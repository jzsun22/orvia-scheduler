import { supabase } from '@/lib/supabase/client';
import { ScheduledShift, ShiftAssignment } from '@/lib/types';
import { formatDateToYYYYMMDD } from './utils';

/**
 * Saves the generated schedule to the database.
 * Uses a "Rolling Deletion" strategy:
 * 1. Deletes shifts older than ~4 weeks for the location.
 * 2. Deletes shifts for the specific week being generated.
 * 3. Inserts the new shifts and assignments.
 * Assumes cascading delete is configured on shift_assignments.scheduled_shift_id.
 * 
 * @param scheduledShifts The array of generated ScheduledShift objects.
 * @param shiftAssignments The array of generated ShiftAssignment objects.
 * @param locationId The ID of the location for which the schedule was generated.
 * @param weekDates An array of 7 Date objects representing the target week (Mon-Sun).
 * @throws Error if any database operation fails.
 */
export async function saveSchedule(
    scheduledShifts: ScheduledShift[],
    shiftAssignments: ShiftAssignment[],
    locationId: string,
    weekDates: Date[]
): Promise<void> {
    if (!weekDates || weekDates.length !== 7) {
        throw new Error("saveSchedule requires a weekDates array with exactly 7 days.");
    }

    const startDate = weekDates[0];
    const endDate = weekDates[6];
    const startDateString = formatDateToYYYYMMDD(startDate);
    const endDateString = formatDateToYYYYMMDD(endDate);

    const cutoffDate = new Date(startDate.getTime());
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 28); 
    const cutoffDateString = formatDateToYYYYMMDD(cutoffDate);

    console.log(`Saving schedule for location ${locationId}, week ${startDateString} to ${endDateString}.`);
    console.log(`Deleting data older than ${cutoffDateString} and for the target week.`);

    try {
        // --- Fetch Shift Template IDs for the location ---
        const { data: templatesForLocation, error: templatesError } = await supabase
            .from('shift_templates')
            .select('id')
            .eq('location_id', locationId);

        if (templatesError) {
            console.error("Error fetching shift templates for location:", templatesError);
            throw new Error(`Failed to fetch shift templates for location ${locationId}: ${templatesError.message}`);
        }

        if (!templatesForLocation || templatesForLocation.length === 0) {
            // If there are no templates for this location, then there should be no shifts to delete
            // or save. Log a warning and proceed, as subsequent operations might also result in no-ops.
            console.warn(`No shift templates found for location ${locationId}. Deletion and save operations might not affect any rows.`);
            // Depending on strictness, you might choose to throw an error here if templates are expected.
            // For now, allow proceeding as it might be a valid scenario (e.g., new location with no templates yet).
        }
        
        const templateIdsForLocation = templatesForLocation?.map(t => t.id) || [];

        // --- Deletion Phase --- 

        // 1. Delete shifts older than ~4 weeks (Assignments should cascade)
        // Only attempt delete if there are template IDs to filter by
        if (templateIdsForLocation.length > 0) {
            const { error: deleteOldError } = await supabase
                .from('scheduled_shifts')
                .delete()
                .in('template_id', templateIdsForLocation)
                .lt('shift_date', cutoffDateString);

            if (deleteOldError) {
                console.error("Error deleting old shifts:", deleteOldError);
                throw new Error(`Failed to delete old shifts: ${deleteOldError.message}`);
            }
            console.log(`Deletion of shifts older than ${cutoffDateString} for relevant templates completed (or none found).`);
        } else {
            console.log(`Skipping deletion of old shifts as no templates were found for location ${locationId}.`);
        }


        // 2. Delete shifts for the target week (Assignments should cascade)
        // Only attempt delete if there are template IDs to filter by
        if (templateIdsForLocation.length > 0) {
            const { error: deleteWeekError } = await supabase
                .from('scheduled_shifts')
                .delete()
                .in('template_id', templateIdsForLocation)
                .gte('shift_date', startDateString)
                .lte('shift_date', endDateString);

            if (deleteWeekError) {
                console.error("Error deleting target week shifts:", deleteWeekError);
                throw new Error(`Failed to delete target week shifts: ${deleteWeekError.message}`);
            }
            console.log(`Deletion of shifts for week ${startDateString} to ${endDateString} for relevant templates completed (or none found).`);
        } else {
            console.log(`Skipping deletion of target week shifts as no templates were found for location ${locationId}.`);
        }

        // --- Insertion Phase --- 

        // 3. Prepare data for insert
        // Keep client-generated 'id' for 'scheduled_shifts' and 'shift_assignments'.
        // Remove fields not in DB schema or auto-generated by DB ('created_at', 'location_id', 'position_id').
        const preparedShifts = scheduledShifts.map(shift => ({
            id: shift.id, // Preserve client-generated UUID
            shift_date: shift.shift_date,
            template_id: shift.template_id,
            worker_id: shift.worker_id, // worker_id is part of ScheduledShift type and DB schema
            start_time: shift.start_time,
            end_time: shift.end_time,
            is_recurring_generated: shift.is_recurring_generated
            // Properties to omit: created_at, location_id, position_id
        }));

        const preparedAssignments = shiftAssignments.map(assignment => ({
            id: assignment.id, // Preserve client-generated UUID
            scheduled_shift_id: assignment.scheduled_shift_id,
            worker_id: assignment.worker_id,
            assignment_type: assignment.assignment_type,
            is_manual_override: assignment.is_manual_override,
            assigned_start: assignment.assigned_start,
            assigned_end: assignment.assigned_end
            // Property to omit: created_at
        }));

        // 4. Insert new shifts
        if (preparedShifts.length > 0) {
            console.log(`Inserting ${preparedShifts.length} new shifts...`);
            const { error: insertShiftsError } = await supabase
                .from('scheduled_shifts')
                .insert(preparedShifts as any); // Use 'as any' if type mismatch after omitting fields

            if (insertShiftsError) {
                console.error("Error inserting new shifts:", insertShiftsError);
                throw new Error(`Failed to insert new shifts: ${insertShiftsError.message}`);
            }
        } else {
            console.log("No new shifts to insert.");
        }

        // 5. Insert new assignments
        if (preparedAssignments.length > 0) {
            console.log(`Inserting ${preparedAssignments.length} new assignments...`);
            const { error: insertAssignmentsError } = await supabase
                .from('shift_assignments')
                .insert(preparedAssignments as any); // Use 'as any' if type mismatch

            if (insertAssignmentsError) {
                console.error("Error inserting new assignments:", insertAssignmentsError);
                // Potentially attempt to rollback or clean up inserted shifts if possible
                throw new Error(`Failed to insert new assignments: ${insertAssignmentsError.message}`);
            }
        } else {
            console.log("No new shift assignments to insert.");
        }

        console.log("Schedule saved successfully.");

    } catch (error) {
        console.error("Error during saveSchedule operation:", error);
        // Re-throw the error for the caller to handle
        throw error;
    }
} 