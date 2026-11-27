-- Krishi Sangrah / Krishi Mitra PostgreSQL Schema for Supabase
-- Run this once in your Supabase Dashboard -> SQL Editor.

CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  mobile_number TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'farmer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.farmer_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  state TEXT,
  district TEXT,
  village TEXT,
  farmer_category TEXT,
  land_holding_acres TEXT,
  main_crop TEXT,
  irrigation_availability TEXT,
  farming_type TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.schemes (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  government_level TEXT NOT NULL,
  state_name TEXT NOT NULL DEFAULT 'All India',
  category TEXT NOT NULL,
  target_categories JSONB NOT NULL,
  overview TEXT NOT NULL,
  objectives JSONB NOT NULL,
  benefits TEXT NOT NULL,
  eligibility_summary TEXT NOT NULL,
  eligibility_rules JSONB NOT NULL,
  required_documents JSONB NOT NULL,
  application_procedure JSONB NOT NULL,
  official_url TEXT NOT NULL,
  logo_url TEXT,
  last_verified_date TEXT NOT NULL,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agriculture_items (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  summary TEXT NOT NULL,
  image_url TEXT,
  details JSONB NOT NULL,
  highlights JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  session_key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Farmer Assistant Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recently_viewed_schemes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheme_id INTEGER NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (server accesses via SUPABASE_SERVICE_ROLE_KEY)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agriculture_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recently_viewed_schemes ENABLE ROW LEVEL SECURITY;

-- Grant schema, table, and sequence privileges to service_role (required for sb_secret_ keys / custom table ownership)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
