import { pino } from 'pino';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { createWriteStream, rmSync } from 'node:fs';

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

const TMP_DIR = path.join(process.cwd(), 'logs');
if (!existsSync(TMP_DIR)) {
  mkdirSync(TMP_DIR);
}

export const removeIfExists = (filename: string) => {
  const logfile = path.join(TMP_DIR, filename);
  if (existsSync(logfile)) {
    rmSync(logfile);
  }
}

export const appendToLogs = (data: unknown[], logFile: string) => {
  const LOG_FILE = path.join(TMP_DIR, logFile);
  const writeStream = createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
  for (const item of data) {
    writeStream.write(JSON.stringify(item));
    writeStream.write('\n');
  }
  writeStream.end();
};
