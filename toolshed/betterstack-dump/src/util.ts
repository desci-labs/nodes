import { errWithCause } from 'pino-std-serializers';
import { logger } from './logger.js';

export const parseDate = (dateString: string): Date | undefined => {
  try {
    return new Date(dateString);
  } catch (e) {
    const err = e as Error;
    logger.error({ dateString, err: errWithCause(err) }, 'Failed to parse date, using default');
    return undefined;
  }
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const buildQueryString = (params: Record<string, any>) =>
  Object.entries(params).reduce((queryStr, [key, value]) => {
    if (value) {
      const param = `${key}=${value}`;
      return queryStr ? `${queryStr}&${param}` : param;
    } else {
      return queryStr;
    }
  }, '');
