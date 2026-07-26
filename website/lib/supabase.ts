'use client';

import { createClient } from '@supabase/supabase-js';

// Set these in website/.env.local (see .env.local.example) and as Vercel
// project env vars. Same Supabase project as the Electron app — one account
// works for both. The anon key is safe to expose: Row Level Security in
// supabase/migrations/0001_init.sql is what actually restricts access.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type ProfileStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  status: ProfileStatus;
  is_admin: boolean;
  created_at: string;
}
