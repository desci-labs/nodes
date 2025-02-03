
/** Rate limiter for sequential requests.
 *
 * Does not work with concurrency, nor allows bursts. Should prob implement smt like token buckets algorithm
 * if we need to parallelize for the Authors/Sources/etc APIs.
 */
export class RateLimiter {
  private lastRequest: number = 0;
  private readonly minGap: number;

  constructor(minGapMs: number) {
    this.minGap = minGapMs;
    this.lastRequest = 0;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;

    if (timeSinceLastRequest < this.minGap) {
      const waitTime = this.minGap - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequest = Date.now();
  }
}
