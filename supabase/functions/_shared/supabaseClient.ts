import { createClient } from '@supabase/supabase-js'

// These lines fetch the values from the Edge Function secrets you've set
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
// const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '' // No longer needed here for supabaseAdmin
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Get the service role key

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey // Use the service role key here
)

// If you need to create a client with user's auth context within each function:
export function createSupabaseClient(req: Request) {
  const authHeader = req.headers.get('Authorization')!;
  // Note: It's generally recommended to pass the Authorization header directly.
  // The Supabase client handles extracting the token.
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',    // Directly getting from env
    Deno.env.get('SUPABASE_ANON_KEY') ?? '', // Directly getting from env for user-context clients
    { global: { headers: { Authorization: authHeader } } }
  );
} 