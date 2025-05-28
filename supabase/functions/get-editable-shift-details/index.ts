import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'; 
import { corsHeaders } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseClient.ts' 
import type { SupabaseClient } from '@supabase/supabase-js'; 


import {
  getScheduledShiftById,
  getShiftTemplateById,
  getShiftAssignmentsWithWorkerDetailsByScheduledShiftId,
  fetchLocationById,
  getPositionById,
} from '../_shared/edge-supabase-helpers.ts'; // UPDATED PATH
import type {
  ScheduledShift,
  ShiftTemplate,
  ShiftAssignmentsWithWorker,
  Location,
  Position,
  EditableShiftDetails
} from '../../../src/lib/types.ts'; // UPDATED PATH


serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = supabaseAdmin; 
    const { scheduledShiftId } = await req.json()

    if (!scheduledShiftId || typeof scheduledShiftId !== 'string') {
      return new Response(JSON.stringify({ error: 'scheduledShiftId is required and must be a string' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const scheduledShift = await getScheduledShiftById(supabaseClient, scheduledShiftId)
    if (!scheduledShift) {
      return new Response(JSON.stringify({ error: 'Scheduled shift not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    if (!scheduledShift.template_id) {
        return new Response(JSON.stringify({ error: 'Scheduled shift is missing a template_id' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400, 
        });
    }

    const shiftTemplate = await getShiftTemplateById(supabaseClient, scheduledShift.template_id)
    
    if (!shiftTemplate) {
      return new Response(JSON.stringify({ error: 'Shift template not found for the given template_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    if (!shiftTemplate.location_id) {
        return new Response(JSON.stringify({ error: 'Shift template is missing a location_id' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
    if (!shiftTemplate.position_id) {
        return new Response(JSON.stringify({ error: 'Shift template is missing a position_id' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }

    let shiftType: EditableShiftDetails['shiftType'];
    if (shiftTemplate.lead_type === 'opening') {
        shiftType = 'opening-lead';
    } else if (shiftTemplate.lead_type === 'closing') {
        shiftType = 'closing-lead';
    } else { 
        shiftType = 'non-lead';
    }

    const currentAssignments = await getShiftAssignmentsWithWorkerDetailsByScheduledShiftId(supabaseClient, scheduledShiftId)

    const location = await fetchLocationById(supabaseClient, shiftTemplate.location_id)
    if (!location) {
      return new Response(JSON.stringify({ error: 'Location data not found for shift template\'s location_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    const position = await getPositionById(supabaseClient, shiftTemplate.position_id)
    if (!position) {
      return new Response(JSON.stringify({ error: 'Position data not found for shift template\'s position_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    const responseData: EditableShiftDetails = {
      scheduledShift,
      shiftTemplate,
      currentAssignments,
      shiftType,
      location,
      position,
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: unknown) { 
    let errorMessage = 'An unexpected error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error('Error in get-editable-shift-details:', errorMessage)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
}) 