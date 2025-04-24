import 'dotenv/config';
import { addDays, differenceInDays, endOfDay, isAfter, isSameDay, startOfDay } from 'date-fns';
import { logger } from './src/logger.js';
import { getDrizzle, getNextDayToImport, pool, type OaDrizzle, type QueryInfo } from './src/db/index.js';
import { type Optional, parseDate } from './src/util.js';
import { errWithCause } from 'pino-std-serializers';
import { UTCDate } from '@date-fns/utc';
import { runImportPipeline } from './src/pipeline.js';
import { Cron } from 'croner';

export const MAX_PAGES_TO_FETCH = parseInt(process.env.MAX_PAGES_TO_FETCH || '100');
export const IS_DEV = process.env.NODE_ENV === 'development';
export const SKIP_LOG_WRITE = process.env.SKIP_LOG_WRITE;

/** crontab specifying every 10 minutes */
const DEFAULT_SCHEDULE = '*/5 * * * *';

/**
 * Runs an import job for the first day not included in an 'updated' batch, unless an import is currently ongoing.
 */
const runImportTask = async (db: OaDrizzle, query_type: QueryInfo['query_type']) => {
  const nextDay: UTCDate = await getNextDayToImport(db, query_type);
  const currentDate: UTCDate = new UTCDate();
  if (isSameDay(nextDay, currentDate) || isAfter(nextDay, currentDate)) {
    logger.info({ nextDay, currentDate }, '💤 Next day to import is today or in the future, snoozing...');
    return;
  }

  const importParams: QueryInfo = {
    query_from: startOfDay(nextDay),
    query_to: endOfDay(nextDay),
    query_type,
  };

  logger.info(
    {
      nextDay,
      importParams,
    },
    '🔔 Recurring task triggered, running import for next unhandled day...',
  );

  await runImportPipeline(db, importParams);
  logger.info({ currentDate }, '🏁 Recurring import finished, idling until next trigger');
};

/**
 * Without configuring a specific time, main defaults to forking a background cronjob.
 *
 */
async function main(): Promise<void> {
  const args = getRuntimeArgs();
  const db = getDrizzle();

  if (!args.query_from && !args.query_to) {
    logger.info({ args }, '➿  Time range not passed, configuring recurring task...');
    const schedule = args.query_schedule ?? DEFAULT_SCHEDULE;
    if (!args.query_schedule) {
      logger.info({ DEFAULT_SCHEDULE }, 'No schedule passed, using default');
    }

    const job = new Cron(schedule, async () => runImportTask(db, args.query_type), {
      timezone: 'UTC',
      protect: () => {
        logger.info('💤 Recurring task invoked while an import is already running, snoozing...');
      },
      // For some reason this doesn't trigger if the stream callbacks catches errors, but the app exits anyway so OK
      catch: (e, job) => {
        logger.error({ error: errWithCause(e as Error) }, '💥 Cron job caught an error');
        job.stop();
        throw e;
      },
    });

    // Kick off first run right away
    void job.trigger();
  } else if (args.query_from) {
    logger.info('Running Script in Time travel mode ⏰✈');
    const startDate: UTCDate = args.query_from;
    const endDate: UTCDate = args.query_to || args.query_from;
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
      await runImportPipeline(db, queryInfo);
    } else {
      // run import from start to end date
      let currentDate = startDate;

      while (diffInDays >= 0) {
        const queryInfo: QueryInfo = {
          query_type: args.query_type,
          query_from: startOfDay(currentDate),
          query_to: endOfDay(currentDate),
        };
        logger.info({ diffInDays, currentDate, queryInfo }, 'Running import for currentDate...');
        await runImportPipeline(db, queryInfo);
        currentDate = addDays(currentDate, 1);
        diffInDays = differenceInDays(endDate, currentDate);
      }

      logger.info({ currentDate, diffInDays, endDate }, 'Time travel completed ⏰✈');
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

Semantics:
- No specified query range => schedule recurring job trying to continue updates from the last successful import
- Only query_from => query that single day
- Both query_from and query_to => query range (inclusive)
- No query_schedule => defaults to trying to perform next import every 5 minutes, no-op if already in progress
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
  console.log();

  const args: Partial<RuntimeArgs> = {};
  if (raw.query_type === 'created' || raw.query_type === 'updated') {
    args.query_type = raw.query_type;
  } else throw new Error(CLI_HELP, { cause: raw });

  if (raw.query_from) {
    const parsed = parseDate(raw.query_from);
    if (!parsed) throw new Error(CLI_HELP, { cause: raw });
    args.query_from = parsed;
  }

  if (raw.query_to) {
    const parsed = parseDate(raw.query_to);
    // Also throws if there is an end date but no start
    if (!parsed || !args.query_from) throw new Error(CLI_HELP, { cause: raw });
    args.query_to = parsed;
  }

  if (raw.query_schedule) {
    args.query_schedule = raw.query_schedule;
  }

  logger.info(args, 'Parsed runtime arguments');
  return args as RuntimeArgs;
};

process.on('uncaughtException', async (err) => {
  logger.fatal(errWithCause(err), 'uncaught exception');
  if (!pool.ending) {
    await pool.end();
  }
  process.exit(1);
});

process.on('beforeExit', async () => {
  logger.info('Process exiting, shutting down pool...')
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM signal. Shutting down pool...");
  if (!pool.ending) {
    await pool.end();
  }
});

process.on("SIGINT", async () => {
  logger.info("Received SIGINT signal. Shutting down pool...");
  if (!pool.ending) {
    await pool.end();
  }
});

/**
 * If app is running it's cron jobs, main() will exit but the cron cycle keeps running in the background,
 * so don't call pool.end() after main()!
 */
await main();
