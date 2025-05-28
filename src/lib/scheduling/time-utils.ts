import { TimeRange } from '@/lib/types';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

// Application's primary timezone (America/Los_Angeles for PST/PDT)
export const APP_TIMEZONE = 'America/Los_Angeles';

/**
 * Parses a time string (HH:mm or HH:mm:ss) into a Date object in the application's timezone (PST/PDT).
 * The returned Date object will have today's date but the time set according to the input.
 * Seconds are ignored if present in the string format.
 * @param time - The time string or Date object.
 * @returns A Date object representing the parsed time on today's date in PST/PDT.
 * @throws Error if the string format is invalid.
 */
export function parseTime(time: string | Date): Date {
    if (time instanceof Date) {
        // Convert the input Date to PST/PDT
        return toZonedTime(time, APP_TIMEZONE);
    }

    const parts = time.split(':');
    if (parts.length < 2 || parts.length > 3) {
        throw new Error(`Invalid time format: ${time}. Expected HH:mm or HH:mm:ss`);
    }

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    // Seconds (parts[2]) are ignored if present

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error(`Invalid time values: ${time}`);
    }

    // Create today's date in PST/PDT
    const now = new Date();
    const pstDate = toZonedTime(now, APP_TIMEZONE);
    
    // Create a full ISO datetime string in PST/PDT
    const dateStr = formatInTimeZone(pstDate, APP_TIMEZONE, 'yyyy-MM-dd');
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    
    // Parse the full datetime string as PST/PDT
    return toZonedTime(`${dateStr}T${timeStr}`, APP_TIMEZONE);
}

/**
 * Formats a Date object into a time string (HH:mm) in the application's timezone (PST/PDT).
 * @param date The Date object to format
 * @returns A string in HH:mm format representing the time in PST/PDT
 */
export function formatTime(date: Date): string {
    return formatInTimeZone(date, APP_TIMEZONE, 'HH:mm');
}

/**
 * Checks if two time ranges overlap, comparing times in PST/PDT.
 */
export function timeRangeOverlaps(range1: TimeRange, range2: TimeRange): boolean {
    const start1 = parseTime(range1.start_time);
    const end1 = parseTime(range1.end_time);
    const start2 = parseTime(range2.start_time);
    const end2 = parseTime(range2.end_time);

    return start1 < end2 && start2 < end1;
}

/**
 * Checks if a time is within a range, comparing times in PST/PDT.
 */
export function isTimeInRange(time: string, range: TimeRange): boolean {
    const timeDate = parseTime(time);
    const startDate = parseTime(range.start_time);
    const endDate = parseTime(range.end_time);

    return timeDate >= startDate && timeDate <= endDate;
}

/**
 * Calculates the duration between two time strings in hours, interpreting times in PST/PDT.
 * 
 * @param startTimeString Start time in "HH:mm" or "HH:mm:ss" format (PST/PDT).
 * @param endTimeString End time in "HH:mm" or "HH:mm:ss" format (PST/PDT).
 * @returns The duration in hours (e.g., 8.5 for 8 hours 30 minutes).
 * @throws Error if time strings are invalid or end time is before start time.
 */
export function calculateShiftDurationHours(startTimeString: string, endTimeString: string): number {
    const startDate = parseTime(startTimeString);
    const endDate = parseTime(endTimeString);

    if (endDate.getTime() < startDate.getTime()) {
        console.warn(`End time ${endTimeString} is before start time ${startTimeString} in PST/PDT. Assuming 0 duration.`);
        return 0;
    }

    const durationMilliseconds = endDate.getTime() - startDate.getTime();
    const durationHours = durationMilliseconds / (1000 * 60 * 60);

    return durationHours;
}

/**
 * Helper function to get the current timezone abbreviation (PST/PDT).
 * Useful for UI display.
 */
export function getCurrentTimezoneAbbr(): string {
    const now = new Date();
    return formatInTimeZone(now, APP_TIMEZONE, 'zzz');
}