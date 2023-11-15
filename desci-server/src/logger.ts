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
  options: { destination: `${__dirname}/../log/server.log` },
  level: 'trace',
};

const logger = pino({
  level: logLevel,
  serializers: {
    files: omitBuffer,
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
