import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

interface NewShiftClientContext {
  templateId: string;
  shiftDate: string;    // YYYY-MM-DD
  startTime: string;    // HH:MM
  endTime: string;      // HH:MM
  // locationId and positionId can be derived from templateId by the Supabase function
}

interface RequestBody {
  scheduledShiftId?: string; // Can be UUID for existing, or a temporary ID like "new-shift-..." for new ones
  newShiftClientContext?: NewShiftClientContext; // Provided by the client when scheduledShiftId is for a new shift
  targetAssignmentType: 'lead' | 'regular' | 'training' | string;
  excludeWorkerId?: string | null;
}

export async function POST(req: NextRequest) {
  // if (!supabaseUrl || !supabaseServiceRoleKey) {
  //   console.error('Supabase URL or Service Role Key is not defined.')
  //   return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })
  // }

  const supabaseAdmin = createSupabaseAdminClient();

  try {
    const body: RequestBody = await req.json()
    const { scheduledShiftId, newShiftClientContext, targetAssignmentType, excludeWorkerId } = body

    // Validate targetAssignmentType early
    if (!targetAssignmentType || typeof targetAssignmentType !== 'string') {
      return NextResponse.json({ error: 'targetAssignmentType is required and must be a string.' }, { status: 400 })
    }

    let payloadForSupabaseFunction;

    if (newShiftClientContext && scheduledShiftId && scheduledShiftId.startsWith('new-shift-')) {
      // This is a new shift, client provides full context.
      console.log(`[api/get-eligible-workers] Processing NEW shift context for temp ID: ${scheduledShiftId}`);
      payloadForSupabaseFunction = {
        newShiftPayload: {
          templateId: newShiftClientContext.templateId,
          shiftDate: newShiftClientContext.shiftDate,
          startTime: newShiftClientContext.startTime,
          endTime: newShiftClientContext.endTime,
        },
        targetAssignmentType,
        excludeWorkerId,
      };
    } else if (scheduledShiftId && !scheduledShiftId.startsWith('new-shift-')) {
      // This is an existing shift (presumed to be a valid UUID)
      console.log(`[api/get-eligible-workers] Processing EXISTING shift ID: ${scheduledShiftId}`);
      payloadForSupabaseFunction = {
        scheduledShiftId,
        targetAssignmentType,
        excludeWorkerId,
      };
    } else {
      // Invalid combination or missing data
      console.warn('[api/get-eligible-workers] Invalid request parameters:', body);
      return NextResponse.json({ error: 'Invalid request: Provide valid scheduledShiftId (UUID for existing) or newShiftClientContext with a temporary new-shift- ID for new shifts.' }, { status: 400 });
    }

    console.log('[api/get-eligible-workers] Invoking Supabase function with payload:', JSON.stringify(payloadForSupabaseFunction));
    // Invoke the Supabase Edge Function
    const { data, error: functionError } = await supabaseAdmin.functions.invoke(
      'get-eligible-workers', 
      { body: payloadForSupabaseFunction } 
    )

    if (functionError) {
      console.error('Error invoking Supabase function (get-eligible-workers):', functionError.message)
      let detail = functionError.message;
      // Attempt to parse more detailed error from function response if available
      if (functionError.context && typeof functionError.context.error === 'string') {
        detail = functionError.context.error;
      } else if (functionError.context && typeof functionError.context.error === 'object' && functionError.context.error.message) {
        detail = functionError.context.error.message;
      }
      return NextResponse.json({ error: `Failed to fetch eligible workers: ${detail}` }, { status: 500 })
    }

    // The `data` here should be the already parsed JSON object from the function's response body.
    return NextResponse.json(data, { status: 200 })

  } catch (error: any) {
    console.error('Error in get-eligible-workers route handler:', error.message)
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 })
  }
} 