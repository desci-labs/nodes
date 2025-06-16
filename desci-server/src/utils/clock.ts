import { subDays, startOfDay, Duration } from 'date-fn-latest';
import { intervalToDuration, formatDuration } from 'date-fns';

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

/**
 * Returns a string representing the relative time between now and the target date
 * @param target Date object representing the target date
 * @param format optional: Array of keys from the Duration type to include in the formatted string. Defaults to ['days', 'hours', 'minutes']
 * @returns String representing the relative time between now and the target date
 */
export const getRelativeTime = (target: Date, format: (keyof Duration)[] = ['days', 'hours', 'minutes']): string => {
  const now = new Date();
  const targetDate = new Date(target);

  const duration = intervalToDuration({ start: now, end: targetDate });
  const formatted = formatDuration(duration, { format });
  return formatted;
};
