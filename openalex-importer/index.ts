import 'dotenv/config';
import { addDays, differenceInDays, endOfDay, startOfDay, subDays } from 'date-fns';
import cron from 'node-cron';
import { runImport } from './src/script.js';
import { logger } from './src/logger.js';

async function main() {
  const cliArgs = parseArgs();
  if (!cliArgs) {
    cron.schedule('*/2 * * * *', async () => {
      logger.info('Running a task evey day at 12:00 AM');
      const currentDate = new Date();
      // let from_created_date = startOfDay(subDays(currentDate, 1));
      // let to_created_date = endOfDay(subDays(currentDate, 1));
      const from_created_date = startOfDay(subDays(currentDate, 0));
      const to_created_date = endOfDay(subDays(currentDate, 0));
      await runImport({ from: from_created_date, to: to_created_date });
    });
  } else if (cliArgs.start) {
    logger.info('Running Script in Time travel moide ⏰✈️');
    const startDate = cliArgs.start;
    const endDate = cliArgs.end || cliArgs.start;
    let diffInDays = differenceInDays(endDate, startDate);
    logger.info({ diffInDays }, 'differenceInDays');
    // run script from start date to end date in a loop
    if (diffInDays === 0) {
      logger.info({ from: startOfDay(startDate), to: endOfDay(startDate) }, 'Single Day time travel');
      await runImport({ from: startOfDay(startDate), to: endOfDay(startDate) });
    } else {
      // run import from start to end date
      let currentDate = startDate;

      while (diffInDays > 0) {
        logger.info({ diffInDays, currentDate }, 'Run import script');
        // await runImport({ from: startOfDay(currentDate), to: endOfDay(currentDate) });
        currentDate = addDays(currentDate, 1);
        diffInDays = differenceInDays(endDate, currentDate);
      }

      logger.info({ currentDate, diffInDays, endDate }, 'Time travel completed ⏰✈️');
    }
  }

  return;
}

/**
 * Parses command line arguments for start and end dates.
 *
 * @returns An object with 'start' and 'end' Date properties if valid args are provided,
 *          or undefined if no valid args are found.
 * @throws {Error} If the start argument is invalid or missing.
 */
function parseArgs() {
  const parseDate = (dateString: string) => {
    try {
      return new Date(dateString);
    } catch (err) {
      logger.error({ err }, '[Error]::Parsing Date args');
      return undefined;
    }
  };

  logger.info({ args: process.argv }, 'ARGS');
  if (process.argv.length > 2) {
    const param: { start?: Date | undefined; end?: Date | undefined } = {};
    const start = process.argv[2];
    const end = process.argv[3];
    if (start.startsWith('--start=')) {
      param.start = parseDate(start.split('=')[1]);
    } else {
      throw new Error(
        `Invalid cli args\n
        Usage node ./index.js --start=[MM-DD-YYYY] --end=[MM-DD-YYYY]`,
      );
    }
    if (end.startsWith('--end=')) {
      param.end = parseDate(end.split('=')[1]);
    }
    logger.info(param, 'ARGS');
    console.log(param, 'ARGS');
    if (param.start) return param;
    return;
  }

  return;
}

main()
  .then((_) => logger.info('Open Alex Import script Scheduled'))
  .catch((err) => {
    logger.info({ err }, 'ERROR: data import crashed due to: ');
    console.log('Error: ', err);
  });

// Todo: Add k8s config file
