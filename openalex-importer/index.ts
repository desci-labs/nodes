import "dotenv/config";
import cron from "node-cron";
import { runImport } from "./src/script.js";
import { logger } from "./src/logger.js";
import { differenceInDays, endOfDay, startOfDay, subDays } from "date-fns";

async function main() {
  let cliArgs = parseArgs();
  if (!cliArgs) {
    cron.schedule("*/3 * * * *", async () => {
      logger.info("Running a task evey day at 12:00 AM");
      let currentDate = new Date();
      // let from_created_date = startOfDay(subDays(currentDate, 1));
      // let to_created_date = endOfDay(subDays(currentDate, 1));
      let from_created_date = startOfDay(subDays(currentDate, 0));
      let to_created_date = endOfDay(subDays(currentDate, 0));
      await runImport({ from: from_created_date, to: to_created_date });
    });
  } else if (cliArgs.start) {
    logger.info("Running Script in Time travel mode ⏰✈️");
    let startDate = cliArgs.start;
    let endDate = cliArgs.end || cliArgs.start;
    let diffInDays = differenceInDays(startDate, endDate!);
    logger.info({ diffInDays }, "differenceInDays");
    // run script from start date to end date in a loop
  }
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
      logger.error({ err }, "[Error]::Parsing Date args");
      return undefined;
    }
  };

  logger.info({ args: process.argv }, "ARGS");
  if (process.argv.length > 2) {
    let param: { start?: Date | undefined; end?: Date | undefined } = {};
    let start = process.argv[2];
    let end = process.argv[3];
    if (start.startsWith("--start=")) {
      param.start = parseDate(start.split("=")[1]);
    } else {
      throw new Error(
        `Invalid cli args\n
        Usage node ./index.js --start=[MM-DD-YYYY] --end=[MM-DD-YYYY]`,
      );
    }
    if (end.startsWith("--end=")) {
      param.end = parseDate(end.split("=")[1]);
    }
    logger.info(param, "ARGS");

    if (param.start) return param;
    return;
  }

  return;
}

main()
  .then((_) => logger.info("Open Alex Import script Scheduled"))
  .catch((err) => logger.info({ err }, "ERROR: data import crashed due to: "));
