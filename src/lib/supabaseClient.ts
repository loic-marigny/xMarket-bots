import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn("Supabase env variables are missing; live market data may be unavailable.");
}

/**
 * Optional Supabase client used to hydrate last known prices for holdings.
 * When credentials are missing we gracefully fall back to mock values.
 */
export const supabaseClient = url && anonKey ? createClient(url, anonKey) : null;
