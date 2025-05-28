import { 
    DayOfWeek, 
    TimeRange, 
    WorkerAvailability, 
    LocationOperatingHours, 
    Worker, 
    ShiftTemplate
} from '@/lib/types';
import { parseTime, calculateShiftDurationHours } from './time-utils';
import { ScheduleGenerationState } from './scheduleState';

/**
 * Calculates the date range for the week (Monday to Sunday) containing the given date.
 * 
 * @param dateInWeek A date object that falls within the desired week.
 * @returns An array of 7 Date objects, starting from Monday.
 */
export function getWeekDateRange(dateInWeek: Date): Date[] {
    // Use UTC methods to avoid timezone issues
    const dayOfWeek = dateInWeek.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const differenceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust Sunday

    // Calculate the timestamp for Monday midnight UTC
    const monday = new Date(dateInWeek.getTime()); // Clone the date
    monday.setUTCDate(monday.getUTCDate() + differenceToMonday);
    monday.setUTCHours(0, 0, 0, 0); // Normalize to start of UTC day

    const weekDates: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const dayTimestamp = monday.getTime() + i * 24 * 60 * 60 * 1000;
        weekDates.push(new Date(dayTimestamp));
    }

    return weekDates;
}

/**
 * Maps a day of the week string ('monday', 'tuesday', etc.) to the corresponding Date object
 * within a given week's date array.
 * 
 * @param day The DayOfWeek string ('monday', 'tuesday', ...).
 * @param weekDates An array of 7 Date objects representing the week, starting from Monday.
 * @returns The Date object corresponding to the given day.
 * @throws Error if the day string is invalid or the weekDates array is not 7 days.
 */
export function mapDayOfWeekToDate(day: DayOfWeek, weekDates: Date[]): Date {
    if (weekDates.length !== 7) {
        throw new Error('weekDates array must contain exactly 7 Date objects.');
    }

    const dayIndexMap: Record<DayOfWeek, number> = {
        monday: 0,
        tuesday: 1,
        wednesday: 2,
        thursday: 3,
        friday: 4,
        saturday: 5,
        sunday: 6,
    };

    const index = dayIndexMap[day];
    if (index === undefined) {
        throw new Error(`Invalid DayOfWeek string: ${day}`);
    }

    return weekDates[index];
}

// Helper to convert Date object's day index (0-6) to DayOfWeek string ('sunday', 'monday', etc.)
// Note: getUTCDay() returns 0 for Sunday, 1 for Monday, etc.
const DAY_INDEX_MAP: Record<number, DayOfWeek> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday'
};

export function getDayOfWeekStringFromDate(date: Date): DayOfWeek {
    const dayIndex = date.getUTCDay();
    return DAY_INDEX_MAP[dayIndex];
}

/**
 * Checks if a given shift time range falls completely within a worker's availability 
 * for a specific date, based on availability labels and the location's morning cutoff.
 * 'all_day' => always available.
 * 'morning' => shift must END by morning_cutoff.
 * 'afternoon' => shift must START at or after morning_cutoff.
 * 
 * @param shiftTimeRange The start and end time of the shift (HH:mm).
 * @param shiftDate The specific calendar date of the shift.
 * @param workerAvailability The worker's availability object (mapping DayOfWeek to AvailabilityLabel[]).
 * @param locationHoursForDay The operating hours record (used for morning_cutoff).
 * @returns True if the shift timing aligns with any applicable availability label, false otherwise.
 */
export function isShiftWithinAvailability(
    shiftTimeRange: TimeRange,
    shiftDate: Date,
    workerAvailability: WorkerAvailability,
    locationHoursForDay: LocationOperatingHours
): boolean {
    
    const dayOfWeek = getDayOfWeekStringFromDate(shiftDate);
    const todaysAvailabilityLabels = workerAvailability[dayOfWeek] || [];

    if (todaysAvailabilityLabels.length === 0 || (todaysAvailabilityLabels.length === 1 && todaysAvailabilityLabels[0] === 'none')) {
        return false;
    }

    try {
        const shiftStartTime = parseTime(shiftTimeRange.start_time);
        const shiftEndTime = parseTime(shiftTimeRange.end_time);
        const locationMorningCutoff = parseTime(locationHoursForDay.morning_cutoff);

        for (const label of todaysAvailabilityLabels) {
            if (label === 'all_day') {
                // 'all_day' covers any shift time
                return true; 
            } else if (label === 'morning') {
                // Shift must end by the cutoff time
                if (shiftEndTime.getTime() <= locationMorningCutoff.getTime()) {
                    return true;
                }
            } else if (label === 'afternoon') {
                // Shift must start at or after the cutoff time
                if (shiftStartTime.getTime() >= locationMorningCutoff.getTime()) {
                    return true;
                }
            }
            // Ignore 'none' label
        }

    } catch (error) {
        console.error(`Error during availability check for ${dayOfWeek} (Shift: ${shiftTimeRange.start_time}-${shiftTimeRange.end_time}):`, error);
        return false; 
    }

    // If loop completes without finding a suitable availability block
    return false;
}

/**
 * Checks if a worker is eligible to be assigned to a specific shift template instance on a given date.
 * This checks position, location, availability, daily conflicts, and preferred hours.
 * NOTE: It does NOT check the worker.is_lead status, as that's specific to the lead assigner.
 * 
 * @param worker The worker object (potentially with nested position/location data).
 * @param template The ShiftTemplate being considered.
 * @param shiftDate The specific Date of the shift instance.
 * @param state The current ScheduleGenerationState.
 * @param locationHours The LocationOperatingHours for the specific day of the week.
 * @returns True if the worker is eligible, false otherwise.
 */
export function checkWorkerShiftEligibility(
    worker: Worker,
    template: ShiftTemplate,
    shiftDate: Date,
    state: ScheduleGenerationState,
    locationHours: LocationOperatingHours | undefined // Allow undefined check
): boolean {

    if (!locationHours) {
        return false; 
    }

    // 1. Check for existing assignment on this date
    if (state.isWorkerAssignedOnDate(worker.id, shiftDate)) {
        return false;
    }

    // 2. Check preferred hours
    const workerHours = state.getWorkerHours(worker.id);
    const preferredHours = worker.preferred_hours_per_week;
    let templateDuration = 0;
    try {
        templateDuration = calculateShiftDurationHours(template.start_time, template.end_time);
    } catch (error) {
        return false; 
    }

    if (preferredHours !== null && (workerHours + templateDuration) > preferredHours) {
        return false; 
    }

    // 3. Check position eligibility - uses 'positions' alias from fetchWorkers
    const hasPosition = worker.positions?.some(p => p.position?.id === template.position_id) ?? false;
    if (!hasPosition) {
        return false;
    }

    // 4. Check location eligibility - uses 'locations' alias from fetchWorkers
    const hasLocation = worker.locations?.some(l => l.location?.id === template.location_id) ?? false;
    if (!hasLocation) {
        return false;
    }
    
    // 5. Check availability for the shift time
    const templateTimeRange = { start_time: template.start_time, end_time: template.end_time };
    let isAvailable = false;
    try {
        isAvailable = isShiftWithinAvailability(templateTimeRange, shiftDate, worker.availability, locationHours);
    } catch (error) {
        return false; 
    }

    if (!isAvailable) {
        return false;
    }

    return true; 
}

/**
 * Formats a Date object into a "YYYY-MM-DD" string using UTC.
 * 
 * @param date The Date object to format.
 * @returns The formatted date string.
 */
export function formatDateToYYYYMMDD(date: Date): string {
    if (!date || !(date instanceof Date)) {
        // Handle potential invalid input gracefully
        console.error("Invalid date passed to formatDateToYYYYMMDD");
        // Return a value or throw error depending on desired strictness
        // Throwing might be safer to catch logic errors earlier.
        throw new Error("Invalid date object provided for formatting.");
    }
    const year = date.getUTCFullYear();
    // Month is 0-indexed, so add 1
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0'); 
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
} 