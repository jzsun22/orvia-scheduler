import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type Database } from "@/lib/supabase/database.types"
import { cookies } from 'next/headers';

export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        async setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              (await cookies()).set(name, value, options);
            }
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
};

// New function for creating an admin client with service role key
export const createSupabaseAdminClient = () => {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use the service role key
    {
      cookies: { // Admin client typically doesn't need cookies, but good to be consistent
        getAll() { return []; }, // No-op for admin client
        setAll() { /* No-op */ }, // No-op for admin client
      },
    }
  );
}; 