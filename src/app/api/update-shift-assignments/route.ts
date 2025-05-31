import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { type Database } from '@/lib/supabase/database.types';

// Types for the payload received from the client (e.g., EditShiftModal)
interface ClientAssignmentPayload {
  id?: string; // DB ID if existing, undefined or temp client-ID if new/conceptual
  worker_id: string;
  assignment_type: 'lead' | 'regular' | 'training';
  assigned_start?: string | null;
  assigned_end?: string | null;
}

interface RequestPayload {
  scheduledShiftId: string;
  assignments: ClientAssignmentPayload[]; // The desired state from the client
}

// Types for interacting with the 'modify-shift-assignment' Supabase function
interface SPModifyAssignmentPayload {
  id: string;
  worker_id: string;
  assigned_start?: string | null;
  assigned_end?: string | null;
}

interface SPAddNewAssignmentPayload {
  scheduled_shift_id: string;
  worker_id: string;
  assignment_type: 'lead' | 'regular' | 'training';
  // assigned_start & assigned_end are handled/defaulted by the Supabase function for new assignments
}

interface SPRemoveAssignmentPayload {
  id: string;
}

interface SPModifyShiftAssignmentsBody {
  scheduledShiftId: string;
  assignmentsToUpdate: SPModifyAssignmentPayload[];
  assignmentsToRemove: SPRemoveAssignmentPayload[];
  assignmentsToAdd: SPAddNewAssignmentPayload[];
}

// Type for assignments fetched from the DB for comparison
type DBAssignment = Pick<
  Database['public']['Tables']['shift_assignments']['Row'],
  'id' | 'worker_id' | 'assignment_type' | 'assigned_start' | 'assigned_end'
>;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  try {
    const { scheduledShiftId, assignments: desiredAssignments }: RequestPayload = await request.json();

    console.log('[API update-shift-assignments] Received desiredAssignments:', JSON.stringify(desiredAssignments, null, 2));

    if (!scheduledShiftId) {
      return NextResponse.json({ error: 'Missing scheduledShiftId' }, { status: 400 });
    }
    if (!Array.isArray(desiredAssignments)) {
      return NextResponse.json({ error: 'Assignments must be an array' }, { status: 400 });
    }

    // 1. Fetch Current DB Assignments for the shift
    const { data: currentDBAssignmentsList, error: fetchError } = await supabase
      .from('shift_assignments')
      .select('id, worker_id, assignment_type, assigned_start, assigned_end')
      .eq('scheduled_shift_id', scheduledShiftId);

    console.log('[API update-shift-assignments] Fetched currentDBAssignmentsList:', JSON.stringify(currentDBAssignmentsList, null, 2));

    if (fetchError) {
      console.error('[API update-shift-assignments] Supabase error fetching current assignments:', fetchError);
      return NextResponse.json({ error: fetchError.message || 'Failed to fetch current assignments' }, { status: 500 });
    }

    const currentDBAssignmentsMap = new Map(
      (currentDBAssignmentsList as DBAssignment[] || []).map(a => [a.id, a])
    );

    const assignmentsToUpdate: SPModifyAssignmentPayload[] = [];
    const assignmentsToAdd: SPAddNewAssignmentPayload[] = [];
    const assignmentsToRemove: SPRemoveAssignmentPayload[] = [];

    const processedDBAssignmentIds = new Set<string>();

    // 2. Determine assignments to add and update
    for (const desired of desiredAssignments) {
      if (desired.id && !desired.id.startsWith('new-assignment-') && !desired.id.startsWith('new-shift-')) {
        // This is potentially an existing assignment
        const current = currentDBAssignmentsMap.get(desired.id);
        if (current) {
          processedDBAssignmentIds.add(desired.id);
          // Check if update is needed
          const needsUpdate =
            desired.worker_id !== current.worker_id ||
            desired.assignment_type !== current.assignment_type ||
            (desired.assigned_start || null) !== (current.assigned_start || null) || // Normalize null/undefined
            (desired.assigned_end || null) !== (current.assigned_end || null);

          if (needsUpdate) {
            assignmentsToUpdate.push({
              id: desired.id,
              worker_id: desired.worker_id,
              assigned_start: desired.assigned_start,
              assigned_end: desired.assigned_end,
            });
          }
        } else {
          // ID provided by client but not found in DB - could be an error or a new item with a non-temp ID.
          // For simplicity, if ID is present but not in DB map, we'll treat as an add,
          // assuming client IDs for new items are always temporary.
          // A more robust system might reject this or log a warning.
          // For now, let's be strict: if it has an ID that's not a temp one, it *should* exist.
          // If it doesn't, it might have been deleted by another process, or client state is off.
          // For safety, we could choose to ignore it or log an error.
          // Let's log and skip, to prevent accidental re-creation if it's a stale client ID.
          console.warn(`[API update-shift-assignments] Desired assignment with ID ${desired.id} not found in DB. Skipping update/add for this item.`);
        }
      } else {
        // New assignment (no ID or temporary client-generated ID)
        assignmentsToAdd.push({
          scheduled_shift_id: scheduledShiftId,
          worker_id: desired.worker_id,
          assignment_type: desired.assignment_type,
          // assigned_start/end are not part of AddNewSPPayload as per current Supabase func
        });
      }
    }

    // 3. Determine assignments to remove
    for (const currentId of Array.from(currentDBAssignmentsMap.keys())) {
      if (!processedDBAssignmentIds.has(currentId)) {
        // This DB assignment was not in the desired state (and not updated), so remove it.
        assignmentsToRemove.push({ id: currentId });
      }
    }
    
    console.log('[API update-shift-assignments] Changes determined:', {
        assignmentsToAdd,
        assignmentsToUpdate,
        assignmentsToRemove,
    });

    // 4. Invoke the consolidated Supabase function if there are any changes
    if (assignmentsToAdd.length > 0 || assignmentsToUpdate.length > 0 || assignmentsToRemove.length > 0) {
      const supabaseFunctionBody: SPModifyShiftAssignmentsBody = {
        scheduledShiftId,
        assignmentsToUpdate,
        assignmentsToRemove,
        assignmentsToAdd,
      };

      console.log('[API update-shift-assignments] Invoking modify-shift-assignment with body:', JSON.stringify(supabaseFunctionBody, null, 2));

      const { data: functionResponse, error: functionError } = await supabase.functions.invoke(
        'modify-shift-assignment',
        { body: supabaseFunctionBody }
      );

      if (functionError) {
        console.error('[API update-shift-assignments] Error invoking modify-shift-assignment Edge Function:', functionError);
        return NextResponse.json({
          error: functionError.message || 'Failed to update assignments via Supabase function.',
          details: functionError, // Include more details if available
        }, { status: 500 });
      }

      console.log('[API update-shift-assignments] Response from modify-shift-assignment:', functionResponse);
      return NextResponse.json({
        message: 'Shift assignments update processed successfully.',
        response: functionResponse,
      }, { status: 200 });

    } else {
      console.log('[API update-shift-assignments] No changes detected. Nothing to submit to Supabase function.');
      return NextResponse.json({
        message: 'No changes detected in assignments.',
      }, { status: 200 });
    }

  } catch (error: any) {
    console.error('[API update-shift-assignments] Unhandled API error:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred' }, { status: 500 });
  }
} 