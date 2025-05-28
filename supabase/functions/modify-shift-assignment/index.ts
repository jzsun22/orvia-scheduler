import { supabaseAdmin } from '../_shared/supabaseClient.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
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
} from '../_shared/edge-supabase-helpers.ts';
import type { DayOfWeek, ConflictingScheduledShift, Worker } from '../../../src/lib/types.ts';

interface ModifyAssignmentPayload {
    id: string; // ID of the shift_assignment to modify
    worker_id: string; // New worker_id
    assigned_start?: string | null; // Optional: New start time
    assigned_end?: string | null;   // Optional: New end time
}

interface RemoveAssignmentPayload {
    id: string; // ID of the shift_assignment to remove
}

interface AddNewAssignmentPayload {
    // This mirrors structure from add-shift-assignment but simplified for this context
    scheduled_shift_id: string;
    worker_id: string;
    assignment_type: 'regular'; // Only regular for Prep Barista
    // No assigned_start/end
}

interface ModifyShiftAssignmentsRequestBody {
    scheduledShiftId: string;
    assignmentsToUpdate: ModifyAssignmentPayload[];
    assignmentsToRemove: RemoveAssignmentPayload[];
    assignmentsToAdd: AddNewAssignmentPayload[]; // For assigning a previously unassigned Prep Barista
}

declare const Deno: any;

Deno.serve(async (req: Request) => {
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
        const body: ModifyShiftAssignmentsRequestBody = await req.json();
        console.log('[modify-shift-assignment] Received body:', JSON.stringify(body, null, 2));

        const { scheduledShiftId, assignmentsToUpdate, assignmentsToRemove, assignmentsToAdd } = body;

        if (!scheduledShiftId) {
            return new Response(JSON.stringify({ error: 'Missing required field: scheduledShiftId.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }

        const shiftContext: ShiftContext = await getShiftContext(scheduledShiftId, supabaseClient);
        const { scheduledShiftData, templateData, shiftType, currentAssignments: initialAssignmentsForShift } = shiftContext;

        // --- Paired Shift Logic ---
        const pairedInfo = await getPairedShiftPartnerDetails(supabaseClient, scheduledShiftData.template_id, scheduledShiftData.shift_date);
        let targetRegularWorkerIdForPairedShift: string | null = null;
        let isUnassigningPairedShift = false;

        if (pairedInfo.isPaired && pairedInfo.currentShiftTemplateDetails?.position_id === PREP_BARISTA_POSITION_ID) {
            console.log('[modify-shift-assignment] Detected Prep+Barista paired shift context.');

            // Consolidate changes to determine the single target regular worker or unassignment
            if (assignmentsToAdd.length > 1 || (assignmentsToAdd.length > 0 && assignmentsToUpdate.length > 0)) {
                 return new Response(JSON.stringify({ error: 'Invalid operations: Cannot add and update Prep+Barista assignment simultaneously.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
            }
            if (assignmentsToAdd.find(a => a.assignment_type !== 'regular')) {
                return new Response(JSON.stringify({ error: 'Only regular assignments can be added to Prep+Barista.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
            }
            // No training or custom times allowed - this will be implicitly handled by not having fields for them.

            if (assignmentsToAdd.length === 1) {
                targetRegularWorkerIdForPairedShift = assignmentsToAdd[0].worker_id;
            } else if (assignmentsToUpdate.length === 1) {
                // Find the assignment being updated to check its type. We only care about 'regular' type here.
                const originalAssignment = initialAssignmentsForShift.find(a => a.id === assignmentsToUpdate[0].id);
                if (originalAssignment?.assignment_type === 'regular') {
                    targetRegularWorkerIdForPairedShift = assignmentsToUpdate[0].worker_id;
                }
            } else if (assignmentsToRemove.length > 0) {
                // Check if any of the removed assignments was the 'regular' one
                const regularAssignmentBeingRemoved = initialAssignmentsForShift.find(a => 
                    a.assignment_type === 'regular' && assignmentsToRemove.some(r => r.id === a.id)
                );
                if (regularAssignmentBeingRemoved) {
                    isUnassigningPairedShift = true;
                    targetRegularWorkerIdForPairedShift = null;
                }
            }
            
            // If no relevant change to the regular worker, we might not need to sync.
            // However, the function will proceed to apply changes to the current shift first.
            // The sync logic will then act based on final state or the determined target worker.

            if (targetRegularWorkerIdForPairedShift) { // A worker is being assigned or changed
                 if (!pairedInfo.partnerScheduledShiftId || !pairedInfo.partnerTemplateDetails || !pairedInfo.currentShiftTemplateDetails) {
                    return new Response(JSON.stringify({ error: 'Paired shift partner details incomplete. Cannot modify assignment.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
                }
                // Eligibility check for the target worker for BOTH parts
                const workerDetailsMap = await fetchMultipleWorkerDetailsForEligibility(supabaseClient, [targetRegularWorkerIdForPairedShift]);
                const workerDetails = workerDetailsMap.get(targetRegularWorkerIdForPairedShift);
                if (!workerDetails) {
                    return new Response(JSON.stringify({ error: "Target worker details not found." }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
                }

                const dayOfWeekForCurrentShift: DayOfWeek = await getDayOfWeekName(scheduledShiftData.shift_date);
                const locationHoursCurrent = await fetchLocationHoursForDay(supabaseClient, pairedInfo.currentShiftTemplateDetails.location_id, dayOfWeekForCurrentShift);
                const isLinkedToLocationCurrent = await checkWorkerLocationLink(supabaseClient, targetRegularWorkerIdForPairedShift, pairedInfo.currentShiftTemplateDetails.location_id);
                const isLinkedToPositionCurrent = await checkWorkerPositionLink(supabaseClient, targetRegularWorkerIdForPairedShift, pairedInfo.currentShiftTemplateDetails.position_id);
                const conflictingShiftsCurrent: ConflictingScheduledShift[] = await fetchConflictingShiftsForWorker(supabaseClient, targetRegularWorkerIdForPairedShift, scheduledShiftData.shift_date);
                const prefetchedDataCurrent: PrefetchedWorkerEligibilityData = { workerDetailsMap, locationLinkedWorkerIds: new Set(isLinkedToLocationCurrent ? [targetRegularWorkerIdForPairedShift] : []), positionLinkedWorkerIds: new Set(isLinkedToPositionCurrent ? [targetRegularWorkerIdForPairedShift] : []), conflictingShiftsMap: new Map([[targetRegularWorkerIdForPairedShift, conflictingShiftsCurrent]]) };

                const isEligibleForCurrentPart = await isWorkerEligibleForAssignment(targetRegularWorkerIdForPairedShift, scheduledShiftData.shift_date, pairedInfo.currentShiftTemplateDetails.start_time, pairedInfo.currentShiftTemplateDetails.end_time, pairedInfo.currentShiftTemplateDetails.location_id, pairedInfo.currentShiftTemplateDetails.position_id, 'regular', null, locationHoursCurrent, prefetchedDataCurrent, supabaseClient);
                if (!isEligibleForCurrentPart) {
                    return new Response(JSON.stringify({ error: `Worker not eligible for current part (${pairedInfo.currentShiftTemplateDetails.start_time}-${pairedInfo.currentShiftTemplateDetails.end_time}) of paired shift.` }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
                }

                const dayOfWeekForPartnerShift: DayOfWeek = await getDayOfWeekName(pairedInfo.partnerScheduledShiftDetails!.shift_date);
                const locationHoursPartner = await fetchLocationHoursForDay(supabaseClient, pairedInfo.partnerTemplateDetails.location_id, dayOfWeekForPartnerShift);
                const prefetchedDataPartner: PrefetchedWorkerEligibilityData = prefetchedDataCurrent; // Assuming same location/pos needs for pair

                const isEligibleForPartnerPart = await isWorkerEligibleForAssignment(targetRegularWorkerIdForPairedShift, pairedInfo.partnerScheduledShiftDetails!.shift_date, pairedInfo.partnerTemplateDetails.start_time, pairedInfo.partnerTemplateDetails.end_time, pairedInfo.partnerTemplateDetails.location_id, pairedInfo.partnerTemplateDetails.position_id, 'regular', null, locationHoursPartner, prefetchedDataPartner, supabaseClient);
                if (!isEligibleForPartnerPart) {
                    return new Response(JSON.stringify({ error: `Worker not eligible for partner part (${pairedInfo.partnerTemplateDetails.start_time}-${pairedInfo.partnerTemplateDetails.end_time}) of paired shift.` }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
                }
            }
        }
        // --- End Paired Shift Logic Initial Checks ---

        // --- Database Operations --- 
        // ** TODO: Wrap in a transaction / RPC call **
        const allModifiedAssignmentIds: string[] = [];
        
        // Prepare the final list of assignments to remove, including cascaded training workers
        const finalAssignmentsToRemovePayloads: RemoveAssignmentPayload[] = [...(assignmentsToRemove || [])];

        if (assignmentsToRemove && assignmentsToRemove.length > 0) {
            const primaryWorkerAssignmentTypes = ['regular', 'lead'];

            for (const removalRequest of assignmentsToRemove) {
                const assignmentBeingRemoved = initialAssignmentsForShift.find(a => a.id === removalRequest.id);

                if (assignmentBeingRemoved && primaryWorkerAssignmentTypes.includes(assignmentBeingRemoved.assignment_type)) {
                    // A primary worker is being removed. Find and add associated training workers.
                    initialAssignmentsForShift.forEach(assignment => {
                        if (assignment.scheduled_shift_id === scheduledShiftId && // ensure same shift
                            assignment.assignment_type === 'training' &&
                            !finalAssignmentsToRemovePayloads.some(r => r.id === assignment.id)) { // avoid duplicates
                            finalAssignmentsToRemovePayloads.push({ id: assignment.id });
                            console.log(`[modify-shift-assignment] Cascading removal of training worker assignment ${assignment.id} due to primary worker assignment ${assignmentBeingRemoved.id} unassignment.`);
                        }
                    });
                }
            }
        }
        
        const allRemovedAssignmentIds: string[] = finalAssignmentsToRemovePayloads.map(r => r.id);

        // 1. Process Removals for current shift
        if (finalAssignmentsToRemovePayloads.length > 0) {
            const idsActuallyToRemove = finalAssignmentsToRemovePayloads.map(a => a.id);
            const { error: deleteError } = await supabaseClient
                .from('shift_assignments')
                .delete()
                .in('id', idsActuallyToRemove);
            if (deleteError) throw new Error(`Failed to remove shift assignments: ${deleteError.message}`);
            console.log('[modify-shift-assignment] Assignments removed for current shift:', idsActuallyToRemove);
        }

        // 2. Process Updates for current shift
        for (const assignment of (assignmentsToUpdate || [])) {
            const updatePayload: { worker_id: string; is_manual_override: boolean; assigned_start?: string | null; assigned_end?: string | null } = {
                worker_id: assignment.worker_id,
                is_manual_override: true,
            };

            if (assignment.assigned_start !== undefined) {
                updatePayload.assigned_start = assignment.assigned_start;
            }
            if (assignment.assigned_end !== undefined) {
                updatePayload.assigned_end = assignment.assigned_end;
            }

            const { error: updateError } = await supabaseClient
                .from('shift_assignments')
                .update(updatePayload)
                .eq('id', assignment.id);
            if (updateError) throw new Error(`Failed to update shift assignment ${assignment.id}: ${updateError.message}`);
            allModifiedAssignmentIds.push(assignment.id);
            console.log('[modify-shift-assignment] Assignment updated for current shift:', assignment.id);
        }

        // 3. Process Additions for current shift
        for (const assignment of (assignmentsToAdd || [])) {
            const { data: newAssignment, error: insertError } = await supabaseClient
                .from('shift_assignments')
                .insert({
                    scheduled_shift_id: assignment.scheduled_shift_id, // Should match main scheduledShiftId
                    worker_id: assignment.worker_id,
                    assignment_type: assignment.assignment_type,
                    is_manual_override: true,
                    assigned_start: null, // Enforced for Prep Barista
                    assigned_end: null    // Enforced for Prep Barista
                })
                .select('id')
                .single();
            if (insertError || !newAssignment) throw new Error(`Failed to add new shift assignment: ${insertError?.message || 'No data'}`);
            allModifiedAssignmentIds.push(newAssignment.id);
            console.log('[modify-shift-assignment] Assignment added for current shift:', newAssignment.id);
        }

        // 4. Synchronize with Partner Shift if applicable
        if (pairedInfo.isPaired && pairedInfo.currentShiftTemplateDetails?.position_id === PREP_BARISTA_POSITION_ID && pairedInfo.partnerScheduledShiftId) {
            console.log(`[modify-shift-assignment] Synchronizing partner shift ${pairedInfo.partnerScheduledShiftId}. Target worker: ${targetRegularWorkerIdForPairedShift}, Unassigning: ${isUnassigningPairedShift}`);
            // First, remove any existing 'regular' Prep Barista assignment from the partner shift
            const { error: deletePartnerOldError } = await supabaseClient
                .from('shift_assignments')
                .delete()
                .eq('scheduled_shift_id', pairedInfo.partnerScheduledShiftId)
                .eq('assignment_type', 'regular'); // Assuming only one 'regular' Prep Barista

            if (deletePartnerOldError) {
                console.error(`[modify-shift-assignment] Error deleting old regular assignment from partner ${pairedInfo.partnerScheduledShiftId}:`, deletePartnerOldError);
                // This could leave the partner in an inconsistent state. Consider impact.
            }

            if (targetRegularWorkerIdForPairedShift) { // Assign/change worker on partner
                const { data: partnerNewAssignment, error: insertPartnerError } = await supabaseClient
                    .from('shift_assignments')
                    .insert({
                        scheduled_shift_id: pairedInfo.partnerScheduledShiftId,
                        worker_id: targetRegularWorkerIdForPairedShift,
                        assignment_type: 'regular',
                        is_manual_override: true,
                        assigned_start: null,
                        assigned_end: null
                    })
                    .select('id')
                    .single();
                if (insertPartnerError || !partnerNewAssignment) {
                     console.error('[modify-shift-assignment] Error inserting assignment for partner shift:', insertPartnerError);
                    // CRITICAL: This means current shift changed, partner failed. Need transaction.
                    return new Response(JSON.stringify({ error: 'Failed to sync assignment to partner shift. Main shift modified, partner failed.' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
                }
                console.log('[modify-shift-assignment] Assignment synced to partner shift:', partnerNewAssignment.id);
            } else if (isUnassigningPairedShift) {
                // If we are unassigning, the deletion above already handled it for the partner.
                console.log('[modify-shift-assignment] Regular worker unassigned, partner sync involved deletion (already performed).');
            }
        }

        // 5. Update worker_id on scheduled_shifts table for current and potentially partner
        // Refetch assignments for current shift after modifications to determine its primary worker
        const { data: updatedAssignmentsCurrent, error: fetchCurrentError } = await supabaseClient
            .from('shift_assignments')
            .select<string, AssignmentData>(`*, workers (*, worker_positions(positions(*)), worker_locations(locations(*)))`)
            .eq('scheduled_shift_id', scheduledShiftId);
        if (fetchCurrentError) throw new Error("Failed to refetch current assignments after modification.");
        
        const primaryWorkerIdCurrent = determinePrimaryWorkerForShift(updatedAssignmentsCurrent || [], shiftType);
        await updateScheduledShiftPrimaryWorker(supabaseClient, scheduledShiftId, primaryWorkerIdCurrent);

        if (pairedInfo.isPaired && pairedInfo.currentShiftTemplateDetails?.position_id === PREP_BARISTA_POSITION_ID && pairedInfo.partnerScheduledShiftId) {
            const { data: updatedAssignmentsPartner, error: fetchPartnerError } = await supabaseClient
                .from('shift_assignments')
                .select<string, AssignmentData>(`*, workers (*, worker_positions(positions(*)), worker_locations(locations(*)))`)
                .eq('scheduled_shift_id', pairedInfo.partnerScheduledShiftId);
            if (fetchPartnerError) throw new Error("Failed to refetch partner assignments after modification.");

            const partnerShiftType = 'non-lead'; // Prep Barista is not lead
            const primaryWorkerIdPartner = determinePrimaryWorkerForShift(updatedAssignmentsPartner || [], partnerShiftType);
            await updateScheduledShiftPrimaryWorker(supabaseClient, pairedInfo.partnerScheduledShiftId, primaryWorkerIdPartner);
        }
        // --- End Database Operations ---

        // After all modifications, re-fetch context and update primary worker
        const finalShiftContext = await getShiftContext(scheduledShiftId, supabaseClient);
        const finalPrimaryWorkerId = determinePrimaryWorkerForShift(finalShiftContext.currentAssignments, finalShiftContext.shiftType);
        await updateScheduledShiftPrimaryWorker(supabaseClient, scheduledShiftId, finalPrimaryWorkerId);

        if (pairedInfo.isPaired && pairedInfo.partnerScheduledShiftId && pairedInfo.currentShiftTemplateDetails?.position_id === PREP_BARISTA_POSITION_ID) {
            const finalPartnerContext = await getShiftContext(pairedInfo.partnerScheduledShiftId, supabaseClient);
            const finalPartnerPrimaryWorkerId = determinePrimaryWorkerForShift(finalPartnerContext.currentAssignments, finalPartnerContext.shiftType);
            await updateScheduledShiftPrimaryWorker(supabaseClient, pairedInfo.partnerScheduledShiftId, finalPartnerPrimaryWorkerId);
        }

        return new Response(JSON.stringify({ success: true, message: "Shift assignments modified successfully." }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });

    } catch (error) {
        console.error("[modify-shift-assignment] CRITICAL UNHANDLED ERROR:", error);
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
