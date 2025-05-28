import { SupabaseClient } from '@supabase/supabase-js';

// Define a more specific type for the Supabase client if you have one
// For example, if you use generated types:
// import { Database } from '../database.types';
// type SupabaseAdminClient = SupabaseClient<Database>;

interface ScheduledShiftData {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  worker_id: string | null;
  template_id: string;
}

interface LocationData {
  id: string;
  name: string;
}

interface PositionData {
  id: string;
  name: string;
}

interface WorkerData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  is_lead: boolean;
}

interface TemplateData {
  lead_type: 'opening' | 'closing' | null;
  location_id: string;
  position_id: string;
  locations: LocationData | null; // Can be null if join fails, though !inner should prevent
  positions: PositionData | null; // Can be null if join fails
  // Add any other fields from shift_templates
}

// This interface represents the raw structure from Supabase for assignments
interface RawAssignmentFromSupabase {
  id: string;
  worker_id: string | null;
  assignment_type: 'lead' | 'regular' | 'training' | string;
  assigned_start_time?: string | null;
  assigned_end_time?: string | null;
  is_manual_override?: boolean | null;
  workers: WorkerData[] | null; // Supabase might return an array for the joined table
}

// This is the clean AssignmentData type we want to work with internally
interface AssignmentData {
  id: string;
  worker_id: string | null;
  assignment_type: 'lead' | 'regular' | 'training' | string;
  assigned_start_time?: string | null;
  assigned_end_time?: string | null;
  is_manual_override?: boolean | null;
  workerDetails: WorkerData | null; // Changed from 'workers' to 'workerDetails' for clarity
}

export interface ShiftContext {
  scheduledShiftData: ScheduledShiftData;
  templateData: TemplateData & { locations: LocationData; positions: PositionData }; // Make nested not null
  shiftType: 'LeadShift' | 'NonLeadShift';
  currentAssignments: AssignmentData[];
}

/**
 * Fetches essential context about a given shift.
 * @param supabaseClient - The Supabase client instance.
 * @param scheduledShiftId - The ID of the scheduled shift.
 * @returns An object containing scheduledShiftData, templateData, shiftType, and currentAssignments.
 */
export async function getShiftContext(
  supabaseClient: SupabaseClient, // Use SupabaseAdminClient if defined
  scheduledShiftId: string
): Promise<ShiftContext> {
  // 1. Fetch the scheduled_shift and its related template, location, and position
  const { data: shiftDetails, error: shiftDetailsError } = await supabaseClient
    .from('scheduled_shifts')
    .select(`
      id,
      shift_date,
      start_time,
      end_time,
      worker_id,
      template_id,
      shift_templates!inner (
        lead_type,
        location_id,
        position_id,
        locations!inner (id, name),
        positions!inner (id, name)
      )
    `)
    .eq('id', scheduledShiftId)
    .single();

  if (shiftDetailsError) {
    console.error('Error fetching shift details:', shiftDetailsError);
    throw new Error(`Failed to fetch shift details for ID ${scheduledShiftId}: ${shiftDetailsError.message}`);
  }
  if (!shiftDetails) {
    throw new Error(`No shift found for ID ${scheduledShiftId}`);
  }

  // Type assertion because !inner should guarantee these are not null
  const templateData = shiftDetails.shift_templates as unknown as TemplateData & { locations: LocationData; positions: PositionData };
  
  if (!templateData.locations || !templateData.positions) {
    // This should ideally not happen with !inner joins but good to check.
    throw new Error('Shift template is missing location or position data.');
  }

  // 2. Determine ShiftType
  const shiftType = (templateData.lead_type === 'opening' || templateData.lead_type === 'closing')
    ? 'LeadShift'
    : 'NonLeadShift';

  // 3. Fetch current assignments for the shift
  const { data: rawAssignmentsData, error: assignmentsError } = await supabaseClient
    .from('shift_assignments')
    .select(`
      id,
      worker_id,
      assignment_type,
      assigned_start_time,
      assigned_end_time,
      is_manual_override,
      workers (
        id,
        first_name,
        last_name,
        preferred_name,
        is_lead
      )
    `)
    .eq('scheduled_shift_id', scheduledShiftId);

  if (assignmentsError) {
    console.error('Error fetching current assignments:', assignmentsError);
    throw new Error(`Failed to fetch assignments for shift ID ${scheduledShiftId}: ${assignmentsError.message}`);
  }

  // Remove the nested shift_templates from the top-level shiftDetails to match ScheduledShiftData type
  const { shift_templates, ...scheduledShiftData } = shiftDetails;

  const currentAssignments: AssignmentData[] = (rawAssignmentsData || []).map(rawAssignment => {
    // Cast rawAssignment to the Supabase return type structure
    const assignment = rawAssignment as RawAssignmentFromSupabase;
    return {
      id: assignment.id,
      worker_id: assignment.worker_id,
      assignment_type: assignment.assignment_type,
      assigned_start_time: assignment.assigned_start_time,
      assigned_end_time: assignment.assigned_end_time,
      is_manual_override: assignment.is_manual_override,
      // If workers array exists and has an element, take the first one. Otherwise, null.
      workerDetails: (assignment.workers && assignment.workers.length > 0) ? assignment.workers[0] : null,
    };
  });

  return {
    scheduledShiftData: scheduledShiftData as ScheduledShiftData,
    templateData,
    shiftType,
    currentAssignments,
  };
}

// Helper to convert "HH:MM" or "HH:MM:SS" time string to minutes since midnight
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Helper to get lowercase day name (e.g., "monday") from a YYYY-MM-DD date string
function getDayOfWeekName(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00'); // Ensure parsing as local, add dummy time
  const dayIndex = date.getDay();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[dayIndex];
}

interface WorkerAvailability {
  // Assuming structure like: { monday: "all_day", tuesday: "morning", ... }
  [key: string]: 'morning' | 'afternoon' | 'all_day' | 'unavailable' | string;
}

/**
 * Checks if a worker is eligible for a specific assignment.
 * @param supabaseClient The Supabase client.
 * @param workerId The ID of the worker.
 * @param shiftDate The date of the shift (YYYY-MM-DD).
 * @param shiftStartTime The start time of the shift (HH:MM).
 * @param shiftEndTime The end time of the shift (HH:MM).
 * @param locationId The ID of the location.
 * @param positionId The ID of the position.
 * @param assignmentType The type of assignment ('lead', 'regular', 'training').
 * @param scheduledShiftIdToExclude The ID of the scheduled_shift this assignment is for (to exclude from conflict checks if modifying).
 * @returns True if the worker is eligible, false otherwise.
 */
export async function isWorkerEligibleForAssignment(
  supabaseClient: SupabaseClient,
  workerId: string,
  shiftDate: string, // YYYY-MM-DD
  shiftStartTime: string, // HH:MM
  shiftEndTime: string, // HH:MM
  locationId: string,
  positionId: string,
  assignmentType: 'lead' | 'regular' | 'training' | string,
  scheduledShiftIdToExclude: string | null // ID of the current scheduled_shift being evaluated
): Promise<boolean> {
  try {
    // 1. Fetch Worker Details (is_lead, availability)
    const { data: worker, error: workerError } = await supabaseClient
      .from('workers')
      .select('id, is_lead, availability')
      .eq('id', workerId)
      .single();

    if (workerError || !worker) {
      console.warn(`Eligibility check: Worker ${workerId} not found or error.`, workerError);
      return false;
    }

    // 2. Check is_lead (if assignmentType is 'lead')
    if (assignmentType === 'lead' && !worker.is_lead) {
      console.warn(`Eligibility check: Worker ${workerId} is not a lead for lead assignment.`);
      return false;
    }

    // 3. Check Location Association
    const { data: workerLocation, error: locError } = await supabaseClient
      .from('worker_locations')
      .select('worker_id')
      .eq('worker_id', workerId)
      .eq('location_id', locationId)
      .maybeSingle(); // Use maybeSingle in case record doesn't exist

    if (locError || !workerLocation) {
      console.warn(`Eligibility check: Worker ${workerId} not associated with location ${locationId}.`, locError);
      return false;
    }

    // 4. Check Position Association
    const { data: workerPosition, error: posError } = await supabaseClient
      .from('worker_positions')
      .select('worker_id')
      .eq('worker_id', workerId)
      .eq('position_id', positionId)
      .maybeSingle();

    if (posError || !workerPosition) {
      console.warn(`Eligibility check: Worker ${workerId} not associated with position ${positionId}.`, posError);
      return false;
    }

    // 5. Check Availability
    const dayOfWeek = getDayOfWeekName(shiftDate);
    const workerAvailabilityToday = (worker.availability as WorkerAvailability || {})[dayOfWeek];

    if (!workerAvailabilityToday || workerAvailabilityToday === 'unavailable') {
      console.warn(`Eligibility check: Worker ${workerId} unavailable on ${dayOfWeek}.`);
      return false;
    }

    const { data: locationHours, error: locHoursError } = await supabaseClient
      .from('location_hours')
      .select('day_start, day_end, morning_cutoff')
      .eq('location_id', locationId)
      .eq('day_of_week', dayOfWeek)
      .single();

    if (locHoursError || !locationHours) {
      console.warn(`Eligibility check: Location hours not found for ${locationId} on ${dayOfWeek}.`, locHoursError);
      // This could be a configuration issue. Depending on policy, you might allow if not defined,
      // or strictly disallow. For now, disallowing if not configured.
      return false;
    }

    const shiftStartMinutes = timeToMinutes(shiftStartTime);
    const shiftEndMinutes = timeToMinutes(shiftEndTime);

    let availableStartMinutes = -1;
    let availableEndMinutes = -1;

    if (workerAvailabilityToday === 'all_day') {
      availableStartMinutes = timeToMinutes(locationHours.day_start);
      availableEndMinutes = timeToMinutes(locationHours.day_end);
    } else if (workerAvailabilityToday === 'morning') {
      availableStartMinutes = timeToMinutes(locationHours.day_start);
      availableEndMinutes = timeToMinutes(locationHours.morning_cutoff);
    } else if (workerAvailabilityToday === 'afternoon') {
      availableStartMinutes = timeToMinutes(locationHours.morning_cutoff);
      availableEndMinutes = timeToMinutes(locationHours.day_end);
    }

    if (!(shiftStartMinutes >= availableStartMinutes && shiftEndMinutes <= availableEndMinutes)) {
      console.warn(`Eligibility check: Shift [${shiftStartTime}-${shiftEndTime}] does not fit worker ${workerId} availability [${workerAvailabilityToday}] on ${dayOfWeek}.`);
      return false;
    }

    // 6. Check for Conflicting Shifts
    let query = supabaseClient
      .from('shift_assignments')
      .select(`
        id,
        assigned_start_time,
        assigned_end_time,
        scheduled_shifts (
          id,
          start_time,
          end_time
        )
      `)
      .eq('worker_id', workerId);

    // Correct approach for conflict check: Fetch scheduled_shifts for the worker on that date, then their assignments.
    const { data: conflictingScheduledShifts, error: conflictShiftsError } = await supabaseClient
      .from('scheduled_shifts')
      .select(`
        id,
        start_time,
        end_time,
        shift_assignments!inner (
            id,
            assigned_start_time,
            assigned_end_time
        )
      `)
      .eq('shift_date', shiftDate)
      .eq('shift_assignments.worker_id', workerId); // Filter by worker_id on the joined table

    if (conflictShiftsError) {
        console.error('Error fetching potentially conflicting shifts:', conflictShiftsError);
        return false; // Or throw, depending on how critical this is
    }

    if (conflictingScheduledShifts) {
      for (const conflictingShift of conflictingScheduledShifts) {
        if (scheduledShiftIdToExclude && conflictingShift.id === scheduledShiftIdToExclude) {
          continue; // Don't compare a shift with itself if we are modifying it
        }

        // Determine the effective start/end times for the conflicting assignment
        // An assignment can have its own start/end times, or it defaults to the scheduled_shift times.
        // The inner join on shift_assignments should give us the specific assignment for this worker on this conflictingShift.
        // Assuming conflictingShift.shift_assignments is an array (due to !inner) and has at least one item for this worker.
        const conflictingAssignment = conflictingShift.shift_assignments[0];
        if (!conflictingAssignment) continue; // Should not happen with !inner and worker_id filter

        const existingStartStr = conflictingAssignment.assigned_start_time || conflictingShift.start_time;
        const existingEndStr = conflictingAssignment.assigned_end_time || conflictingShift.end_time;

        const existingStartMinutes = timeToMinutes(existingStartStr);
        const existingEndMinutes = timeToMinutes(existingEndStr);

        // Check for overlap: (StartA < EndB) and (EndA > StartB)
        if (shiftStartMinutes < existingEndMinutes && shiftEndMinutes > existingStartMinutes) {
          console.warn(`Eligibility check: Worker ${workerId} has a conflicting shift [${existingStartStr}-${existingEndStr}] on ${shiftDate}.`);
          return false;
        }
      }
    }

    // 7. If all checks pass
    return true;

  } catch (error) {
    console.error(`Error in isWorkerEligibleForAssignment for worker ${workerId}:`, error);
    return false; // Default to not eligible on any unexpected error
  }
} 