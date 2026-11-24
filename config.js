/* ==========================================================================
   Paw Aid — Supabase connection settings
   Find both values in your Supabase project: Project Settings → API.
   The "anon" / "publishable" key is safe to put in a website; the database
   security rules in supabase/schema.sql decide what each user may do.
   NEVER put the "service_role" / "secret" key here.
   ========================================================================== */

window.PAWAID_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY'
};
