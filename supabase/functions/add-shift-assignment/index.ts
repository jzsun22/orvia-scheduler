import { supabaseAdmin } from '../_shared/supabaseClient.ts'; // Use the shared admin client
import type { SupabaseClient } from '@supabase/supabase-js'; // Still need the type if you use it explicitly

import {
  getShiftContext,
  isWorkerEligibleForAssignment,
  validateShiftComposition,
  determinePrimaryWorkerForShift,
  updateScheduledShiftPrimaryWorker,
  ShiftContext,
  AssignmentData,
  getDayOfWeekName, 
  PrefetchedWorkerEligibilityData,
  getPairedShiftPartnerDetails,
  CUPERTINO_LOCATION_ID,
  PREP_BARISTA_POSITION_ID,
  PAIRED_TEMPLATE_ID_1,
  PAIRED_TEMPLATE_ID_2
} from '../_shared/utils.ts';


import { 
  fetchMultipleWorkerDetailsForEligibility,
  checkWorkerLocationLink,
  checkWorkerPositionLink,
  fetchLocationHoursForDay,
  fetchConflictingShiftsForWorker
} from '../_shared/edge-supabase-helpers.ts'; // UPDATED PATH
import type { DayOfWeek, ConflictingScheduledShift } from '../../../src/lib/types.ts';

// Define the expected request body structure
interface AddAssignmentRequestBody {
  scheduledShiftId: string; // The shift to add this assignment to
  newWorkerId: string;
  newAssignmentType: 'lead' | 'regular' | 'training' | string;
  newAssignedStart?: string | null; // CHANGED
  newAssignedEnd?: string | null;   // CHANGED
}

// In a true Deno environment, Deno is a global.
declare const Deno: any;

// export default async function handler(req: Request): Promise<Response> {
Deno.serve(async (req: Request) => { 
  // console.log('[add-shift-assignment] Handler invoked.', { method: req.method, url: req.url });
  const supabaseClient: SupabaseClient = supabaseAdmin; 

  if (req.method === 'OPTIONS') {
    // console.log('[add-shift-assignment] Handling OPTIONS request.');
    return new Response('ok', { 
      headers: { 
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Methods': 'POST, OPTIONS', // Added POST
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' 
      } 
    });
  }

  try {
    // console.log('[add-shift-assignment] Inside try block, attempting to parse request body.');
    const body: AddAssignmentRequestBody = await req.json();
    console.log('[add-shift-assignment] Received body:', JSON.stringify(body, null, 2)); // LOG 1: Received body

    const {
      scheduledShiftId,
      newWorkerId,
      newAssignmentType,
      newAssignedStart,
      newAssignedEnd
    } = body;
    console.log('[add-shift-assignment] Destructured payload:', { scheduledShiftId, newWorkerId, newAssignmentType, newAssignedStart, newAssignedEnd }); // LOG 2: Destructured values

    if (!scheduledShiftId || !newWorkerId || !newAssignmentType) {
        // console.error('[add-shift-assignment] ERROR: Missing required fields.');
        return new Response(JSON.stringify({ error: 'Missing required fields: scheduledShiftId, newWorkerId, newAssignmentType.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const shiftContext: ShiftContext = await getShiftContext(scheduledShiftId, supabaseClient);
    // console.log('[add-shift-assignment] Shift context fetched.');

    const { scheduledShiftData, templateData, shiftType, currentAssignments } = shiftContext;

    console.log('add-shift-assignment: Received scheduledShiftData.shift_date:', scheduledShiftData.shift_date);
    console.log('add-shift-assignment: Received templateData:', JSON.stringify(templateData, null, 2));

    // --- Paired Shift Logic ---
    const pairedInfo = await getPairedShiftPartnerDetails(supabaseClient, scheduledShiftData.template_id, scheduledShiftData.shift_date);

    if (pairedInfo.isPaired && pairedInfo.currentShiftTemplateDetails?.position_id === PREP_BARISTA_POSITION_ID) {
      console.log('[add-shift-assignment] Detected Prep+Barista paired shift context.');
      if (newAssignmentType === 'training') {
        return new Response(JSON.stringify({ error: 'Training assignments are not allowed for the Prep+Barista position.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      if (newAssignedStart || newAssignedEnd) {
        return new Response(JSON.stringify({ error: 'Custom start/end times are not allowed for Prep+Barista assignments.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      if (newAssignmentType !== 'regular') { // Only regular assignments for this special case
        return new Response(JSON.stringify({ error: `Only 'regular' assignment type is allowed for Prep+Barista. Received: ${newAssignmentType}` }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      if (!pairedInfo.partnerScheduledShiftId || !pairedInfo.partnerTemplateDetails || !pairedInfo.currentShiftTemplateDetails) {
        console.warn('[add-shift-assignment] Paired shift detected, but partner details are incomplete. Cannot enforce pairing.');
        // Potentially return error, or proceed with caution (current plan implies erroring if partner missing for enforcement)
        return new Response(JSON.stringify({ error: 'Paired shift partner details incomplete. Cannot add assignment.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }

      // Eligibility for CURRENT shift part
      const dayOfWeekForCurrentShift: DayOfWeek = await getDayOfWeekName(scheduledShiftData.shift_date);
      const locationHoursCurrent = await fetchLocationHoursForDay(supabaseClient, pairedInfo.currentShiftTemplateDetails.location_id, dayOfWeekForCurrentShift);
      const workerDetailsMapCurrent = await fetchMultipleWorkerDetailsForEligibility(supabaseClient, [newWorkerId]);
      const workerDetailsCurrent = workerDetailsMapCurrent.get(newWorkerId);
       if (!workerDetailsCurrent) {
        return new Response(JSON.stringify({ error: "Worker details not found, cannot check eligibility." }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      const isLinkedToLocationCurrent = await checkWorkerLocationLink(supabaseClient, newWorkerId, pairedInfo.currentShiftTemplateDetails.location_id);
      const isLinkedToPositionCurrent = await checkWorkerPositionLink(supabaseClient, newWorkerId, pairedInfo.currentShiftTemplateDetails.position_id);
      const conflictingShiftsCurrent: ConflictingScheduledShift[] = await fetchConflictingShiftsForWorker(supabaseClient, newWorkerId, scheduledShiftData.shift_date);
      
      const prefetchedDataCurrent: PrefetchedWorkerEligibilityData = {
        workerDetailsMap: new Map([[newWorkerId, workerDetailsCurrent!]]),
        locationLinkedWorkerIds: new Set(isLinkedToLocationCurrent ? [newWorkerId] : []),
        positionLinkedWorkerIds: new Set(isLinkedToPositionCurrent ? [newWorkerId] : []),
        conflictingShiftsMap: new Map([[newWorkerId, conflictingShiftsCurrent]])
      };

      const isEligibleForCurrentPart = await isWorkerEligibleForAssignment(
        newWorkerId, scheduledShiftData.shift_date, pairedInfo.currentShiftTemplateDetails.start_time, pairedInfo.currentShiftTemplateDetails.end_time,
        pairedInfo.currentShiftTemplateDetails.location_id, pairedInfo.currentShiftTemplateDetails.position_id, 'regular', null, locationHoursCurrent, prefetchedDataCurrent, supabaseClient
      );
      if (!isEligibleForCurrentPart) {
        return new Response(JSON.stringify({ error: `Worker not eligible for the current part (${pairedInfo.currentShiftTemplateDetails.start_time}-${pairedInfo.currentShiftTemplateDetails.end_time}) of the paired shift.` }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }

      // Eligibility for PARTNER shift part
      const dayOfWeekForPartnerShift: DayOfWeek = await getDayOfWeekName(pairedInfo.partnerScheduledShiftDetails!.shift_date); // Partner date is same
      const locationHoursPartner = await fetchLocationHoursForDay(supabaseClient, pairedInfo.partnerTemplateDetails!.location_id, dayOfWeekForPartnerShift);
      // We can reuse workerDetailsMap, isLinkedToLocation (if same location), isLinkedToPosition (if same pos)
      // Conflicting shifts need to be checked specifically for the partner's time range if it could differ, but for paired shifts it is distinct.
      // For simplicity, we'll reuse the conflictingShiftsCurrent as the date is the same. A worker busy during one part is busy for the other in terms of daily conflicts for other shifts.
      const prefetchedDataPartner: PrefetchedWorkerEligibilityData = prefetchedDataCurrent; // Assuming location and position are same for pair

      const isEligibleForPartnerPart = await isWorkerEligibleForAssignment(
        newWorkerId, pairedInfo.partnerScheduledShiftDetails!.shift_date, pairedInfo.partnerTemplateDetails!.start_time, pairedInfo.partnerTemplateDetails!.end_time,
        pairedInfo.partnerTemplateDetails!.location_id, pairedInfo.partnerTemplateDetails!.position_id, 'regular', null, locationHoursPartner, prefetchedDataPartner, supabaseClient
      );
      if (!isEligibleForPartnerPart) {
        return new Response(JSON.stringify({ error: `Worker not eligible for the partner part (${pairedInfo.partnerTemplateDetails!.start_time}-${pairedInfo.partnerTemplateDetails!.end_time}) of the paired shift.` }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      
      // --- End Eligibility for Paired ---
    }
    // --- End Paired Shift Logic ---

    // --- Original Time Validation and Eligibility (for non-paired or fallback) ---
    const effectiveStartTime = newAssignedStart || scheduledShiftData.start_time;
    const effectiveEndTime = newAssignedEnd || scheduledShiftData.end_time;

    if (newAssignedStart && newAssignedStart < scheduledShiftData.start_time) {
      return new Response(JSON.stringify({ error: `Custom start time (${newAssignedStart}) cannot be earlier than original shift start time (${scheduledShiftData.start_time}).` }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    if (newAssignedEnd && newAssignedEnd > scheduledShiftData.end_time) {
      return new Response(JSON.stringify({ error: `Custom end time (${newAssignedEnd}) cannot be later than original shift end time (${scheduledShiftData.end_time}).` }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    if (newAssignedStart && newAssignedEnd && newAssignedStart > newAssignedEnd) {
      return new Response(JSON.stringify({ error: `Custom start time (${newAssignedStart}) cannot be after custom end time (${newAssignedEnd}).` }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    
    if (!pairedInfo.isPaired || pairedInfo.currentShiftTemplateDetails?.position_id !== PREP_BARISTA_POSITION_ID) { // Run original eligibility if not the special pair being handled
      const dayOfWeekForShift: DayOfWeek = await getDayOfWeekName(scheduledShiftData.shift_date);
      let locationIdForCall: string | undefined = typeof templateData.location_id === 'string' ? templateData.location_id : templateData.locations?.id;
      let positionIdForCall: string | undefined = typeof templateData.position_id === 'string' ? templateData.position_id : templateData.positions?.id;

      if (!locationIdForCall || !positionIdForCall) {
        return new Response(JSON.stringify({ error: 'Internal server error: Location/Position ID invalid.' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      const locationHours = await fetchLocationHoursForDay(supabaseClient, locationIdForCall, dayOfWeekForShift);
      const workerDetailsMap = await fetchMultipleWorkerDetailsForEligibility(supabaseClient, [newWorkerId]);
      const workerDetails = workerDetailsMap.get(newWorkerId);
      if (!workerDetails) {
        return new Response(JSON.stringify({ error: "Worker details not found." }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      const isLinkedToLocation = await checkWorkerLocationLink(supabaseClient, newWorkerId, locationIdForCall);
      let isLinkedToPosition = newAssignmentType === 'training' ? true : await checkWorkerPositionLink(supabaseClient, newWorkerId, positionIdForCall);
      const conflictingShifts: ConflictingScheduledShift[] = await fetchConflictingShiftsForWorker(supabaseClient, newWorkerId, scheduledShiftData.shift_date);
      const prefetchedData: PrefetchedWorkerEligibilityData = {
        workerDetailsMap: new Map([[newWorkerId, workerDetails!]]),
        locationLinkedWorkerIds: new Set(isLinkedToLocation ? [newWorkerId] : []),
        positionLinkedWorkerIds: new Set(isLinkedToPosition ? [newWorkerId] : []),
        conflictingShiftsMap: new Map([[newWorkerId, conflictingShifts]])
      };
      const isEligible = await isWorkerEligibleForAssignment(
        newWorkerId, scheduledShiftData.shift_date, effectiveStartTime, effectiveEndTime,
        locationIdForCall, positionIdForCall, newAssignmentType, null, locationHours, prefetchedData, supabaseClient
      );
      if (!isEligible) {
        return new Response(JSON.stringify({ error: "Worker is not eligible for this new assignment." }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }
    // --- End Original Time Validation and Eligibility ---

    const fetchedWorkerDetailsForNewAssignment = (await fetchMultipleWorkerDetailsForEligibility(supabaseClient, [newWorkerId])).get(newWorkerId);
    const newAssignmentForValidation: AssignmentData = {
      id: 'temp-new-assignment',
      worker_id: newWorkerId,
      assignment_type: newAssignmentType,
      assigned_start: newAssignedStart,
      assigned_end: newAssignedEnd,
      is_manual_override: true,
      workerDetails: fetchedWorkerDetailsForNewAssignment ? {
        id: newWorkerId,
        first_name: fetchedWorkerDetailsForNewAssignment.first_name || null,
        last_name: fetchedWorkerDetailsForNewAssignment.last_name || null,
        preferred_name: fetchedWorkerDetailsForNewAssignment.preferred_name || null,
        is_lead: fetchedWorkerDetailsForNewAssignment.is_lead || false,
        // Spread any other properties from fetchedWorkerDetailsForNewAssignment that are part of WorkerData
        // This assumes WorkerData and the result of fetchMultipleWorkerDetailsForEligibility are compatible
      } : null
    };
    const proposedAssignments: AssignmentData[] = [...currentAssignments, newAssignmentForValidation];
    
    const isValidComposition = validateShiftComposition(shiftType, proposedAssignments);
    console.log('[add-shift-assignment] Composition validation result:', isValidComposition); // LOG 5: Composition validation

    if (!isValidComposition) {
      // console.warn('[add-shift-assignment] Invalid shift composition.');
      return new Response(JSON.stringify({ error: "Invalid resulting shift composition." }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    console.log('[add-shift-assignment] Attempting to insert assignment with values:', { // LOG 6: Values for DB insert
        scheduled_shift_id: scheduledShiftId,
        worker_id: newWorkerId,
        assignment_type: newAssignmentType,
        assigned_start: newAssignedStart, 
        assigned_end: newAssignedEnd,    
        is_manual_override: true,
    });

    const { data: insertedAssignment, error: insertError } = await supabaseClient
      .from('shift_assignments')
      .insert({
        scheduled_shift_id: scheduledShiftId,
        worker_id: newWorkerId,
        assignment_type: newAssignmentType,
        assigned_start: newAssignedStart, // This now directly uses the (renamed) payload field
        assigned_end: newAssignedEnd,    // This now directly uses the (renamed) payload field
        is_manual_override: true,
      })
      .select()
      .single(); // Assuming you want the inserted record back

    if (insertError || !insertedAssignment) {
      console.error('[add-shift-assignment] Error inserting new shift_assignment:', insertError); // LOG 7: Insert error (if any)
      throw new Error(`Failed to add new shift assignment: ${insertError?.message || 'No data returned after insert.'}`);
    }
    console.log('[add-shift-assignment] Assignment inserted for current shift:', insertedAssignment.id);
    
    let partnerAssignmentId: string | null = null;

    // 2. If paired, add assignment to partner shift
    if (pairedInfo.isPaired && pairedInfo.currentShiftTemplateDetails?.position_id === PREP_BARISTA_POSITION_ID && pairedInfo.partnerScheduledShiftId && newAssignmentType === 'regular') {
      // Remove any existing 'regular' assignment from partner shift for Prep Barista
      const { error: deletePartnerOldError } = await supabaseClient
        .from('shift_assignments')
        .delete()
        .eq('scheduled_shift_id', pairedInfo.partnerScheduledShiftId)
        .eq('assignment_type', 'regular'); // Assuming only one regular Prep Barista per shift

      if (deletePartnerOldError) {
        console.error(`[add-shift-assignment] Error deleting old regular assignment from partner ${pairedInfo.partnerScheduledShiftId}:`, deletePartnerOldError);
        // Decide if this is critical enough to rollback or prevent main assignment. For now, log and continue.
      }

      const { data: insertedPartnerAssignment, error: insertPartnerError } = await supabaseClient
        .from('shift_assignments')
        .insert({
          scheduled_shift_id: pairedInfo.partnerScheduledShiftId,
          worker_id: newWorkerId,
          assignment_type: 'regular', // Paired assignment is always regular
          assigned_start: null, // Paired shifts use template times
          assigned_end: null,
          is_manual_override: true,
        })
        .select('id')
        .single();
      
      if (insertPartnerError || !insertedPartnerAssignment) {
        console.error('[add-shift-assignment] Error inserting assignment for partner shift:', insertPartnerError);
        // CRITICAL: How to handle this? Rollback main insert? For now, error and main assignment is still there.
        // This highlights need for transactions.
        return new Response(JSON.stringify({ error: 'Failed to add assignment to partner shift. Main assignment was added but partner failed.' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      partnerAssignmentId = insertedPartnerAssignment.id;
      console.log('[add-shift-assignment] Assignment inserted for partner shift:', partnerAssignmentId);
    }

    // 3. Update worker_id on scheduled_shifts table for current and potentially partner
    const finalProposedAssignmentsForCurrent: AssignmentData[] = [
        ...currentAssignments.filter(a => a.id !== insertedAssignment.id), // remove temp if it was there
        {
            id: insertedAssignment.id, worker_id: insertedAssignment.worker_id,
            assignment_type: insertedAssignment.assignment_type as string,
            assigned_start: insertedAssignment.assigned_start, assigned_end: insertedAssignment.assigned_end,
            is_manual_override: insertedAssignment.is_manual_override,
            workerDetails: (await fetchMultipleWorkerDetailsForEligibility(supabaseClient, [insertedAssignment.worker_id])).get(insertedAssignment.worker_id)
        }
    ];
    const primaryWorkerIdCurrent = determinePrimaryWorkerForShift(finalProposedAssignmentsForCurrent, shiftType);
    await updateScheduledShiftPrimaryWorker(supabaseClient, scheduledShiftId, primaryWorkerIdCurrent);

    if (pairedInfo.isPaired && pairedInfo.currentShiftTemplateDetails?.position_id === PREP_BARISTA_POSITION_ID && pairedInfo.partnerScheduledShiftId && newAssignmentType === 'regular') {
        // Fetch partner's other assignments to correctly determine its primary worker
        const { data: partnerExistingAssignments, error: partnerAssignmentsError } = await supabaseClient
            .from('shift_assignments')
            .select<string, AssignmentData>(`*, workers (*, worker_positions(positions(*)), worker_locations(locations(*)))`) // Select worker details for AssignmentData
            .eq('scheduled_shift_id', pairedInfo.partnerScheduledShiftId)
            .neq('id', partnerAssignmentId); // Exclude the one we just added if it's already in list
        
        if(partnerAssignmentsError){
            console.error("Error fetching partner's existing assignments:", partnerAssignmentsError.message);
            // Non-critical for this flow, but log it.
        }

        const finalProposedAssignmentsForPartner: AssignmentData[] = [
            ...(partnerExistingAssignments || []),
            {
                id: partnerAssignmentId!, worker_id: newWorkerId, assignment_type: 'regular',
                assigned_start: null, assigned_end: null, is_manual_override: true,
                workerDetails: (await fetchMultipleWorkerDetailsForEligibility(supabaseClient, [newWorkerId])).get(newWorkerId)
            }
        ];
        // Determine shiftType for partner (should be 'non-lead' for Prep Barista)
        const partnerShiftType = 'non-lead'; // Hardcoding as Prep Barista is not lead
        const primaryWorkerIdPartner = determinePrimaryWorkerForShift(finalProposedAssignmentsForPartner, partnerShiftType);
        await updateScheduledShiftPrimaryWorker(supabaseClient, pairedInfo.partnerScheduledShiftId, primaryWorkerIdPartner);
    }
    // --- End Database Operations ---

    return new Response(JSON.stringify({ success: true, message: "Shift assignment added successfully.", data: insertedAssignment }), {
      status: 201, // 201 Created for new resource
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    console.error("[add-shift-assignment] CRITICAL UNHANDLED ERROR in handler:", error); // LOG 9: Catch block error
    let errorMessage = "An unexpected error occurred.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}); 