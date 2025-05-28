// console.log('[get-eligible-workers] FILE EXECUTION START - Top of index.ts');

import { supabaseAdmin } from '../_shared/supabaseClient.ts'; // Use the shared admin client
import type { SupabaseClient } from '@supabase/supabase-js'; // Still need the type if used explicitly

const PREP_BARISTA_POSITION_ID = process.env.PREP_BARISTA_POSITION_ID;

import { getShiftContext, isWorkerEligibleForAssignment, ShiftContext, PrefetchedWorkerEligibilityData, ScheduledShiftData, ShiftTemplateData } from '../_shared/utils.ts'; // Added PrefetchedWorkerEligibilityData, ScheduledShiftData, ShiftTemplateData
// Import from the new edge-specific helpers file
import { 
  fetchWorkersByLocation,
  fetchLocationHoursForDay,
  fetchMultipleWorkerDetailsForEligibility,
  fetchWorkerLocationLinksForMultipleWorkers,
  fetchWorkerPositionLinksForMultipleWorkers,
  fetchConflictingShiftsForMultipleWorkers
} from '../_shared/edge-supabase-helpers.ts'; 
import type { Worker, DayOfWeek, ConflictingScheduledShift, JobLevel } from '../../../src/lib/types.ts'; // Corrected path, added JobLevel

interface NewShiftPayload {
  templateId: string;
  shiftDate: string;    // YYYY-MM-DD
  startTime: string;    // HH:MM
  endTime: string;      // HH:MM
  // clientSideTemporaryId is not strictly needed here as we generate one internally if needed
  // for the conflict exclusion, but the actual passed ID from client for a "new" shift might be useful.
  // For now, the function will generate its own temporary context ID if newShiftPayload is used.
}

interface GetEligibleWorkersRequestBody {
  scheduledShiftId?: string;         // UUID for an existing shift
  newShiftPayload?: NewShiftPayload; // Details for a new, unsaved shift
  targetAssignmentType: 'lead' | 'regular' | 'training' | string;
  excludeWorkerId?: string | null;   // Worker ID to exclude from results
}

interface EligibleWorkerResponse {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  job_level: JobLevel;
}

// In a true Deno environment, Deno is a global.
declare const Deno: any;

// export default async function handler(req: Request): Promise<Response> {
Deno.serve(async (req: Request) => { // Changed to Deno.serve for standard Edge Function
  console.log("[get-eligible-workers] Function start.");
  console.log("get-eligible-workers: Attempting to read SUPABASE_URL:", Deno.env.get('SUPABASE_URL') ? "Found" : "NOT FOUND OR EMPTY");
  console.log("get-eligible-workers: Attempting to read SUPABASE_SERVICE_ROLE_KEY:", Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? "Found (length: " + (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.length || 0) + ")" : "NOT FOUND OR EMPTY");

  const supabaseClient: SupabaseClient = supabaseAdmin; 

  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: { 
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' 
      } 
    });
  }

  try {
    const body: GetEligibleWorkersRequestBody = await req.json();
    const { scheduledShiftId, newShiftPayload, targetAssignmentType, excludeWorkerId } = body;
    
    console.log(`[get-eligible-workers] Received request with: scheduledShiftId=${scheduledShiftId}, newShiftPayload=${JSON.stringify(newShiftPayload)}, targetAssignmentType=${targetAssignmentType}, excludeWorkerId=${excludeWorkerId}`);

    let effectiveShiftContext: ShiftContext;
    let shiftIdForConflictExclusion: string | null;

    if (newShiftPayload) {
      if (scheduledShiftId) {
        console.error('[get-eligible-workers] Both scheduledShiftId and newShiftPayload provided. Please provide only one.');
        return new Response(JSON.stringify({ error: 'Provide either scheduledShiftId or newShiftPayload, not both.' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }  
        });
      }
      console.log(`[get-eligible-workers] Handling new shift with payload:`, newShiftPayload);
      const { templateId, shiftDate, startTime, endTime } = newShiftPayload;

      const { data: template, error: templateError } = await supabaseClient
        .from('shift_templates')
        .select('*') 
        .eq('id', templateId)
        .single();

      if (templateError || !template) {
        console.error(`[get-eligible-workers] New Shift Error: Failed to fetch template ${templateId}`, templateError);
        return new Response(JSON.stringify({ error: `Failed to fetch template details for templateId: ${templateId}. ${templateError?.message}` }), { 
          status: 500, // Or 404 if template not found is a client error
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }  
        });
      }
      
      // Construct a partial ScheduledShiftData. Ensure it has all fields used by downstream logic.
      // The `id` here is temporary for the context of this function call, mainly for conflict exclusion.
      const tempNewShiftId = `new-shift-${crypto.randomUUID()}`;
      const partialScheduledShift: ScheduledShiftData = {
        id: tempNewShiftId, 
        shift_date: shiftDate,
        template_id: templateId,
        start_time: startTime,
        end_time: endTime,
        worker_id: null, // New shift, no worker assigned yet
        is_recurring_generated: false, // Default for new manual additions
        // Fields like positionName, workerName, workerLevel etc., are not available for an unsaved shift
        // and should not be relied upon by isWorkerEligibleForAssignment if it uses this partial data.
        // Ensure isWorkerEligibleForAssignment gets locationId & positionId from templateData for new shifts.
        positionName: undefined, // Explicitly undefined
        workerName: undefined, // Explicitly undefined
        workerLevel: undefined, // Explicitly undefined
        location_id: template.location_id, // Ensure this is part of ScheduledShiftData if needed, or rely on templateData
      };
      
      effectiveShiftContext = {
        scheduledShiftData: partialScheduledShift,
        templateData: template as ShiftTemplateData, 
      };
      shiftIdForConflictExclusion = tempNewShiftId;
      console.log(`[get-eligible-workers] Constructed context for new shift. Temporary ID for exclusion: ${tempNewShiftId}`);

    } else if (scheduledShiftId) {
      console.log(`[get-eligible-workers] Handling existing shift with ID: ${scheduledShiftId}`);
      // Assuming getShiftContext is defined in _shared/utils.ts and handles its own Supabase client or one is passed.
      // If getShiftContext needs a client, it should be: await getShiftContext(scheduledShiftId, supabaseClient);
      try {
        // Pass the supabaseClient to getShiftContext
        effectiveShiftContext = await getShiftContext(scheduledShiftId, supabaseClient); 
        if (!effectiveShiftContext || !effectiveShiftContext.scheduledShiftData || !effectiveShiftContext.templateData) {
            throw new Error("Shift context, scheduled data, or template data is missing.");
        }
      } catch (e: any) {
        console.error(`[get-eligible-workers] Error fetching context for existing shift ${scheduledShiftId}:`, e.message);
        return new Response(JSON.stringify({ error: `Failed to fetch shift context for ID: ${scheduledShiftId}. ${e.message}` }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }  
        });
      }
      shiftIdForConflictExclusion = scheduledShiftId;
      console.log(`[get-eligible-workers] Fetched context for existing shift.`);
    } else {
      console.error('[get-eligible-workers] Missing required fields: either scheduledShiftId or newShiftPayload must be provided.');
      return new Response(JSON.stringify({ error: 'Missing shift identifier: Provide scheduledShiftId or newShiftPayload.' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }  
      });
    }

    // Destructure after context is resolved
    const { scheduledShiftData, templateData } = effectiveShiftContext;
    
    // Validate crucial data after context resolution
    if (!scheduledShiftData || !templateData || !templateData.location_id || !templateData.position_id) {
        console.error('[get-eligible-workers] Resolved shift context is missing critical data (scheduledShiftData, templateData, location_id, or position_id). Context:', JSON.stringify(effectiveShiftContext));
        return new Response(JSON.stringify({ error: 'Internal error: Resolved shift context is incomplete.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    console.log(`[get-eligible-workers] Using locationId: ${templateData.location_id}, positionId: ${templateData.position_id}, shiftDate: ${scheduledShiftData.shift_date}`);

    // Continue with logic using templateData and scheduledShiftData from effectiveShiftContext
    console.log(`[get-eligible-workers] Fetching potential workers for location: ${templateData.location_id}`);
    const potentialWorkersRaw = await fetchWorkersByLocation(supabaseClient, templateData.location_id);
    console.log(`[get-eligible-workers] Found ${potentialWorkersRaw.length} potential raw workers.`);

    // Filter out inactive workers from the potential list
    const potentialWorkers = potentialWorkersRaw.filter(worker => worker.inactive !== true);
    console.log(`[get-eligible-workers] Filtered to ${potentialWorkers.length} active potential workers.`);

    if (potentialWorkers.length === 0) {
      console.log('[get-eligible-workers] No active potential workers found, returning empty list.');
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    const potentialWorkerIds = potentialWorkers.map(w => w.id);

    // Fetch locationHours once before the loop
    const dayOfWeekForShift = await getDayOfWeekName(scheduledShiftData.shift_date);
    console.log(`[get-eligible-workers] Fetching location hours for location ${templateData.location_id} on ${dayOfWeekForShift}...`);
    // Fetch location hours using the helper (which now takes a client)
    const locationHours = await fetchLocationHoursForDay(supabaseClient, templateData.location_id, dayOfWeekForShift);
    if (!locationHours) {
      console.warn(`[get-eligible-workers] Failed to fetch location hours for ${templateData.location_id} on ${dayOfWeekForShift}. This may affect eligibility checks.`);
    }
    console.log('[get-eligible-workers] Location hours fetched.');

    // --- Pre-fetch data for all potential workers ---
    console.log('[get-eligible-workers] Pre-fetching bulk worker data...');
    const [workerDetailsMap, locationLinkedWorkerIds, positionLinkedWorkerIds, conflictingShiftsMap] = await Promise.all([
      fetchMultipleWorkerDetailsForEligibility(supabaseClient, potentialWorkerIds),
      fetchWorkerLocationLinksForMultipleWorkers(supabaseClient, potentialWorkerIds, templateData.location_id),
      fetchWorkerPositionLinksForMultipleWorkers(supabaseClient, potentialWorkerIds, templateData.position_id),
      fetchConflictingShiftsForMultipleWorkers(supabaseClient, potentialWorkerIds, scheduledShiftData.shift_date) // Fetch conflicting shifts
    ]);
    console.log('[get-eligible-workers] Bulk worker data pre-fetched.');

    const prefetchedData: PrefetchedWorkerEligibilityData = {
      workerDetailsMap,
      locationLinkedWorkerIds,
      positionLinkedWorkerIds,
      conflictingShiftsMap // Add to prefetched data
    };

    const eligibleWorkers: EligibleWorkerResponse[] = [];
    let eligibleCount = 0;

    console.log('[get-eligible-workers] Starting eligibility check loop...');
    for (let i = 0; i < potentialWorkers.length; i++) {
      const worker = potentialWorkers[i];
      console.log(`[get-eligible-workers] [${i+1}/${potentialWorkers.length}] Checking eligibility for worker ID: ${worker.id} (using pre-fetched data)`);
      
      if (excludeWorkerId && worker.id === excludeWorkerId) {
        console.log(`[get-eligible-workers] [${i+1}/${potentialWorkers.length}] Worker ID: ${worker.id} is excluded.`);
        continue;
      }

      // Double-check worker.inactive status here before calling isWorkerEligibleForAssignment
      // This is a safeguard, as they should already be filtered. 
      // The worker object here comes from potentialWorkers, which is already filtered.
      // However, workerDetailsMap will contain the inactive status from fetchMultipleWorkerDetailsForEligibility.
      const workerDetail = workerDetailsMap.get(worker.id);
      if (workerDetail?.inactive === true) {
          console.log(`[get-eligible-workers] [${i+1}/${potentialWorkers.length}] Worker ID: ${worker.id} is inactive (from workerDetailsMap), skipping eligibility check.`);
          continue;
      }

      let effectiveShiftStartTime = scheduledShiftData.start_time;
      let effectiveShiftEndTime = scheduledShiftData.end_time;

      // Check if this is a Prep/Barista shift by its position_id
      // templateData.position_id is the source of truth for the position.
      if (templateData.position_id === PREP_BARISTA_POSITION_ID) {
        console.log(`[get-eligible-workers] Detected PREP_BARISTA_POSITION_ID ('${templateData.position_id}'). Adjusting effective time window.`);
        effectiveShiftStartTime = "09:30"; // Hardcoded start for the paired shift's full duration
        effectiveShiftEndTime = "17:00";   // Hardcoded end for the paired shift's full duration
        console.log(`[get-eligible-workers] Effective time for Prep/Barista: ${effectiveShiftStartTime} - ${effectiveShiftEndTime}`);
      } else {
        console.log(`[get-eligible-workers] Standard shift. Effective time: ${effectiveShiftStartTime} - ${effectiveShiftEndTime}`);
      }

      const isEligible = await isWorkerEligibleForAssignment(
        worker.id,
        scheduledShiftData.shift_date,
        effectiveShiftStartTime, // Pass the determined effective start time
        effectiveShiftEndTime,   // Pass the determined effective end time
        templateData.location_id,
        templateData.position_id,
        targetAssignmentType,
        shiftIdForConflictExclusion, // Use the resolved ID for conflict exclusion
        locationHours,
        prefetchedData,
        supabaseClient // Pass supabaseClient, as isWorkerEligibleForAssignment is async due to internal awaits (if any left)
      );
      console.log(`[get-eligible-workers] [${i+1}/${potentialWorkers.length}] Worker ID: ${worker.id} isEligible: ${isEligible}`);

      if (isEligible) {
        eligibleWorkers.push({
          id: worker.id,
          first_name: worker.first_name,
          last_name: worker.last_name,
          preferred_name: worker.preferred_name,
          job_level: worker.job_level,
        });
        eligibleCount++;
      }
    }
    console.log(`[get-eligible-workers] Eligibility check loop finished. Found ${eligibleCount} eligible workers.`);

    return new Response(JSON.stringify(eligibleWorkers), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    console.error("Error in get-eligible-workers handler:", error);
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

console.log('[get-eligible-workers] FILE EXECUTION END - After Deno.serve');

// Helper function (can be moved to utils.ts if used elsewhere)
function getDayOfWeekName(dateString: string): DayOfWeek { // Ensure DayOfWeek type is imported or defined
  const date = new Date(dateString + 'T00:00:00');
  const dayIndex = date.getDay();
  const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[dayIndex];
}

// Need to import DayOfWeek type if not already available
import type { DayOfWeek, ScheduledShiftData as LibScheduledShiftData, ShiftTemplateData as LibShiftTemplateData } from '../../../src/lib/types.ts'; // Corrected path, uncommented

// Make sure ShiftContext in utils.ts aligns with these extended/imported types
// For instance, if utils.ts defines its own ScheduledShiftData, ensure compatibility or use imported ones.
// Assuming utils.ts ShiftContext uses types that are compatible with what's constructed for new shifts
// and what's returned for existing shifts.