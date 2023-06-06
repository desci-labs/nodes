import pino from 'pino';

const logLevel = process.env.PINO_LOG_LEVEL || 'trace';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      level: logLevel,
    },
  },
});
export default logger;
