// Discovery is read-only; publication always uses the fresh gateway snapshot.
import { destinationConfig } from './service.ts';
import { readSalesOrderSyncJobs } from './repository.ts';
import { isDue } from './sync.ts';
import { dependencyUnavailable } from './errors.ts';
import { sendGatewayCommand } from './gateway.ts';
import { newUuid, nowIso } from './ids.ts';
export type SyncMode = 'off' | 'staging' | 'live';
export function syncMode(): SyncMode {
  const mode = process.env.SALES_ORDER_SYNC_ENABLED;
  if (mode === 'staging') return mode;
  return mode === 'live' && process.env.SALES_ORDER_SYNC_ALLOW_LIVE === '1' ? 'live' : 'off';
}
export async function processDueJobs(): Promise<{ processed: number; skipped: number; blocked: string[] }> {
  if (syncMode() === 'off') throw dependencyUnavailable('Outbound synchronization is disabled.');
  const destination = destinationConfig();
  if (!destination) throw dependencyUnavailable('Destination is not configured.');
  const jobs = (await readSalesOrderSyncJobs()).filter(job => isDue(job, nowIso()));
  let processed = 0;
  const blocked: string[] = [];
  for (const job of jobs) {
    try {
      if (job.destinationSpreadsheetId !== destination.spreadsheetId || job.destinationSheetId !== destination.sheetId) continue;
      const send = <T>(commandType: string, payload: object) => sendGatewayCommand<T>({
        command: { commandId: newUuid(), commandType, salesOrderId: job.salesOrderId,
          expectedVersion: null, actorUserId: 'system-worker', issuedAt: nowIso(), payload }, payload,
      });
      const claim = await send<{ published: boolean; leaseToken: string; errorCode?: string }>('so.sync.claim', {
        job: { syncJobId: job.syncJobId }, destination, leaseToken: newUuid(), leaseOwner: 'next-worker',
      });
      if (!claim.result.published) { blocked.push(`${job.syncJobId}: ${claim.result.errorCode || 'publication pending'}`); continue; }
      await send('so.sync.complete', { job: { syncJobId: job.syncJobId }, leaseToken: claim.result.leaseToken });
      processed++;
    } catch (error) { blocked.push(`${job.syncJobId}: ${error instanceof Error ? error.message : 'sync failed'}`); }
  }
  return { processed, skipped: jobs.length - processed, blocked };
}
