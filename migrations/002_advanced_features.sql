-- ─── Advanced Features Migration ─────────────────────────────

-- 1. Organizations: Add join code limits
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS invite_code_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invite_code_max_usage INTEGER;

-- 2. Groups Table
CREATE TABLE IF NOT EXISTS public.groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view groups" ON public.groups
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.org_members WHERE org_id = groups.org_id));

CREATE POLICY "Admins can manage groups" ON public.groups
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.org_members WHERE org_id = groups.org_id AND role = 'admin'));

-- 3. Group Members Table
CREATE TABLE IF NOT EXISTS public.group_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view group memberships" ON public.group_members
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.org_members WHERE org_id = (SELECT org_id FROM public.groups WHERE id = group_members.group_id)));

CREATE POLICY "Admins can manage group members" ON public.group_members
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.org_members WHERE org_id = (SELECT org_id FROM public.groups WHERE id = group_members.group_id) AND role = 'admin'));

-- 4. Test Assignments Table
CREATE TABLE IF NOT EXISTS public.test_assignments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id     UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    student_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    group_id    UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    -- Either student_id OR group_id must be present
    CONSTRAINT student_or_group CHECK ((student_id IS NOT NULL AND group_id IS NULL) OR (student_id IS NULL AND group_id IS NOT NULL))
);
ALTER TABLE public.test_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view their assignments" ON public.test_assignments
    FOR SELECT USING (
        auth.uid() = student_id OR 
        auth.uid() IN (SELECT user_id FROM public.group_members WHERE group_id = test_assignments.group_id)
    );

CREATE POLICY "Admins can manage assignments" ON public.test_assignments
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.org_members WHERE org_id = (SELECT org_id FROM public.tests WHERE id = test_assignments.test_id) AND role = 'admin'));

-- 5. Test Attempts Table (Successor to submissions for proctoring)
CREATE TABLE IF NOT EXISTS public.test_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id         UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    violation_score INTEGER DEFAULT 0,
    ip_address      TEXT,
    user_agent      TEXT
);
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can manage their own attempts" ON public.test_attempts
    FOR ALL USING (auth.uid() = student_id);

CREATE POLICY "Admins can view attempts" ON public.test_attempts
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.org_members WHERE org_id = (SELECT org_id FROM public.tests WHERE id = test_attempts.test_id) AND role = 'admin'));

-- 6. Attempt Logs Table
CREATE TABLE IF NOT EXISTS public.attempt_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id  UUID NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    details     JSONB DEFAULT '{}',
    timestamp   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.attempt_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert logs for their attempts" ON public.attempt_logs
    FOR INSERT WITH CHECK (auth.uid() = (SELECT student_id FROM public.test_attempts WHERE id = attempt_id));

CREATE POLICY "Admins can view attempt logs" ON public.attempt_logs
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.org_members WHERE org_id = (SELECT org_id FROM public.tests WHERE id = (SELECT test_id FROM public.test_attempts WHERE id = attempt_logs.attempt_id)) AND role = 'admin'));

-- 7. Update get_org_by_invite_code to check expiry and usage
CREATE OR REPLACE FUNCTION public.get_org_by_invite_code(code text)
RETURNS TABLE(id uuid, name text, slug text, is_valid boolean, error_message text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    org_rec RECORD;
    usage_count INTEGER;
BEGIN
    SELECT * INTO org_rec FROM public.organizations WHERE invite_code = code;
    
    IF org_rec IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, false, 'Invalid invite code'::text;
        RETURN;
    END IF;

    -- Check expiry
    IF org_rec.invite_code_expiry IS NOT NULL AND org_rec.invite_code_expiry < NOW() THEN
        RETURN QUERY SELECT org_rec.id, org_rec.name, org_rec.slug, false, 'Invite code has expired'::text;
        RETURN;
    END IF;

    -- Check usage limit
    IF org_rec.invite_code_max_usage IS NOT NULL THEN
        SELECT COUNT(*) INTO usage_count FROM public.org_members WHERE org_id = org_rec.id;
        IF usage_count >= org_rec.invite_code_max_usage THEN
            RETURN QUERY SELECT org_rec.id, org_rec.name, org_rec.slug, false, 'Invite code usage limit reached'::text;
            RETURN;
        END IF;
    END IF;

    RETURN QUERY SELECT org_rec.id, org_rec.name, org_rec.slug, true, NULL::text;
END;
$$;
