import { startOfflineExecutor } from '@tanstack/offline-transactions/react-native';
import { createReport as createReportApi, type ReportsCreateRequest } from '@libs/api-js';
import { createOfflineTransactionsStorage } from './mmkvStorageAdapter';
import { throwForFailedResponse } from './classifyError';
import { database } from '../../../lib/watermelon/database';
import { Report } from '../../../lib/watermelon/models/Report';
import { REPORT_TABLE } from '../../../lib/watermelon/schema';

/**
 * Durable retry queue for pushing a report to the server - replaces the
 * hand-rolled `NetInfo` retry loop that used to live in
 * `hooks/sync/useReportSync.ts`. No `@tanstack/db` Collections involved:
 * `collections: {}` is enough (confirmed by reading the library's own
 * source - it's safe), the report's fields travel through
 * `transaction.metadata` instead.
 *
 * Marking the local Watermelon row `synced: true` happens *inside* the
 * mutation function, not at the call site - this is what makes the
 * retry durable: if the app is killed before a push succeeds, the
 * executor replays this same function from its own on-disk outbox on
 * next launch, and it still knows what to do, with no JS closure from
 * the original call needed.
 */
export const reportsExecutor = startOfflineExecutor({
  collections: {},
  storage: createOfflineTransactionsStorage('reports'),
  mutationFns: {
    pushReport: async ({ transaction }) => {
      const body = transaction.metadata as ReportsCreateRequest;

      const { error, response } = await createReportApi({ body });
      if (error) {
        throwForFailedResponse(response?.status, 'report push');
      }

      const report = await database.get<Report>(REPORT_TABLE).find(body.id);
      await database.write(() =>
        report.update((r) => {
          r.synced = true;
        }),
      );
    },
  },
});
