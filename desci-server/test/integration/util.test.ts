import { subDays } from 'date-fns';
import { describe, it, expect } from 'vitest';

import { getUtcDateXDaysAgo } from '../../src/utils/clock.js';

describe.skip('utils', async () => {
  it('should subtract days correctly with subDays', async () => {
    // Test that subDays correctly handles month boundaries
    const startDate = new Date(2023, 0, 1); // Jan 1, 2023
    const threeDaysEarlier = subDays(startDate, 3);

    // Should be Dec 29, 2022
    expect(threeDaysEarlier.getFullYear()).toBe(2022);
    expect(threeDaysEarlier.getMonth()).toBe(11); // December (0-based)
    expect(threeDaysEarlier.getDate()).toBe(29);
  });

  it('should get UTC midnight x days ago', async () => {
    const daysAgo = 1;
    const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);

    // Create expected date - midnight UTC X days ago
    const now = new Date();
    const expectedDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysAgo,
        0,
        0,
        0,
        0, // Set to midnight UTC
      ),
    );

    expect(utcMidnightXDaysAgo.getTime()).toBe(expectedDate.getTime());
  });
});
