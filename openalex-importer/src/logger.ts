import { pino } from 'pino';

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
  transport:
    process.env.NODE_ENV === 'production'
      ? { targets: [] }
      : {
          targets: [devTransport],
        },
  redact: {
    paths: [],
  },
});

function omitBuffer(array) {
  return array.map((obj) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { buffer, ...rest } = obj;
    return rest;
  });
}

process.on('uncaughtException', (err) => {
  logger.fatal(err, 'uncaught exception');
});
