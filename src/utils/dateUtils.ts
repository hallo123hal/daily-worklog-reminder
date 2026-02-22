import { format, startOfDay, endOfDay } from 'date-fns';

/**
 * Get today's date in YYYY-MM-DD format
 * This is used for querying worklogs for the current day
 */
export function getTodayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Get the start of today in ISO format (for Jira API queries)
 * Jira API expects dates in ISO 8601 format
 */
export function getTodayStartISO(): string {
  return startOfDay(new Date()).toISOString();
}

/**
 * Get the end of today in ISO format (for Jira API queries)
 */
export function getTodayEndISO(): string {
  return endOfDay(new Date()).toISOString();
}

/**
 * Convert seconds to hours with 2 decimal precision
 * Used for converting timeSpentSeconds from Jira worklog API
 */
export function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}
