import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
const configuredBackend = ((import.meta.env.VITE_BACKEND_PROVIDER as string | undefined)?.trim() ?? '').toLowerCase();

export const getBackendProvider = (): 'node' | 'supabase' => {
    if (configuredBackend === 'node' || configuredBackend === 'supabase') {
        return configuredBackend;
    }

    return supabaseUrl && supabaseAnonKey ? 'supabase' : 'node';
};

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured()
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    })
    : null;

export const requireSupabaseClient = () => {
    if (!supabase) {
        throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }

    return supabase;
};
