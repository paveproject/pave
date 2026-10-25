import { startOfflineExecutor } from '@tanstack/offline-transactions/react-native';
import { createCollection, localOnlyCollectionOptions } from '@tanstack/db';
import { createReport as createReportApi, type ReportsCreateRequest } from '@libs/api-js';
import { createOfflineTransactionsStorage } from './mmkvStorageAdapter';
import { throwForFailedResponse } from './classifyError';
import { database } from '../../../lib/watermelon/database';
import { Report } from '../../../lib/watermelon/models/Report';
import { REPORT_TABLE } from '../../../lib/watermelon/schema';
import { logger } from '../../../logger';

/**
 * Dummy `@tanstack/db` collection, purely so `transaction.mutate()` has
 * *something* real to mutate. Confirmed by reading `@tanstack/db`'s own
 * `Transaction.commit()` source: when `this.mutations.length === 0` it
 * takes an early-exit path that marks the transaction "completed" and
 * resolves it *without ever calling `mutationFn`* - which is exactly
 * what an empty `.mutate(() => {})` callback with `collections: {}`
 * produces. That early exit is what made every report push silently
 * no-op: `commit()` resolved "success" instantly, `pushReport` never
 * ran, nothing ever reached the server, and there was no error to catch
 * because nothing failed - the transaction was simply never attempted.
 * Inserting into this collection inside `.mutate()` gives it one real
 * pending mutation, forcing `commit()` down the real path that awaits
 * `mutationFn`. The row itself is never read back.
 */
export const reportMutationMarkers = createCollection(
  localOnlyCollectionOptions<{ id: string }>({
    getKey: (item) => item.id,
  }),
);

/**
 * Durable retry queue for pushing a report to the server - replaces the
 * hand-rolled `NetInfo` retry loop that used to live in
 * `hooks/sync/useReportSync.ts`. The report's real fields travel through
 * `transaction.metadata`, not through `reportMutationMarkers` itself.
 *
 * Marking the local Watermelon row `synced: true` happens *inside* the
 * mutation function, not at the call site - this is what makes the
 * retry durable: if the app is killed before a push succeeds, the
 * executor replays this same function from its own on-disk outbox on
 * next launch, and it still knows what to do, with no JS closure from
 * the original call needed.
 *
 * `leaderElection` is forced to "always leader" - without this, the
 * library auto-detects a coordination mechanism meant for multiple
 * browser tabs sharing one outbox (`WebLocksLeader`/`BroadcastChannelLeader`),
 * and a transaction's own mutation function only ever actually runs on
 * whichever instance "wins" leadership. `commit()` itself resolves
 * regardless (it only signals the transaction was durably queued), so a
 * non-leader instance silently never executes anything while still
 * reporting success. React Native has no second tab to hand leadership
 * to - there's only ever this one instance - so there's nothing to elect.
 */
export const reportsExecutor = startOfflineExecutor({
  collections: { reportMutationMarkers },
  storage: createOfflineTransactionsStorage('reports'),
  leaderElection: {
    requestLeadership: () => Promise.resolve(true),
    releaseLeadership: () => {},
    isLeader: () => true,
    onLeadershipChange: () => () => {},
  },
  mutationFns: {
    pushReport: async ({ transaction }) => {
      const body = transaction.metadata as ReportsCreateRequest;
      logger.debug('report: pushReport called', { reportId: body.id });

      const { error, response } = await createReportApi({ body });
      if (error) {
        throwForFailedResponse(response?.status, 'report push');
      }

      reportMutationMarkers.utils.acceptMutations(transaction);

      const report = await database.get<Report>(REPORT_TABLE).find(body.id);
      await database.write(() =>
        report.update((r) => {
          r.synced = true;
        }),
      );
      logger.debug('report: marked synced locally', { reportId: body.id });
    },
  },
});
