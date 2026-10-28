import { Q } from '@nozbe/watermelondb';
import type { ReportsCreateRequest } from '@libs/api-js';
import type { ReportTypeKey } from '@libs/constants';
import { database } from './database';
import { Report } from './models/Report';
import { REPORT_TABLE } from './schema';
import {
  reportsExecutor,
  reportMutationMarkers,
} from '../../providers/sync/offlineExecutor/reportsExecutor';
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
  type: ReportTypeKey;
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
  logger.debug('report: local row written', { reportId: report.id });

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
  // Must be a *real* mutation, not a no-op - an empty callback with
  // nothing mutated leaves `transaction.mutations` empty, and
  // `@tanstack/db`'s own `commit()` short-circuits an empty-mutations
  // transaction as already "completed" without ever calling `mutationFn`
  // (see `reportsExecutor.ts`'s `reportMutationMarkers` doc comment).
  transaction.mutate(() => {
    reportMutationMarkers.insert({ id: report.id });
  });

  useSyncLogStore.getState().append({
    taskId: SYNC_TASK_IDS.reports,
    status: 'syncing',
    message: `report ${report.id.slice(0, 8)}…: push attempt started`,
  });

  transaction.commit().then(
    () => {
      logger.debug('report: push succeeded', { reportId: report.id });
      useSyncLogStore.getState().append({
        taskId: SYNC_TASK_IDS.reports,
        status: 'idle',
        message: `report ${report.id.slice(0, 8)}…: pushed successfully`,
      });
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('report push failed permanently', { reportId: report.id, error });
      useSyncLogStore.getState().append({
        taskId: SYNC_TASK_IDS.reports,
        status: 'error',
        message: `report ${report.id.slice(0, 8)}…: ${message}`,
      });
    },
  );
};

const getUnsyncedReports = (): Promise<Report[]> =>
  reports().query(Q.where('synced', false)).fetch();

export const getUnsyncedReportsCount = async (): Promise<number> =>
  (await getUnsyncedReports()).length;

/** Reactive version of `getUnsyncedReports` - for `lib/mesh/outgoingBridge.ts`,
 * which needs to notice every new local report (including ones just
 * created by `createReport`) without `reports.ts` needing to know the
 * mesh relay exists. */
export const observeUnsyncedReports = () => reports().query(Q.where('synced', false)).observe();

/** Every local report, synced or not - for `screens/home/HomeMap.tsx`,
 * which merges these in alongside the server-fetched ones so a report
 * (self-authored or received over the mesh relay) shows up immediately,
 * even on a device that hasn't reached the server yet. */
export const observeAllReports = () => reports().query().observe();

/**
 * Mirror of `createReport` for a report arriving via the BLE mesh relay
 * (see `lib/mesh`) rather than authored on this device - writes it under
 * its *original* id (not a freshly generated one) so this device's own
 * push reuses the same server-side idempotency key the original author's
 * push would have used. Idempotent locally too: a no-op if a row with
 * this id already exists (already relayed through this device before,
 * or this device is also the original author).
 *
 * `r._raw.id = ...` is WatermelonDB's own internal field, not a public
 * API - `Model._prepareCreate` always assigns a fresh random id before
 * the `create()` callback runs, with no supported way to override it, so
 * this is the only way to persist a caller-specified id.
 */
export const receiveMeshReport = async (packet: {
  reportId: string;
  type: ReportTypeKey;
  lat: number;
  lng: number;
  occurredAt: Date;
}): Promise<void> => {
  const existing = await reports().query(Q.where('id', packet.reportId)).fetch();
  if (existing.length > 0) return;

  const report = await database.write(() =>
    reports().create((r) => {
      r._raw.id = packet.reportId;
      r.type = packet.type;
      r.lat = packet.lat;
      r.lng = packet.lng;
      r.occurredAt = packet.occurredAt;
      r.synced = false;
    }),
  );

  await enqueuePush(report);
};

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
