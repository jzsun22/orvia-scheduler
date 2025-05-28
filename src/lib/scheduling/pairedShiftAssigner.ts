import {
    ShiftTemplate,
    Worker,
    ScheduledShift,
    ShiftAssignment,
    LocationOperatingHours,
    DayOfWeek,
    compareJobLevels,
    Position,
    Location,
} from '@/lib/types';
import { ScheduleGenerationState } from './scheduleState';
import { 
    mapDayOfWeekToDate, 
    isShiftWithinAvailability
} from './utils';
import { calculateShiftDurationHours } from './time-utils';
import { v4 as uuidv4 } from 'uuid';

// --- Constants for the paired shift --- 
const CUPERTINO_LOCATION_ID = process.env.CUPERTINO_LOCATION_ID;
const PREP_BARISTA_POSITION_ID = process.env.PREP_BARISTA_POSITION_ID;
const PAIR_SHIFT1_START = '09:30:00';
const PAIR_SHIFT1_END = '12:00:00';
const PAIR_SHIFT2_START = '12:00:00';
const PAIR_SHIFT2_END = '17:00:00';
const COMBINED_DURATION_HOURS = 7.5; // 9:30 to 17:00

/**
 * Handles the special case for the paired "Prep+Barista" shift in Cupertino.
 * Ensures the two specific shift templates (9:30-12:00 and 12:00-17:00) 
 * for this role/location are assigned to the same worker if both are unfilled.
 * 
 * @param templates List of all ShiftTemplates for the location.
 * @param workers List of all potentially relevant workers.
 * @param state The ScheduleGenerationState object.
 * @param weekDates Array of 7 Date objects for the target week (Mon-Sun).
 * @returns An object containing an array of warning messages.
 */
export function processPairedPrepBaristaShifts(
    templates: ShiftTemplate[],
    workers: Worker[],
    state: ScheduleGenerationState,
    weekDates: Date[],
    locationOperatingHoursMap: Map<DayOfWeek, LocationOperatingHours> // Still needed for availability check
): { warnings: string[] } {
    const warnings: string[] = [];
    console.log("[PairedShiftAssigner] Starting...");

    // 1. Find the two specific templates
    const template1 = templates.find(t => 
        t.location_id === CUPERTINO_LOCATION_ID &&
        t.position_id === PREP_BARISTA_POSITION_ID &&
        t.start_time === PAIR_SHIFT1_START &&
        t.end_time === PAIR_SHIFT1_END
    );
    const template2 = templates.find(t => 
        t.location_id === CUPERTINO_LOCATION_ID &&
        t.position_id === PREP_BARISTA_POSITION_ID &&
        t.start_time === PAIR_SHIFT2_START &&
        t.end_time === PAIR_SHIFT2_END
    );

    if (!template1 || !template2) {
        warnings.push("Could not find one or both required Prep+Barista paired shift templates for Cupertino. Skipping pair assignment.");
        console.log("[PairedShiftAssigner] ERROR: Paired templates not found. T1:", template1, "T2:", template2);
        return { warnings };
    }
    // console.log(`[PairedShiftAssigner] Found template1: ${template1.id}, template2: ${template2.id}`);

    // Assume both templates apply to the same days of the week
    const applicableDays = template1.days_of_week;
    // console.log("[PairedShiftAssigner] Applicable days:", applicableDays);

    for (const dayOfWeek of applicableDays) {
        console.log(`[PairedShiftAssigner] Processing day: ${dayOfWeek}`);
        let shiftDate: Date;
        try {
            shiftDate = mapDayOfWeekToDate(dayOfWeek, weekDates);
            console.log(`[PairedShiftAssigner] Mapped day ${dayOfWeek} to date: ${shiftDate.toISOString().split('T')[0]}`);
        } catch (error: any) {
            warnings.push(`Error determining date for paired shift on ${dayOfWeek}: ${error.message}`);
            console.log(`[PairedShiftAssigner] ERROR mapping date for ${dayOfWeek}:`, error);
            continue;
        }

        // 2. Check if BOTH templates are currently unfilled for this day
        const isTemplate1Filled = state.isTemplateSlotFilled(template1.id, shiftDate);
        const isTemplate2Filled = state.isTemplateSlotFilled(template2.id, shiftDate);
        console.log(`[PairedShiftAssigner] For ${shiftDate.toISOString().split('T')[0]}: Template1 (${template1.id}) filled? ${isTemplate1Filled}. Template2 (${template2.id}) filled? ${isTemplate2Filled}`);

        // If either is already filled (e.g., by a recurring assignment), we can't assign the pair.
        if (isTemplate1Filled || isTemplate2Filled) {
            if (isTemplate1Filled !== isTemplate2Filled) {
                warnings.push(`Inconsistent state for paired Prep+Barista shift on ${shiftDate.toISOString().split('T')[0]}. One template filled, the other not. Cannot assign pair.`);
                console.log(`[PairedShiftAssigner] WARNING: Inconsistent fill state for ${shiftDate.toISOString().split('T')[0]}. T1 filled: ${isTemplate1Filled}, T2 filled: ${isTemplate2Filled}`);
            }
            console.log(`[PairedShiftAssigner] Skipping pair assignment for ${shiftDate.toISOString().split('T')[0]} as one or both templates already filled.`);
            continue; // Skip to next day
        }

        // 3. Find eligible workers for the COMBINED block
        const locationHours = locationOperatingHoursMap.get(dayOfWeek);
        if (!locationHours) {
             warnings.push(`Missing operating hours for ${dayOfWeek} at Cupertino. Cannot assign paired shift.`);
             console.log(`[PairedShiftAssigner] ERROR: Missing operating hours for ${dayOfWeek} on ${shiftDate.toISOString().split('T')[0]}.`);
             continue;
        }
        console.log(`[PairedShiftAssigner] Operating hours for ${dayOfWeek} (${shiftDate.toISOString().split('T')[0]}):`, locationHours);

        const candidates = workers.filter(worker => {
            const logPrefix = `[PairedShiftAssigner] Worker ${worker.id} (${worker.first_name} ${worker.last_name}) for date ${shiftDate.toISOString().split('T')[0]}:`;
            // Basic checks: Position, Location
            const workerData = worker as any; 

            // Corrected to use 'workerData.positions' based on the alias in fetchWorkers
            const hasPosition = workerData.positions?.some((wp: { position: Position }) => wp.position?.id === PREP_BARISTA_POSITION_ID) ?? false;
            if (!hasPosition) {
                console.log(`${logPrefix} REJECTED - Missing Prep Barista position. Checked workerData.positions.`);
                return false;
            }
            // Assuming workerData.locations is the correct alias from fetchWorkers for worker_locations
            const hasLocation = workerData.locations?.some((wl: { location: Location }) => wl.location?.id === CUPERTINO_LOCATION_ID) ?? false;
            if (!hasLocation) {
                console.log(`${logPrefix} REJECTED - Not assigned to Cupertino location. Checked workerData.locations.`);
                return false;
            }

            // Daily conflict check
            if (state.isWorkerAssignedOnDate(worker.id, shiftDate)) {
                console.log(`${logPrefix} REJECTED - Already assigned on this date.`);
                return false;
            }

            // Preferred hours check (using COMBINED duration)
            const currentHours = state.getWorkerHours(worker.id);
            const preferredHours = worker.preferred_hours_per_week;
            if (preferredHours !== null && (currentHours + COMBINED_DURATION_HOURS) > preferredHours) {
                console.log(`${logPrefix} REJECTED - Would exceed preferred hours (${currentHours} + ${COMBINED_DURATION_HOURS} > ${preferredHours}).`);
                 return false; // Assigning pair would exceed preferred hours
            }

            // Availability Check: Use isShiftWithinAvailability for the combined 9:30-17:00 range
            const combinedShiftTimeRange = { 
                start_time: PAIR_SHIFT1_START, 
                end_time: PAIR_SHIFT2_END 
            };
            const isAvailable = isShiftWithinAvailability(combinedShiftTimeRange, shiftDate, worker.availability, locationHours);
            if (!isAvailable) {
                console.log(`${logPrefix} REJECTED - Not available for combined range ${PAIR_SHIFT1_START}-${PAIR_SHIFT2_END}. Availability:`, JSON.stringify(worker.availability[dayOfWeek as DayOfWeek]));
                return false; // Worker not available for the full combined duration
            }
            
            console.log(`${logPrefix} QUALIFIED as a candidate.`);
            return true;
        });

        console.log(`[PairedShiftAssigner] Found ${candidates.length} candidates for ${shiftDate.toISOString().split('T')[0]}.`);
        if (candidates.length === 0) {
            warnings.push(`No eligible worker found for the paired Prep+Barista shift on ${shiftDate.toISOString().split('T')[0]}.`);
            // console.log already part of the warning push by scheduleGenerator
            continue;
        }

        // 4. Prioritize: Job Level DESC -> Hours ASC
        candidates.sort((a, b) => {
            const levelComparison = compareJobLevels(b.job_level, a.job_level);
            if (levelComparison !== 0) return levelComparison;
            return state.getWorkerHours(a.id) - state.getWorkerHours(b.id);
        });

        // 5. Handle Ties
        const topLevel = candidates[0].job_level;
        const topHours = state.getWorkerHours(candidates[0].id);
        const tiedCandidates = candidates.filter(c => 
            c.job_level === topLevel && state.getWorkerHours(c.id) === topHours
        );

        if (tiedCandidates.length > 1) {
            warnings.push(`Tie detected for paired Prep+Barista shift on ${shiftDate.toISOString().split('T')[0]}. Leaving unassigned.`);
            console.log(`[PairedShiftAssigner] TIE DETECTED for ${shiftDate.toISOString().split('T')[0]} among ${tiedCandidates.length} candidates. Leaving unassigned.`);
            tiedCandidates.forEach(tc => console.log(`  - Tied candidate: ${tc.id} (${tc.first_name}), Job Level: ${tc.job_level}, Hours: ${state.getWorkerHours(tc.id)}`));
            continue;
        }

        // 6. Assign Winner to BOTH shifts
        const winner = tiedCandidates[0];
        console.log(`[PairedShiftAssigner] WINNER for ${shiftDate.toISOString().split('T')[0]} is ${winner.id} (${winner.first_name} ${winner.last_name}). Assigning to both shifts.`);
        const dateString = shiftDate.toISOString().split('T')[0];
        const nowISO = new Date().toISOString();

        // Create objects for Shift 1 (9:30 - 12:00)
        const shift1: ScheduledShift = {
            id: uuidv4(), shift_date: dateString, template_id: template1.id, worker_id: winner.id,
            location_id: template1.location_id, position_id: template1.position_id,
            start_time: template1.start_time, end_time: template1.end_time,
            is_recurring_generated: false, created_at: nowISO
        };
        const assignment1: ShiftAssignment = {
            id: uuidv4(), scheduled_shift_id: shift1.id, worker_id: winner.id,
            assignment_type: 'regular', is_manual_override: false,
            assigned_start: shift1.start_time, assigned_end: shift1.end_time, created_at: nowISO
        };
        const duration1 = calculateShiftDurationHours(shift1.start_time, shift1.end_time);

        // Create objects for Shift 2 (12:00 - 17:00)
        const shift2: ScheduledShift = {
            id: uuidv4(), shift_date: dateString, template_id: template2.id, worker_id: winner.id,
            location_id: template2.location_id, position_id: template2.position_id,
            start_time: template2.start_time, end_time: template2.end_time,
            is_recurring_generated: false, created_at: nowISO
        };
        const assignment2: ShiftAssignment = {
            id: uuidv4(), scheduled_shift_id: shift2.id, worker_id: winner.id,
            assignment_type: 'regular', is_manual_override: false,
            assigned_start: shift2.start_time, assigned_end: shift2.end_time, created_at: nowISO
        };
        const duration2 = calculateShiftDurationHours(shift2.start_time, shift2.end_time);

        // 7. Update state for BOTH shifts
        state.addAssignment(shift1, assignment1, template1.id, duration1);
        state.addAssignment(shift2, assignment2, template2.id, duration2);
        console.log(`[PairedShiftAssigner] Successfully added assignments for worker ${winner.id} to state for ${dateString}.`);
    }

    console.log("[PairedShiftAssigner] Finished processing all applicable days.");
    return { warnings };
} 