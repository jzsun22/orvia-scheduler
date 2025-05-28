import { createSupabaseServerClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'


export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  // The imported 'supabase' client handles its own URL and Key checks internally.
  // If NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY are missing,
  // the error would originate from there, or the client wouldn't initialize.

  try {
    const body = await req.json()
    const { scheduledShiftId } = body

    if (!scheduledShiftId || typeof scheduledShiftId !== 'string') {
      return NextResponse.json({ error: 'scheduledShiftId is required and must be a string.' }, { status: 400 })
    }

    // Invoke the Supabase Edge Function using the standard client
    // The Edge Function itself will use its configured admin client if needed.
    const { data, error: functionError } = await supabase.functions.invoke(
      'get-editable-shift-details',
      { body: { scheduledShiftId } }
    )

    if (functionError) {
      console.error('Error invoking Supabase function:', functionError.message, functionError.context)
      let detail = functionError.message;
      // Check if context is an object and has an error property that could be more specific
      if (typeof functionError.context === 'object' && functionError.context !== null && 'error' in functionError.context) {
        const contextError = (functionError.context as any).error;
        if (typeof contextError === 'string') {
          detail = contextError;
        } else if (typeof contextError === 'object' && contextError !== null && 'message' in contextError) {
          detail = (contextError as any).message;
        }
      }
      return NextResponse.json({ error: `Failed to fetch shift details: ${detail}` }, { status: 500 })
    }

    return NextResponse.json(data, { status: 200 })

  } catch (error: any) {
    console.error('Error in get-editable-shift-details route handler:', error.message)
    // Ensure a default message if error.message is not available
    const errorMessage = error?.message || 'An unexpected error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
} 