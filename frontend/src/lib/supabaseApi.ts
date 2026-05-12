import { ApiError } from './apiError';
import { requireSupabaseClient } from './supabase';

type Role = 'admin' | 'student';

const now = () => new Date().toISOString();

const slugify = (value: string) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'org';

const randomInviteCode = () => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
};

const getDefaultCategoryForType = (type: string) => {
    if (type === 'code') return 'coding';
    if (type === 'text') return 'saq';
    if (type === 'numeric') return 'numerical';
    return 'mcq';
};

const normalizeAcceptedAnswers = (answers: unknown) => {
    if (!Array.isArray(answers)) return [];
    return answers.map((answer) => String(answer || '').trim()).filter(Boolean).slice(0, 20);
};

const normalizeCodeTestCases = (testCases: unknown) => {
    if (!Array.isArray(testCases)) return [];
    return testCases
        .filter((testCase) => testCase && typeof testCase === 'object')
        .slice(0, 20)
        .map((testCase: any, index) => ({
            id: typeof testCase.id === 'string' && testCase.id.trim() ? testCase.id.trim().slice(0, 64) : `case-${index + 1}`,
            input: String(testCase.input || '').slice(0, 4000),
            output: String(testCase.output || '').slice(0, 4000),
            hidden: Boolean(testCase.hidden),
        }))
        .filter((testCase) => testCase.input || testCase.output);
};

const fail = (message: string, status = 400): never => {
    throw new ApiError(message, status);
};

const unwrap = (error: any, fallbackMessage: string, status = 400) => {
    if (!error) return;
    if (error.code === 'PGRST116') fail('Resource not found.', 404);
    fail(error.message || fallbackMessage, status);
};

const mapQuestionRow = (row: any) => ({
    ...row,
    category: row.category ?? getDefaultCategoryForType(row.type),
    image_url: row.image_url ?? null,
    options: row.options ?? [],
    accepted_answers: row.accepted_answers ?? [],
    case_sensitive: Boolean(row.case_sensitive),
    numeric_answer: row.numeric_answer === null || row.numeric_answer === undefined ? null : Number(row.numeric_answer),
    numeric_tolerance: row.numeric_tolerance === null || row.numeric_tolerance === undefined ? 0 : Number(row.numeric_tolerance),
    constraints: row.constraints ?? [],
    examples: row.examples ?? [],
    test_cases: row.test_cases ?? [],
    created_at: row.created_at,
});

const serializeQuestionForRole = (row: any, role: Role) => {
    const question = mapQuestionRow(row);
    if (role === 'admin') return question;
    if (question.type === 'mcq') return { ...question, answer: undefined };
    if (question.type === 'text') return { ...question, accepted_answers: undefined, case_sensitive: undefined };
    if (question.type === 'numeric') return { ...question, numeric_answer: undefined, numeric_tolerance: undefined };
    return { ...question, test_cases: undefined };
};

const mapTestRow = (row: any, questions: any[], role: Role) => ({
    ...row,
    visibility: row.visibility === 'org_public' ? 'org_public' : 'assigned_only',
    tags: row.tags ?? [],
    created_at: row.created_at,
    questions: questions.map((question) => serializeQuestionForRole(question, role)),
});

const serializeOrganizationForRole = (row: any, role: Role) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    invite_code: role === 'admin' ? row.invite_code : undefined,
    created_by: row.created_by,
    created_at: row.created_at,
});

const normalizeQuestionInput = (question: any, position: number, testId: string) => ({
    test_id: testId,
    type: question.type,
    category: String(question.category || getDefaultCategoryForType(question.type)).trim().toLowerCase() || getDefaultCategoryForType(question.type),
    title: String(question.title || '').trim(),
    description: String(question.description || ''),
    image_url: question.image_url !== undefined || question.imageUrl !== undefined ? String((question.image_url ?? question.imageUrl) || '') || null : null,
    points: Number(question.points || 0),
    position,
    options: question.type === 'mcq' ? (Array.isArray(question.options) ? question.options : []) : null,
    answer: question.type === 'mcq' ? Number(question.answer ?? 0) : null,
    accepted_answers: question.type === 'text' ? normalizeAcceptedAnswers(question.accepted_answers ?? question.acceptedAnswers) : null,
    case_sensitive: question.type === 'text' ? Boolean(question.case_sensitive ?? question.caseSensitive) : false,
    numeric_answer: question.type === 'numeric' ? Number(question.numeric_answer ?? question.answer ?? 0) : null,
    numeric_tolerance: question.type === 'numeric' ? Math.max(0, Number(question.numeric_tolerance ?? question.tolerance ?? 0)) : 0,
    template: question.type === 'code' ? String(question.template || '') : null,
    language: question.type === 'code' ? String(question.language || 'python') : null,
    constraints: question.type === 'code' ? (Array.isArray(question.constraints) ? question.constraints : []) : null,
    examples: question.type === 'code' ? (Array.isArray(question.examples) ? question.examples : []) : null,
    test_cases: question.type === 'code' ? normalizeCodeTestCases(question.test_cases ?? question.testCases) : null,
});

const getAuthContext = async () => {
    const supabase = requireSupabaseClient();
    const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
    ]);

    unwrap(sessionError, 'Unable to restore session.', 401);
    unwrap(userError, 'Unable to load current user.', 401);

    const session = sessionData.session;
    const authUser = userData.user;
    if (!session || !authUser) return { session: null, user: null };

    const profile = {
        id: authUser.id,
        name: typeof authUser.user_metadata?.name === 'string' && authUser.user_metadata.name.trim()
            ? authUser.user_metadata.name.trim()
            : authUser.email?.split('@')[0] || 'User',
        email: authUser.email ?? '',
    };

    const { error: profileError } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' });
    unwrap(profileError, 'Unable to sync user profile.');

    return {
        session: {
            userId: authUser.id,
            createdAt: session.user.last_sign_in_at || now(),
        },
        user: {
            ...profile,
            role: null,
        },
    };
};

const requireUser = async () => {
    const auth = await getAuthContext();
    if (!auth.user) fail('Authentication required.', 401);
    return auth.user;
};

const getMembership = async (userId: string, orgId: string) => {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.from('org_members').select('*').eq('user_id', userId).eq('org_id', orgId).maybeSingle();
    unwrap(error, 'Unable to load organization membership.');
    return data;
};

const requireMembership = async (userId: string, orgId: string) => {
    const membership = await getMembership(userId, orgId);
    if (!membership) fail('You are not a member of this organization.', 403);
    return membership;
};

const requireAdmin = async (userId: string, orgId: string) => {
    const membership = await requireMembership(userId, orgId);
    if (membership.role !== 'admin') fail('Admin access required.', 403);
    return membership;
};

const getTestOrThrow = async (testId: string) => {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.from('tests').select('*').eq('id', testId).maybeSingle();
    unwrap(error, 'Unable to load test.');
    if (!data) fail('Test not found.', 404);
    return data;
};

const getQuestionOrThrow = async (questionId: string) => {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.from('questions').select('*').eq('id', questionId).maybeSingle();
    unwrap(error, 'Unable to load question.');
    if (!data) fail('Question not found.', 404);
    return data;
};

const fetchQuestionsByTestIds = async (testIds: string[]) => {
    if (testIds.length === 0) return [];
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.from('questions').select('*').in('test_id', testIds).order('position', { ascending: true });
    unwrap(error, 'Unable to load questions.');
    return (data ?? []).map(mapQuestionRow);
};

const insertAuditLog = async (entry: {
    orgId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata?: Record<string, unknown>;
}) => {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('audit_logs').insert({
        org_id: entry.orgId,
        actor_user_id: entry.actorUserId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        metadata: entry.metadata ?? {},
        created_at: now(),
    });
    unwrap(error, 'Unable to write audit log.');
};

const getAssignedTestIdsForStudent = async (userId: string) => {
    const supabase = requireSupabaseClient();
    const [{ data: direct, error: directError }, { data: groups, error: groupError }] = await Promise.all([
        supabase.from('test_assignments').select('test_id').eq('student_id', userId),
        supabase.from('group_members').select('group_id').eq('user_id', userId),
    ]);

    unwrap(directError, 'Unable to load direct assignments.');
    unwrap(groupError, 'Unable to load group memberships.');

    const testIds = new Set((direct ?? []).map((row: any) => row.test_id));
    const groupIds = (groups ?? []).map((row: any) => row.group_id).filter(Boolean);

    if (groupIds.length > 0) {
        const { data: groupAssignments, error } = await supabase.from('test_assignments').select('test_id').in('group_id', groupIds);
        unwrap(error, 'Unable to load group assignments.');
        for (const row of groupAssignments ?? []) {
            testIds.add((row as any).test_id);
        }
    }

    return testIds;
};

const assertTestReadyForPublish = async (testId: string) => {
    const supabase = requireSupabaseClient();
    const test = await getTestOrThrow(testId);
    const { data: questionRows, error: questionError } = await supabase.from('questions').select('*').eq('test_id', testId);
    unwrap(questionError, 'Unable to validate questions.');

    const hasInvalidCodingQuestion = (questionRows ?? [])
        .map(mapQuestionRow)
        .some((question) => question.type === 'code' && !normalizeCodeTestCases(question.test_cases).some((testCase) => testCase.hidden));

    if (hasInvalidCodingQuestion) {
        fail('Every coding question must include at least one hidden test case before publishing.', 400);
    }

    if (test.visibility === 'assigned_only') {
        const { data: assignments, error } = await supabase.from('test_assignments').select('id').eq('test_id', testId).limit(1);
        unwrap(error, 'Unable to validate test assignments.');
        if (!assignments || assignments.length === 0) {
            fail('Assigned-only tests must have at least one assigned group or student before publishing.', 400);
        }
    }
};

export const supabaseApiRequest = async <T>(path: string, options: { body?: unknown; method?: string } = {}): Promise<T> => {
    const supabase = requireSupabaseClient();
    const requestUrl = new URL(path, 'https://etester.local');
    const pathname = requestUrl.pathname;
    const body = (options.body ?? {}) as Record<string, any>;
    const method = (options.method || 'GET').toUpperCase();

    if (method === 'GET' && pathname === '/auth/session') return await getAuthContext() as T;

    if (method === 'POST' && pathname === '/auth/signup') {
        const { data, error } = await supabase.auth.signUp({
            email: String(body.email || '').trim().toLowerCase(),
            password: String(body.password || ''),
            options: { data: { name: String(body.name || '').trim() } },
        });

        unwrap(error, 'Registration failed.');
        if (!data.session || !data.user) {
            return { session: null, user: null, pendingEmailConfirmation: true } as T;
        }

        const auth = await getAuthContext();
        return { session: auth.session, user: auth.user, pendingEmailConfirmation: false } as T;
    }

    if (method === 'POST' && pathname === '/auth/login') {
        const { error } = await supabase.auth.signInWithPassword({
            email: String(body.email || '').trim().toLowerCase(),
            password: String(body.password || ''),
        });
        unwrap(error, 'Login failed.', 401);
        return await getAuthContext() as T;
    }

    if (method === 'POST' && pathname === '/auth/logout') {
        const { error } = await supabase.auth.signOut();
        unwrap(error, 'Logout failed.');
        return null as T;
    }

    if (method === 'GET' && pathname === '/orgs/mine') {
        const user = await requireUser();
        const { data: memberships, error } = await supabase.from('org_members').select('role,org_id').eq('user_id', user.id);
        unwrap(error, 'Unable to load organizations.');

        const orgIds = (memberships ?? []).map((membership: any) => membership.org_id);
        const { data: orgRows, error: orgError } = orgIds.length > 0
            ? await supabase.from('organizations').select('*').in('id', orgIds)
            : { data: [], error: null };
        unwrap(orgError, 'Unable to load organizations.');

        const orgMap = new Map((orgRows ?? []).map((org: any) => [org.id, org]));
        return {
            orgs: (memberships ?? [])
                .map((membership: any) => ({
                    org: serializeOrganizationForRole(orgMap.get(membership.org_id), membership.role),
                    role: membership.role,
                }))
                .filter((membership: any) => membership.org),
        } as T;
    }

    if (method === 'POST' && pathname === '/orgs') {
        const user = await requireUser();
        const name = String(body.name || '').trim();
        if (!name) fail('Organization name is required.', 400);

        const baseSlug = slugify(name);
        let slug = baseSlug;
        let suffix = 1;
        while (true) {
            const { data, error } = await supabase.from('organizations').select('id').eq('slug', slug).maybeSingle();
            unwrap(error, 'Unable to validate organization slug.');
            if (!data) break;
            slug = `${baseSlug}-${suffix++}`;
        }

        const { data: org, error } = await supabase
            .from('organizations')
            .insert({
                name,
                slug,
                invite_code: randomInviteCode(),
                created_by: user.id,
                created_at: now(),
            })
            .select('*')
            .single();
        unwrap(error, 'Failed to create organization.');

        const { error: membershipError } = await supabase.from('org_members').insert({
            org_id: org.id,
            user_id: user.id,
            role: 'admin',
            joined_at: now(),
        });
        unwrap(membershipError, 'Failed to create organization membership.');

        await insertAuditLog({
            orgId: org.id,
            actorUserId: user.id,
            action: 'org.created',
            entityType: 'organization',
            entityId: org.id,
            metadata: { organizationName: org.name },
        });

        return { org: serializeOrganizationForRole(org, 'admin') } as T;
    }

    if (method === 'POST' && pathname === '/orgs/join') {
        const user = await requireUser();
        const code = String(body.code || '').trim().toLowerCase();
        if (!code) fail('Invite code is required.', 400);

        const { data: org, error } = await supabase.from('organizations').select('*').ilike('invite_code', code).maybeSingle();
        unwrap(error, 'Unable to look up invite code.');
        if (!org) fail('Invalid invite code. Please check and try again.', 404);

        const membership = await getMembership(user.id, org.id);
        if (!membership) {
            const { error: membershipError } = await supabase.from('org_members').insert({
                org_id: org.id,
                user_id: user.id,
                role: 'student',
                joined_at: now(),
            });
            unwrap(membershipError, 'Unable to join organization.');

            await insertAuditLog({
                orgId: org.id,
                actorUserId: user.id,
                action: 'org.joined',
                entityType: 'organization',
                entityId: org.id,
                metadata: { organizationName: org.name },
            });
        }

        return { success: true } as T;
    }

    if (method === 'POST' && pathname === '/orgs/switch') {
        const user = await requireUser();
        const membership = await requireMembership(user.id, String(body.orgId || ''));
        return { role: membership.role } as T;
    }

    let match = pathname.match(/^\/orgs\/([^/]+)\/invite-code\/regenerate$/);
    if (method === 'POST' && match) {
        const user = await requireUser();
        const orgId = decodeURIComponent(match[1]);
        await requireAdmin(user.id, orgId);

        const { data: org, error } = await supabase
            .from('organizations')
            .update({ invite_code: randomInviteCode() })
            .eq('id', orgId)
            .select('*')
            .single();
        unwrap(error, 'Unable to regenerate invite code.');

        await insertAuditLog({
            orgId,
            actorUserId: user.id,
            action: 'org.invite_code_regenerated',
            entityType: 'organization',
            entityId: orgId,
            metadata: { organizationName: org.name },
        });

        return { org: serializeOrganizationForRole(org, 'admin') } as T;
    }

    match = pathname.match(/^\/orgs\/([^/]+)\/members$/);
    if (method === 'GET' && match) {
        const user = await requireUser();
        const orgId = decodeURIComponent(match[1]);
        await requireAdmin(user.id, orgId);

        const { data: members, error } = await supabase.from('org_members').select('*').eq('org_id', orgId).order('joined_at', { ascending: true });
        unwrap(error, 'Unable to load organization members.');

        const userIds = (members ?? []).map((member: any) => member.user_id);
        const { data: profiles, error: profileError } = userIds.length > 0
            ? await supabase.from('profiles').select('*').in('id', userIds)
            : { data: [], error: null };
        unwrap(profileError, 'Unable to load member profiles.');

        const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
        return {
            members: (members ?? []).map((member: any) => ({
                ...member,
                profile: profileMap.get(member.user_id)
                    ? {
                        name: profileMap.get(member.user_id).name,
                        email: profileMap.get(member.user_id).email,
                    }
                    : undefined,
            })),
        } as T;
    }

    match = pathname.match(/^\/orgs\/([^/]+)\/groups$/);
    if (match) {
        const user = await requireUser();
        const orgId = decodeURIComponent(match[1]);

        if (method === 'GET') {
            await requireMembership(user.id, orgId);
            const { data, error } = await supabase.from('groups').select('*').eq('org_id', orgId).order('name', { ascending: true });
            unwrap(error, 'Unable to load groups.');
            return { groups: data ?? [] } as T;
        }

        if (method === 'POST') {
            await requireAdmin(user.id, orgId);
            const name = String(body.name || '').trim();
            if (!name) fail('Group name is required.', 400);

            const { data, error } = await supabase
                .from('groups')
                .insert({
                    org_id: orgId,
                    name,
                    description: String(body.description || ''),
                    created_at: now(),
                })
                .select('*')
                .single();
            unwrap(error, 'Unable to create group.');
            return { group: data } as T;
        }
    }

    match = pathname.match(/^\/groups\/([^/]+)$/);
    if (method === 'DELETE' && match) {
        const user = await requireUser();
        const groupId = decodeURIComponent(match[1]);
        const { data: group, error } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
        unwrap(error, 'Unable to load group.');
        if (!group) fail('Group not found.', 404);
        await requireAdmin(user.id, group.org_id);
        const { error: deleteError } = await supabase.from('groups').delete().eq('id', groupId);
        unwrap(deleteError, 'Unable to delete group.');
        return null as T;
    }

    match = pathname.match(/^\/groups\/([^/]+)\/members$/);
    if (match) {
        const user = await requireUser();
        const groupId = decodeURIComponent(match[1]);
        const { data: group, error } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
        unwrap(error, 'Unable to load group.');
        if (!group) fail('Group not found.', 404);

        if (method === 'GET') {
            await requireMembership(user.id, group.org_id);
            const { data: groupMembers, error: groupMemberError } = await supabase.from('group_members').select('*').eq('group_id', groupId);
            unwrap(groupMemberError, 'Unable to load group members.');
            const profileIds = (groupMembers ?? []).map((member: any) => member.user_id);
            const { data: profiles, error: profileError } = profileIds.length > 0
                ? await supabase.from('profiles').select('*').in('id', profileIds)
                : { data: [], error: null };
            unwrap(profileError, 'Unable to load member profiles.');
            const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
            return {
                members: (groupMembers ?? []).map((member: any) => ({
                    userId: member.user_id,
                    name: profileMap.get(member.user_id)?.name ?? 'Unknown',
                    email: profileMap.get(member.user_id)?.email ?? '',
                })),
            } as T;
        }

        if (method === 'POST') {
            await requireAdmin(user.id, group.org_id);
            const targetUserId = String(body.userId || '');
            if (!targetUserId) fail('User ID is required.', 400);
            const { error: insertError } = await supabase.from('group_members').upsert({
                group_id: groupId,
                user_id: targetUserId,
                joined_at: now(),
            }, { onConflict: 'group_id,user_id' });
            unwrap(insertError, 'Unable to add group member.');
            return null as T;
        }
    }

    match = pathname.match(/^\/groups\/([^/]+)\/members\/([^/]+)$/);
    if (method === 'DELETE' && match) {
        const user = await requireUser();
        const groupId = decodeURIComponent(match[1]);
        const targetUserId = decodeURIComponent(match[2]);
        const { data: group, error } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
        unwrap(error, 'Unable to load group.');
        if (!group) fail('Group not found.', 404);
        await requireAdmin(user.id, group.org_id);
        const { error: deleteError } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', targetUserId);
        unwrap(deleteError, 'Unable to remove group member.');
        return null as T;
    }

    match = pathname.match(/^\/orgs\/([^/]+)\/audit-logs$/);
    if (method === 'GET' && match) {
        const user = await requireUser();
        const orgId = decodeURIComponent(match[1]);
        await requireAdmin(user.id, orgId);

        const limit = Math.max(1, Math.min(Number(requestUrl.searchParams.get('limit') || 25), 100));
        const { data: logs, error } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(limit);
        unwrap(error, 'Unable to load audit logs.');

        const actorIds = (logs ?? []).map((log: any) => log.actor_user_id).filter(Boolean);
        const { data: actors, error: actorError } = actorIds.length > 0
            ? await supabase.from('profiles').select('*').in('id', actorIds)
            : { data: [], error: null };
        unwrap(actorError, 'Unable to load audit log actors.');
        const actorMap = new Map((actors ?? []).map((actor: any) => [actor.id, actor]));

        return {
            logs: (logs ?? []).map((log: any) => ({
                ...log,
                actor: log.actor_user_id && actorMap.get(log.actor_user_id)
                    ? {
                        id: actorMap.get(log.actor_user_id).id,
                        name: actorMap.get(log.actor_user_id).name,
                        email: actorMap.get(log.actor_user_id).email,
                    }
                    : null,
            })),
        } as T;
    }

    match = pathname.match(/^\/orgs\/([^/]+)\/tests$/);
    if (method === 'GET' && match) {
        const user = await requireUser();
        const orgId = decodeURIComponent(match[1]);
        const membership = await requireMembership(user.id, orgId);

        let tests: any[] = [];
        if (membership.role === 'admin') {
            const { data, error } = await supabase.from('tests').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
            unwrap(error, 'Unable to load tests.');
            tests = data ?? [];
        } else {
            const assignedTestIds = await getAssignedTestIdsForStudent(user.id);
            const { data, error } = await supabase.from('tests').select('*').eq('org_id', orgId).eq('published', true).order('created_at', { ascending: false });
            unwrap(error, 'Unable to load tests.');
            tests = (data ?? []).filter((test: any) => test.visibility === 'org_public' || assignedTestIds.has(test.id));
        }

        const questions = await fetchQuestionsByTestIds(tests.map((test) => test.id));
        return {
            tests: tests.map((test) => mapTestRow(test, questions.filter((question) => question.test_id === test.id), membership.role)),
        } as T;
    }

    if (method === 'POST' && pathname === '/tests') {
        const user = await requireUser();
        const orgId = String(body.orgId || '');
        await requireAdmin(user.id, orgId);
        const title = String(body.title || '').trim();
        if (!title) fail('Test title is required.', 400);

        const { data: created, error } = await supabase
            .from('tests')
            .insert({
                org_id: orgId,
                title,
                description: String(body.description || ''),
                duration: Number(body.duration || 60),
                difficulty: ['Easy', 'Medium', 'Hard'].includes(body.difficulty) ? body.difficulty : 'Medium',
                tags: Array.isArray(body.tags) ? body.tags : [],
                visibility: ['assigned_only', 'org_public'].includes(body.visibility) ? body.visibility : 'assigned_only',
                published: false,
                start_at: body.startAt ?? null,
                created_by: user.id,
                created_at: now(),
            })
            .select('*')
            .single();
        unwrap(error, 'Unable to create test.');

        await insertAuditLog({
            orgId,
            actorUserId: user.id,
            action: 'test.created',
            entityType: 'test',
            entityId: created.id,
            metadata: { title: created.title, difficulty: created.difficulty, tags: created.tags ?? [] },
        });

        return { test: mapTestRow(created, [], 'admin') } as T;
    }

    match = pathname.match(/^\/tests\/([^/]+)$/);
    if (match) {
        const user = await requireUser();
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireAdmin(user.id, test.org_id);

        if (method === 'PATCH') {
            const nextPublished = body.published === undefined ? test.published : Boolean(body.published);
            if (nextPublished && !test.published) await assertTestReadyForPublish(testId);

            const updates: Record<string, unknown> = {};
            if (body.title !== undefined) updates.title = String(body.title).trim();
            if (body.description !== undefined) updates.description = String(body.description);
            if (body.duration !== undefined) updates.duration = Number(body.duration);
            if (body.difficulty !== undefined) updates.difficulty = body.difficulty;
            if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) ? body.tags : [];
            if (body.visibility !== undefined) updates.visibility = body.visibility;
            if (body.published !== undefined) updates.published = nextPublished;
            if (body.startAt !== undefined) updates.start_at = body.startAt;

            const { data: updated, error } = await supabase.from('tests').update(updates).eq('id', testId).select('*').single();
            unwrap(error, 'Unable to update test.');

            await insertAuditLog({
                orgId: test.org_id,
                actorUserId: user.id,
                action: body.published === true && !test.published ? 'test.published' : body.published === false && test.published ? 'test.unpublished' : 'test.updated',
                entityType: 'test',
                entityId: testId,
                metadata: { title: updated.title, published: updated.published },
            });

            const questions = await fetchQuestionsByTestIds([testId]);
            return { test: mapTestRow(updated, questions, 'admin') } as T;
        }

        if (method === 'DELETE') {
            const { error } = await supabase.from('tests').delete().eq('id', testId);
            unwrap(error, 'Unable to delete test.');
            await insertAuditLog({
                orgId: test.org_id,
                actorUserId: user.id,
                action: 'test.deleted',
                entityType: 'test',
                entityId: testId,
                metadata: { title: test.title },
            });
            return { success: true } as T;
        }
    }

    match = pathname.match(/^\/tests\/([^/]+)\/questions$/);
    if (method === 'POST' && match) {
        const user = await requireUser();
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireAdmin(user.id, test.org_id);

        const { data: existing, error: existingError } = await supabase.from('questions').select('id').eq('test_id', testId);
        unwrap(existingError, 'Unable to load question positions.');
        const payload = normalizeQuestionInput(body, existing?.length ?? 0, testId);
        const { data: created, error } = await supabase.from('questions').insert(payload).select('*').single();
        unwrap(error, 'Unable to create question.');

        await insertAuditLog({
            orgId: test.org_id,
            actorUserId: user.id,
            action: 'question.created',
            entityType: 'question',
            entityId: created.id,
            metadata: { testId, title: created.title, type: created.type, points: created.points },
        });

        return { question: mapQuestionRow(created) } as T;
    }

    match = pathname.match(/^\/tests\/([^/]+)\/questions\/bulk$/);
    if (method === 'POST' && match) {
        const user = await requireUser();
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireAdmin(user.id, test.org_id);

        const questions = Array.isArray(body.questions) ? body.questions : [];
        const { data: existing, error: existingError } = await supabase.from('questions').select('id').eq('test_id', testId).order('position', { ascending: true });
        unwrap(existingError, 'Unable to load question positions.');

        const payload = questions.map((question, index) => normalizeQuestionInput(question, (existing?.length ?? 0) + index, testId));
        const { data: created, error } = await supabase.from('questions').insert(payload).select('*');
        unwrap(error, 'Unable to import questions.');
        return { questions: (created ?? []).map(mapQuestionRow) } as T;
    }

    match = pathname.match(/^\/questions\/([^/]+)$/);
    if (match) {
        const user = await requireUser();
        const questionId = decodeURIComponent(match[1]);
        const question = await getQuestionOrThrow(questionId);
        const test = await getTestOrThrow(question.test_id);
        await requireAdmin(user.id, test.org_id);

        if (method === 'PATCH') {
            const updates: Record<string, unknown> = {};
            if (body.title !== undefined) updates.title = String(body.title).trim();
            if (body.description !== undefined) updates.description = String(body.description);
            if (body.image_url !== undefined || body.imageUrl !== undefined) updates.image_url = String((body.image_url ?? body.imageUrl) || '') || null;
            if (body.points !== undefined) updates.points = Number(body.points);
            if (body.category !== undefined) updates.category = String(body.category).trim().toLowerCase();
            if (body.options !== undefined) updates.options = Array.isArray(body.options) ? body.options : [];
            if (body.accepted_answers !== undefined || body.acceptedAnswers !== undefined) updates.accepted_answers = normalizeAcceptedAnswers(body.accepted_answers ?? body.acceptedAnswers);
            if (body.case_sensitive !== undefined || body.caseSensitive !== undefined) updates.case_sensitive = Boolean(body.case_sensitive ?? body.caseSensitive);
            if (body.numeric_answer !== undefined || body.answer !== undefined) updates.numeric_answer = Number(body.numeric_answer ?? body.answer);
            if (body.numeric_tolerance !== undefined || body.tolerance !== undefined) updates.numeric_tolerance = Math.max(0, Number(body.numeric_tolerance ?? body.tolerance));
            if (body.answer !== undefined && question.type === 'mcq') updates.answer = Number(body.answer);
            if (body.template !== undefined) updates.template = String(body.template);
            if (body.language !== undefined) updates.language = String(body.language);
            if (body.constraints !== undefined) updates.constraints = Array.isArray(body.constraints) ? body.constraints : [];
            if (body.examples !== undefined) updates.examples = Array.isArray(body.examples) ? body.examples : [];
            if (body.test_cases !== undefined || body.testCases !== undefined) updates.test_cases = normalizeCodeTestCases(body.test_cases ?? body.testCases);

            const { data: updated, error } = await supabase.from('questions').update(updates).eq('id', questionId).select('*').single();
            unwrap(error, 'Unable to update question.');

            await insertAuditLog({
                orgId: test.org_id,
                actorUserId: user.id,
                action: 'question.updated',
                entityType: 'question',
                entityId: questionId,
                metadata: { testId: test.id, title: updated.title, type: updated.type, points: updated.points },
            });

            return { question: mapQuestionRow(updated) } as T;
        }

        if (method === 'DELETE') {
            const { error } = await supabase.from('questions').delete().eq('id', questionId);
            unwrap(error, 'Unable to delete question.');

            const { data: remaining, error: remainingError } = await supabase.from('questions').select('*').eq('test_id', test.id).order('position', { ascending: true });
            unwrap(remainingError, 'Unable to reorder questions.');
            await Promise.all((remaining ?? []).map((row: any, index: number) => supabase.from('questions').update({ position: index }).eq('id', row.id)));

            await insertAuditLog({
                orgId: test.org_id,
                actorUserId: user.id,
                action: 'question.deleted',
                entityType: 'question',
                entityId: questionId,
                metadata: { testId: test.id, title: question.title, type: question.type },
            });

            return { success: true } as T;
        }
    }

    match = pathname.match(/^\/tests\/([^/]+)\/questions\/reorder$/);
    if (method === 'POST' && match) {
        const user = await requireUser();
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireAdmin(user.id, test.org_id);

        const questionIds = Array.isArray(body.questionIds) ? body.questionIds.map(String) : [];
        await Promise.all(questionIds.map((questionId, index) => supabase.from('questions').update({ position: index }).eq('id', questionId).eq('test_id', testId)));
        const questions = await fetchQuestionsByTestIds([testId]);

        await insertAuditLog({
            orgId: test.org_id,
            actorUserId: user.id,
            action: 'question.reordered',
            entityType: 'test',
            entityId: testId,
            metadata: { title: test.title, questionCount: questionIds.length },
        });

        return { questions: questions.filter((question) => question.test_id === testId) } as T;
    }

    match = pathname.match(/^\/tests\/([^/]+)\/assignments$/);
    if (match) {
        const user = await requireUser();
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);

        if (method === 'GET') {
            await requireMembership(user.id, test.org_id);
            const { data, error } = await supabase.from('test_assignments').select('*').eq('test_id', testId);
            unwrap(error, 'Unable to load test assignments.');
            return { assignments: data ?? [] } as T;
        }

        if (method === 'POST') {
            await requireAdmin(user.id, test.org_id);
            const groupIds = Array.isArray(body.groupIds) ? body.groupIds.filter(Boolean).map(String) : [];
            const studentIds = Array.isArray(body.studentIds) ? body.studentIds.filter(Boolean).map(String) : [];

            const { error: deleteError } = await supabase.from('test_assignments').delete().eq('test_id', testId);
            unwrap(deleteError, 'Unable to replace test assignments.');

            const payload = [
                ...groupIds.map((groupId) => ({ test_id: testId, group_id: groupId, assigned_at: now() })),
                ...studentIds.map((studentId) => ({ test_id: testId, student_id: studentId, assigned_at: now() })),
            ];
            if (payload.length > 0) {
                const { error: insertError } = await supabase.from('test_assignments').insert(payload);
                unwrap(insertError, 'Unable to save test assignments.');
            }

            await insertAuditLog({
                orgId: test.org_id,
                actorUserId: user.id,
                action: 'test.assignments_updated',
                entityType: 'test',
                entityId: testId,
                metadata: { title: test.title, groupCount: groupIds.length, studentCount: studentIds.length },
            });

            return null as T;
        }
    }

    if (
        pathname.startsWith('/tests/') && pathname.includes('/run')
        || pathname.includes('/attempts')
        || pathname === '/submissions'
        || pathname.match(/^\/orgs\/[^/]+\/submissions$/)
        || pathname.match(/^\/orgs\/[^/]+\/live-attempts$/)
        || pathname.match(/^\/attempts\/[^/]+\/evidence$/)
    ) {
        fail('This exam-runtime route has not been migrated to Supabase yet. Keep `VITE_BACKEND_PROVIDER=node` for student attempt flows until the edge-function phase is added.', 501);
    }

    fail(`Supabase adapter does not implement ${method} ${pathname}.`, 404);
};
