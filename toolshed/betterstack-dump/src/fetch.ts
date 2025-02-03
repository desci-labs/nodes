import { errWithCause } from 'pino-std-serializers';
import { logger } from './logger.js';
import { sleep } from './util.js';

const MAX_RETRIES = 5;
const BASE_DELAY = 1_000;

type ApiResponse<T> = {
  data: T[];
  pagination: {
    next: string | undefined;
  };
};

const headers = { Authorization: `Bearer ${process.env.BETTERSTACK_TOKEN as string}` };

export async function fetchPage<T>(
  url: string,
): Promise<{ data: T[]; next: string | undefined }> {
  
  const request = new Request(url, { headers });
  const response = (await fetch(request)) as Response;

  if (response.ok && response.status === 200) {
    if (response.headers.get('content-type')?.includes('application/json')) {
      const res = (await response.json()) as ApiResponse<T[]>;
      return {
        data: res.data as T[],
        next: res.pagination.next,
      };
    } else {
      logger.error(response, 'Unexpected API response');
      throw new Error('Unexpected API response');
    }
  } else {
    logger.error(
      {
        url,
        status: response.status,
        message: response.statusText,
        data: await response.text(),
      },
      'Betterstack API request failed',
    );
    throw new Error('Betterstack API request failed');
  }
}

export const fetchWithRetry = async (url: string) => {
    let lastError: Error | null = null;
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        return await fetchPage(url);
      } catch (error) {
        lastError = error;
        retries++;

        const delayMs = retries * BASE_DELAY;
        logger.warn(
          { error: errWithCause(error), retries, MAX_RETRIES, backoff: delayMs },
          'Fetch attempt failed'
        );

        await sleep(delayMs);
      }
    }

    throw new Error(
      `Fetch failed after ${MAX_RETRIES} retries`,
      { cause: lastError }
    );
  };
