import { Q } from '@nozbe/watermelondb';
import type { ReportType, ReportsCreateRequest } from '@libs/api-js';
import { database } from './database';
import { Report } from './models/Report';
import { REPORT_TABLE } from './schema';
import { reportsExecutor } from '../../providers/sync/offlineExecutor/reportsExecutor';
import { useSyncLogStore } from '../../providers/sync/syncLogStore';
import { SYNC_TASK_IDS } from '../../providers/sync/types';
import { logger } from '../../logger';

const reports = () => database.get<Report>(REPORT_TABLE);

/**
 * Writes the report locally first (so it survives being offline right
 * now), then durably enqueues the push via `reportsExecutor` (see its
 * own doc comment) - retried automatically on reconnect/app-foreground,
 * and replayed on next launch if the app is killed before it lands. No
 * error is thrown back to the caller either way.
 */
export const createReport = async (params: {
  type: ReportType;
  lat: number;
  lng: number;
}): Promise<Report> => {
  const report = await database.write(() =>
    reports().create((r) => {
      r.type = params.type;
      r.lat = params.lat;
      r.lng = params.lng;
      r.occurredAt = new Date();
      r.synced = false;
    }),
  );

  await enqueuePush(report);
  return report;
};

const enqueuePush = async (report: Report): Promise<void> => {
  await reportsExecutor.waitForInit();

  const body: ReportsCreateRequest = {
    id: report.id,
    type: report.type,
    lat: report.lat,
    lng: report.lng,
    occurredAt: report.occurredAt.toISOString(),
  };

  const transaction = reportsExecutor.createOfflineTransaction({
    mutationFnName: 'pushReport',
    // Without this, the transaction auto-commits the instant `.mutate()`
    // below runs, and the explicit `.commit()` call that's supposed to
    // report completion throws "no longer pending" instead - the real
    // push can still go through via auto-commit, but nothing can tell.
    autoCommit: false,
    idempotencyKey: report.id,
    metadata: body,
  });
  transaction.mutate(() => {});
  transaction.commit().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('report push failed permanently', { reportId: report.id, error });
    useSyncLogStore.getState().append({
      taskId: SYNC_TASK_IDS.reports,
      status: 'error',
      message: `report ${report.id.slice(0, 8)}…: ${message}`,
    });
  });
};

const getUnsyncedReports = (): Promise<Report[]> =>
  reports().query(Q.where('synced', false)).fetch();

export const getUnsyncedReportsCount = async (): Promise<number> =>
  (await getUnsyncedReports()).length;

/**
 * One-time catch-up for reports that are `synced: false` in Watermelon
 * but might not actually be in `reportsExecutor`'s own durable outbox -
 * either pre-existing rows from before this executor existed, or the
 * rare case of the app dying between the Watermelon write and
 * `enqueuePush` above. Safe to call unconditionally: re-enqueuing a
 * report already mid-flight in the outbox just means one harmless extra
 * request (the server's `ON CONFLICT (id) DO NOTHING` absorbs it).
 */
export const reconcileUnsyncedReports = async (): Promise<void> => {
  const pending = await getUnsyncedReports();
  await Promise.all(pending.map(enqueuePush));
};

/**
 * Called on logout/sign-in (see `AuthProvider`) - Watermelon and
 * `reportsExecutor`'s own outbox are both shared storage on the device,
 * unscoped to any account. Without this, a second account signing in
 * would inherit the first's still-local reports, and `reconcileUnsyncedReports`
 * would happily push them under the new account's session. Dropped, not
 * flushed first - a report that didn't make it out before the account
 * changed has lost the identity it was meant to go out under.
 */
export const clearLocalReports = async (): Promise<void> => {
  await reportsExecutor.clearOutbox();
  await database.write(async () => {
    const all = await reports().query().fetch();
    await database.batch(...all.map((report) => report.prepareDestroyPermanently()));
  });
};
