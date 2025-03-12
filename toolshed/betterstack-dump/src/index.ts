import 'dotenv/config';
import { logger } from './logger.js';
import { errWithCause } from 'pino-std-serializers';
import { runImportPipeline } from './pipeline.js';
import { parseDate } from './util.js';

async function main() {
  const args = getRuntimeArgs();
  await runImportPipeline(args);
}

const CLI_HELP = `Invalid args.

Usage: npm start --query='...' [optionals]

Flags:
  --query='search query in Live tail Query Language'
  [--order=newest_first] (default: oldest_first)
  [--batch=1000] (default: 1000)
  [--from=ISO8601 string] (default: to ? to-30m : now-30m)
  [--to=ISO8610 string] (default: from ? from+30m : now)
  [--max_pages=number] (default: no limit)
`;

/**
 * Checks for 'VAR_NAME' in env and '--var_name=' in CLI flags, if empty throws with instructions
 * IF optional is true
 **/
const getParam = (name: string, required: boolean) => {
  const rawFlag = process.argv.find((arg) => arg.startsWith(`--${name.toLowerCase()}=`));
  let val: string | undefined;
  if (rawFlag) {
    val = rawFlag.split('=')[1] as string;
  }

  if (!val && required) {
    throw new Error(CLI_HELP);
  }

  return val;
};

type ResultOrder = 'newest_first' | 'oldest_first';

export type RuntimeArgs = {
  query: string;
  order?: ResultOrder;
  batch?: number;
  from: Date | undefined;
  to: Date | undefined;
  max_pages?: number;
};

/**
 * Parses and validates configuration arguments from env and/or flags
 */
const getRuntimeArgs = (): RuntimeArgs => {
  const raw = {
    query: getParam('query', true) as string,
    order: getParam('order', false),
    batch: getParam('batch', false),
    from: getParam('from', false),
    to: getParam('to', false),
    max_pages: getParam('max_pages', false),
  };
  logger.info(raw, 'Raw flags');

  const args: Partial<RuntimeArgs> = {};
  if (raw.query) {
    args.query = raw.query;
  } else throw new Error(CLI_HELP);

  if (raw.order && ['newest_first', 'oldest_first'].includes(raw.order)) {
    args.order = raw.order as ResultOrder;
  }

  if (raw.to) {
    const parsed = parseDate(raw.to);
    args.to = parsed;
  }

  if (raw.from) {
    const parsed = parseDate(raw.from);
    args.from = parsed;
  }

  if (raw.batch) {
    args.batch = parseInt(raw.batch);
  }

  if (raw.max_pages) {
    args.max_pages = parseInt(raw.max_pages);
  }

  logger.info(args, 'Parsed flags');
  return args as RuntimeArgs;
};

try {
  await main();
} catch (e) {
  const err = e as Error;
  logger.error(errWithCause(err), 'Dump caught unexpected error');
}
