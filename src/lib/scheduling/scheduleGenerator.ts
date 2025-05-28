import type { SupabaseClient } from '@supabase/supabase-js'; // Correct import for SupabaseClient type
import { 
    ShiftTemplate, 
    Worker, 
    RecurringShiftAssignment, 
    LocationOperatingHours, 
    DayOfWeek,
    ScheduledShift,
    ShiftAssignment
    // SupabaseClient type is now imported from '@supabase/supabase-js'
} from '@/lib/types';
import { ScheduleGenerationState } from './scheduleState';
import { processRecurringAssignments } from './recurringAssigner';
import { processPairedPrepBaristaShifts } from './pairedShiftAssigner';
import { assignLeads } from './leadAssigner';
import { assignDynamicShifts } from './dynamicAssigner';
import { saveSchedule } from './dataSaver';
import { getWeekDateRange } from './utils'; // Assuming this utility exists
import { fetchSchedulingPrerequisites } from '@/lib/supabase'; // Assuming fetch function is here

/**
 * Orchestrates the weekly schedule generation process for a specific location.
 * 
 * Steps:
 * 1. Fetches prerequisite data (workers, templates, recurring assignments, operating hours).
 * 2. Initializes the in-memory schedule state.
 * 3. Processes recurring assignments.
 * 4. Processes special paired shifts (e.g., Prep+Barista).
 * 5. Assigns lead roles to remaining slots.
 * 6. Assigns remaining standard shifts dynamically.
 * 7. Saves the generated schedule (shifts and assignments) to the database.
 * 
 * @param client The Supabase client to use for fetching prerequisites.
 * @param locationId The UUID of the location to generate the schedule for.
 * @param startDate The start date (typically a Monday) of the week to generate.
 * @returns An object indicating success status, any warnings generated, and a list of templates that couldn't be assigned.
 */
export async function generateWeeklySchedule(
    client: SupabaseClient,
    locationId: string,
    startDate: Date 
): Promise<{
    success: boolean;
    warnings: string[];
    unassignedSlots: ShiftTemplate[];
}> {
    const warnings: string[] = [];
    let success = false;
    let finalUnassignedTemplates: ShiftTemplate[] = [];

    try {
        // --- 1. Initialization & Data Fetching ---
        console.log(`Starting schedule generation for location ${locationId}, week of ${startDate.toISOString().split('T')[0]}`);
        
        const weekDates = getWeekDateRange(startDate);
        if (!weekDates || weekDates.length !== 7) {
            throw new Error('Failed to generate valid week date range.');
        }

        const prerequisites = await fetchSchedulingPrerequisites(client, locationId);
        
        // Convert operating hours array to a map for efficient lookup
        const locationOperatingHoursMap = new Map<DayOfWeek, LocationOperatingHours>();
        prerequisites.locationOperatingHours.forEach(hours => {
            locationOperatingHoursMap.set(hours.day_of_week, hours);
        });

        const { 
            workers, 
            templates, 
            recurringAssignments 
        } = prerequisites;

        // Filter workers to only those assigned to the current locationId
        const workersForLocation = workers.filter(worker => 
            (worker as any).locations?.some((wl: { location: { id: string; [key: string]: any; } }) => wl.location?.id === locationId)
        );
        console.log(`[ScheduleGenerator] Fetched ${workers.length} total workers. After filtering for location ${locationId}, ${workersForLocation.length} workers remain.`);

        // Filter out inactive workers from the location-specific list
        const activeWorkers = workersForLocation.filter(worker => worker.inactive !== true);
        console.log(`[ScheduleGenerator] From ${workersForLocation.length} location-specific workers, ${activeWorkers.length} are active.`);

        // Basic data validation
        if (!activeWorkers || activeWorkers.length === 0) {
            warnings.push(`No active workers found for location ${locationId}. Schedule generation might be incomplete.`);
            // Consider if this should be a hard stop or just a warning
        }
        if (!templates || templates.length === 0) {
            warnings.push("No shift templates found for this location. Cannot generate schedule.");
            return { success: false, warnings, unassignedSlots: [] };
        }
         if (!locationOperatingHoursMap || locationOperatingHoursMap.size === 0) {
            warnings.push("No operating hours found for this location. Availability checks might fail.");
            // Decide if this is critical enough to stop
        }

        const state = new ScheduleGenerationState(templates, activeWorkers); // Pass filtered activeWorkers
        console.log("Data fetched, starting assignment phases...");

        // --- 2. Process Recurring Assignments ---
        const recurringResult = processRecurringAssignments(
            recurringAssignments, 
            weekDates, 
            templates, 
            state
        );
        warnings.push(...recurringResult.warnings);
        console.log(`Recurring assignments processed. Current state: ${state.scheduledShifts.length} shifts.`);

        // --- 3. Process Paired Shifts (Cupertino Specific) ---
        // Only run paired shift logic if the location is Cupertino
        const CUPERTINO_LOCATION_ID = process.env.CUPERTINO_LOCATION_ID; // ID from pairedShiftAssigner.ts
        if (locationId === CUPERTINO_LOCATION_ID) {
            const pairedResult = processPairedPrepBaristaShifts(
                templates, 
                activeWorkers, // Pass filtered activeWorkers
                state, 
                weekDates, 
                locationOperatingHoursMap 
            );
            warnings.push(...pairedResult.warnings);
            console.log(`Paired shifts processed for Cupertino. Current state: ${state.scheduledShifts.length} shifts.`);
        } else {
            console.log(`Skipping paired shifts processing as location is not Cupertino.`);
        }

        // --- 4. Assign Leads ---
        // Use per-template-per-date instance tracking
        let unfilledInstances = state.getUnfilledTemplateInstances(weekDates); // [{ template, date, dayOfWeek }]
        const leadInstances = unfilledInstances.filter(inst => inst.template.lead_type === 'opening' || inst.template.lead_type === 'closing');
        
        console.log(`Lead Assignment Phase: ${unfilledInstances.length} unfilled instances initially. ${leadInstances.length} are specific lead instances.`);
        const shiftsBeforeLeads = state.scheduledShifts.length;

        // Assign leads for each unfilled lead instance
        for (const inst of leadInstances) {
            assignLeads(
                inst.template,
                inst.date,
                activeWorkers, // Pass filtered activeWorkers
                state,
                weekDates,
                locationOperatingHoursMap
            );
        }
        const shiftsAfterLeads = state.scheduledShifts.length;
        console.log(`Lead assignment processed. Shifts before: ${shiftsBeforeLeads}, Shifts after: ${shiftsAfterLeads}. Current total shifts: ${state.scheduledShifts.length}.`);

        // --- 5. Assign Dynamic Shifts ---
        unfilledInstances = state.getUnfilledTemplateInstances(weekDates); // Update unfilled list
        const dynamicInstances = unfilledInstances.filter(inst => !inst.template.lead_type);
        
        for (const inst of dynamicInstances) {
            assignDynamicShifts(
                inst.template,
                inst.date,
                activeWorkers, // Pass filtered activeWorkers
                state,
                weekDates,
                locationOperatingHoursMap
            );
        }
        console.log(`Dynamic assignment processed. Current state: ${state.scheduledShifts.length} shifts.`);

        // --- 6. Extract Final State & Unassigned ---
        const finalShifts = state.scheduledShifts;
        const finalAssignments = state.shiftAssignments;
        finalUnassignedTemplates = templates.filter(t => !state.isTemplateSlotFilled(t.id));

        if (finalShifts.length === 0) {
             warnings.push("No shifts were generated in any phase.");
             // Decide if this means success: false or just an empty schedule
        } else {
            console.log(`Total shifts generated: ${finalShifts.length}. Attempting to save...`);
        }

        // --- 7. Save Schedule to Database ---
        // IMPORTANT: Consider adding logic here to DELETE existing shifts for this location/week
        // before saving the new ones to prevent duplicates or conflicts. 
        // This depends on the desired "overwrite" behavior. See app-flow rule.
        
        await saveSchedule(finalShifts, finalAssignments, locationId, weekDates); // Added locationId and weekDates
        
        console.log("Schedule saved successfully.");
        success = true;

    } catch (error: any) {
        console.error("Error during schedule generation:", error);
        warnings.push(`Critical error during generation: ${error.message || 'Unknown error'}`);
        success = false;
        // Ensure finalUnassignedTemplates is populated even on error? 
        // If templates were loaded, it might be useful to return which ones were *intended* but failed.
        // For now, it will be empty if error happened before step 6.
    }

    // --- 8. Return Results ---
    console.log(`Generation finished. Success: ${success}, Warnings: ${warnings.length}, Unassigned: ${finalUnassignedTemplates.length}`);
    return {
        success,
        warnings,
        unassignedSlots: finalUnassignedTemplates,
    };
} 