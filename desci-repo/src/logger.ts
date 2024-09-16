import { pino } from 'pino';
import { fileURLToPath } from 'url';
import path from 'path';
import { pool } from './db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logLevel = process.env.PINO_LOG_LEVEL || 'trace';

const devTransport = {
  target: 'pino-pretty',
  level: logLevel,
  options: {
    colorize: true,
  },
};

const fileTransport = {
  target: 'pino/file',
  options: { destination: `${__dirname}/../log/server.log` },
  level: 'trace',
};

console.log('[DIR NAME]::', __dirname, __filename, logLevel);

export const logger = pino({
  level: logLevel,
  serializers: {
    files: omitBuffer,
  },
  transport:
    process.env.NODE_ENV === 'production'
      ? { targets: [] }
      : {
          targets: [devTransport, fileTransport],
        },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'user.email',
      '*.user.email',
      'user.name',
      '*.user.name',
      'user.website',
      '*.user.website',
      'user.googleScholarUrl',
      '*.user.googleScholarUrl',
      'user.walletAddress',
      '*.user.walletAddress',
      'user.siweNonce',
      '*.user.siweNonce',
      'user.orcid',
      '*.user.orcid',
      'authorization',
      '*.authorization',
      '*.Authorization',
      'Authorization',
    ],
  },
});

function omitBuffer(array) {
  return array.map((obj) => {
    const { buffer, ...rest } = obj;
    return rest;
  });
}

type RejectionPayload = {
  reason: unknown,
  promise: Promise<unknown>,
};

const shutdownNicely = async (
  err: Error | RejectionPayload,
  kind: string
): Promise<void> => {
  await pool.end();
  logger.fatal(err, kind);
  process.exit(1);
};

process.on(
  'uncaughtException',
  e => shutdownNicely(e, 'uncaughtException')
);

process.on(
  'unhandledRejection',
  (reason, promise) => shutdownNicely({ reason, promise }, 'unhandledRejection')
);
