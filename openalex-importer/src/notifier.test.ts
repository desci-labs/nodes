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
let startCommandListener: typeof import('./notifier.js')['startCommandListener'];
let stopCommandListener: typeof import('./notifier.js')['stopCommandListener'];

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_CHAT_ID', '-100123456');
  fetchSpy.mockClear();
  fetchSpy.mockResolvedValue({ ok: true, text: async () => '{}' });

  const mod = await import('./notifier.js');
  sendTelegram = mod.sendTelegram;
  notifyError = mod.notifyError;
  notifyCaughtUp = mod.notifyCaughtUp;
  markImporting = mod.markImporting;
  sendDailyDigest = mod.sendDailyDigest;
  buildDigestMessage = mod.buildDigestMessage;
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
    await notifyError(new Error('first'));
    vi.useFakeTimers();
    vi.advanceTimersByTime(61 * 60 * 1000);
    vi.useRealTimers();

    vi.resetModules();
    const mod = await import('./notifier.js');
    await mod.notifyError(new Error('after cooldown'));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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
        .mockResolvedValueOnce({ failed_count: '0' }),
    } as any;

    await sendDailyDigest(mockDb);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain('Status');
    expect(body.text).toContain('2024-03-15');
    expect(body.text).toContain('3 days');
  });

  it('shows warning for failed batches', async () => {
    const mockDb = {
      oneOrNone: vi.fn()
        .mockResolvedValueOnce({ query_to: new Date('2024-03-10') })
        .mockResolvedValueOnce({ days_imported: '1', total_duration_sec: '60' })
        .mockResolvedValueOnce({ failed_count: '5' }),
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
        .mockResolvedValueOnce({ failed_count: '0' }),
    } as any;

    await sendDailyDigest(mockDb);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text).toContain('No imports completed');
    expect(body.text).toContain('check pod health');
  });
});

describe('buildDigestMessage', () => {
  it('includes pod uptime', async () => {
    const mockDb = {
      oneOrNone: vi.fn()
        .mockResolvedValueOnce({ query_to: new Date('2024-03-15') })
        .mockResolvedValueOnce({ days_imported: '1', total_duration_sec: '60' })
        .mockResolvedValueOnce({ failed_count: '0' }),
    } as any;

    const message = await buildDigestMessage(mockDb);
    expect(message).toContain('Pod uptime');
  });

  it('shows caught up status for recent sync', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const mockDb = {
      oneOrNone: vi.fn()
        .mockResolvedValueOnce({ query_to: yesterday })
        .mockResolvedValueOnce({ days_imported: '1', total_duration_sec: '30' })
        .mockResolvedValueOnce({ failed_count: '0' }),
    } as any;

    const message = await buildDigestMessage(mockDb);
    expect(message).toContain('Caught up');
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
