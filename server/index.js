import { createServer } from 'node:http';
import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { closeDb, initDb, query, transaction } from './db.js';
import { executeSnippet, getExecutionProvider } from './codeExecution.js';

const PORT = Number(process.env.PORT || 3001);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_TTL_HOURS = Math.max(1, Number(process.env.SESSION_TTL_HOURS || 24 * 7));
const ATTEMPT_HEARTBEAT_GRACE_SECONDS = Math.max(30, Number(process.env.ATTEMPT_HEARTBEAT_GRACE_SECONDS || 90));
const DEV_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
];
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const EFFECTIVE_ALLOWED_ORIGINS = ALLOWED_ORIGINS.length > 0 || NODE_ENV === 'production'
    ? ALLOWED_ORIGINS
    : DEV_ALLOWED_ORIGINS;
const MAX_CODE_TEST_CASES = 20;
const MAX_CODE_TEST_CASE_INPUT_BYTES = 4000;
const MAX_CODE_TEST_CASE_OUTPUT_BYTES = 4000;
const rateLimitStore = new Map();

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const now = () => new Date().toISOString();

const isOriginAllowed = (origin) => {
    if (!origin) return true;
    return EFFECTIVE_ALLOWED_ORIGINS.includes(origin);
};

const getCorsHeaders = (req) => {
    const origin = req.headers.origin;
    const headers = {
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };

    if (origin && isOriginAllowed(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }

    return headers;
};

const validateOrigin = (req) => {
    const origin = req.headers.origin;
    if (!origin || isOriginAllowed(origin)) return;
    throw new HttpError(403, 'Origin not allowed.');
};

const enforceRateLimit = (req, scope, { limit, windowMs }) => {
    const key = `${scope}:${req.socket.remoteAddress || 'unknown'}`;
    const currentTime = Date.now();
    const current = rateLimitStore.get(key);

    if (!current || current.resetAt <= currentTime) {
        rateLimitStore.set(key, { count: 1, resetAt: currentTime + windowMs });
        return;
    }

    if (current.count >= limit) {
        throw new HttpError(429, 'Too many requests. Please try again later.');
    }

    current.count += 1;
};

const sendJson = (req, res, status, payload) => {
    res.writeHead(status, {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(payload));
};

const sendEmpty = (req, res, status) => {
    res.writeHead(status, {
        ...getCorsHeaders(req),
    });
    res.end();
};

const parseBody = async (req) => {
    if (req.method === 'GET' || req.method === 'DELETE') return {};

    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};

    try {
        return JSON.parse(raw);
    } catch {
        throw new HttpError(400, 'Invalid JSON body.');
    }
};

const hashPassword = (password) => {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
    return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
    const [salt, expected] = storedHash.split(':');
    if (!salt || !expected) return false;
    const actual = pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
    return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
};

const slugify = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'org';

const uniqueSlug = async (client, name) => {
    const base = slugify(name);
    let slug = base;
    let index = 1;

    while (true) {
        const { rowCount } = await client.query('SELECT 1 FROM organizations WHERE slug = $1 LIMIT 1', [slug]);
        if (rowCount === 0) return slug;
        slug = `${base}-${index}`;
        index += 1;
    }
};

const uniqueInviteCode = async (client) => {
    while (true) {
        const code = randomBytes(4).toString('hex');
        const { rowCount } = await client.query('SELECT 1 FROM organizations WHERE invite_code = $1 LIMIT 1', [code]);
        if (rowCount === 0) return code;
    }
};

const sanitizeUser = (user, role = null) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role,
});

const sanitizeSession = (session) => ({
    token: session.token,
    userId: session.user_id,
    createdAt: session.created_at instanceof Date ? session.created_at.toISOString() : session.created_at,
});

const serializeOrganizationForRole = (row, role) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    invite_code: role === 'admin' ? row.invite_code : undefined,
    created_by: row.created_by,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

const mapQuestionRow = (row) => ({
    ...row,
    options: row.options ?? null,
    constraints: row.constraints ?? null,
    examples: row.examples ?? null,
    test_cases: row.test_cases ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

const serializeQuestionForRole = (row, role) => {
    const question = mapQuestionRow(row);

    if (role === 'admin') return question;

    if (question.type === 'mcq') {
        return {
            ...question,
            answer: undefined,
        };
    }

    return {
        ...question,
        test_cases: undefined,
    };
};

const mapTestRow = (row, questions = [], role = 'admin') => ({
    ...row,
    tags: row.tags ?? [],
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    questions: questions.map((question) => serializeQuestionForRole(question, role)),
});

const mapSubmissionRow = (row) => ({
    ...row,
    answers: row.answers ?? [],
    integrity_events: row.integrity_events ?? [],
    submitted_at: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at,
});

const mapAttemptRow = (row) => ({
    ...row,
    integrity_events: row.integrity_events ?? [],
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    last_heartbeat_at: row.last_heartbeat_at instanceof Date ? row.last_heartbeat_at.toISOString() : row.last_heartbeat_at,
    expires_at: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    submitted_at: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at,
});

const getAttemptOrThrow = async (attemptId) => {
    const { rows } = await query('SELECT * FROM test_attempts WHERE id = $1 LIMIT 1', [attemptId]);
    if (rows.length === 0) throw new HttpError(404, 'Attempt not found.');
    return rows[0];
};

const isAttemptExpired = (attempt) => {
    const nowMs = Date.now();
    const expiresAtMs = new Date(attempt.expires_at).getTime();
    const heartbeatDeadlineMs = new Date(attempt.last_heartbeat_at).getTime() + ATTEMPT_HEARTBEAT_GRACE_SECONDS * 1000;
    return nowMs > expiresAtMs || nowMs > heartbeatDeadlineMs;
};

const expireAttemptIfNeeded = async (attempt) => {
    if (attempt.status !== 'active' || !isAttemptExpired(attempt)) return attempt;

    const { rows } = await query(`
        UPDATE test_attempts
        SET status = 'expired'
        WHERE id = $1
        RETURNING *
    `, [attempt.id]);

    return rows[0] ?? attempt;
};

const getAuth = async (req) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return { session: null, user: null };
    const sessionCutoff = new Date(Date.now() - SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { rows } = await query(`
        SELECT
            s.token,
            s.user_id,
            s.created_at,
            u.id,
            u.name,
            u.email,
            u.password_hash
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1
          AND s.created_at >= $2
        LIMIT 1
    `, [token, sessionCutoff]);

    if (rows.length === 0) return { session: null, user: null };

    const row = rows[0];
    return {
        session: {
            token: row.token,
            user_id: row.user_id,
            created_at: row.created_at,
        },
        user: {
            id: row.id,
            name: row.name,
            email: row.email,
            password_hash: row.password_hash,
        },
    };
};

const requireAuth = async (req) => {
    const auth = await getAuth(req);
    if (!auth.user || !auth.session) throw new HttpError(401, 'Authentication required.');
    return auth;
};

const getMembership = async (userId, orgId) => {
    const { rows } = await query('SELECT * FROM org_members WHERE user_id = $1 AND org_id = $2 LIMIT 1', [userId, orgId]);
    return rows[0] ?? null;
};

const requireMembership = async (userId, orgId) => {
    const membership = await getMembership(userId, orgId);
    if (!membership) throw new HttpError(403, 'You are not a member of this organization.');
    return membership;
};

const requireAdmin = async (userId, orgId) => {
    const membership = await requireMembership(userId, orgId);
    if (membership.role !== 'admin') throw new HttpError(403, 'Admin access required.');
    return membership;
};

const getTestOrThrow = async (testId) => {
    const { rows } = await query('SELECT * FROM tests WHERE id = $1 LIMIT 1', [testId]);
    if (rows.length === 0) throw new HttpError(404, 'Test not found.');
    return rows[0];
};

const getQuestionOrThrow = async (questionId) => {
    const { rows } = await query('SELECT * FROM questions WHERE id = $1 LIMIT 1', [questionId]);
    if (rows.length === 0) throw new HttpError(404, 'Question not found.');
    return rows[0];
};

const createSession = async (client, userId) => {
    const token = randomBytes(24).toString('hex');
    await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    const { rows } = await client.query(`
        INSERT INTO sessions (token, user_id, created_at)
        VALUES ($1, $2, $3)
        RETURNING token, user_id, created_at
    `, [token, userId, now()]);
    return rows[0];
};

const normalizeCodeTestCases = (testCases) => {
    if (!Array.isArray(testCases)) return [];

    return testCases
        .filter((testCase) => testCase && typeof testCase === 'object')
        .slice(0, MAX_CODE_TEST_CASES)
        .map((testCase, index) => ({
            id: typeof testCase.id === 'string' && testCase.id.trim() ? testCase.id.trim().slice(0, 64) : `case-${index + 1}`,
            input: String(testCase.input || '').slice(0, MAX_CODE_TEST_CASE_INPUT_BYTES),
            output: String(testCase.output || '').slice(0, MAX_CODE_TEST_CASE_OUTPUT_BYTES),
            hidden: Boolean(testCase.hidden),
        }))
        .filter((testCase) => testCase.input || testCase.output);
};

const normalizeQuestionInput = (question, position) => ({
    id: randomUUID(),
    test_id: question.testId,
    type: question.type,
    title: String(question.title || '').trim(),
    description: String(question.description || ''),
    points: Number(question.points || 0),
    position,
    options: question.type === 'mcq' ? JSON.stringify(question.options ?? []) : null,
    answer: question.type === 'mcq' ? Number(question.answer ?? 0) : null,
    template: question.type === 'code' ? String(question.template || '') : null,
    language: question.type === 'code' ? String(question.language || 'python') : null,
    constraints: question.type === 'code' ? JSON.stringify(question.constraints ?? []) : null,
    examples: question.type === 'code' ? JSON.stringify(question.examples ?? []) : null,
    test_cases: question.type === 'code' ? JSON.stringify(normalizeCodeTestCases(question.test_cases ?? question.testCases)) : null,
    created_at: now(),
});

const questionHasHiddenCodeCases = (question) =>
    question.type === 'code' && normalizeCodeTestCases(question.test_cases).some((testCase) => testCase.hidden);

const assertTestReadyForPublish = async (testId) => {
    const { rows } = await query('SELECT * FROM questions WHERE test_id = $1', [testId]);
    const questions = rows.map(mapQuestionRow);
    const invalidCodeQuestion = questions.find((question) => question.type === 'code' && !questionHasHiddenCodeCases(question));

    if (invalidCodeQuestion) {
        throw new HttpError(400, 'Every coding question must include at least one hidden test case before publishing.');
    }

    return questions;
};

const fetchQuestionsByTestIds = async (testIds) => {
    if (testIds.length === 0) return [];
    const { rows } = await query(`
        SELECT *
        FROM questions
        WHERE test_id = ANY($1::text[])
        ORDER BY position ASC
    `, [testIds]);
    return rows.map(mapQuestionRow);
};

const normalizeOutputForComparison = (value) => String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

const evaluateCodeAnswer = async (question, submitted) => {
    const code = typeof submitted.code === 'string' ? submitted.code.slice(0, 50000) : '';
    const language = typeof submitted.language === 'string' ? submitted.language : (question.language ?? 'python');
    const testCases = normalizeCodeTestCases(question.test_cases);
    const effectiveCases = testCases.length > 0
        ? testCases
        : normalizeCodeTestCases((question.examples ?? []).map((example, index) => ({
            id: `example-${index + 1}`,
            input: example.input,
            output: example.output,
            hidden: false,
        })));

    const normalized = {
        questionId: question.id,
        type: question.type,
        pointsEarned: 0,
        code,
        language,
    };

    if (!code.trim() || effectiveCases.length === 0) {
        return normalized;
    }

    let passedCount = 0;

    for (const testCase of effectiveCases) {
        let result;
        try {
            result = await executeSnippet(language, code, { stdin: testCase.input });
        } catch (error) {
            throw new HttpError(503, error instanceof Error ? error.message : 'Code evaluation is currently unavailable.');
        }

        if (result.run.code !== 0) continue;

        const actual = normalizeOutputForComparison(result.run.stdout || result.run.output);
        const expected = normalizeOutputForComparison(testCase.output);
        if (actual === expected) {
            passedCount += 1;
        }
    }

    normalized.pointsEarned = Math.round((question.points * passedCount) / effectiveCases.length);
    return normalized;
};

const buildSubmissionAnswers = async (questionRows, incomingAnswers) => {
    const answersByQuestionId = new Map(
        (Array.isArray(incomingAnswers) ? incomingAnswers : [])
            .filter((answer) => answer && typeof answer === 'object' && typeof answer.questionId === 'string')
            .map((answer) => [answer.questionId, answer])
    );

    let totalPoints = 0;
    let score = 0;

    const answers = [];
    for (const question of questionRows) {
        totalPoints += Number(question.points || 0);
        const submitted = answersByQuestionId.get(question.id) ?? {};

        if (question.type === 'mcq') {
            const normalized = {
                questionId: question.id,
                type: question.type,
                pointsEarned: 0,
            };
            const choice = Number.isInteger(submitted.choice) ? submitted.choice : undefined;
            if (choice !== undefined) normalized.choice = choice;
            if (choice === question.answer) {
                normalized.pointsEarned = question.points;
            }
            score += normalized.pointsEarned;
            answers.push(normalized);
            continue;
        }

        const normalized = await evaluateCodeAnswer(question, submitted);
        score += normalized.pointsEarned;
        answers.push(normalized);
    }

    return { answers, score, totalPoints };
};

const normalizeIntegrityEvents = (incomingEvents) => {
    if (!Array.isArray(incomingEvents)) return [];

    return incomingEvents
        .filter((event) => event && typeof event === 'object')
        .slice(0, 100)
        .map((event) => ({
            type: String(event.type || 'UNKNOWN').slice(0, 64),
            message: String(event.message || '').slice(0, 500),
            timestamp: String(event.timestamp || ''),
            occurredAt: String(event.occurredAt || ''),
        }));
};

const mergeIntegrityEvents = (existingEvents, incomingEvents) => {
    const merged = [...normalizeIntegrityEvents(existingEvents), ...normalizeIntegrityEvents(incomingEvents)];
    const seen = new Set();

    return merged.filter((event) => {
        const key = `${event.type}|${event.occurredAt}|${event.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 200);
};

const handleRequest = async (req, res) => {
    if (!req.url) throw new HttpError(400, 'Missing request URL.');
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    validateOrigin(req);

    if (req.method === 'OPTIONS') {
        sendEmpty(req, res, 204);
        return;
    }

    const body = await parseBody(req);

    if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(req, res, 200, { ok: true });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/signup') {
        enforceRateLimit(req, 'auth-signup', { limit: 10, windowMs: 15 * 60 * 1000 });
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (!name || !email || !password) throw new HttpError(400, 'Name, email, and password are required.');
        if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters long.');

        const result = await transaction(async (client) => {
            const existing = await client.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);
            if (existing.rowCount > 0) throw new HttpError(409, 'An account with this email already exists.');

            const userId = randomUUID();
            const userResult = await client.query(`
                INSERT INTO users (id, name, email, password_hash, created_at)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, name, email
            `, [userId, name, email, hashPassword(password), now()]);

            const session = await createSession(client, userId);
            return { user: userResult.rows[0], session };
        });

        sendJson(req, res, 201, {
            session: sanitizeSession(result.session),
            user: sanitizeUser(result.user),
            pendingEmailConfirmation: false,
        });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
        enforceRateLimit(req, 'auth-login', { limit: 10, windowMs: 15 * 60 * 1000 });
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const { rows } = await query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
        const user = rows[0];

        if (!user || !verifyPassword(password, user.password_hash)) {
            throw new HttpError(401, 'Invalid email or password.');
        }

        const session = await transaction(async (client) => createSession(client, user.id));
        sendJson(req, res, 200, {
            session: sanitizeSession(session),
            user: sanitizeUser(user),
        });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/auth/session') {
        const { session, user } = await getAuth(req);
        sendJson(req, res, 200, {
            session: session ? sanitizeSession(session) : null,
            user: user ? sanitizeUser(user) : null,
        });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/logout') {
        const { session } = await getAuth(req);
        if (session) {
            await query('DELETE FROM sessions WHERE token = $1', [session.token]);
        }
        sendJson(req, res, 200, { success: true });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/orgs/mine') {
        const { user } = await requireAuth(req);
        const { rows } = await query(`
            SELECT
                m.role,
                o.id,
                o.name,
                o.slug,
                o.invite_code,
                o.created_by,
                o.created_at
            FROM org_members m
            JOIN organizations o ON o.id = m.org_id
            WHERE m.user_id = $1
            ORDER BY o.created_at DESC
        `, [user.id]);

        sendJson(req, res, 200, {
            orgs: rows.map((row) => ({
                org: serializeOrganizationForRole(row, row.role),
                role: row.role,
            })),
        });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/orgs') {
        const { user } = await requireAuth(req);
        const name = String(body.name || '').trim();
        if (!name) throw new HttpError(400, 'Organization name is required.');

        const org = await transaction(async (client) => {
            const id = randomUUID();
            const slug = await uniqueSlug(client, name);
            const inviteCode = await uniqueInviteCode(client);
            const createdAt = now();

            const orgResult = await client.query(`
                INSERT INTO organizations (id, name, slug, invite_code, created_by, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [id, name, slug, inviteCode, user.id, createdAt]);

            await client.query(`
                INSERT INTO org_members (id, org_id, user_id, role, joined_at)
                VALUES ($1, $2, $3, 'admin', $4)
            `, [randomUUID(), id, user.id, createdAt]);

            return orgResult.rows[0];
        });

        sendJson(req, res, 201, {
            org: serializeOrganizationForRole(org, 'admin'),
        });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/orgs/join') {
        const { user } = await requireAuth(req);
        const code = String(body.code || '').trim().toLowerCase();

        const org = await transaction(async (client) => {
            const orgResult = await client.query('SELECT * FROM organizations WHERE LOWER(invite_code) = $1 LIMIT 1', [code]);
            if (orgResult.rowCount === 0) throw new HttpError(404, 'Invalid invite code. Please check and try again.');

            const orgRow = orgResult.rows[0];
            const membershipResult = await client.query(`
                SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2 LIMIT 1
            `, [orgRow.id, user.id]);

            if (membershipResult.rowCount > 0) throw new HttpError(409, 'You are already a member of this organization.');

            await client.query(`
                INSERT INTO org_members (id, org_id, user_id, role, joined_at)
                VALUES ($1, $2, $3, 'student', $4)
            `, [randomUUID(), orgRow.id, user.id, now()]);

            return orgRow;
        });

        sendJson(req, res, 200, {
            org: serializeOrganizationForRole(org, 'student'),
        });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/orgs/switch') {
        const { user } = await requireAuth(req);
        const orgId = String(body.orgId || '');
        const membership = await requireMembership(user.id, orgId);
        sendJson(req, res, 200, { role: membership.role });
        return;
    }

    let match = pathname.match(/^\/api\/orgs\/([^/]+)\/members$/);
    if (req.method === 'GET' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        await requireAdmin(user.id, orgId);

        const { rows } = await query(`
            SELECT
                m.id,
                m.org_id,
                m.user_id,
                m.role,
                m.joined_at,
                u.name AS profile_name,
                u.email AS profile_email
            FROM org_members m
            JOIN users u ON u.id = m.user_id
            WHERE m.org_id = $1
            ORDER BY m.joined_at ASC
        `, [orgId]);

        sendJson(req, res, 200, {
            members: rows.map((row) => ({
                id: row.id,
                org_id: row.org_id,
                user_id: row.user_id,
                role: row.role,
                joined_at: row.joined_at.toISOString(),
                profile: {
                    name: row.profile_name,
                    email: row.profile_email,
                },
            })),
        });
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/invite-code\/regenerate$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        await requireAdmin(user.id, orgId);

        const org = await transaction(async (client) => {
            const inviteCode = await uniqueInviteCode(client);
            const result = await client.query(`
                UPDATE organizations
                SET invite_code = $1
                WHERE id = $2
                RETURNING *
            `, [inviteCode, orgId]);
            if (result.rowCount === 0) throw new HttpError(404, 'Organization not found.');
            return result.rows[0];
        });

        sendJson(req, res, 200, {
            org: serializeOrganizationForRole(org, 'admin'),
        });
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/tests$/);
    if (req.method === 'GET' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        const membership = await requireMembership(user.id, orgId);

        const testRows = await query(`
            SELECT *
            FROM tests
            WHERE org_id = $1
              AND ($2 = 'admin' OR published = TRUE)
            ORDER BY created_at DESC
        `, [orgId, membership.role]);

        const testIds = testRows.rows.map((row) => row.id);
        const questionRows = await fetchQuestionsByTestIds(testIds);

        sendJson(req, res, 200, {
            tests: testRows.rows.map((row) => mapTestRow(row, questionRows.filter((question) => question.test_id === row.id), membership.role)),
        });
        return;
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)\/attempts$/);
    if (req.method === 'POST' && match) {
        enforceRateLimit(req, 'attempt-start', { limit: Number(process.env.ATTEMPT_START_RATE_LIMIT || 60), windowMs: 15 * 60 * 1000 });
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        const membership = await requireMembership(user.id, test.org_id);
        if (membership.role !== 'student') throw new HttpError(403, 'Only students can start test attempts.');
        if (!test.published) throw new HttpError(403, 'Only published tests can be attempted.');

        const latestAttemptResult = await query(`
            SELECT *
            FROM test_attempts
            WHERE test_id = $1 AND student_id = $2
            ORDER BY started_at DESC
            LIMIT 1
        `, [testId, user.id]);

        if (latestAttemptResult.rows.length > 0) {
            const latestAttempt = await expireAttemptIfNeeded(latestAttemptResult.rows[0]);

            if (latestAttempt.status === 'active') {
                sendJson(req, res, 200, { attempt: mapAttemptRow(latestAttempt) });
                return;
            }

            if (latestAttempt.status === 'submitted') {
                throw new HttpError(409, 'This test has already been submitted.');
            }

            // Expired or abandoned — allow the student to start a fresh attempt
        }

        const startedAt = now();
        const expiresAt = new Date(Date.now() + Math.max(1, Number(test.duration || 60)) * 60 * 1000).toISOString();
        const { rows } = await query(`
            INSERT INTO test_attempts (
                id, test_id, org_id, student_id, status,
                started_at, last_heartbeat_at, expires_at, violations_count, integrity_events
            )
            VALUES ($1, $2, $3, $4, 'active', $5, $5, $6, 0, '[]'::jsonb)
            RETURNING *
        `, [
            randomUUID(),
            testId,
            test.org_id,
            user.id,
            startedAt,
            expiresAt,
        ]);

        sendJson(req, res, 201, { attempt: mapAttemptRow(rows[0]) });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/tests') {
        const { user } = await requireAuth(req);
        const orgId = String(body.orgId || '');
        await requireAdmin(user.id, orgId);

        const title = String(body.title || '').trim();
        if (!title) throw new HttpError(400, 'Test title is required.');

        const { rows } = await query(`
            INSERT INTO tests (id, org_id, title, description, duration, difficulty, tags, published, created_by, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, FALSE, $8, $9)
            RETURNING *
        `, [
            randomUUID(),
            orgId,
            title,
            String(body.description || ''),
            Number(body.duration || 60),
            ['Easy', 'Medium', 'Hard'].includes(body.difficulty) ? body.difficulty : 'Medium',
            JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
            user.id,
            now(),
        ]);

        sendJson(req, res, 201, { test: mapTestRow(rows[0], []) });
        return;
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)$/);
    if (match) {
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);

        if (req.method === 'PATCH') {
            await requireAdmin(user.id, test.org_id);
            if (body.published === true) {
                await assertTestReadyForPublish(testId);
            }

            const { rows } = await query(`
                UPDATE tests
                SET
                    title = COALESCE($1, title),
                    description = COALESCE($2, description),
                    duration = COALESCE($3, duration),
                    difficulty = COALESCE($4, difficulty),
                    tags = COALESCE($5::jsonb, tags),
                    published = COALESCE($6, published)
                WHERE id = $7
                RETURNING *
            `, [
                body.title !== undefined ? String(body.title).trim() : null,
                body.description !== undefined ? String(body.description) : null,
                body.duration !== undefined ? Number(body.duration) : null,
                body.difficulty !== undefined ? body.difficulty : null,
                body.tags !== undefined ? JSON.stringify(Array.isArray(body.tags) ? body.tags : []) : null,
                body.published !== undefined ? Boolean(body.published) : null,
                testId,
            ]);

            const questionRows = await fetchQuestionsByTestIds([testId]);
            sendJson(req, res, 200, { test: mapTestRow(rows[0], questionRows) });
            return;
        }

        if (req.method === 'DELETE') {
            await requireAdmin(user.id, test.org_id);
            await query('DELETE FROM tests WHERE id = $1', [testId]);
            sendJson(req, res, 200, { success: true });
            return;
        }
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)\/questions$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireAdmin(user.id, test.org_id);

        const positionResult = await query('SELECT COUNT(*)::int AS count FROM questions WHERE test_id = $1', [testId]);
        const question = normalizeQuestionInput({ ...body, testId }, positionResult.rows[0].count);

        const { rows } = await query(`
            INSERT INTO questions (
                id, test_id, type, title, description, points, position,
                options, answer, template, language, constraints, examples, test_cases, created_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15
            )
            RETURNING *
        `, [
            question.id,
            question.test_id,
            question.type,
            question.title,
            question.description,
            question.points,
            question.position,
            question.options,
            question.answer,
            question.template,
            question.language,
            question.constraints,
            question.examples,
            question.test_cases,
            question.created_at,
        ]);

        sendJson(req, res, 201, { question: mapQuestionRow(rows[0]) });
        return;
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)\/questions\/reorder$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireAdmin(user.id, test.org_id);

        const questionIds = Array.isArray(body.questionIds) ? body.questionIds : [];
        await transaction(async (client) => {
            for (const [index, questionId] of questionIds.entries()) {
                await client.query('UPDATE questions SET position = $1 WHERE id = $2 AND test_id = $3', [index, questionId, testId]);
            }
        });

        const { rows } = await query('SELECT * FROM questions WHERE test_id = $1 ORDER BY position ASC', [testId]);
        sendJson(req, res, 200, { questions: rows.map(mapQuestionRow) });
        return;
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)\/questions\/([^/]+)\/run$/);
    if (req.method === 'POST' && match) {
        enforceRateLimit(req, 'code-run', { limit: 30, windowMs: 5 * 60 * 1000 });
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const questionId = decodeURIComponent(match[2]);
        const test = await getTestOrThrow(testId);
        const membership = await requireMembership(user.id, test.org_id);
        if (membership.role !== 'admin' && !test.published) {
            throw new HttpError(403, 'Only published tests can be executed.');
        }

        const question = await getQuestionOrThrow(questionId);
        if (question.test_id !== testId) {
            throw new HttpError(400, 'Question does not belong to this test.');
        }
        if (question.type !== 'code') {
            throw new HttpError(400, 'Only code questions can be executed.');
        }

        const language = String(body.language || question.language || 'javascript').toLowerCase();
        const code = String(body.code || '').slice(0, 50000);
        const stdin = String(body.stdin || '').slice(0, MAX_CODE_TEST_CASE_INPUT_BYTES);
        if (!code.trim()) throw new HttpError(400, 'Code is required.');

        try {
            const result = await executeSnippet(language, code, { stdin });
            sendJson(req, res, 200, {
                provider: getExecutionProvider(),
                ...result,
            });
        } catch (error) {
            if (error instanceof Error && error.message.includes('disabled')) {
                throw new HttpError(501, error.message);
            }

            throw new HttpError(400, error instanceof Error ? error.message : 'Code execution failed.');
        }
        return;
    }

    match = pathname.match(/^\/api\/attempts\/([^/]+)\/heartbeat$/);
    if (req.method === 'POST' && match) {
        enforceRateLimit(req, 'attempt-heartbeat', { limit: 120, windowMs: 60 * 60 * 1000 });
        const { user } = await requireAuth(req);
        const attemptId = decodeURIComponent(match[1]);
        let attempt = await getAttemptOrThrow(attemptId);
        if (attempt.student_id !== user.id) throw new HttpError(403, 'You can only update your own attempt.');

        attempt = await expireAttemptIfNeeded(attempt);
        if (attempt.status === 'submitted') throw new HttpError(409, 'This attempt is already submitted.');
        if (attempt.status !== 'active') throw new HttpError(410, 'This attempt is no longer active.');

        const { rows } = await query(`
            UPDATE test_attempts
            SET last_heartbeat_at = $1
            WHERE id = $2
            RETURNING *
        `, [now(), attemptId]);

        sendJson(req, res, 200, { attempt: mapAttemptRow(rows[0]) });
        return;
    }

    match = pathname.match(/^\/api\/attempts\/([^/]+)\/integrity-events$/);
    if (req.method === 'POST' && match) {
        enforceRateLimit(req, 'attempt-events', { limit: 240, windowMs: 60 * 60 * 1000 });
        const { user } = await requireAuth(req);
        const attemptId = decodeURIComponent(match[1]);
        let attempt = await getAttemptOrThrow(attemptId);
        if (attempt.student_id !== user.id) throw new HttpError(403, 'You can only update your own attempt.');

        attempt = await expireAttemptIfNeeded(attempt);
        if (attempt.status === 'submitted') throw new HttpError(409, 'This attempt is already submitted.');
        if (attempt.status !== 'active') throw new HttpError(410, 'This attempt is no longer active.');

        const integrityEvents = mergeIntegrityEvents(attempt.integrity_events, body.events ?? body.integrity_events);
        const { rows } = await query(`
            UPDATE test_attempts
            SET
                integrity_events = $1::jsonb,
                violations_count = $2,
                last_heartbeat_at = $3
            WHERE id = $4
            RETURNING *
        `, [
            JSON.stringify(integrityEvents),
            integrityEvents.length,
            now(),
            attemptId,
        ]);

        sendJson(req, res, 200, { attempt: mapAttemptRow(rows[0]) });
        return;
    }

    match = pathname.match(/^\/api\/questions\/([^/]+)$/);
    if (match) {
        const { user } = await requireAuth(req);
        const questionId = decodeURIComponent(match[1]);
        const question = await getQuestionOrThrow(questionId);
        const test = await getTestOrThrow(question.test_id);
        await requireAdmin(user.id, test.org_id);

        if (req.method === 'PATCH') {
            const { rows } = await query(`
                UPDATE questions
                SET
                    title = COALESCE($1, title),
                    description = COALESCE($2, description),
                    points = COALESCE($3, points),
                    options = CASE WHEN $4::jsonb IS NULL THEN options ELSE $4::jsonb END,
                    answer = COALESCE($5, answer),
                    template = COALESCE($6, template),
                    language = COALESCE($7, language),
                    constraints = CASE WHEN $8::jsonb IS NULL THEN constraints ELSE $8::jsonb END,
                    examples = CASE WHEN $9::jsonb IS NULL THEN examples ELSE $9::jsonb END,
                    test_cases = CASE WHEN $10::jsonb IS NULL THEN test_cases ELSE $10::jsonb END
                WHERE id = $11
                RETURNING *
            `, [
                body.title !== undefined ? String(body.title).trim() : null,
                body.description !== undefined ? String(body.description) : null,
                body.points !== undefined ? Number(body.points) : null,
                body.options !== undefined ? JSON.stringify(Array.isArray(body.options) ? body.options : []) : null,
                body.answer !== undefined ? Number(body.answer) : null,
                body.template !== undefined ? String(body.template) : null,
                body.language !== undefined ? String(body.language) : null,
                body.constraints !== undefined ? JSON.stringify(Array.isArray(body.constraints) ? body.constraints : []) : null,
                body.examples !== undefined ? JSON.stringify(Array.isArray(body.examples) ? body.examples : []) : null,
                body.test_cases !== undefined || body.testCases !== undefined
                    ? JSON.stringify(normalizeCodeTestCases(body.test_cases ?? body.testCases))
                    : null,
                questionId,
            ]);

            sendJson(req, res, 200, { question: mapQuestionRow(rows[0]) });
            return;
        }

        if (req.method === 'DELETE') {
            await query('DELETE FROM questions WHERE id = $1', [questionId]);
            const remaining = await query('SELECT id FROM questions WHERE test_id = $1 ORDER BY position ASC', [test.id]);
            await transaction(async (client) => {
                for (const [index, row] of remaining.rows.entries()) {
                    await client.query('UPDATE questions SET position = $1 WHERE id = $2', [index, row.id]);
                }
            });
            sendJson(req, res, 200, { success: true });
            return;
        }
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/submissions$/);
    if (req.method === 'GET' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        const membership = await requireMembership(user.id, orgId);

        const { rows } = await query(`
            SELECT *
            FROM submissions
            WHERE org_id = $1
              AND ($2 = 'admin' OR student_id = $3)
            ORDER BY submitted_at DESC
        `, [orgId, membership.role, user.id]);

        sendJson(req, res, 200, { submissions: rows.map(mapSubmissionRow) });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/submissions') {
        enforceRateLimit(req, 'submission-create', { limit: 20, windowMs: 5 * 60 * 1000 });
        const { user } = await requireAuth(req);
        const orgId = String(body.org_id || '');
        const testId = String(body.test_id || '');
        const attemptId = String(body.attempt_id || '');
        const membership = await requireMembership(user.id, orgId);
        if (membership.role !== 'student') throw new HttpError(403, 'Only students can submit test attempts.');
        if (!attemptId) throw new HttpError(400, 'Attempt ID is required.');

        const test = await getTestOrThrow(testId);
        if (test.org_id !== orgId) throw new HttpError(400, 'Test does not belong to the active organization.');
        if (!test.published) throw new HttpError(403, 'Only published tests can be submitted.');

        let attempt = await getAttemptOrThrow(attemptId);
        if (attempt.student_id !== user.id) throw new HttpError(403, 'You can only submit your own attempt.');
        if (attempt.test_id !== testId || attempt.org_id !== orgId) {
            throw new HttpError(400, 'Attempt does not belong to this test or organization.');
        }

        attempt = await expireAttemptIfNeeded(attempt);
        if (attempt.status === 'submitted') throw new HttpError(409, 'This attempt has already been submitted.');
        if (attempt.status !== 'active') throw new HttpError(410, 'This attempt is no longer active.');

        const questionResult = await query('SELECT * FROM questions WHERE test_id = $1 ORDER BY position ASC', [testId]);
        const { answers, score, totalPoints } = await buildSubmissionAnswers(questionResult.rows.map(mapQuestionRow), body.answers);
        const integrityEvents = mergeIntegrityEvents(attempt.integrity_events, body.integrity_events);
        const violationsCount = integrityEvents.length;
        const integrityScore = Math.max(0, 100 - Math.min(violationsCount, 20) * 5);

        const submittedAt = now();
        const submission = await transaction(async (client) => {
            const submissionId = randomUUID();
            const submissionResult = await client.query(`
                INSERT INTO submissions (
                    id, test_id, org_id, student_id, student_name, attempt_id, answers,
                    score, total_points, integrity_score, violations_count, integrity_events, submitted_at
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7::jsonb,
                    $8, $9, $10, $11, $12::jsonb, $13
                )
                RETURNING *
            `, [
                submissionId,
                testId,
                orgId,
                user.id,
                user.name,
                attemptId,
                JSON.stringify(answers),
                score,
                totalPoints,
                integrityScore,
                violationsCount,
                JSON.stringify(integrityEvents),
                submittedAt,
            ]);

            await client.query(`
                UPDATE test_attempts
                SET
                    status = 'submitted',
                    submitted_at = $1,
                    last_heartbeat_at = $1,
                    integrity_events = $2::jsonb,
                    violations_count = $3
                WHERE id = $4
            `, [
                submittedAt,
                JSON.stringify(integrityEvents),
                violationsCount,
                attemptId,
            ]);

            return submissionResult.rows[0];
        });

        sendJson(req, res, 201, { submission: mapSubmissionRow(submission) });
        return;
    }

    throw new HttpError(404, 'Route not found.');
};

await initDb();

const server = createServer(async (req, res) => {
    try {
        await handleRequest(req, res);
    } catch (error) {
        if (error instanceof HttpError) {
            sendJson(req, res, error.status, { error: error.message });
            return;
        }

        console.error(error);
        sendJson(req, res, 500, { error: 'Internal server error.' });
    }
});

server.listen(PORT, () => {
    console.log(`Etester API listening on http://localhost:${PORT}`);
    console.log(`Code execution provider: ${getExecutionProvider()}`);
    if (EFFECTIVE_ALLOWED_ORIGINS.length > 0) {
        console.log(`CORS allowlist: ${EFFECTIVE_ALLOWED_ORIGINS.join(', ')}`);
    } else {
        console.warn('CORS allowlist is empty. Set ALLOWED_ORIGINS before deploying to production.');
    }
});

const shutdown = async () => {
    server.close(async () => {
        await closeDb();
        process.exit(0);
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
