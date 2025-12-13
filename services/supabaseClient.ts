import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------
// IMPORTANT: REPLACE THESE WITH YOUR ACTUAL SUPABASE CREDENTIALS
// ---------------------------------------------------------
const SUPABASE_URL = 'https://dauegzprzhawsivykuaq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhdWVnenByemhhd3NpdnlrdWFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5OTE2NzUsImV4cCI6MjA3OTU2NzY3NX0.PwQp4Jzk09bxgQKFPOAf00t7XAsP4f08elxAb8NV6Pk';

// Only create the client if the URL is a valid HTTP/HTTPS URL
// This prevents the app from crashing immediately with "Invalid supabaseUrl"
const isConfigured = SUPABASE_URL && SUPABASE_URL.startsWith('http');

export const supabase = isConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;