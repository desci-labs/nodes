import "dotenv/config";
import cron from "node-cron";
import { runImport } from "./src/script.js";
import { logger } from "./src/logger.js";

async function main() {
  cron.schedule("0 0 * * *", async () => {
    logger.info("running a task every minute");
    await runImport();
  });
  // await runImport();
}

main()
  .then((_) => logger.info("Open Alex Import script Scheduled"))
  .catch((err) => logger.info({ err }, "ERROR: data import crashed due to: "));
