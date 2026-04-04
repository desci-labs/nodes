import { logger } from './logger.js';
import { differenceInCalendarDays } from 'date-fns';
import { UTCDate } from '@date-fns/utc';
import type { OaDb } from './db/index.js';

const TELEGRAM_API = 'https://api.telegram.org';
const ERROR_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between error notifications
const POLL_INTERVAL_MS = 5_000;

let lastErrorNotifyMs = 0;
let wasCaughtUp = true;
let pollAbort: AbortController | null = null;

const getConfig = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const threadId = process.env.TELEGRAM_THREAD_ID;
  return token && chatId ? { token, chatId, threadId } : null;
};

export const sendTelegram = async (message: string): Promise<boolean> => {
  const config = getConfig();
  if (!config) return false;

  try {
    const body: Record<string, unknown> = {
      chat_id: config.chatId,
      text: message,
      parse_mode: 'HTML',
    };
    if (config.threadId) {
      body.message_thread_id = parseInt(config.threadId, 10);
    }

    const res = await fetch(`${TELEGRAM_API}/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, body: text }, 'Telegram API returned non-OK');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, 'Failed to send Telegram notification');
    return false;
  }
};

/**
 * Rate-limited error notification. Sends at most 1 error message per hour
 * (in-memory cooldown). On crash-loop restarts, the first error after each
 * restart gets through, but K8s exponential backoff (up to 5min) limits the
 * volume naturally.
 */
export const notifyError = async (error: Error, context?: string): Promise<void> => {
  const now = Date.now();
  if (now - lastErrorNotifyMs < ERROR_COOLDOWN_MS) return;
  lastErrorNotifyMs = now;

  const contextLine = context ? `\n<b>Context:</b> ${context}` : '';
  await sendTelegram(
    `🔴 <b>OpenAlex Importer Error</b>${contextLine}\n<code>${error.message.slice(0, 300)}</code>`,
  );
};

/**
 * Notify when the importer finishes catching up — only fires on the
 * state transition from "behind" to "caught up", not on every idle tick.
 */
export const notifyCaughtUp = async (syncedTo: string): Promise<void> => {
  if (wasCaughtUp) return;
  wasCaughtUp = true;
  await sendTelegram(
    `✅ <b>OpenAlex Importer caught up</b>\nSynced through <b>${syncedTo}</b>`,
  );
};

/**
 * Mark that we're actively importing (behind). Called before each import
 * so notifyCaughtUp knows when the transition happens.
 */
export const markImporting = (): void => {
  wasCaughtUp = false;
};

/**
 * Builds the status/digest message by querying the batch table.
 * Shared between the daily digest cron and the /status bot command.
 */
export const buildDigestMessage = async (db: OaDb): Promise<string> => {
  const syncPosition = await db.oneOrNone<{ query_to: Date }>(
    `SELECT query_to FROM openalex.batch
     WHERE query_type = 'updated' AND finished_at IS NOT NULL
     ORDER BY query_to DESC LIMIT 1`,
  );

  const last24h = await db.oneOrNone<{ days_imported: string; total_duration_sec: string }>(
    `SELECT
       COUNT(*) AS days_imported,
       COALESCE(EXTRACT(EPOCH FROM SUM(finished_at - started_at)), 0)::int AS total_duration_sec
     FROM openalex.batch
     WHERE finished_at > NOW() - INTERVAL '24 hours'
       AND query_type = 'updated'`,
  );

  const recentErrors = await db.oneOrNone<{ failed_count: string }>(
    `SELECT COUNT(*) AS failed_count
     FROM openalex.batch
     WHERE finished_at IS NULL
       AND started_at > NOW() - INTERVAL '24 hours'
       AND query_type = 'updated'`,
  );

  const lastSuccess = await db.oneOrNone<{ finished_at: Date }>(
    `SELECT finished_at FROM openalex.batch
     WHERE finished_at IS NOT NULL AND query_type = 'updated'
     ORDER BY finished_at DESC LIMIT 1`,
  );

  const syncDate = syncPosition?.query_to
    ? new UTCDate(syncPosition.query_to).toISOString().split('T')[0]
    : 'unknown';

  const daysImported = parseInt(last24h?.days_imported ?? '0');
  const totalDuration = parseInt(last24h?.total_duration_sec ?? '0');
  const failedBatches = parseInt(recentErrors?.failed_count ?? '0');
  const daysBehind = syncPosition?.query_to
    ? differenceInCalendarDays(new UTCDate(), new UTCDate(syncPosition.query_to))
    : null;

  const durationMin = Math.floor(totalDuration / 60);
  const durationSec = totalDuration % 60;

  let status: string;
  if (daysBehind === null) status = '⚠️ Unknown';
  else if (daysBehind <= 1) status = '✅ Caught up';
  else if (daysBehind <= 7) status = `🟡 ${daysBehind} days behind`;
  else status = `🔴 ${daysBehind} days behind`;

  const uptime = Math.floor(process.uptime());
  const uptimeH = Math.floor(uptime / 3600);
  const uptimeM = Math.floor((uptime % 3600) / 60);

  const lastSuccessStr = lastSuccess?.finished_at
    ? new UTCDate(lastSuccess.finished_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    : 'never';

  const lines = [
    `📊 <b>OpenAlex Importer — Status</b>`,
    ``,
    `<b>Status:</b> ${status}`,
    `<b>Synced through:</b> ${syncDate}${daysBehind !== null && daysBehind > 1 ? ` (${daysBehind} days behind)` : ''}`,
    `<b>Last successful import:</b> ${lastSuccessStr}`,
    `<b>Last 24h:</b> ${daysImported} day${daysImported !== 1 ? 's' : ''} imported in ${durationMin}m ${durationSec}s`,
    `<b>Pod uptime:</b> ${uptimeH}h ${uptimeM}m`,
  ];

  if (failedBatches > 0) {
    lines.push(`<b>⚠️ Failed batches:</b> ${failedBatches}`);
  }

  if (daysImported === 0 && (daysBehind ?? 0) > 1) {
    lines.push(`\n<b>⚠️ No imports completed in 24h but still behind — check pod health</b>`);
  }

  return lines.join('\n');
};

export const sendDailyDigest = async (db: OaDb): Promise<void> => {
  try {
    const message = await buildDigestMessage(db);
    await sendTelegram(message);
  } catch (err) {
    logger.warn({ err }, 'Failed to build daily digest');
    await sendTelegram('⚠️ <b>OpenAlex Importer</b>\nFailed to generate daily digest — check logs');
  }
};

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    message_thread_id?: number;
    text?: string;
  };
}

const replyToMessage = async (chatId: number, messageId: number, text: string, threadId?: number): Promise<void> => {
  const config = getConfig();
  if (!config) return;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_to_message_id: messageId,
  };
  if (threadId) {
    body.message_thread_id = threadId;
  }

  try {
    await fetch(`${TELEGRAM_API}/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to reply to Telegram command');
  }
};

/**
 * Polls Telegram for bot commands. Responds to:
 *   /status  — current sync position, last 24h stats, pod uptime
 *   /help    — list available commands
 */
export const startCommandListener = (db: OaDb): void => {
  const config = getConfig();
  if (!config) {
    logger.info('Telegram bot commands disabled (no TELEGRAM_BOT_TOKEN)');
    return;
  }

  let offset = 0;
  pollAbort = new AbortController();

  void (async () => {
    try {
      const message = await buildDigestMessage(db);
      await sendTelegram(`🟢 <b>OpenAlex Importer online</b>\n\n${message}\n\nType /help for commands.`);
    } catch {
      await sendTelegram('🟢 <b>OpenAlex Importer online</b>\nFailed to fetch initial status — type /status to retry.');
    }
  })();

  const poll = async () => {
    while (!pollAbort?.signal.aborted) {
      try {
        const res = await fetch(
          `${TELEGRAM_API}/bot${config.token}/getUpdates?offset=${offset}&timeout=30`,
          { signal: pollAbort?.signal ?? null },
        );

        if (!res.ok) {
          logger.warn({ status: res.status }, 'Telegram getUpdates failed');
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
          continue;
        }

        const data = await res.json() as { ok: boolean; result: TelegramUpdate[] };
        if (!data.ok || !data.result.length) continue;

        for (const update of data.result) {
          offset = update.update_id + 1;
          const text = update.message?.text?.trim();
          if (!text || !update.message) continue;

          const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();

          if (command === '/status') {
            try {
              const message = await buildDigestMessage(db);
              await replyToMessage(
                update.message.chat.id,
                update.message.message_id,
                message,
                update.message.message_thread_id,
              );
            } catch (err) {
              logger.warn({ err }, 'Failed to build status for /status command');
              await replyToMessage(
                update.message.chat.id,
                update.message.message_id,
                '⚠️ Failed to fetch status — check logs',
                update.message.message_thread_id,
              );
            }
          } else if (command === '/help') {
            await replyToMessage(
              update.message.chat.id,
              update.message.message_id,
              [
                `<b>OpenAlex Importer Bot</b>`,
                ``,
                `/status — sync position, last 24h stats, pod uptime`,
                `/help — show this message`,
              ].join('\n'),
              update.message.message_thread_id,
            );
          }
        }
      } catch (err) {
        if (pollAbort?.signal.aborted) break;
        logger.warn({ err }, 'Telegram poll error, retrying...');
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      }
    }
  };

  logger.info('Telegram bot command listener started');
  void poll();
};

export const stopCommandListener = (): void => {
  pollAbort?.abort();
  pollAbort = null;
};
