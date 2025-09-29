import { AsyncLocalStorage } from 'async_hooks';

import { pino } from 'pino';

export const als = new AsyncLocalStorage();

const logLevel = process.env.PINO_LOG_LEVEL || 'trace';

const devTransport = {
  target: 'pino-pretty',
  level: logLevel,
  options: {
    colorize: true,
  },
};

export const logger = pino({
  level: logLevel,
  serializers: {
    files: omitBuffer,
  },
  hooks: {
    logMethod: function (inputArgs, method) {
      try {
        //get caller
        const stack = new Error().stack.split('\n');
        // find first line that is not from this file

        let callerFilePath;
        try {
          const intermediate = stack.filter(
            (a) => a.includes('file:///') && !(a.includes('/dist/logger.') || a.includes('/src/logger.')),
          )[0];

          if (intermediate) {
            callerFilePath = intermediate
              .split('(')[1]
              .split(')')[0]
              .replace('file:///app/desci-server/src/', '')
              .replace('file:///app/dist/', '');
          }
        } catch (err) {
          // callerFilePath = '-unknown-';
        }

        let target = typeof inputArgs[0] == 'string' ? 1 : 0;
        let newInputArgs = [...inputArgs];

        if (!newInputArgs[target]) {
          newInputArgs[target] = {};
        } else if (typeof newInputArgs[target] !== 'object') {
          const rawValue = {};
          rawValue['stringLogs'] = inputArgs;

          rawValue['error'] =
            'this means your pino log statement is incorrectly formatted, check the order of the arguments';
          target = 0;
          newInputArgs[target] = { rawValue };
          newInputArgs = [newInputArgs[0], inputArgs[0]];
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
      } catch (err) {
        // logger.error({ err }, 'error in logMethod hook');
        return method.apply(this, inputArgs);
      }
    },
  },
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : {
          targets: [devTransport],
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
      'access_token',
      'refresh_token',
      '*.access_token',
      '*.refresh_token',
      'jwtToken',
      '*.jwtToken',
    ],
  },
});

function omitBuffer(array) {
  return array.map((obj) => {
    const { buffer, ...rest } = obj;
    return rest;
  });
}
