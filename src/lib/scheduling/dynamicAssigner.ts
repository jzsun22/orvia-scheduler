import {
    ShiftTemplate,
    Worker,
    ScheduledShift,
    ShiftAssignment,
    LocationOperatingHours,
    DayOfWeek,
    compareJobLevels, // Import the comparator
} from '@/lib/types';
import { ScheduleGenerationState } from './scheduleState';
import { 
    mapDayOfWeekToDate, 
    checkWorkerShiftEligibility, // Use shared helper
    formatDateToYYYYMMDD, // Import the date formatting helper
    getDayOfWeekStringFromDate
} from './utils';
import { calculateShiftDurationHours } from './time-utils';
import { v4 as uuidv4 } from 'uuid';

/**
 * Assigns a worker to a specific dynamic (non-lead) template instance (template + date).
 * Prioritizes candidates based on Job Level (descending), then by least currently assigned hours (ascending).
 * Leaves slot unfilled if no eligible worker is found.
 * 
 * @param template The ShiftTemplate instance to fill.
 * @param date The date (YYYY-MM-DD or Date) for this instance.
 * @param workers List of all potentially relevant workers.
 * @param state The ScheduleGenerationState object.
 * @param weekDates Array of 7 Date objects for the target week (Mon-Sun).
 * @param locationOperatingHoursMap Map<DayOfWeek, LocationOperatingHours> for the target location.
 * @returns An object containing an array of warning messages (likely minimal).
 */
export function assignDynamicShifts(
    template: ShiftTemplate,
    date: string | Date,
    workers: Worker[],
    state: ScheduleGenerationState,
    weekDates: Date[],
    locationOperatingHoursMap: Map<DayOfWeek, LocationOperatingHours>
): { warnings: string[] } {
    const warnings: string[] = [];
    // Only process non-lead templates
    if (template.lead_type) {
        return { warnings };
    }
    // Convert date to Date object and string
    const shiftDate = typeof date === 'string' ? new Date(date) : date;
    const dateStr = formatDateToYYYYMMDD(shiftDate);
    const dayOfWeek = getDayOfWeekStringFromDate(shiftDate);
    const locationHours = locationOperatingHoursMap.get(dayOfWeek);
    if (!locationHours) {
        warnings.push(`Missing operating hours for ${dayOfWeek} at location ${template.location_id}. Cannot assign dynamic shift for template ${template.id}.`);
        return { warnings };
    }
    // Find eligible candidates using the shared helper
    const candidates = workers.filter(worker => 
        checkWorkerShiftEligibility(worker, template, shiftDate, state, locationHours)
    );
    if (candidates.length === 0) {
        // Silently leave unfilled as requested
        return { warnings };
    }
    // Prioritize: 1. Job Level DESC, 2. Current Hours ASC
    candidates.sort((a, b) => {
        const levelComparison = compareJobLevels(b.job_level, a.job_level); // Higher level first
        if (levelComparison !== 0) {
            return levelComparison;
        }
        // If job levels are the same, sort by hours (ascending)
        const hoursA = state.getWorkerHours(a.id);
        const hoursB = state.getWorkerHours(b.id);
        return hoursA - hoursB; // Lower hours first
    });
    // Select the best candidate
    const winner = candidates[0];
    // Create Shift and Assignment
    const newScheduledShift: ScheduledShift = {
        id: uuidv4(),
        shift_date: dateStr,
        template_id: template.id,
        worker_id: winner.id,
        location_id: template.location_id,
        position_id: template.position_id,
        start_time: template.start_time,
        end_time: template.end_time,
        is_recurring_generated: false, // Assigned dynamically
        created_at: new Date().toISOString(),
    };
    const newShiftAssignment: ShiftAssignment = {
        id: uuidv4(),
        scheduled_shift_id: newScheduledShift.id,
        worker_id: winner.id,
        assignment_type: 'regular', // Regular assignment
        is_manual_override: false,
        assigned_start: template.start_time,
        assigned_end: template.end_time,
        created_at: new Date().toISOString(),
    };
    let shiftDurationHours = 0;
    try {
        shiftDurationHours = calculateShiftDurationHours(template.start_time, template.end_time);
    } catch (error: any) {
        warnings.push(`Error calculating duration for dynamic assignment (Template ${template.id}): ${error.message}. Skipping assignment.`); 
        return { warnings };
    }
    // Update state
    state.addAssignment(newScheduledShift, newShiftAssignment, template.id, shiftDurationHours);
    return { warnings };
} 