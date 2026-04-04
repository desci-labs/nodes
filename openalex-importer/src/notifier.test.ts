import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' });
vi.stubGlobal('fetch', fetchSpy);

let sendTelegram: typeof import('./notifier.js')['sendTelegram'];
let notifyError: typeof import('./notifier.js')['notifyError'];
let notifyCaughtUp: typeof import('./notifier.js')['notifyCaughtUp'];
let markImporting: typeof import('./notifier.js')['markImporting'];
let sendDailyDigest: typeof import('./notifier.js')['sendDailyDigest'];
let buildDigestMessage: typeof import('./notifier.js')['buildDigestMessage'];
let buildPipelineStatus: typeof import('./notifier.js')['buildPipelineStatus'];
let startCommandListener: typeof import('./notifier.js')['startCommandListener'];
let stopCommandListener: typeof import('./notifier.js')['stopCommandListener'];

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_CHAT_ID', '-100123456');
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue({ ok: true, text: async () => '{}' });

  const mod = await import('./notifier.js');
  sendTelegram = mod.sendTelegram;
  notifyError = mod.notifyError;
  notifyCaughtUp = mod.notifyCaughtUp;
  markImporting = mod.markImporting;
  sendDailyDigest = mod.sendDailyDigest;
  buildDigestMessage = mod.buildDigestMessage;
  buildPipelineStatus = mod.buildPipelineStatus;
  startCommandListener = mod.startCommandListener;
  stopCommandListener = mod.stopCommandListener;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sendTelegram', () => {
  it('sends a message when env vars are configured', async () => {
    const result = await sendTelegram('test message');
    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain('test-token');
    const body = JSON.parse(opts.body);
    expect(body.chat_id).toBe('-100123456');
    expect(body.text).toBe('test message');
    expect(body.parse_mode).toBe('HTML');
  });

  it('includes message_thread_id when TELEGRAM_THREAD_ID is set', async () => {
    vi.stubEnv('TELEGRAM_THREAD_ID', '13983');
    vi.resetModules();
    const mod = await import('./notifier.js');

    await mod.sendTelegram('threaded message');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.message_thread_id).toBe(13983);
  });

  it('no-ops and returns false when env vars are missing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.resetModules();
    const mod = await import('./notifier.js');

    const result = await mod.sendTelegram('should not send');
    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns false on API error without throwing', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'Forbidden' });
    const result = await sendTelegram('test');
    expect(result).toBe(false);
  });

  it('returns false on network error without throwing', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    const result = await sendTelegram('test');
    expect(result).toBe(false);
  });
});

describe('notifyError', () => {
  it('sends on first error', async () => {
    await notifyError(new Error('test failure'));
    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain('test failure');
    expect(body.text).toContain('Error');
  });

  it('includes context in the message', async () => {
    await notifyError(new Error('boom'), 'during mesh insert');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain('during mesh insert');
  });

  it('rate-limits: second error within cooldown is suppressed', async () => {
    await notifyError(new Error('first'));
    await notifyError(new Error('second'));
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('sends again after cooldown expires', async () => {
    const baseTime = 1_700_000_000_000;
    const dateNowSpy = vi.spyOn(Date, 'now');

    dateNowSpy.mockReturnValue(baseTime);
    await notifyError(new Error('first'));
    expect(fetchSpy).toHaveBeenCalledOnce();

    dateNowSpy.mockReturnValue(baseTime + 61 * 60 * 1000);
    await notifyError(new Error('after cooldown'));
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    dateNowSpy.mockRestore();
  });

  it('truncates very long error messages', async () => {
    const longMsg = 'x'.repeat(500);
    await notifyError(new Error(longMsg));
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text.length).toBeLessThan(500);
  });
});

describe('notifyCaughtUp', () => {
  it('does not notify when already caught up (initial state)', async () => {
    await notifyCaughtUp('2024-03-15');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('notifies on transition from importing to caught up', async () => {
    markImporting();
    await notifyCaughtUp('2024-03-15');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain('2024-03-15');
    expect(body.text).toContain('caught up');
  });

  it('does not double-notify if called again while still caught up', async () => {
    markImporting();
    await notifyCaughtUp('2024-03-15');
    await notifyCaughtUp('2024-03-15');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('notifies again after another import cycle', async () => {
    markImporting();
    await notifyCaughtUp('2024-03-15');
    markImporting();
    await notifyCaughtUp('2024-03-16');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('sendDailyDigest', () => {
  it('sends a digest with data from DB queries', async () => {
    const mockDb = {
      oneOrNone: vi.fn()
        .mockResolvedValueOnce({ query_to: new Date('2024-03-15') })
        .mockResolvedValueOnce({ days_imported: '3', total_duration_sec: '125' })
        .mockResolvedValueOnce({ failed_count: '0' })
        .mockResolvedValueOnce({ finished_at: new Date('2024-03-15T10:30:00Z') })
        .mockResolvedValueOnce({ total_works: '5000000', works_24h: '45000', works_30d: '900000' }),
    } as any;

    await sendDailyDigest(mockDb);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain('Status');
    expect(body.text).toContain('2024-03-15');
    expect(body.text).toContain('3 day');
    expect(body.text).toContain('Last import');
    expect(body.text).toContain('45.0K works');
    expect(body.text).toContain('900.0K works');
    expect(body.text).toContain('5.0M works');
  });

  it('shows warning for failed batches', async () => {
    const mockDb = {
      oneOrNone: vi.fn()
        .mockResolvedValueOnce({ query_to: new Date('2024-03-10') })
        .mockResolvedValueOnce({ days_imported: '1', total_duration_sec: '60' })
        .mockResolvedValueOnce({ failed_count: '5' })
        .mockResolvedValueOnce({ finished_at: new Date('2024-03-10T08:00:00Z') })
        .mockResolvedValueOnce({ total_works: '1000000', works_24h: '10000', works_30d: '200000' }),
    } as any;

    await sendDailyDigest(mockDb);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain('Failed batches');
    expect(body.text).toContain('5');
  });

  it('handles no sync position gracefully', async () => {
    const mockDb = {
      oneOrNone: vi.fn().mockResolvedValue(null),
    } as any;

    await sendDailyDigest(mockDb);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain('unknown');
  });

  it('sends fallback message if DB query fails', async () => {
    const mockDb = {
      oneOrNone: vi.fn().mockRejectedValue(new Error('DB down')),
    } as any;

    await sendDailyDigest(mockDb);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain('Failed to generate daily digest');
  });

  it('warns about stalled imports when behind with no recent completions', async () => {
    const mockDb = {
      oneOrNone: vi.fn()
        .mockResolvedValueOnce({ query_to: new Date('2024-01-01') })
        .mockResolvedValueOnce({ days_imported: '0', total_duration_sec: '0' })
        .mockResolvedValueOnce({ failed_count: '0' })
        .mockResolvedValueOnce({ finished_at: new Date('2024-01-01T12:00:00Z') })
        .mockResolvedValueOnce({ total_works: '100000', works_24h: '0', works_30d: '5000' }),
    } as any;

    await sendDailyDigest(mockDb);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain('No imports completed');
    expect(body.text).toContain('check pod health');
  });
});

describe('buildDigestMessage', () => {
  it('includes pod uptime, last import with time ago, and record counts', async () => {
    const recentDate = new Date(Date.now() - 3600_000); // 1h ago
    const mockDb = {
      oneOrNone: vi.fn()
        .mockResolvedValueOnce({ query_to: new Date('2024-03-15') })
        .mockResolvedValueOnce({ days_imported: '1', total_duration_sec: '60' })
        .mockResolvedValueOnce({ failed_count: '0' })
        .mockResolvedValueOnce({ finished_at: recentDate })
        .mockResolvedValueOnce({ total_works: '12500000', works_24h: '8500', works_30d: '250000' }),
    } as any;

    const message = await buildDigestMessage(mockDb);
    expect(message).toContain('Pod uptime');
    expect(message).toContain('Last import');
    expect(message).toContain('ago)');
    expect(message).toContain('24h:');
    expect(message).toContain('8.5K works');
    expect(message).toContain('30d:');
    expect(message).toContain('250.0K works');
    expect(message).toContain('~12.5M works');
  });

  it('shows caught up status for recent sync', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const mockDb = {
      oneOrNone: vi.fn()
        .mockResolvedValueOnce({ query_to: yesterday })
        .mockResolvedValueOnce({ days_imported: '1', total_duration_sec: '30' })
        .mockResolvedValueOnce({ failed_count: '0' })
        .mockResolvedValueOnce({ finished_at: yesterday })
        .mockResolvedValueOnce({ total_works: '1000', works_24h: '500', works_30d: '800' }),
    } as any;

    const message = await buildDigestMessage(mockDb);
    expect(message).toContain('Caught up');
  });

  it('shows "never" when no successful imports exist', async () => {
    const mockDb = {
      oneOrNone: vi.fn().mockResolvedValue(null),
    } as any;

    const message = await buildDigestMessage(mockDb);
    expect(message).toContain('never');
  });
});

describe('buildPipelineStatus', () => {
  it('shows overall health and per-pipeline details', async () => {
    const mockDb = {
      oneOrNone: vi.fn().mockResolvedValueOnce({ max_batch: '14611' }),
      manyOrNone: vi.fn().mockResolvedValueOnce([
        { service: 'pg-to-es-batch-openalex', value: '14527', updated_at: new Date(Date.now() - 3600_000) },
        { service: 'ml-novelty-batch-openalex', value: '14527', updated_at: new Date(Date.now() - 3600_000) },
        { service: 'pg-to-vector-db-batch-openalex', value: '6451', updated_at: new Date('2026-02-27') },
      ]),
    } as any;

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'deploy-es', name: 'pg_to_es_batch_import_deployment' },
          { id: 'deploy-nov', name: 'batch_novelty_openalex_deployment' },
          { id: 'deploy-qdr', name: 'pg_to_vector_db_batch_import_deployment' },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'run1', deployment_id: 'deploy-es', state: { type: 'COMPLETED', name: 'Completed' }, start_time: new Date(Date.now() - 7200_000).toISOString(), total_run_time: 221 },
          { id: 'run2', deployment_id: 'deploy-nov', state: { type: 'COMPLETED', name: 'Completed' }, start_time: new Date(Date.now() - 7200_000).toISOString(), total_run_time: 1540 },
          { id: 'run3', deployment_id: 'deploy-qdr', state: { type: 'COMPLETED', name: 'Completed' }, start_time: new Date(Date.now() - 86400_000).toISOString(), total_run_time: 3.8 },
        ],
      });

    const message = await buildPipelineStatus(mockDb);
    expect(message).toContain('Pipeline Health');
    expect(message).toContain('action needed');
    expect(message).toContain('✅');
    expect(message).toContain('PG → Elasticsearch');
    expect(message).toContain('Healthy');
    expect(message).toContain('PG → Qdrant');
    expect(message).toContain('Stalled');
    expect(message).toContain('6,451');
    expect(message).toContain('no data processed');
    expect(message).toContain('Importer at batch');
  });

  it('shows all healthy when pipelines are caught up', async () => {
    const mockDb = {
      oneOrNone: vi.fn().mockResolvedValueOnce({ max_batch: '14611' }),
      manyOrNone: vi.fn().mockResolvedValueOnce([
        { service: 'pg-to-es-batch-openalex', value: '14611', updated_at: new Date() },
        { service: 'ml-novelty-batch-openalex', value: '14611', updated_at: new Date() },
        { service: 'pg-to-vector-db-batch-openalex', value: '14611', updated_at: new Date() },
      ]),
    } as any;

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'd1', name: 'pg_to_es_batch_import_deployment' },
          { id: 'd2', name: 'batch_novelty_openalex_deployment' },
          { id: 'd3', name: 'pg_to_vector_db_batch_import_deployment' },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'r1', deployment_id: 'd1', state: { type: 'COMPLETED', name: 'Completed' }, start_time: new Date().toISOString(), total_run_time: 300 },
          { id: 'r2', deployment_id: 'd2', state: { type: 'COMPLETED', name: 'Completed' }, start_time: new Date().toISOString(), total_run_time: 1200 },
          { id: 'r3', deployment_id: 'd3', state: { type: 'COMPLETED', name: 'Completed' }, start_time: new Date().toISOString(), total_run_time: 600 },
        ],
      });

    const message = await buildPipelineStatus(mockDb);
    expect(message).toContain('All pipelines healthy');
    expect(message).toContain('caught up');
  });

  it('handles Prefect API failure gracefully', async () => {
    const mockDb = {
      oneOrNone: vi.fn().mockResolvedValueOnce({ max_batch: '14611' }),
      manyOrNone: vi.fn().mockResolvedValueOnce([
        { service: 'pg-to-es-batch-openalex', value: '14527', updated_at: new Date() },
      ]),
    } as any;

    fetchSpy.mockRejectedValueOnce(new Error('connection refused'));

    const message = await buildPipelineStatus(mockDb);
    expect(message).toContain('Pipeline Health');
    expect(message).toContain('No recent runs found');
    expect(message).toContain('14,527');
  });

  it('handles empty export_metadata gracefully', async () => {
    const mockDb = {
      oneOrNone: vi.fn().mockResolvedValueOnce({ max_batch: '100' }),
      manyOrNone: vi.fn().mockResolvedValueOnce([]),
    } as any;

    fetchSpy.mockRejectedValueOnce(new Error('connection refused'));

    const message = await buildPipelineStatus(mockDb);
    expect(message).toContain('no tracking data');
  });

  it('shows failing status for crashed runs', async () => {
    const mockDb = {
      oneOrNone: vi.fn().mockResolvedValueOnce({ max_batch: '100' }),
      manyOrNone: vi.fn().mockResolvedValueOnce([
        { service: 'pg-to-es-batch-openalex', value: '90', updated_at: new Date() },
      ]),
    } as any;

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'd1', name: 'pg_to_es_batch_import_deployment' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'r1', deployment_id: 'd1', state: { type: 'CRASHED', name: 'Crashed' }, start_time: new Date().toISOString(), total_run_time: 2 },
        ],
      });

    const message = await buildPipelineStatus(mockDb);
    expect(message).toContain('Last run failed');
    expect(message).toContain('action needed');
  });
});

describe('startCommandListener', () => {
  it('does not start polling when env vars are missing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.resetModules();
    const mod = await import('./notifier.js');

    mod.startCommandListener({} as any);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stops cleanly via stopCommandListener', () => {
    stopCommandListener();
  });
});
