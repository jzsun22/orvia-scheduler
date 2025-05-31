import { createBrowserClient } from '@supabase/ssr';
import { type Database } from "@/lib/supabase/database.types"

export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Add an event listener to sign out the user when the tab is closed
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', async () => {
    // We don't want to prevent the tab from closing, so we don't return anything.
    // We also don't want to await the signOut promise, as that might delay closing.
    // This is a "fire and forget" operation.
    supabase.auth.signOut();
  });
}
