import pino from 'pino';

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
  options: { destination: `${__dirname}/server.log` },
  level: 'trace',
};

const logger = pino({
  level: logLevel,
  serializers: {
    files: omitBuffer,
  },
  transport: {
    targets: [
      devTransport,
      // fileTransport
    ],
  },
  redact: {
    paths: [
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
    ],
  },
});
export default logger;

function omitBuffer(array) {
  return array.map((obj) => {
    const { buffer, ...rest } = obj;
    return rest;
  });
}

process.on('uncaughtException', (err) => {
  logger.fatal(err, 'uncaught exception');
});
