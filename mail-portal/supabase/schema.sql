-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. PROFILES TABLE
-- ==========================================
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view their own profile" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

-- Trigger: Auto-create profile on Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==========================================
-- 2. SUBSCRIPTIONS TABLE
-- ==========================================
CREATE TABLE public.subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'cancelled')),
    billing_provider TEXT NOT NULL CHECK (billing_provider IN ('mercado_pago', 'fintoc')),
    subscription_id TEXT UNIQUE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Subscriptions Policies (Read-only for users, updates managed by service role / webhook)
CREATE POLICY "Users can view their own subscription" 
    ON public.subscriptions FOR SELECT 
    USING (auth.uid() = profile_id);


-- ==========================================
-- 3. DOMAINS TABLE
-- ==========================================
CREATE TABLE public.domains (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    domain_name TEXT UNIQUE NOT NULL CHECK (domain_name ~* '^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}$'),
    verification_token TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

-- Domains Policies
CREATE POLICY "Users can view their own domains" 
    ON public.domains FOR SELECT 
    USING (auth.uid() = profile_id);

CREATE POLICY "Users can register their own domains" 
    ON public.domains FOR INSERT 
    WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can delete their own unverified domains" 
    ON public.domains FOR DELETE 
    USING (auth.uid() = profile_id AND is_verified = FALSE);


-- ==========================================
-- 4. MAILBOXES TABLE
-- ==========================================
CREATE TABLE public.mailboxes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    domain_id UUID REFERENCES public.domains(id) ON DELETE CASCADE NOT NULL,
    local_part TEXT NOT NULL CHECK (local_part ~* '^[a-z0-9._%+-]+$'),
    storage_quota_mb INTEGER NOT NULL CHECK (storage_quota_mb > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE (domain_id, local_part)
);

-- Enable RLS
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

-- Helper function to check if domain belongs to user (for inserts/deletes)
CREATE OR REPLACE FUNCTION public.user_owns_domain(domain_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.domains 
        WHERE id = domain_uuid AND profile_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mailboxes Policies
CREATE POLICY "Users can view mailboxes for their domains" 
    ON public.mailboxes FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.domains 
            WHERE domains.id = mailboxes.domain_id AND domains.profile_id = auth.uid()
        )
    );

CREATE POLICY "Users can create mailboxes for their domains" 
    ON public.mailboxes FOR INSERT 
    WITH CHECK (
        public.user_owns_domain(domain_id) AND 
        EXISTS (
            SELECT 1 FROM public.domains 
            WHERE id = domain_id AND is_verified = TRUE
        )
    );

CREATE POLICY "Users can delete mailboxes for their domains" 
    ON public.mailboxes FOR DELETE 
    USING (public.user_owns_domain(domain_id));
