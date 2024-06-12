import { AsyncLocalStorage } from 'async_hooks';
import path from 'path';
import { fileURLToPath } from 'url';

import { pino } from 'pino';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const als = new AsyncLocalStorage();

const logLevel = process.env.PINO_LOG_LEVEL || 'trace';

const devTransport = {
  target: 'pino-pretty',
  level: logLevel,
  options: {
    colorize: true,
  },
};

console.log('[DIR NAME]::', __dirname, __filename, logLevel);

const fileTransport = {
  target: 'pino/file',
  options: { destination: `${__dirname}/../log/server.log` },
  level: 'trace',
};

export const logger = pino({
  level: logLevel,
  serializers: {
    files: omitBuffer,
  },
  hooks: {
    logMethod: function (inputArgs, method) {
      //get caller
      const stack = new Error().stack.split('\n');
      // find first line that is not from this file

      let callerFilePath;
      try {
        callerFilePath = stack
          .filter((a) => a.includes('file:///') && !(a.includes('/dist/logger.') || a.includes('/src/logger.')))[0]
          .split('(')[1]
          .split(')')[0]
          .replace('file:///app/desci-server/src/', '')
          .replace('file:///app/dist/', '');
      } catch (err) {
        // callerFilePath = '-unknown-';
      }

      const target = typeof inputArgs[0] == 'string' ? 1 : 0;
      const newInputArgs = [...inputArgs];
      if (!newInputArgs[target]) {
        newInputArgs[target] = {};
      }

      newInputArgs[target]['caller'] = callerFilePath;

      newInputArgs[target]['userAuth'] = (als.getStore() as any)?.userAuth;

      const traceId = (als.getStore() as any)?.traceId;
      if (traceId) {
        newInputArgs[target]['traceId'] = traceId;

        const timingArray = (als.getStore() as any)?.timing;
        if (timingArray) {
          newInputArgs[target]['traceIndex'] = timingArray.length;
          newInputArgs[target]['traceDelta'] = Date.now() - timingArray[timingArray.length - 1];
        }
        (als.getStore() as any)?.timing.push(Date.now());
      }

      return method.apply(this, [...newInputArgs]);
    },
  },
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
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

process.on('uncaughtException', (err) => {
  logger.fatal(err, 'uncaught exception');
});
