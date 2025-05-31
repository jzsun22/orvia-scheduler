import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { type Database } from '@/lib/supabase/database.types';

// Define constants for paired shifts
const CUPERTINO_LOCATION_ID = process.env.CUPERTINO_LOCATION_ID;
const PREP_BARISTA_POSITION_ID = process.env.PREP_BARISTA_POSITION_ID;
const PAIRED_TEMPLATE_ID_1 = process.env.PAIRED_TEMPLATE_ID_1; 
const PAIRED_TEMPLATE_ID_2 = process.env.PAIRED_TEMPLATE_ID_2; 

interface ShiftData {
  shift_date: string;    // YYYY-MM-DD
  template_id: string;
  start_time: string;    // HH:MM
  end_time: string;      // HH:MM
}

interface AssignmentData {
  worker_id: string;
  assignment_type: 'lead' | 'regular' | 'training';
  is_manual_override?: boolean;
  assigned_start?: string | null;
  assigned_end?: string | null;
}

interface RequestPayload {
  shiftData: ShiftData;
  assignments: AssignmentData[];
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  try {
    const { shiftData, assignments }: RequestPayload = await request.json();

    if (!shiftData || !assignments) {
      return NextResponse.json({ error: 'Missing shiftData or assignments' }, { status: 400 });
    }

    const { shift_date, template_id } = shiftData; // Original start_time, end_time from client are less reliable

    if (!shift_date || !template_id) {
      // Removed start_time and end_time check here as we'll fetch from template
      return NextResponse.json({ error: 'Missing required fields in shiftData (shift_date, template_id)' }, { status: 400 });
    }

    // Define consistent types for shift template and scheduled shift rows/inserts
    type ShiftTemplateRow = Database['public']['Tables']['shift_templates']['Row'];
    type ScheduledShiftInsert = Database['public']['Tables']['scheduled_shifts']['Insert'];
    type ScheduledShiftRow = Database['public']['Tables']['scheduled_shifts']['Row'];

    // 1. Fetch details for the primary template
    const { data: primaryTemplate, error: primaryTemplateError } = await supabase
      .from('shift_templates')
      .select('id, start_time, end_time, position_id, location_id')
      .eq('id', template_id)
      .single<ShiftTemplateRow>();

    if (primaryTemplateError || !primaryTemplate) {
      console.error('Supabase error fetching primary template:', primaryTemplateError);
      return NextResponse.json({ error: primaryTemplateError?.message || 'Failed to fetch primary shift template.' }, { status: 500 });
    }

    let isPairedShift = false;
    let partnerTemplateId: string | null = null;
    let partnerTemplate: ShiftTemplateRow | null = null; // Use the consistent Row type
    let scheduledShiftIdForAssignments: string;
    let createdPartnerScheduledShiftId: string | null = null;

    // Check if it's the special Prep/Barista paired shift
    if (
      primaryTemplate.position_id === PREP_BARISTA_POSITION_ID &&
      primaryTemplate.location_id === CUPERTINO_LOCATION_ID
    ) {
      if (primaryTemplate.id === PAIRED_TEMPLATE_ID_1) {
        partnerTemplateId = PAIRED_TEMPLATE_ID_2 ?? null;
      } else if (primaryTemplate.id === PAIRED_TEMPLATE_ID_2) {
        partnerTemplateId = PAIRED_TEMPLATE_ID_1 ?? null;
      }

      if (partnerTemplateId) {
        const { data: fetchedPartnerTemplate, error: partnerTemplateError }  = await supabase
          .from('shift_templates')
          .select('id, start_time, end_time, position_id, location_id')
          .eq('id', partnerTemplateId)
          .single<ShiftTemplateRow>();

        if (partnerTemplateError || !fetchedPartnerTemplate) {
          console.warn(`Paired shift detected, but partner template ${partnerTemplateId} not found. Proceeding as non-paired.`, partnerTemplateError);
          // Proceed as if not a paired shift if partner template is missing
        } else if (
            fetchedPartnerTemplate.position_id === PREP_BARISTA_POSITION_ID &&
            fetchedPartnerTemplate.location_id === CUPERTINO_LOCATION_ID
        ) {
          isPairedShift = true;
          partnerTemplate = fetchedPartnerTemplate;
        } else {
            console.warn(`Paired shift detected, but partner template ${partnerTemplateId} does not match Prep Barista/Cupertino criteria. Proceeding as non-paired.`);
        }
      }
    }

    // 2. Create the scheduled shift(s)
    if (isPairedShift && partnerTemplate) {
      // Create first part of the pair (using primaryTemplate)
      const shift1ToInsert: ScheduledShiftInsert = {
        shift_date,
        template_id: primaryTemplate.id,
        start_time: primaryTemplate.start_time,
        end_time: primaryTemplate.end_time,
        is_recurring_generated: false,
      };
      const { data: newScheduledShift1, error: shiftError1 } = await supabase
        .from('scheduled_shifts')
        .insert(shift1ToInsert)
        .select('id')
        .single<ScheduledShiftRow>();

      if (shiftError1 || !newScheduledShift1) {
        console.error('Supabase error creating first part of paired scheduled_shift:', shiftError1);
        return NextResponse.json({ error: shiftError1?.message || 'Failed to create first part of paired shift.' }, { status: 500 });
      }
      scheduledShiftIdForAssignments = newScheduledShift1.id;

      // Create second part of the pair (using partnerTemplate)
      const shift2ToInsert: ScheduledShiftInsert = {
        shift_date,
        template_id: partnerTemplate.id,
        start_time: partnerTemplate.start_time,
        end_time: partnerTemplate.end_time,
        is_recurring_generated: false,
      };
      const { data: newScheduledShift2, error: shiftError2 } = await supabase
        .from('scheduled_shifts')
        .insert(shift2ToInsert)
        .select('id')
        .single<ScheduledShiftRow>();
      
      if (shiftError2 || !newScheduledShift2) {
        console.error('Supabase error creating second part of paired scheduled_shift:', shiftError2);
        // Attempt to clean up the first created shift part
        await supabase.from('scheduled_shifts').delete().eq('id', scheduledShiftIdForAssignments);
        return NextResponse.json({ error: shiftError2?.message || 'Failed to create second part of paired shift. First part rolled back.' }, { status: 500 });
      }
      createdPartnerScheduledShiftId = newScheduledShift2.id; // For logging or return if needed
      console.log(`Created paired shifts: ${scheduledShiftIdForAssignments} (Primary) and ${createdPartnerScheduledShiftId} (Partner)`);

    } else { // Not a paired shift or failed to validate partner
      const shiftToInsert: ScheduledShiftInsert = {
        shift_date,
        template_id: primaryTemplate.id, // Use the fetched primary template ID
        start_time: primaryTemplate.start_time, // Use authoritative start time
        end_time: primaryTemplate.end_time,   // Use authoritative end time
        is_recurring_generated: false,
      };
      const { data: newScheduledShift, error: shiftError } = await supabase
        .from('scheduled_shifts')
        .insert(shiftToInsert)
        .select('id')
        .single<ScheduledShiftRow>();

      if (shiftError || !newScheduledShift) {
        console.error('Supabase error creating scheduled_shift:', shiftError);
        const message = shiftError?.message || 'Failed to create shift, no data returned from database.';
        return NextResponse.json({ error: message }, { status: 500 });
      }
      scheduledShiftIdForAssignments = newScheduledShift.id;
    }

    const createdAssignmentResults = [];

    // 3. Create the shift assignments by calling the 'add-shift-assignment' Edge Function for each
    if (assignments.length > 0) {
      for (const asm of assignments) {
        const edgeFunctionPayload = {
          scheduledShiftId: scheduledShiftIdForAssignments, // Use the ID of the main/primary shift
          newWorkerId: asm.worker_id,
          newAssignmentType: asm.assignment_type,
          newAssignedStart: asm.assigned_start || null,
          newAssignedEnd: asm.assigned_end || null,
        };

        // Ensure the 'supabase' client from '@/lib/supabase' is an admin client
        // configured to invoke Edge Functions (typically using the service_role key).
        const { data: functionResponseData, error: functionInvokeError } = await supabase.functions.invoke(
          'add-shift-assignment',
          { body: edgeFunctionPayload }
        );

        if (functionInvokeError) {
          console.error(`[API ROUTE] Error invoking 'add-shift-assignment' for worker ${asm.worker_id}:`, JSON.stringify(functionInvokeError, null, 2));
          // Attempt to clean up: delete assignments made so far and the created shift(s).
          // This is a best-effort cleanup and not truly atomic.
          await supabase.from('shift_assignments').delete().eq('scheduled_shift_id', scheduledShiftIdForAssignments);
          if (createdPartnerScheduledShiftId) { // Also try to clean up assignments for partner if it was a paired creation
              await supabase.from('shift_assignments').delete().eq('scheduled_shift_id', createdPartnerScheduledShiftId);
          }
          await supabase.from('scheduled_shifts').delete().eq('id', scheduledShiftIdForAssignments);
          if (createdPartnerScheduledShiftId) {
              await supabase.from('scheduled_shifts').delete().eq('id', createdPartnerScheduledShiftId);
          }
          
          return NextResponse.json({
            error: `Failed to add assignment for worker ${asm.worker_id} via Edge Function: ${functionInvokeError.message}. Shift creation has been rolled back.`,
            details: functionInvokeError, // Contains details from the Edge Function error or invocation error
          }, { status: 500 });
        }
        
        // The 'add-shift-assignment' function returns { success: true, message: ..., data: insertedAssignment }
        // or throws an error that functionInvokeError would catch.
        // We assume if functionInvokeError is null, the function call was successful at HTTP level
        // and functionResponseData contains the body from the Edge Function.
        createdAssignmentResults.push(functionResponseData); 
      }
    }

    return NextResponse.json({
      message: 'Shift created and assignments processed successfully using Edge Function.',
      scheduledShiftId: scheduledShiftIdForAssignments,
      partnerScheduledShiftId: createdPartnerScheduledShiftId, // Include if created
      assignmentResults: createdAssignmentResults,
    }, { status: 201 });

  } catch (error: any) {
    console.error('API error in create-shift-with-assignments (during Edge Function invocation flow):', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred' }, { status: 500 });
  }
} 