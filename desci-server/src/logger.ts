import pino from 'pino';

const logLevel = process.env.PINO_LOG_LEVEL || 'trace';

const logger = pino({
  serializers: {
    files: omitBuffer,
  },
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      level: logLevel,
    },
  },
});
export default logger;

function omitBuffer(array) {
  return array.map((obj) => {
    const { buffer, ...rest } = obj;
    return rest;
  });
}
