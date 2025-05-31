import { createBrowserClient } from '@supabase/ssr';
import { type Database } from "@/lib/supabase/database.types"

export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Removing the beforeunload event listener that was causing sign out on page refresh.
// The user should remain logged in on page refresh.
// Logout will occur on explicit logout button click or when the session cookie expires.
