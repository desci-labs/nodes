import 'dotenv/config';
import { addDays, differenceInDays, endOfDay, startOfDay, subDays } from 'date-fns';
import cron from 'node-cron';
import { runImport } from './src/script.js';
import { logger } from './src/logger.js';
import type { QueryInfo } from './src/db/index.js';
import { type Optional, parseDate } from './src/util.js';
import { errWithCause } from 'pino-std-serializers';
import { UTCDate } from '@date-fns/utc';

/** Every day at noon */
const DEFAULT_SCHEDULE = '0 12 * * *';

async function main() {
  const args = getRuntimeArgs();
  if (!args.query_from && !args.query_to) {
    logger.info({ args }, 'Time range not passed, configuring recurring task...');
    const schedule = args.query_schedule ?? DEFAULT_SCHEDULE;
    if (!args.query_schedule) {
      logger.info({ DEFAULT_SCHEDULE }, 'No schedule passed, using default');
    }

    cron.schedule(
      schedule,
      async () => {
        logger.info(
          { query_type: args.query_type },
          '🔔 Recurring task triggered, running import from previous day...',
        );
        const currentDate = new UTCDate();
        const query_from: UTCDate = startOfDay(subDays<UTCDate, UTCDate>(currentDate, 1));
        const query_to: UTCDate = endOfDay(subDays<UTCDate, UTCDate>(currentDate, 1));
        await runImport({ query_type: args.query_type, query_from, query_to });
        logger.info({ currentDate }, '🏁 Recurring import finished, idling until next trigger');
      },
      { timezone: 'UTC' },
    );
  } else if (args.query_from) {
    logger.info('Running Script in Time travel mode ⏰✈️');
    const startDate = args.query_from;
    const endDate = args.query_to || args.query_from;
    if (!args.query_to) {
      logger.info('query_to not set, treating as single day');
    }

    let diffInDays = differenceInDays(endDate, args.query_from);
    logger.info({ diffInDays }, 'differenceInDays');

    // run script from start date to end date in a loop
    if (diffInDays === 0) {
      const queryInfo: QueryInfo = {
        query_type: args.query_type,
        query_from: startOfDay(startDate),
        query_to: endOfDay(startDate),
      };
      logger.info(queryInfo, 'Single Day time travel');
      await runImport(queryInfo);
    } else {
      // run import from start to end date
      let currentDate = startDate;

      while (diffInDays > 0) {
        const queryInfo: QueryInfo = {
          query_type: args.query_type,
          query_from: startOfDay(currentDate),
          query_to: endOfDay(currentDate),
        };
        logger.info({ diffInDays, currentDate, queryInfo }, 'Running import for currentDate...');
        await runImport(queryInfo);
        currentDate = addDays(currentDate, 1);
        diffInDays = differenceInDays(endDate, currentDate);
      }

      logger.info({ currentDate, diffInDays, endDate }, 'Time travel completed ⏰✈️');
    }
  } else {
    logger.warn('Unexpected args; doing nothing.');
  }
}

const CLI_HELP = `Invalid args.

Usage: node index.js --query_type=created|updated [OPTIONALS]

Flags:
  --query_type=created|updated
  [--query_from=YYYY-MM-DD]
  [--query_to=YYYY-MM-DD]
  [--query_schedule='CRONTAB']

Corresponding environment variables:
  QUERY_TYPE
  QUERY_FROM
  QUERY_TO
  QUERY_SCHEDULE

Note: Dates are always UTC. Always queries full days.
`;

/**
 * Checks for 'VAR_NAME' in env and '--var_name=' in CLI flags, if empty throws with instructions
 * IF optional is true
 **/
const getParam = (name: string, required: boolean) => {
  let val = process.env[name.toUpperCase()];

  // Explicit flags override env
  const rawFlag = process.argv.find((arg) => arg.startsWith(`--${name.toLowerCase()}=`));
  if (rawFlag) {
    val = rawFlag.split('=')[1] as string;
  }

  if (!val && required) {
    throw new Error(CLI_HELP);
  }

  return val;
};

type RuntimeArgs = Optional<QueryInfo, 'query_from' | 'query_to'> & { query_schedule?: string };
/**
 * Parses and validates configuration arguments from env and/or flags
 */
const getRuntimeArgs = (): RuntimeArgs => {
  const raw = {
    query_type: getParam('query_type', true) as string,
    query_from: getParam('query_from', false),
    query_to: getParam('query_to', false),
    query_schedule: getParam('query_schedule', false),
  };

  const args: Partial<RuntimeArgs> = {};
  if (raw.query_type === 'created' || raw.query_type === 'updated') {
    args.query_type = raw.query_type;
  } else throw new Error(CLI_HELP);

  if (raw.query_from) {
    const parsed = parseDate(raw.query_from);
    if (!parsed) throw new Error(CLI_HELP);
    args.query_from = parsed;
  }

  if (raw.query_to) {
    const parsed = parseDate(raw.query_to);
    // Also throws if there is an end date but no start
    if (!parsed || !args.query_from) throw new Error(CLI_HELP);
    args.query_to = parsed;
  }

  if (raw.query_schedule) {
    if (cron.validate(raw.query_schedule)) {
      args.query_schedule = raw.query_schedule;
    } else {
      logger.error({ query_schedule: raw.query_schedule }, 'Got invalid crontab schedule');
      throw new Error(CLI_HELP);
    }
  }

  logger.info(args, 'Parsed runtime arguments');
  return args as RuntimeArgs;
};

try {
  await main();
} catch (e) {
  const err = e as Error;
  logger.error(errWithCause(err), 'Data import caught unexpected error');
}
