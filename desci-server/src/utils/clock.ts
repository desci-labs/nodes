import { subDays, startOfDay } from 'date-fn-latest';

/**
 * Returns a Date object representing UTC midnight X days ago
 * Uses subDays for reliable date calculation across month boundaries
 * @param daysAgo number of days to subtract from current date
 * @returns Date object representing UTC midnight X days ago
 */
export const getUtcDateXDaysAgo = (daysAgo: number): Date => {
  // Use subDays to properly handle month boundaries
  const targetDate = subDays(new Date(), daysAgo - 1);

  // Create a new date at UTC midnight
  return new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
};
