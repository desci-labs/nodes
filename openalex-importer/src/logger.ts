import { pino } from 'pino';
import path from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { appendFileSync } from 'node:fs';
import { rimraf } from 'rimraf';

const logLevel = process.env.PINO_LOG_LEVEL || 'trace';

const devTransport = {
  target: 'pino-pretty',
  level: logLevel,
  options: {
    colorize: true,
  },
};

const stdoutTransport = {
  target: 'pino/file',
  options: { destination: 1 } // this writes to STDOUT,
};

export const logger = pino({
  level: logLevel,
  serializers: {
    files: omitBuffer,
  },
  transport:
    process.env.NODE_ENV === 'production'
      ? { targets: [stdoutTransport] }
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

const TMP_DIR = path.join(process.cwd(), 'logs');
if (!existsSync(TMP_DIR)) {
  mkdirSync(TMP_DIR);
}

/** Write raw and transformed data to logfiles for manual inspection */
export const saveToLogs = (data: any, logFile: string) => {
  const LOG_FILE = path.join(TMP_DIR, logFile);

  if (data) {
    writeFileSync(LOG_FILE, JSON.stringify(data));
  }
};

export const appendToLogs = (data: unknown, logFile: string) => {
  const LOG_FILE = path.join(TMP_DIR, logFile);
  appendFileSync(LOG_FILE, JSON.stringify(data));
  appendFileSync(LOG_FILE, '\n');
};

export const nukeOldLogs = async () => {
  const rmGlob = `${TMP_DIR || 'VERY_UNLIKELY_DIR_JUST_TO_BE_SURE'}/*`;
  await rimraf(rmGlob, { glob: true });
};
