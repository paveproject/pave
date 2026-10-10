import { Q } from '@nozbe/watermelondb';
import { createReport as createReportApi } from '@libs/api-js';
import type { ReportType } from '@libs/api-js';
import { database } from './database';
import { Report } from './models/Report';
import { REPORT_TABLE } from './schema';
import { logger } from '../../logger';

const reports = () => database.get<Report>(REPORT_TABLE);

/**
 * Writes the report locally first (so it survives being offline right now),
 * then tries to push it to the API immediately. On failure it just stays
 * `synced: false` - `pushPendingReports` retries it on the next reconnect
 * (see `hooks/useReportSync.ts`), no error is thrown back to the caller.
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

  await pushReport(report);
  return report;
};

const pushReport = async (report: Report): Promise<void> => {
  try {
    await createReportApi({
      body: {
        id: report.id,
        type: report.type,
        lat: report.lat,
        lng: report.lng,
        occurredAt: report.occurredAt.toISOString(),
      },
    });
    await database.write(() =>
      report.update((r) => {
        r.synced = true;
      }),
    );
  } catch (error) {
    logger.error('report push failed, will retry on reconnect', { error });
  }
};

/** Re-attempts every not-yet-synced report - call on reconnect. */
export const pushPendingReports = async (): Promise<void> => {
  const pending = await reports().query(Q.where('synced', false)).fetch();
  await Promise.all(pending.map(pushReport));
};
