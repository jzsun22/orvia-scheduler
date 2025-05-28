import { 
  fetchShiftDetailsForContext, 
  fetchAssignmentsForShiftContext,
  fetchWorkerDetailsForEligibility,
  checkWorkerLocationLink,
  checkWorkerPositionLink,
  fetchLocationHoursForDay,
  updatePrimaryWorkerOnScheduledShift
} from './edge-supabase-helpers.ts'; // Corrected path to new edge helpers
import { 
  WorkerAvailability as WorkerAvailabilityType, // Renamed to avoid conflict if a local var is named WorkerAvailability
  AvailabilityLabel,
  ConflictingScheduledShift, // Corrected import for conflicting shifts
  DayOfWeek, // Import DayOfWeek if it's used for keys in WorkerAvailabilityType
  WorkerEligibilityDetails // For the worker object in isWorkerEligibleForAssignment
} from '../../../src/lib/types.ts'; // Corrected path
import { type SupabaseClient } from '@supabase/supabase-js'; // Import SupabaseClient

// Added for pre-fetched data types
export interface PrefetchedWorkerEligibilityData {
  workerDetailsMap: Map<string, { id: string; is_lead: boolean; availability: any }>;
  locationLinkedWorkerIds: Set<string>;
  positionLinkedWorkerIds: Set<string>;
  conflictingShiftsMap: Map<string, ConflictingScheduledShift[]>; // Added for pre-fetched conflicting shifts
}

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
  assigned_start?: string | null;
  assigned_end?: string | null;
  is_manual_override?: boolean | null;
  created_at: string;
  scheduled_shift_id: string;
  workers: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    preferred_name: string | null;
    is_lead: boolean;
  } | null;
}

// This is the clean AssignmentData type we want to work with internally
export interface AssignmentData {
  id: string;
  worker_id: string | null;
  assignment_type: 'lead' | 'regular' | 'training' | string;
  assigned_start?: string | null;
  assigned_end?: string | null;
  is_manual_override?: boolean | null;
  workerDetails: WorkerData | null;
}

export interface ShiftContext {
  scheduledShiftData: ScheduledShiftData;
  templateData: TemplateData & { locations: LocationData; positions: PositionData }; // Make nested not null
  shiftType: 'LeadShift' | 'NonLeadShift';
  currentAssignments: AssignmentData[];
}

/**
 * Fetches essential context about a given shift using centralized data access functions.
 * @param scheduledShiftId - The ID of the scheduled shift.
 * @param client - The Supabase client to use for data access.
 * @returns An object containing scheduledShiftData, templateData, shiftType, and currentAssignments.
 */
export async function getShiftContext(
  scheduledShiftId: string,
  client: SupabaseClient
): Promise<ShiftContext> {
  // 1. Fetch data using imported data access functions, passing the client
  const shiftDetails = await fetchShiftDetailsForContext(client, scheduledShiftId);
  const rawAssignmentsData = await fetchAssignmentsForShiftContext(client, scheduledShiftId);

  // Type assertion for shiftDetails.shift_templates (already in ShiftDetailsContext type)
  const templateData = shiftDetails.shift_templates as NonNullable<typeof shiftDetails.shift_templates>;
  
  if (!templateData.locations || !templateData.positions) {
    throw new Error('Shift template is missing location or position data after fetch.');
  }

  const shiftType = (templateData.lead_type === 'opening' || templateData.lead_type === 'closing')
    ? 'LeadShift'
    : 'NonLeadShift';

  const currentAssignments: AssignmentData[] = rawAssignmentsData.map(rawAssignment => {
    return {
      id: rawAssignment.id,
      worker_id: rawAssignment.worker_id,
      assignment_type: rawAssignment.assignment_type,
      assigned_start: rawAssignment.assigned_start,
      assigned_end: rawAssignment.assigned_end,
      is_manual_override: rawAssignment.is_manual_override,
      workerDetails: rawAssignment.workers,
    };
  });

  // Exclude shift_templates from the top-level object to match ScheduledShiftData
  // The fields of ScheduledShift are directly on shiftDetails due to the select in fetchShiftDetailsForContext
  const scheduledShiftDataOutput: ScheduledShiftData = {
    id: shiftDetails.id,
    shift_date: shiftDetails.shift_date,
    start_time: shiftDetails.start_time,
    end_time: shiftDetails.end_time,
    worker_id: shiftDetails.worker_id ?? null, // Convert undefined to null
    template_id: shiftDetails.template_id,
    // location_id, position_id, etc. are part of ScheduledShift type in supabase/types.ts
    // and are selected in fetchShiftDetailsForContext. Ensure they are mapped if needed here
    // or that ScheduledShiftData in this file matches the one in supabase/types.ts.
  };

  // Construct the TemplateData part for ShiftContext
  const templateDataOutput = {
    lead_type: templateData.lead_type,
    location_id: templateData.location_id,
    position_id: templateData.position_id,
    locations: templateData.locations,
    positions: templateData.positions,
    // any other fields from shift_templates that were on the original TemplateData interface here
  } as ShiftContext['templateData']; // Cast to the specific part of ShiftContext

  return {
    scheduledShiftData: scheduledShiftDataOutput,
    templateData: templateDataOutput,
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
export async function getDayOfWeekName(dateString: string): Promise<DayOfWeek> {
  const date = new Date(dateString + 'T00:00:00'); // Ensure parsing as local, add dummy time
  const dayIndex = date.getDay();
  const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[dayIndex];
}

/**
 * Checks if a worker is eligible for a specific assignment.
 * @param workerId The ID of the worker.
 * @param shiftDate The date of the shift (YYYY-MM-DD).
 * @param shiftStartTime The start time of the shift (HH:MM).
 * @param shiftEndTime The end time of the shift (HH:MM).
 * @param locationId The ID of the location.
 * @param positionId The ID of the position.
 * @param assignmentType The type of assignment ('lead', 'regular', 'training').
 * @param scheduledShiftIdToExclude The ID of the scheduled_shift this assignment is for (to exclude from conflict checks if modifying).
 * @param locationHours Pass fetched location hours
 * @param prefetchedData Pass all pre-fetched data
 * @param supabase_client Pass Supabase client for fetchConflictingShiftsForWorker
 * @returns True if the worker is eligible, false otherwise.
 */
export async function isWorkerEligibleForAssignment(
  workerId: string,
  shiftDate: string, // YYYY-MM-DD
  effectiveShiftStartTime: string, // HH:MM - This is the potentially adjusted start time
  effectiveShiftEndTime: string,   // HH:MM - This is the potentially adjusted end time
  locationId: string, // Still needed for some logic, and if locationHours is not passed for some reason
  positionId: string,
  assignmentType: 'lead' | 'regular' | 'training' | string,
  scheduledShiftIdToExclude: string | null, // ID of the current scheduled_shift being evaluated
  locationHours: { day_start: string; day_end: string; morning_cutoff: string; } | null, // Pass fetched location hours
  prefetchedData: PrefetchedWorkerEligibilityData, // Pass all pre-fetched data
  supabase_client: SupabaseClient // Now explicitly passed and used for fetchConflictingShiftsForWorker
): Promise<boolean> {
  try {
    // 1. Get Worker Details from pre-fetched map
    const worker = prefetchedData.workerDetailsMap.get(workerId);

    if (!worker) {
      console.warn(`[utils] Eligibility check: Worker ${workerId} not found in pre-fetched data.`);
      return false;
    }

    // 2. Check is_lead (if assignmentType is 'lead')
    if (assignmentType === 'lead' && !worker.is_lead) {
      console.warn(`Eligibility check: Worker ${workerId} is not a lead for lead assignment.`);
      return false;
    }

    // 3. Check Location Association from pre-fetched set
    const isLinkedToLocation = prefetchedData.locationLinkedWorkerIds.has(workerId);

    if (!isLinkedToLocation) {
      console.warn(`Eligibility check: Worker ${workerId} not associated with location ${locationId} (from pre-fetched data).`);
      return false;
    }

    // 4. Check Position Association from pre-fetched set (SKIPPED if assignmentType is 'training')
    if (assignmentType !== 'training') {
      const isLinkedToPosition = prefetchedData.positionLinkedWorkerIds.has(workerId);
      if (!isLinkedToPosition) {
        console.warn(`Eligibility check: Worker ${workerId} not associated with position ${positionId} for non-training assignment (from pre-fetched data).`);
        return false;
      }
    }

    // 5. Check Availability (uses worker.availability from pre-fetched data)
    const dayOfWeek = await getDayOfWeekName(shiftDate);
    const workerAvailability = worker.availability as WorkerAvailabilityType | undefined;

    // Use effectiveShiftStartTime and effectiveShiftEndTime for availability check
    if (!checkWorkerAvailability(workerAvailability, dayOfWeek, effectiveShiftStartTime, effectiveShiftEndTime, locationHours)) {
      console.warn(`Eligibility check: Worker ${workerId} not available for shift on ${shiftDate} from ${effectiveShiftStartTime} to ${effectiveShiftEndTime}.`);
      return false;
    }

    // 6. Check for Conflicting Shifts (uses pre-fetched conflicting shifts)
    const conflictingShifts = prefetchedData.conflictingShiftsMap.get(workerId) || [];
    // console.log(`[utils] Worker ${workerId} has ${conflictingShifts.length} potentially conflicting shifts.`);
    
    // Use effectiveShiftStartTime and effectiveShiftEndTime for conflict check
    if (hasConflictingShift(conflictingShifts, shiftDate, effectiveShiftStartTime, effectiveShiftEndTime, scheduledShiftIdToExclude)) {
      console.warn(`Eligibility check: Worker ${workerId} has a conflicting shift on ${shiftDate} between ${effectiveShiftStartTime}-${effectiveShiftEndTime}.`);
      return false;
    }

    return true;

  } catch (error) {
    console.error(`Error in isWorkerEligibleForAssignment for worker ${workerId}:`, error);
    return false;
  }
}

/**
 * Validates if a given set of assignments is valid for a shift, according to the strict composition rules.
 * @param shiftType The type of shift ('LeadShift' or 'NonLeadShift').
 * @param proposedAssignments An array of AssignmentData objects representing the complete intended state of the shift.
 * @returns True if the composition is valid, false otherwise.
 */
export function validateShiftComposition(
  shiftType: 'LeadShift' | 'NonLeadShift',
  proposedAssignments: AssignmentData[]
): boolean {
  // Ensure proposedAssignments is an array
  if (!Array.isArray(proposedAssignments)) {
    console.warn('validateShiftComposition: proposedAssignments is not an array.');
    return false;
  }

  // 1. Check "Trainer cannot work alone"
  const hasLeadOrRegular = proposedAssignments.some(assignment => 
    assignment.assignment_type === 'lead' || assignment.assignment_type === 'regular'
  );
  const hasTraining = proposedAssignments.some(assignment => assignment.assignment_type === 'training');

  if (hasTraining && !hasLeadOrRegular) {
    console.warn('validateShiftComposition: A trainer cannot work alone.');
    return false;
  }

  // 2. Check "No multi-lead scenarios"
  const leadAssignments = proposedAssignments.filter(assignment => assignment.assignment_type === 'lead');
  if (leadAssignments.length > 1) {
    console.warn('validateShiftComposition: Multiple lead assignments are not allowed.');
    return false;
  }

  // 3. Check "Lead shifts can only have lead + optional trainer"
  if (shiftType === 'LeadShift') {
    const hasRegular = proposedAssignments.some(assignment => assignment.assignment_type === 'regular');
    if (hasRegular) {
      console.warn('validateShiftComposition: Lead shifts cannot have regular assignments.');
      return false;
    }
    if (leadAssignments.length !== 1) {
      console.warn('validateShiftComposition: Lead shifts must have exactly one lead assignment.');
      return false;
    }
  }

  // 4. Check "Non-lead shifts can only have regular + optional trainer"
  if (shiftType === 'NonLeadShift') {
    const hasLead = proposedAssignments.some(assignment => assignment.assignment_type === 'lead');
    if (hasLead) {
      console.warn('validateShiftComposition: Non-lead shifts cannot have lead assignments.');
      return false;
    }
    const regularAssignments = proposedAssignments.filter(assignment => assignment.assignment_type === 'regular');
    if (regularAssignments.length !== 1) {
      console.warn('validateShiftComposition: Non-lead shifts must have exactly one regular assignment.');
      return false;
    }
  }

  // 5. If all checks pass
  return true;
}

/**
 * Determines the worker_id that should be set on scheduled_shifts.worker_id based on the hierarchy.
 * @param assignments An array of AssignmentData objects for the shift.
 * @param shiftType The type of shift ('LeadShift' or 'NonLeadShift').
 * @returns The worker_id (string UUID) of the primary worker, or null if no suitable primary worker is found.
 */
export function determinePrimaryWorkerForShift(
  assignments: AssignmentData[],
  shiftType: 'LeadShift' | 'NonLeadShift'
): string | null {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return null;
  }

  // Find lead assignment
  const leadAssignment = assignments.find(a => a.assignment_type === 'lead');
  if (leadAssignment && leadAssignment.worker_id && shiftType === 'LeadShift') {
    return leadAssignment.worker_id;
  }

  // Find regular assignment
  const regularAssignment = assignments.find(a => a.assignment_type === 'regular');
  if (regularAssignment && regularAssignment.worker_id && shiftType === 'NonLeadShift') {
    return regularAssignment.worker_id;
  }
  
  // If a lead shift doesn't have a valid lead, or non-lead doesn't have a valid regular,
  // it implies an invalid state or a shift that should be considered unassigned primarily.
  // A trainer alone cannot be the primary worker.
  return null;
}

/**
 * Performs the actual database update to scheduled_shifts.worker_id.
 * @param scheduledShiftId The ID of the scheduled shift to update.
 * @param primaryWorkerId The worker_id (string UUID) of the primary worker, or null.
 */
export async function updateScheduledShiftPrimaryWorker(
  client: SupabaseClient,
  scheduledShiftId: string,
  primaryWorkerId: string | null
): Promise<void> {
  // This function now directly calls the helper from edge-supabase-helpers
  await updatePrimaryWorkerOnScheduledShift(client, scheduledShiftId, primaryWorkerId);
  console.log(`[utils] Primary worker for shift ${scheduledShiftId} updated to ${primaryWorkerId} via edge-supabase-helpers.`);
}

// --- Constants for Paired Prep+Barista Shifts (Cupertino) ---
export const CUPERTINO_LOCATION_ID = process.env.CUPERTINO_LOCATION_ID;
export const PREP_BARISTA_POSITION_ID = process.env.PREP_BARISTA_POSITION_ID;
export const PAIRED_TEMPLATE_ID_1 = process.env.PAIRED_TEMPLATE_ID_1;
export const PAIRED_TEMPLATE_ID_2 = process.env.PAIRED_TEMPLATE_ID_2;
// --- End Constants ---

interface ScheduledShiftForPairedCheck {
  id: string;
  shift_date: string;
  template_id: string;
  worker_id: string | null;
  start_time: string;
  end_time: string;
  // Add any other fields from scheduled_shifts you might need
}

interface ShiftTemplateForPairedCheck {
  id: string;
  start_time: string;
  end_time: string;
  position_id: string;
  location_id: string;
  // Add any other fields from shift_templates you might need
}

interface PairedShiftDetails {
  isPaired: boolean;
  partnerScheduledShiftId: string | null;
  partnerScheduledShiftDetails: ScheduledShiftForPairedCheck | null;
  partnerTemplateDetails: ShiftTemplateForPairedCheck | null;
  currentShiftTemplateDetails: ShiftTemplateForPairedCheck | null;
}

/**
 * Checks if a given shift (by templateId and date) is part of the special Prep+Barista pair
 * and returns details about its partner if it is.
 */
export async function getPairedShiftPartnerDetails(
  supabaseClient: SupabaseClient, // Renamed from client to supabaseClient for clarity
  currentTemplateId: string,
  currentShiftDate: string
): Promise<PairedShiftDetails> {
  console.log(`[utils] getPairedShiftPartnerDetails called for template: ${currentTemplateId}, date: ${currentShiftDate}`);
  // TODO: This function might need to use helpers that require a client.
  // For now, assuming its internal Supabase calls are self-contained or use a global client
  // which is NOT ideal for edge functions. This needs review if used by edge functions.
  // If it uses functions from src/lib/supabase.ts that were NOT moved to edge-supabase-helpers.ts,
  // those will fail in the edge environment or use the (soon to be restored) global client from there.

  // Example: If getShiftTemplateById and getScheduledShiftByTemplateAndDate were from src/lib/supabase.ts
  // and used the global client, this would be an issue.
  // They should be moved to edge-supabase-helpers.ts if needed by edge functions.

  // For now, leaving this as is, but flagging for review based on usage.
  // It seems this function is not directly on the path of get-eligible-workers.

  let isCurrentShiftPaired = false;
  let partnerTemplateId: string | null = null;

  if (currentTemplateId === PAIRED_TEMPLATE_ID_1) {
    isCurrentShiftPaired = true;
    partnerTemplateId = PAIRED_TEMPLATE_ID_2;
  } else if (currentTemplateId === PAIRED_TEMPLATE_ID_2) {
    isCurrentShiftPaired = true;
    partnerTemplateId = PAIRED_TEMPLATE_ID_1;
  }

  if (!isCurrentShiftPaired || !partnerTemplateId) {
    return {
      isPaired: false,
      partnerScheduledShiftId: null,
      partnerScheduledShiftDetails: null,
      partnerTemplateDetails: null,
      currentShiftTemplateDetails: null,
    };
  }

  // Fetch current shift's template details first
  const { data: currentTemplateData, error: currentTemplateError } = await supabaseClient
    .from('shift_templates')
    .select('id, start_time, end_time, position_id, location_id')
    .eq('id', currentTemplateId)
    .single<ShiftTemplateForPairedCheck>();

  if (currentTemplateError || !currentTemplateData) {
    console.error(`PairedShiftCheck: Error fetching current template details for ${currentTemplateId}:`, currentTemplateError);
    // Potentially throw or return error state, for now, assume not paired if template info missing
    return {
      isPaired: false,
      partnerScheduledShiftId: null,
      partnerScheduledShiftDetails: null,
      partnerTemplateDetails: null,
      currentShiftTemplateDetails: null,
    };
  }
  
  // Basic validation for current template
  if (currentTemplateData.position_id !== PREP_BARISTA_POSITION_ID || currentTemplateData.location_id !== CUPERTINO_LOCATION_ID) {
      console.warn(`PairedShiftCheck: Current template ${currentTemplateId} does not match expected Prep Barista position/location. Not treating as paired.`);
      return { isPaired: false, partnerScheduledShiftId: null, partnerScheduledShiftDetails: null, partnerTemplateDetails: null, currentShiftTemplateDetails: currentTemplateData };
  }


  // Fetch the partner scheduled shift and its template details
  const { data: partnerShiftData, error: partnerShiftError } = await supabaseClient
    .from('scheduled_shifts')
    .select(
      'id,' +
      'shift_date,' +
      'template_id,' +
      'worker_id,' +
      'start_time,' +
      'end_time,' +
      'shift_templates (' +
      '  id,' +
      '  start_time,' +
      '  end_time,' +
      '  position_id,' +
      '  location_id' +
      ')'
    )
    .eq('template_id', partnerTemplateId)
    .eq('shift_date', currentShiftDate)
    .single();

  if (partnerShiftError) {
    if (partnerShiftError.code === 'PGRST116') { // Not found
      console.warn(`PairedShiftCheck: Partner scheduled shift not found for template ${partnerTemplateId} on date ${currentShiftDate}.`);
      return { isPaired: true, partnerScheduledShiftId: null, partnerScheduledShiftDetails: null, partnerTemplateDetails: null, currentShiftTemplateDetails: currentTemplateData };
    }
    console.error(`PairedShiftCheck: Error fetching partner scheduled shift for template ${partnerTemplateId}:`, partnerShiftError);
    return { isPaired: false, partnerScheduledShiftId: null, partnerScheduledShiftDetails: null, partnerTemplateDetails: null, currentShiftTemplateDetails: currentTemplateData }; // Potentially return error
  }

  if (!partnerShiftData || !partnerShiftData.shift_templates) {
    console.warn(`PairedShiftCheck: Partner scheduled shift found, but template details are missing for partner ${partnerTemplateId}.`);
    return { isPaired: true, partnerScheduledShiftId: null, partnerScheduledShiftDetails: null, partnerTemplateDetails: null, currentShiftTemplateDetails: currentTemplateData };
  }
  
  const partnerTemplate = partnerShiftData.shift_templates as ShiftTemplateForPairedCheck;
  
  // Basic validation for partner template
  if (partnerTemplate.position_id !== PREP_BARISTA_POSITION_ID || partnerTemplate.location_id !== CUPERTINO_LOCATION_ID) {
      console.warn(`PairedShiftCheck: Partner template ${partnerTemplate.id} does not match expected Prep Barista position/location. Not treating as fully paired.`);
      return { isPaired: true, partnerScheduledShiftId: partnerShiftData.id, partnerScheduledShiftDetails: partnerShiftData as ScheduledShiftForPairedCheck, partnerTemplateDetails: null, currentShiftTemplateDetails: currentTemplateData };
  }


  return {
    isPaired: true,
    partnerScheduledShiftId: partnerShiftData.id,
    partnerScheduledShiftDetails: partnerShiftData as ScheduledShiftForPairedCheck,
    partnerTemplateDetails: partnerTemplate,
    currentShiftTemplateDetails: currentTemplateData,
  };
}

/**
 * Checks if a worker is available during a given time slot based on their availability labels.
 * @param workerAvailability The worker's availability object (JSONB).
 * @param dayOfWeek The day of the week for the shift.
 * @param shiftStartTime The effective start time of the shift (HH:MM).
 * @param shiftEndTime The effective end time of the shift (HH:MM).
 * @param locationHours The operating hours for the location.
 * @returns True if the worker is available, false otherwise.
 */
function checkWorkerAvailability(
  workerAvailability: WorkerAvailabilityType | undefined,
  dayOfWeek: DayOfWeek,
  shiftStartTime: string, // HH:MM
  shiftEndTime: string,   // HH:MM
  locationHours: { day_start: string; day_end: string; morning_cutoff: string; } | null
): boolean {
  if (!workerAvailability) {
    console.warn(`[utils] checkWorkerAvailability: Worker availability data is undefined.`);
    return false;
  }

  const dailyAvailabilityLabels = workerAvailability[dayOfWeek];

  if (!dailyAvailabilityLabels || dailyAvailabilityLabels.length === 0 || dailyAvailabilityLabels.includes('none')) {
    // console.warn(`[utils] checkWorkerAvailability: Worker unavailable on ${dayOfWeek}. Labels: ${dailyAvailabilityLabels ? dailyAvailabilityLabels.join(', ') : 'N/A'}`);
    return false;
  }

  if (!locationHours) {
    console.warn(`[utils] checkWorkerAvailability: Location hours not found for ${dayOfWeek}. Cannot accurately check availability.`);
    // Depending on strictness, you might return false or true here. Returning false for safety.
    return false;
  }

  const shiftStartMinutes = timeToMinutes(shiftStartTime);
  const shiftEndMinutes = timeToMinutes(shiftEndTime);

  for (const label of dailyAvailabilityLabels) {
    if (label === 'none') continue;

    let availableStartMinutes = -1;
    let availableEndMinutes = -1;

    if (label === 'all_day') {
      availableStartMinutes = 0; // 00:00
      availableEndMinutes = 1439; // 23:59 in minutes (24 * 60 - 1)
    } else if (label === 'morning') {
      availableStartMinutes = timeToMinutes(locationHours.day_start);
      availableEndMinutes = timeToMinutes(locationHours.morning_cutoff);
    } else if (label === 'afternoon') {
      availableStartMinutes = timeToMinutes(locationHours.morning_cutoff);
      availableEndMinutes = timeToMinutes(locationHours.day_end);
    }

    // Check for non-sensical availability slots (e.g. start after end)
    if (availableStartMinutes === -1 || availableEndMinutes === -1 || availableStartMinutes >= availableEndMinutes) {
        // console.warn(`[utils] checkWorkerAvailability: Invalid availability slot derived for label '${label}' on ${dayOfWeek}. Start: ${availableStartMinutes}, End: ${availableEndMinutes}`);
        continue; 
    }
    
    if (shiftStartMinutes >= availableStartMinutes && shiftEndMinutes <= availableEndMinutes) {
      return true; // Shift fits within this availability block
    }
  }

  // console.warn(`[utils] checkWorkerAvailability: Shift [${shiftStartTime}-${shiftEndTime}] does not fit worker availability [${dailyAvailabilityLabels.join(', ')}] on ${dayOfWeek}.`);
  return false;
}

/**
 * Checks if a worker has a conflicting shift.
 * @param conflictingShifts Array of pre-fetched conflicting shifts for the worker on the given date.
 * @param shiftDate The date of the shift (YYYY-MM-DD) - primarily for logging.
 * @param prospectiveShiftStartTime The effective start time of the prospective shift (HH:MM).
 * @param prospectiveShiftEndTime The effective end time of the prospective shift (HH:MM).
 * @param scheduledShiftIdToExclude The ID of the current scheduled_shift being evaluated (to exclude from conflict checks).
 * @returns True if there is a conflict, false otherwise.
 */
function hasConflictingShift(
  conflictingShifts: ConflictingScheduledShift[],
  shiftDate: string, // YYYY-MM-DD, for logging
  prospectiveShiftStartTime: string, // HH:MM
  prospectiveShiftEndTime: string,   // HH:MM
  scheduledShiftIdToExclude: string | null
): boolean {
  if (!conflictingShifts || conflictingShifts.length === 0) {
    return false; // No shifts to conflict with
  }

  const prospectiveStartMinutes = timeToMinutes(prospectiveShiftStartTime);
  const prospectiveEndMinutes = timeToMinutes(prospectiveShiftEndTime);

  for (const existingShift of conflictingShifts) {
    if (scheduledShiftIdToExclude && existingShift.id === scheduledShiftIdToExclude) {
      continue; // Don't conflict with the shift being edited/created
    }

    // Determine the effective start and end times for the existing shift.
    // Ideally, this would use the worker's specific assignment times from `existingShift.shift_assignments`
    // if they override the main shift times (e.g., for partial shift coverage or training).
    // Currently, this uses the main `existingShift.start_time` and `existingShift.end_time` as a fallback.
    // The `conflictingShifts` array, sourced from `fetchConflictingShiftsForMultipleWorkers`,
    // is assumed to contain shifts relevant to the worker being checked.

    const existingStartStr = existingShift.start_time; // Fallback to main shift time
    const existingEndStr = existingShift.end_time;     // Fallback to main shift time
    
    // More precise: Iterate through assignments on the conflicting shift to find the one for *this* worker
    // and use its specific times if available. This is more complex as `workerId` isn't passed here.
    // The `prefetchedData.conflictingShiftsMap.get(workerId)` implies these are already relevant.

    if (!existingStartStr || !existingEndStr) {
        // console.warn(`[utils] hasConflictingShift: Conflicting shift ${existingShift.id} is missing time details.`);
        continue;
    }

    const existingStartMinutes = timeToMinutes(existingStartStr);
    const existingEndMinutes = timeToMinutes(existingEndStr);

    // Standard overlap check:
    // A new shift [S1, E1] overlaps with an existing shift [S2, E2] if S1 < E2 and E1 > S2.
    if (prospectiveStartMinutes < existingEndMinutes && prospectiveEndMinutes > existingStartMinutes) {
      // console.warn(`[utils] hasConflictingShift: Conflict detected. Prospective: ${prospectiveShiftStartTime}-${prospectiveShiftEndTime} overlaps with existing ${existingStartStr}-${existingEndStr} on shift ${existingShift.id}`);
      return true; // Conflict found
    }
  }

  return false; // No conflicts found
} 