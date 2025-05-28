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
    checkWorkerShiftEligibility, // Import shared helper
    formatDateToYYYYMMDD, // Import for date formatting
    getDayOfWeekStringFromDate // Import for day of week string
} from './utils';
import { calculateShiftDurationHours } from './time-utils';
import { v4 as uuidv4 } from 'uuid';

/**
 * Assigns a lead worker to a specific template instance (template + date).
 * Ensures only one opening and one closing lead assignment exists per day.
 * Prioritizes lead candidates based on job level (descending).
 * Leaves slot unassigned if no eligible worker is found or if there's a tie.
 * 
 * @param template The ShiftTemplate instance to fill.
 * @param date The date (YYYY-MM-DD or Date) for this instance.
 * @param workers List of all potentially relevant workers.
 * @param state The ScheduleGenerationState object.
 * @param weekDates Array of 7 Date objects for the target week (Mon-Sun).
 * @param locationOperatingHoursMap Map<DayOfWeek, LocationOperatingHours> for the target location.
 * @returns An object containing an array of warning messages generated during assignment.
 */
export function assignLeads(
    template: ShiftTemplate,
    date: string | Date,
    workers: Worker[],
    state: ScheduleGenerationState,
    weekDates: Date[],
    locationOperatingHoursMap: Map<DayOfWeek, LocationOperatingHours>
): { warnings: string[] } {
    const warnings: string[] = [];
    // Only process templates marked as leads
    if (!template.lead_type) {
        return { warnings };
    }
    // Convert date to Date object and string
    const shiftDate = typeof date === 'string' ? new Date(date) : date;
    const dateStr = formatDateToYYYYMMDD(shiftDate);
    // Check if this specific lead role (opening/closing) for this day is already filled
    const isOpeningNeeded = template.lead_type === 'opening' && !state.hasOpeningLead(shiftDate);
    const isClosingNeeded = template.lead_type === 'closing' && !state.hasClosingLead(shiftDate);
    if (!isOpeningNeeded && !isClosingNeeded) {
        return { warnings };
    }
    // Find eligible candidates using the shared helper + is_lead check
    const candidates = workers.filter(worker => 
        worker.is_lead && // Check lead status first
        checkWorkerShiftEligibility(worker, template, shiftDate, state, locationOperatingHoursMap.get(getDayOfWeekStringFromDate(shiftDate)))
    );
    if (candidates.length === 0) {
        warnings.push(`No eligible *lead* worker found for template ${template.id} (${template.lead_type}) on ${dateStr}.`);
        return { warnings };
    }
    // Prioritize by Job Level (descending)
    candidates.sort((a, b) => compareJobLevels(b.job_level, a.job_level)); // Higher level first
    // Check for ties at the highest level
    const topLevel = candidates[0].job_level;
    const tiedCandidates = candidates.filter(c => c.job_level === topLevel);
    if (tiedCandidates.length > 1) {
        warnings.push(`Tie detected for lead assignment for template ${template.id} (${template.lead_type}) on ${dateStr} between workers: ${tiedCandidates.map(c=>c.id).join(', ')}. Leaving unassigned.`);
        return { warnings };
    }
    // Assign the unique winner
    const winner = tiedCandidates[0];
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
        is_recurring_generated: false, // Assigned by lead assigner
        created_at: new Date().toISOString(),
    };
    const newShiftAssignment: ShiftAssignment = {
        id: uuidv4(),
        scheduled_shift_id: newScheduledShift.id,
        worker_id: winner.id,
        assignment_type: 'lead',
        is_manual_override: false,
        assigned_start: template.start_time,
        assigned_end: template.end_time,
        created_at: new Date().toISOString(),
    };
    let shiftDurationHours = 0;
    try {
        shiftDurationHours = calculateShiftDurationHours(template.start_time, template.end_time);
    } catch (error: any) {
        warnings.push(`Error calculating duration for lead assignment (Template ${template.id}): ${error.message}. Skipping assignment.`); 
        return { warnings };
    }
    // Correctly update state using addAssignment
    state.addAssignment(newScheduledShift, newShiftAssignment, template.id, shiftDurationHours);
    return { warnings };
}