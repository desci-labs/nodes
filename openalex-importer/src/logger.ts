import path from 'path';
import { fileURLToPath } from 'url';

import { pino } from 'pino';

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
  options: { destination: `${__dirname}/../../log/server.log` },
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
    paths: [],
  },
});

function omitBuffer(array) {
  return array.map((obj) => {
    const { buffer, ...rest } = obj;
    return rest;
  });
}

process.on('uncaughtException', (err) => {
  logger.fatal(err, 'uncaught exception');
});
