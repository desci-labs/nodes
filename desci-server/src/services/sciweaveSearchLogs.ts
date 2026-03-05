/**
 * Deletes Sciweave chat/message data from the separate Sciweave Postgres DB (search_logs table).
 * Used during account deletion; records are keyed by username in format `user_[email]`.
 */
import type { Pool } from 'pg';
import pg from 'pg';

import { SCIWEAVE_DATABASE_URL } from '../config.js';
import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({ module: 'SciweaveSearchLogs' });

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (!SCIWEAVE_DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: SCIWEAVE_DATABASE_URL });
  }
  return pool;
}

/**
 * Delete all search_logs rows for the given user. Username in Sciweave DB is stored as `user_[email]`.
 * No-op if SCIWEAVE_DATABASE_URL is not set.
 */
export async function deleteSciweaveSearchLogsByEmail(email: string): Promise<{ deleted: number }> {
  const normalized = email?.toLowerCase()?.trim();
  if (!normalized) {
    logger.warn({ email }, 'deleteSciweaveSearchLogsByEmail: no email provided');
    return { deleted: 0 };
  }

  const poolInstance = getPool();
  if (!poolInstance) {
    logger.debug('SCIWEAVE_DATABASE_URL not set; skipping Sciweave search_logs deletion');
    return { deleted: 0 };
  }

  const username = `user_${normalized}`;
  try {
    const result = await poolInstance.query('DELETE FROM search_logs WHERE username = $1', [username]);
    const deleted = result.rowCount ?? 0;
    logger.info({ email: normalized, username, deleted }, 'Deleted Sciweave search_logs for user');
    return { deleted };
  } catch (err) {
    logger.error({ err, email: normalized, username }, 'Failed to delete Sciweave search_logs');
    throw err;
  }
}
