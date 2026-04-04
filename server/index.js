import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { closeDb, initDb, query, transaction } from './db.js';
import { executeSnippet, getExecutionProvider } from './codeExecution.js';

const PORT = Number(process.env.PORT || 3001);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_TTL_HOURS = Math.max(1, Number(process.env.SESSION_TTL_HOURS || 24 * 7));
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'etester_session';
const SESSION_COOKIE_SAME_SITE = process.env.SESSION_COOKIE_SAME_SITE || 'Lax';
const SESSION_COOKIE_DOMAIN = (process.env.SESSION_COOKIE_DOMAIN || '').trim();
const SESSION_COOKIE_SECURE = process.env.SESSION_COOKIE_SECURE
    ? process.env.SESSION_COOKIE_SECURE === 'true'
    : NODE_ENV === 'production';
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
const MAX_BULK_IMPORT_QUESTIONS = 200;
const MAX_ATTEMPT_EVIDENCE_BYTES = Math.max(40_000, Number(process.env.MAX_ATTEMPT_EVIDENCE_BYTES || 220_000));
const rateLimitStore = new Map();

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const now = () => new Date().toISOString();

const parseCookies = (req) => {
    const raw = req.headers.cookie || '';
    if (!raw) return {};

    return raw.split(';').reduce((acc, part) => {
        const [name, ...rest] = part.trim().split('=');
        if (!name) return acc;
        acc[name] = decodeURIComponent(rest.join('=') || '');
        return acc;
    }, {});
};

const buildSessionCookie = (token) => {
    const parts = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` ,
        'Path=/',
        'HttpOnly',
        `SameSite=${SESSION_COOKIE_SAME_SITE}` ,
        `Max-Age=${SESSION_TTL_HOURS * 60 * 60}` ,
    ];

    if (SESSION_COOKIE_DOMAIN) parts.push(`Domain=${SESSION_COOKIE_DOMAIN}`);
    if (SESSION_COOKIE_SECURE) parts.push('Secure');

    return parts.join('; ');
};

const clearSessionCookie = () => {
    const parts = [
        `${SESSION_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        `SameSite=${SESSION_COOKIE_SAME_SITE}` ,
        'Max-Age=0',
    ];

    if (SESSION_COOKIE_DOMAIN) parts.push(`Domain=${SESSION_COOKIE_DOMAIN}`);
    if (SESSION_COOKIE_SECURE) parts.push('Secure');

    return parts.join('; ');
};

const isLoopbackDevOrigin = (origin) => {
    if (!origin || NODE_ENV === 'production' || ALLOWED_ORIGINS.length > 0) return false;

    try {
        const url = new URL(origin);
        return ['http:', 'https:'].includes(url.protocol)
            && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
            && Boolean(url.port);
    } catch {
        return false;
    }
};

const isOriginAllowed = (origin) => {
    if (!origin) return true;
    return EFFECTIVE_ALLOWED_ORIGINS.includes(origin) || isLoopbackDevOrigin(origin);
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
        headers['Access-Control-Allow-Credentials'] = 'true';
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

const sendJson = (req, res, status, payload, extraHeaders = {}) => {
    res.writeHead(status, {
        ...getCorsHeaders(req),
        ...extraHeaders,
        'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(payload));
};

const sendEmpty = (req, res, status, extraHeaders = {}) => {
    res.writeHead(status, {
        ...getCorsHeaders(req),
        ...extraHeaders,
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

const getRequestIp = (req) => {
    const forwarded = typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for']
        : Array.isArray(req.headers['x-forwarded-for'])
            ? req.headers['x-forwarded-for'][0]
            : '';
    const ip = (forwarded || req.socket.remoteAddress || '').split(',')[0].trim();
    return ip ? ip.slice(0, 128) : null;
};

const sanitizeAuditMetadata = (value, depth = 0) => {
    if (depth > 4) return '[truncated]';
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value.slice(0, 500);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeAuditMetadata(item, depth + 1));
    if (typeof value === 'object') {
        const entries = Object.entries(value).slice(0, 20).map(([key, item]) => [key, sanitizeAuditMetadata(item, depth + 1)]);
        return Object.fromEntries(entries);
    }
    return String(value).slice(0, 500);
};

const insertAuditLog = async (client, entry) => {
    await client.query(`
        INSERT INTO audit_logs (
            id, org_id, actor_user_id, action, entity_type, entity_id, metadata, ip_address, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
    `, [
        randomUUID(),
        entry.orgId ?? null,
        entry.actorUserId ?? null,
        String(entry.action || '').slice(0, 120),
        String(entry.entityType || '').slice(0, 120),
        entry.entityId ? String(entry.entityId).slice(0, 120) : null,
        JSON.stringify(sanitizeAuditMetadata(entry.metadata ?? {})),
        entry.ipAddress ? String(entry.ipAddress).slice(0, 128) : null,
        now(),
    ]);
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

const getDefaultCategoryForType = (type) => {
    if (type === 'code') return 'coding';
    if (type === 'text') return 'saq';
    if (type === 'numeric') return 'numerical';
    return 'mcq';
};

const normalizeAcceptedAnswers = (answers) => {
    if (!Array.isArray(answers)) return [];

    return answers
        .map((answer) => String(answer || '').trim())
        .filter(Boolean)
        .slice(0, 20);
};

const mapQuestionRow = (row) => ({
    ...row,
    category: row.category ?? getDefaultCategoryForType(row.type),
    image_url: row.image_url ?? null,
    options: row.options ?? null,
    accepted_answers: row.accepted_answers ?? null,
    case_sensitive: Boolean(row.case_sensitive),
    numeric_answer: typeof row.numeric_answer === 'number' ? row.numeric_answer : row.numeric_answer === null ? null : Number(row.numeric_answer),
    numeric_tolerance: typeof row.numeric_tolerance === 'number' ? row.numeric_tolerance : Number(row.numeric_tolerance ?? 0),
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

    if (question.type === 'text') {
        return {
            ...question,
            accepted_answers: undefined,
            case_sensitive: undefined,
        };
    }

    if (question.type === 'numeric') {
        return {
            ...question,
            numeric_answer: undefined,
            numeric_tolerance: undefined,
        };
    }

    return {
        ...question,
        test_cases: undefined,
    };
};

const mapTestRow = (row, questions = [], role = 'admin') => ({
    ...row,
    visibility: row.visibility === 'org_public' ? 'org_public' : 'assigned_only',
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

const mapAuditLogRow = (row) => ({
    ...row,
    metadata: row.metadata ?? {},
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

const mapAttemptEvidenceRow = (row) => ({
    ...row,
    metadata: row.metadata ?? {},
    captured_at: row.captured_at instanceof Date ? row.captured_at.toISOString() : row.captured_at,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

const mapAttemptRow = (row) => ({
    ...row,
    answers: row.answers ?? [],
    integrity_events: row.integrity_events ?? [],
    violations: row.violations ?? row.integrity_events ?? [],
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    last_heartbeat_at: row.last_heartbeat_at instanceof Date ? row.last_heartbeat_at.toISOString() : row.last_heartbeat_at,
    expires_at: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    submitted_at: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at,
    latest_evidence_captured_at: row.latest_evidence_captured_at instanceof Date ? row.latest_evidence_captured_at.toISOString() : row.latest_evidence_captured_at,
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
    if (!['active', 'in_progress'].includes(attempt.status) || !isAttemptExpired(attempt)) return attempt;

    const { rows } = await query(`
        UPDATE test_attempts
        SET status = 'expired'
        WHERE id = $1
        RETURNING *
    `, [attempt.id]);

    return rows[0] ?? attempt;
};

const getAuth = async (req) => {
    const cookies = parseCookies(req);
    const header = req.headers.authorization || '';
    const bearerToken = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const cookieToken = cookies[SESSION_COOKIE_NAME] || null;
    const token = cookieToken || bearerToken;
    const source = cookieToken ? 'cookie' : bearerToken ? 'bearer' : null;
    if (!token) return { session: null, user: null, source: null };
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

    if (rows.length === 0) return { session: null, user: null, source };

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
        source,
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
    category: String(question.category || getDefaultCategoryForType(question.type)).trim().toLowerCase() || getDefaultCategoryForType(question.type),
    title: String(question.title || '').trim(),
    description: String(question.description || ''),
    image_url: question.image_url !== undefined || question.imageUrl !== undefined ? String((question.image_url ?? question.imageUrl) || '').slice(0, 2_000_000) : null,
    points: Number(question.points || 0),
    position,
    options: question.type === 'mcq' ? JSON.stringify(question.options ?? []) : null,
    answer: question.type === 'mcq' ? Number(question.answer ?? 0) : null,
    accepted_answers: question.type === 'text' ? JSON.stringify(normalizeAcceptedAnswers(question.accepted_answers ?? question.acceptedAnswers)) : null,
    case_sensitive: question.type === 'text' ? Boolean(question.case_sensitive ?? question.caseSensitive) : false,
    numeric_answer: question.type === 'numeric' ? Number(question.numeric_answer ?? question.answer ?? 0) : null,
    numeric_tolerance: question.type === 'numeric' ? Math.max(0, Number(question.numeric_tolerance ?? question.tolerance ?? 0)) : 0,
    template: question.type === 'code' ? String(question.template || '') : null,
    language: question.type === 'code' ? String(question.language || 'python') : null,
    constraints: question.type === 'code' ? JSON.stringify(question.constraints ?? []) : null,
    examples: question.type === 'code' ? JSON.stringify(question.examples ?? []) : null,
    test_cases: question.type === 'code' ? JSON.stringify(normalizeCodeTestCases(question.test_cases ?? question.testCases)) : null,
    created_at: now(),
});

const insertQuestionRow = async (client, question) => {
    const result = await client.query(`
        INSERT INTO questions (
            id, test_id, type, category, title, description, image_url, points, position,
            options, answer, accepted_answers, case_sensitive, numeric_answer, numeric_tolerance,
            template, language, constraints, examples, test_cases, created_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10::jsonb, $11, $12::jsonb, $13, $14, $15,
            $16, $17, $18::jsonb, $19::jsonb, $20::jsonb, $21
        )
        RETURNING *
    `, [
        question.id,
        question.test_id,
        question.type,
        question.category,
        question.title,
        question.description,
        question.image_url,
        question.points,
        question.position,
        question.options,
        question.answer,
        question.accepted_answers,
        question.case_sensitive,
        question.numeric_answer,
        question.numeric_tolerance,
        question.template,
        question.language,
        question.constraints,
        question.examples,
        question.test_cases,
        question.created_at,
    ]);

    return result.rows[0];
};

const questionHasHiddenCodeCases = (question) =>
    question.type === 'code' && normalizeCodeTestCases(question.test_cases).some((testCase) => testCase.hidden);

const assertTestReadyForPublish = async (testId) => {
    const test = await getTestOrThrow(testId);
    const { rows } = await query('SELECT * FROM questions WHERE test_id = $1', [testId]);
    const hasInvalidCodingQuestion = rows
        .map(mapQuestionRow)
        .some((question) => question.type === 'code' && !questionHasHiddenCodeCases(question));

    if (hasInvalidCodingQuestion) {
        throw new HttpError(400, 'Every coding question must include at least one hidden test case before publishing.');
    }

    if (test.visibility === 'assigned_only') {
        const { rowCount } = await query('SELECT 1 FROM test_assignments WHERE test_id = $1 LIMIT 1', [testId]);
        if (rowCount === 0) {
            throw new HttpError(400, 'Assigned-only tests must have at least one assigned group or student before publishing.');
        }
    }
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

const normalizeTextAnswer = (value, caseSensitive = false) => {
    const normalized = String(value || '').replace(/\r\n/g, '\n').trim();
    return caseSensitive ? normalized : normalized.toLowerCase();
};

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
            return {
                ...normalized,
                evaluationError: error instanceof Error ? error.message : 'Code evaluation is currently unavailable.',
            };
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

const evaluateTextAnswer = (question, submitted) => {
    const response = String(submitted.response || '').trim();
    const normalized = {
        questionId: question.id,
        type: question.type,
        pointsEarned: 0,
        response,
    };

    if (!response) return normalized;

    const acceptedAnswers = normalizeAcceptedAnswers(question.accepted_answers);
    const submittedValue = normalizeTextAnswer(response, question.case_sensitive);
    const isMatch = acceptedAnswers.some((answer) => normalizeTextAnswer(answer, question.case_sensitive) === submittedValue);

    if (isMatch) normalized.pointsEarned = question.points;
    return normalized;
};

const evaluateNumericAnswer = (question, submitted) => {
    const response = String(submitted.response || '').trim();
    const normalized = {
        questionId: question.id,
        type: question.type,
        pointsEarned: 0,
        response,
    };

    if (!response) return normalized;

    const submittedValue = Number(response);
    const expectedValue = Number(question.numeric_answer);
    const tolerance = Math.max(0, Number(question.numeric_tolerance || 0));

    if (!Number.isFinite(submittedValue) || !Number.isFinite(expectedValue)) return normalized;
    if (Math.abs(submittedValue - expectedValue) <= tolerance) {
        normalized.pointsEarned = question.points;
    }

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

        if (question.type === 'text') {
            const normalized = evaluateTextAnswer(question, submitted);
            score += normalized.pointsEarned;
            answers.push(normalized);
            continue;
        }

        if (question.type === 'numeric') {
            const normalized = evaluateNumericAnswer(question, submitted);
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

const buildIntegrityEventsPayload = (body) => {
    const explicitEvents = normalizeIntegrityEvents(body.events ?? body.integrity_events);
    if (explicitEvents.length > 0) return explicitEvents;

    if (!body.type) return [];

    const occurredAt = typeof body.occurredAt === 'string' && body.occurredAt.trim()
        ? body.occurredAt.trim()
        : now();
    const timestamp = typeof body.timestamp === 'string' && body.timestamp.trim()
        ? body.timestamp.trim()
        : occurredAt;

    return normalizeIntegrityEvents([{
        type: body.type,
        message: body.message || body.type,
        timestamp,
        occurredAt,
    }]);
};

const buildAttemptLogDetails = (event, bodyDetails) => ({
    ...(bodyDetails && typeof bodyDetails === 'object' && !Array.isArray(bodyDetails) ? bodyDetails : {}),
    message: event.message,
    occurredAt: event.occurredAt,
});

const normalizeAttemptEvidencePayload = (body) => {
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.trim() : '';
    if (!dataUrl) throw new HttpError(400, 'Evidence snapshot is required.');

    const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new HttpError(400, 'Evidence must be a base64-encoded image data URL.');

    const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const imageBuffer = Buffer.from(match[2], 'base64');
    if (!imageBuffer.length) throw new HttpError(400, 'Evidence snapshot is empty.');
    if (imageBuffer.length > MAX_ATTEMPT_EVIDENCE_BYTES) {
        throw new HttpError(413, 'Evidence snapshot exceeds the configured size limit.');
    }

    const capturedAtInput = typeof body.capturedAt === 'string' && body.capturedAt.trim()
        ? body.capturedAt.trim()
        : now();
    const capturedAt = new Date(capturedAtInput);
    if (Number.isNaN(capturedAt.getTime())) throw new HttpError(400, 'Evidence capture time is invalid.');

    return {
        kind: 'webcam_snapshot',
        mime_type: mimeType,
        image_data: dataUrl,
        byte_size: imageBuffer.length,
        sha256: createHash('sha256').update(imageBuffer).digest('hex'),
        captured_at: capturedAt.toISOString(),
        metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {},
    };
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
        }, { 'Set-Cookie': buildSessionCookie(result.session.token) });
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
        }, { 'Set-Cookie': buildSessionCookie(session.token) });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/auth/session') {
        const { session, user, source } = await getAuth(req);
        const extraHeaders = session && source === 'bearer'
            ? { 'Set-Cookie': buildSessionCookie(session.token) }
            : {};
        sendJson(req, res, 200, {
            session: session ? sanitizeSession(session) : null,
            user: user ? sanitizeUser(user) : null,
        }, extraHeaders);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/logout') {
        const { session } = await getAuth(req);
        if (session) {
            await query('DELETE FROM sessions WHERE token = $1', [session.token]);
        }
        sendJson(req, res, 200, { success: true }, { 'Set-Cookie': clearSessionCookie() });
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
        const requestIp = getRequestIp(req);

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

            await insertAuditLog(client, {
                orgId: id,
                actorUserId: user.id,
                action: 'org.created',
                entityType: 'organization',
                entityId: id,
                metadata: { name, slug },
                ipAddress: requestIp,
            });

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
        const requestIp = getRequestIp(req);

        const org = await transaction(async (client) => {
            const orgResult = await client.query('SELECT * FROM organizations WHERE LOWER(invite_code) = $1 LIMIT 1', [code]);
            if (orgResult.rowCount === 0) throw new HttpError(404, 'Invalid invite code. Please check and try again.');

            const orgRow = orgResult.rows[0];

            // Check expiry
            if (orgRow.invite_code_expiry && new Date(orgRow.invite_code_expiry) < new Date()) {
                throw new HttpError(403, 'This invite code has expired.');
            }

            // Check usage limit
            if (orgRow.invite_code_max_usage) {
                const { rowCount: currentUsage } = await client.query('SELECT 1 FROM org_members WHERE org_id = $1', [orgRow.id]);
                if (currentUsage >= orgRow.invite_code_max_usage) {
                    throw new HttpError(403, 'This invite code has reached its maximum usage limit.');
                }
            }

            const membershipResult = await client.query(`
                SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2 LIMIT 1
            `, [orgRow.id, user.id]);

            if (membershipResult.rowCount > 0) throw new HttpError(409, 'You are already a member of this organization.');

            await client.query(`
                INSERT INTO org_members (id, org_id, user_id, role, joined_at)
                VALUES ($1, $2, $3, 'student', $4)
            `, [randomUUID(), orgRow.id, user.id, now()]);

            await insertAuditLog(client, {
                orgId: orgRow.id,
                actorUserId: user.id,
                action: 'org.joined',
                entityType: 'organization',
                entityId: orgRow.id,
                metadata: { role: 'student', organizationName: orgRow.name },
                ipAddress: requestIp,
            });

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

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/audit-logs$/);
    if (req.method === 'GET' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        await requireAdmin(user.id, orgId);
        const requestedLimit = Number(url.searchParams.get('limit') || 25);
        const limit = Math.max(1, Math.min(requestedLimit, 100));

        const { rows } = await query(`
            SELECT
                a.*,
                u.name AS actor_name,
                u.email AS actor_email
            FROM audit_logs a
            LEFT JOIN users u ON u.id = a.actor_user_id
            WHERE a.org_id = $1
            ORDER BY a.created_at DESC
            LIMIT $2
        `, [orgId, limit]);

        sendJson(req, res, 200, {
            logs: rows.map((row) => {
                const log = mapAuditLogRow(row);
                return {
                    ...log,
                    actor: row.actor_user_id ? {
                        id: row.actor_user_id,
                        name: row.actor_name,
                        email: row.actor_email,
                    } : null,
                };
            }),
        });
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/invite-code\/regenerate$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        await requireAdmin(user.id, orgId);
        const requestIp = getRequestIp(req);

        const org = await transaction(async (client) => {
            const inviteCode = await uniqueInviteCode(client);
            const result = await client.query(`
                UPDATE organizations
                SET invite_code = $1
                WHERE id = $2
                RETURNING *
            `, [inviteCode, orgId]);
            if (result.rowCount === 0) throw new HttpError(404, 'Organization not found.');

            await insertAuditLog(client, {
                orgId,
                actorUserId: user.id,
                action: 'org.invite_code_regenerated',
                entityType: 'organization',
                entityId: orgId,
                metadata: { organizationName: result.rows[0].name },
                ipAddress: requestIp,
            });

            return result.rows[0];
        });

        sendJson(req, res, 200, {
            org: serializeOrganizationForRole(org, 'admin'),
        });
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/groups$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        await requireAdmin(user.id, orgId);
        const name = String(body.name || '').trim();
        if (!name) throw new HttpError(400, 'Group name is required.');

        const group = await transaction(async (client) => {
            const id = randomUUID();
            const result = await client.query(`
                INSERT INTO groups (id, org_id, name, created_at)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [id, orgId, name, now()]);
            return result.rows[0];
        });

        sendJson(req, res, 201, { group });
        return;
    }

    if (req.method === 'GET' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        await requireMembership(user.id, orgId);

        const { rows } = await query('SELECT * FROM groups WHERE org_id = $1 ORDER BY name ASC', [orgId]);
        sendJson(req, res, 200, { groups: rows });
        return;
    }

    match = pathname.match(/^\/api\/groups\/([^/]+)\/members$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const groupId = decodeURIComponent(match[1]);
        const { rows: gRows } = await query('SELECT org_id FROM groups WHERE id = $1', [groupId]);
        if (gRows.length === 0) throw new HttpError(404, 'Group not found.');
        await requireAdmin(user.id, gRows[0].org_id);

        const targetUserId = String(body.userId || '');
        if (!targetUserId) throw new HttpError(400, 'User ID is required.');

        await query(`
            INSERT INTO group_members (id, group_id, user_id, joined_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (group_id, user_id) DO NOTHING
        `, [randomUUID(), groupId, targetUserId, now()]);

        sendEmpty(req, res, 204);
        return;
    }

    if (req.method === 'GET' && match) {
        const { user } = await requireAuth(req);
        const groupId = decodeURIComponent(match[1]);
        const { rows: gRows } = await query('SELECT org_id FROM groups WHERE id = $1', [groupId]);
        if (gRows.length === 0) throw new HttpError(404, 'Group not found.');
        await requireMembership(user.id, gRows[0].org_id);

        const { rows } = await query(`
            SELECT u.id, u.name, u.email
            FROM group_members gm
            JOIN users u ON u.id = gm.user_id
            WHERE gm.group_id = $1
        `, [groupId]);

        sendJson(req, res, 200, { members: rows });
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/live-attempts$/);
    if (req.method === 'GET' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        await requireAdmin(user.id, orgId);

        const { rows: attempts } = await query(`
            SELECT
                a.id,
                p.name as student_name,
                p.email as student_email,
                t.title as test_title,
                t.id as test_id,
                a.status,
                a.started_at,
                a.last_heartbeat_at,
                a.violations_count as violation_score,
                a.ip_address,
                a.integrity_events as violations,
                COALESCE(evidence_stats.evidence_count, 0) as evidence_count,
                latest_evidence.captured_at as latest_evidence_captured_at,
                latest_evidence.image_data as latest_evidence_preview
            FROM test_attempts a
            JOIN public.profiles p ON a.student_id = p.id
            JOIN public.tests t ON a.test_id = t.id
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS evidence_count
                FROM attempt_evidence ae
                WHERE ae.attempt_id = a.id
            ) evidence_stats ON TRUE
            LEFT JOIN LATERAL (
                SELECT ae.captured_at, ae.image_data
                FROM attempt_evidence ae
                WHERE ae.attempt_id = a.id
                ORDER BY ae.captured_at DESC
                LIMIT 1
            ) latest_evidence ON TRUE
            WHERE a.org_id = $1 AND (a.status = 'active' OR a.status = 'in_progress')
            ORDER BY a.started_at DESC
        `, [orgId]);

        sendJson(req, res, 200, { attempts: attempts.map(mapAttemptRow) });
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/tests$/);
    if (req.method === 'GET' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        const membership = await requireMembership(user.id, orgId);

        let testRows;
        if (membership.role === 'admin') {
            testRows = await query(`
                SELECT * FROM tests WHERE org_id = $1 ORDER BY created_at DESC
            `, [orgId]);
        } else {
            // Students see org-public tests or assigned-only tests targeted to them.
            testRows = await query(`
                SELECT t.*
                FROM tests t
                WHERE t.org_id = $1
                  AND t.published = TRUE
                  AND (
                    t.visibility = 'org_public'
                    OR EXISTS (
                      SELECT 1 FROM test_assignments ta
                      LEFT JOIN group_members gm ON gm.group_id = ta.group_id AND gm.user_id = $2
                      WHERE ta.test_id = t.id AND (ta.student_id = $2 OR gm.user_id IS NOT NULL)
                    )
                  )
                ORDER BY t.created_at DESC
            `, [orgId, user.id]);
        }

        const testIds = testRows.rows.map((row) => row.id);
        const questionRows = await fetchQuestionsByTestIds(testIds);

        sendJson(req, res, 200, {
            tests: testRows.rows.map((row) => mapTestRow(row, questionRows.filter((question) => question.test_id === row.id), membership.role)),
        });
        return;
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)\/assignments$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireAdmin(user.id, test.org_id);

        const hasBulkPayload = Array.isArray(body.groupIds) || Array.isArray(body.studentIds);
        if (hasBulkPayload) {
            const groupIds = Array.isArray(body.groupIds) ? body.groupIds.filter(Boolean) : [];
            const studentIds = Array.isArray(body.studentIds) ? body.studentIds.filter(Boolean) : [];
            const requestIp = getRequestIp(req);

            await transaction(async (client) => {
                await client.query('DELETE FROM test_assignments WHERE test_id = $1', [testId]);
                for (const gid of groupIds) {
                    await client.query(`
                        INSERT INTO test_assignments (id, test_id, group_id, assigned_at)
                        VALUES ($1, $2, $3, $4)
                    `, [randomUUID(), testId, gid, now()]);
                }
                for (const sid of studentIds) {
                    await client.query(`
                        INSERT INTO test_assignments (id, test_id, student_id, assigned_at)
                        VALUES ($1, $2, $3, $4)
                    `, [randomUUID(), testId, sid, now()]);
                }

                await insertAuditLog(client, {
                    orgId: test.org_id,
                    actorUserId: user.id,
                    action: 'test.assignments_updated',
                    entityType: 'test',
                    entityId: testId,
                    metadata: { title: test.title, groupCount: groupIds.length, studentCount: studentIds.length },
                    ipAddress: requestIp,
                });
            });

            sendEmpty(req, res, 204);
            return;
        }

        const { studentId, groupId } = body;
        if (!studentId && !groupId) throw new HttpError(400, 'Either studentId or groupId is required.');

        await query(`
            INSERT INTO test_assignments (id, test_id, student_id, group_id, assigned_at)
            VALUES ($1, $2, $3, $4, $5)
        `, [randomUUID(), testId, studentId || null, groupId || null, now()]);

        sendEmpty(req, res, 204);
        return;
    }

    if (req.method === 'GET' && match) {
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireMembership(user.id, test.org_id);

        const { rows } = await query(`
            SELECT ta.*, u.name as student_name, u.email as student_email, g.name as group_name
            FROM test_assignments ta
            LEFT JOIN users u ON u.id = ta.student_id
            LEFT JOIN groups g ON g.id = ta.group_id
            WHERE ta.test_id = $1
        `, [testId]);

        sendJson(req, res, 200, { assignments: rows });
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

        if (test.visibility === 'assigned_only') {
            const { rows: assignments } = await query(`
                SELECT 1 FROM test_assignments ta
                LEFT JOIN group_members gm ON gm.group_id = ta.group_id AND gm.user_id = $2
                WHERE ta.test_id = $1 AND (ta.student_id = $2 OR gm.user_id IS NOT NULL)
                LIMIT 1
            `, [testId, user.id]);

            if (assignments.length === 0) {
                throw new HttpError(403, 'This test is not assigned to you.');
            }
        }
        const requestIp = getRequestIp(req);
        const userAgent = req.headers['user-agent'];

        const latestAttemptResult = await query(`
            SELECT *
            FROM test_attempts
            WHERE test_id = $1 AND student_id = $2
            ORDER BY started_at DESC
            LIMIT 1
        `, [testId, user.id]);

        if (latestAttemptResult.rows.length > 0) {
            const latestAttempt = await expireAttemptIfNeeded(latestAttemptResult.rows[0]);

            if (latestAttempt.status === 'active' || latestAttempt.status === 'in_progress') {
                sendJson(req, res, 200, { attempt: mapAttemptRow(latestAttempt) });
                return;
            }

            if (latestAttempt.status === 'submitted' || latestAttempt.status === 'completed') {
                throw new HttpError(409, 'This test has already been submitted.');
            }
        }

        const startedAt = now();
        const expiresAt = new Date(Date.now() + Math.max(1, Number(test.duration || 60)) * 60 * 1000).toISOString();
        const attemptId = randomUUID();
        let attempt;

        try {
            const { rows } = await query(`
                INSERT INTO test_attempts (
                    id, test_id, org_id, student_id, status, started_at, last_heartbeat_at, expires_at, ip_address, user_agent
                )
                VALUES ($1, $2, $3, $4, 'in_progress', $5, $5, $6, $7, $8)
                RETURNING *
            `, [attemptId, testId, test.org_id, user.id, startedAt, expiresAt, requestIp, userAgent]);

            await insertAuditLog(query, {
                orgId: test.org_id,
                actorUserId: user.id,
                action: 'attempt.started',
                entityType: 'attempt',
                entityId: attemptId,
                metadata: { testId, testTitle: test.title, expiresAt },
                ipAddress: requestIp,
            });

            attempt = rows[0];
        } catch (error) {
            // Handle race conditions (e.g. React StrictMode)
            const { rows } = await query(`
                SELECT * FROM test_attempts 
                WHERE test_id = $1 AND student_id = $2 AND (status = 'active' OR status = 'in_progress')
                LIMIT 1
            `, [testId, user.id]);
            if (rows.length > 0) {
                sendJson(req, res, 200, { attempt: mapAttemptRow(rows[0]) });
                return;
            }
            throw error;
        }

        sendJson(req, res, 201, { attempt: mapAttemptRow(attempt) });
        return;
    }

    match = pathname.match(/^\/api\/attempts\/([^/]+)\/answers$/);
    if (req.method === 'PATCH' && match) {
        const { user } = await requireAuth(req);
        const attemptId = decodeURIComponent(match[1]);
        const attempt = await getAttemptOrThrow(attemptId);
        if (attempt.student_id !== user.id) throw new HttpError(403, 'Unauthorized.');

        if (attempt.status !== 'in_progress' && attempt.status !== 'active') {
            throw new HttpError(410, `Assessment session is ${attempt.status}.`);
        }

        const answers = Array.isArray(body.answers) ? body.answers : [];
        await query('UPDATE test_attempts SET answers = $1::jsonb WHERE id = $2', [JSON.stringify(answers), attemptId]);

        sendEmpty(req, res, 204);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/tests') {
        const { user } = await requireAuth(req);
        const orgId = String(body.orgId || '');
        await requireAdmin(user.id, orgId);
        const requestIp = getRequestIp(req);

        const title = String(body.title || '').trim();
        if (!title) throw new HttpError(400, 'Test title is required.');

        const testId = randomUUID();
        const description = String(body.description || '');
        const duration = Number(body.duration || 60);
        const difficulty = ['Easy', 'Medium', 'Hard'].includes(body.difficulty) ? body.difficulty : 'Medium';
        const tags = Array.isArray(body.tags) ? body.tags : [];

        const createdTest = await transaction(async (client) => {
            const result = await client.query(`
                INSERT INTO tests (id, org_id, title, description, duration, difficulty, tags, visibility, published, created_by, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, FALSE, $9, $10)
                RETURNING *
            `, [
                testId,
                orgId,
                title,
                description,
                duration,
                difficulty,
                JSON.stringify(tags),
                ['assigned_only', 'org_public'].includes(body.visibility) ? body.visibility : 'assigned_only',
                user.id,
                now(),
            ]);

            await insertAuditLog(client, {
                orgId,
                actorUserId: user.id,
                action: 'test.created',
                entityType: 'test',
                entityId: testId,
                metadata: { title, duration, difficulty, tags },
                ipAddress: requestIp,
            });

            return result.rows[0];
        });

        sendJson(req, res, 201, { test: mapTestRow(createdTest, []) });
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
            const requestIp = getRequestIp(req);

            const updatedTest = await transaction(async (client) => {
                const result = await client.query(`
                    UPDATE tests
                    SET
                        title = COALESCE($1, title),
                        description = COALESCE($2, description),
                        duration = COALESCE($3, duration),
                        difficulty = COALESCE($4, difficulty),
                        tags = COALESCE($5::jsonb, tags),
                        visibility = COALESCE($6, visibility),
                        published = COALESCE($7, published)
                    WHERE id = $8
                    RETURNING *
                `, [
                    body.title !== undefined ? String(body.title).trim() : null,
                    body.description !== undefined ? String(body.description) : null,
                    body.duration !== undefined ? Number(body.duration) : null,
                    body.difficulty !== undefined ? body.difficulty : null,
                    body.tags !== undefined ? JSON.stringify(Array.isArray(body.tags) ? body.tags : []) : null,
                    body.visibility !== undefined && ['assigned_only', 'org_public'].includes(body.visibility) ? body.visibility : null,
                    body.published !== undefined ? Boolean(body.published) : null,
                    testId,
                ]);

                const nextTest = result.rows[0];
                const action = body.published === true && !test.published
                    ? 'test.published'
                    : body.published === false && test.published
                        ? 'test.unpublished'
                        : 'test.updated';

                await insertAuditLog(client, {
                    orgId: test.org_id,
                    actorUserId: user.id,
                    action,
                    entityType: 'test',
                    entityId: testId,
                    metadata: {
                        title: nextTest.title,
                        visibility: nextTest.visibility,
                        published: nextTest.published,
                        duration: nextTest.duration,
                        difficulty: nextTest.difficulty,
                    },
                    ipAddress: requestIp,
                });

                return nextTest;
            });

            const questionRows = await fetchQuestionsByTestIds([testId]);
            sendJson(req, res, 200, { test: mapTestRow(updatedTest, questionRows) });
            return;
        }

        if (req.method === 'DELETE') {
            await requireAdmin(user.id, test.org_id);
            const requestIp = getRequestIp(req);
            await transaction(async (client) => {
                await insertAuditLog(client, {
                    orgId: test.org_id,
                    actorUserId: user.id,
                    action: 'test.deleted',
                    entityType: 'test',
                    entityId: testId,
                    metadata: { title: test.title, published: test.published },
                    ipAddress: requestIp,
                });
                await client.query('DELETE FROM tests WHERE id = $1', [testId]);
            });
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
        const requestIp = getRequestIp(req);

        const positionResult = await query('SELECT COUNT(*)::int AS count FROM questions WHERE test_id = $1', [testId]);
        const question = normalizeQuestionInput({ ...body, testId }, positionResult.rows[0].count);

        const createdQuestion = await transaction(async (client) => {
            const created = await insertQuestionRow(client, question);

            await insertAuditLog(client, {
                orgId: test.org_id,
                actorUserId: user.id,
                action: 'question.created',
                entityType: 'question',
                entityId: question.id,
                metadata: { testId, title: question.title, type: question.type, points: question.points },
                ipAddress: requestIp,
            });

            return created;
        });

        sendJson(req, res, 201, { question: mapQuestionRow(createdQuestion) });
        return;
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)\/questions\/bulk$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireAdmin(user.id, test.org_id);
        const requestIp = getRequestIp(req);

        const incomingQuestions = Array.isArray(body.questions) ? body.questions : [];
        if (incomingQuestions.length === 0) {
            throw new HttpError(400, 'At least one question is required.');
        }
        if (incomingQuestions.length > MAX_BULK_IMPORT_QUESTIONS) {
            throw new HttpError(400, `A single import can contain at most ${MAX_BULK_IMPORT_QUESTIONS} questions.`);
        }

        const positionResult = await query('SELECT COUNT(*)::int AS count FROM questions WHERE test_id = $1', [testId]);
        const startingPosition = positionResult.rows[0].count;
        const questions = incomingQuestions.map((item, index) => normalizeQuestionInput({ ...item, testId }, startingPosition + index));

        const createdQuestions = await transaction(async (client) => {
            const created = [];

            for (const question of questions) {
                created.push(await insertQuestionRow(client, question));
            }

            await insertAuditLog(client, {
                orgId: test.org_id,
                actorUserId: user.id,
                action: 'question.imported',
                entityType: 'test',
                entityId: testId,
                metadata: {
                    importedCount: created.length,
                    mcqCount: questions.filter((question) => question.type === 'mcq').length,
                    textCount: questions.filter((question) => question.type === 'text').length,
                    numericCount: questions.filter((question) => question.type === 'numeric').length,
                    codeCount: questions.filter((question) => question.type === 'code').length,
                },
                ipAddress: requestIp,
            });

            return created;
        });

        sendJson(req, res, 201, { questions: createdQuestions.map(mapQuestionRow) });
        return;
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)\/questions\/reorder$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireAdmin(user.id, test.org_id);
        const requestIp = getRequestIp(req);

        const questionIds = Array.isArray(body.questionIds) ? body.questionIds : [];
        await transaction(async (client) => {
            for (const [index, questionId] of questionIds.entries()) {
                await client.query('UPDATE questions SET position = $1 WHERE id = $2 AND test_id = $3', [index, questionId, testId]);
            }

            await insertAuditLog(client, {
                orgId: test.org_id,
                actorUserId: user.id,
                action: 'question.reordered',
                entityType: 'test',
                entityId: testId,
                metadata: { questionIds },
                ipAddress: requestIp,
            });
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
        if (attempt.status !== 'active' && attempt.status !== 'in_progress') throw new HttpError(410, 'This attempt is no longer active.');

        const { rows } = await query(`
            UPDATE test_attempts
            SET
                last_heartbeat_at = $1,
                ip_address = $2,
                user_agent = $3
            WHERE id = $4
            RETURNING *
        `, [now(), getRequestIp(req), req.headers['user-agent'], attemptId]);

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
        if (attempt.status !== 'active' && attempt.status !== 'in_progress') throw new HttpError(410, 'This attempt is no longer active.');

        const incomingEvents = buildIntegrityEventsPayload(body);
        if (incomingEvents.length === 0) throw new HttpError(400, 'At least one integrity event is required.');

        const integrityEvents = mergeIntegrityEvents(attempt.integrity_events, incomingEvents);
        const updatedAttempt = await transaction(async (client) => {
            const updateResult = await client.query(`
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

            for (const event of incomingEvents) {
                await client.query(`
                    INSERT INTO attempt_logs (id, attempt_id, event_type, details, timestamp)
                    VALUES ($1, $2, $3, $4::jsonb, $5)
                `, [
                    randomUUID(),
                    attemptId,
                    String(event.type || 'UNKNOWN').slice(0, 64),
                    JSON.stringify(buildAttemptLogDetails(event, incomingEvents.length === 1 ? body.details : null)),
                    now(),
                ]);
            }

            return updateResult.rows[0];
        });

        sendJson(req, res, 200, { attempt: mapAttemptRow(updatedAttempt) });
        return;
    }

    match = pathname.match(/^\/api\/attempts\/([^/]+)\/evidence$/);
    if (match) {
        const { user } = await requireAuth(req);
        const attemptId = decodeURIComponent(match[1]);
        let attempt = await getAttemptOrThrow(attemptId);

        if (attempt.student_id !== user.id) {
            const membership = await requireMembership(user.id, attempt.org_id);
            if (membership.role !== 'admin') throw new HttpError(403, 'Unauthorized.');
        }

        if (req.method === 'GET') {
            const requestedLimit = Number(url.searchParams.get('limit') || 12);
            const limit = Math.max(1, Math.min(requestedLimit, 60));
            const { rows } = await query(
                'SELECT * FROM attempt_evidence WHERE attempt_id = $1 ORDER BY captured_at DESC LIMIT $2',
                [attemptId, limit]
            );
            sendJson(req, res, 200, { evidence: rows.map(mapAttemptEvidenceRow) });
            return;
        }

        if (req.method === 'POST') {
            enforceRateLimit(req, 'attempt-evidence', { limit: 240, windowMs: 60 * 60 * 1000 });
            if (attempt.student_id !== user.id) throw new HttpError(403, 'You can only upload evidence for your own attempt.');

            attempt = await expireAttemptIfNeeded(attempt);
            if (attempt.status === 'submitted') throw new HttpError(409, 'This attempt is already submitted.');
            if (attempt.status !== 'active' && attempt.status !== 'in_progress') throw new HttpError(410, 'This attempt is no longer active.');

            const evidencePayload = normalizeAttemptEvidencePayload(body);
            const createdEvidence = await transaction(async (client) => {
                const insertResult = await client.query(`
                    INSERT INTO attempt_evidence (
                        id, attempt_id, kind, mime_type, image_data, byte_size, sha256, metadata, captured_at, created_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
                    RETURNING *
                `, [
                    randomUUID(),
                    attemptId,
                    evidencePayload.kind,
                    evidencePayload.mime_type,
                    evidencePayload.image_data,
                    evidencePayload.byte_size,
                    evidencePayload.sha256,
                    JSON.stringify(evidencePayload.metadata),
                    evidencePayload.captured_at,
                    now(),
                ]);

                await client.query(`
                    INSERT INTO attempt_logs (id, attempt_id, event_type, details, timestamp)
                    VALUES ($1, $2, $3, $4::jsonb, $5)
                `, [
                    randomUUID(),
                    attemptId,
                    'evidence_captured',
                    JSON.stringify({
                        kind: evidencePayload.kind,
                        mimeType: evidencePayload.mime_type,
                        byteSize: evidencePayload.byte_size,
                        sha256: evidencePayload.sha256,
                        capturedAt: evidencePayload.captured_at,
                    }),
                    now(),
                ]);

                await client.query('UPDATE test_attempts SET last_heartbeat_at = $1 WHERE id = $2', [now(), attemptId]);

                return insertResult.rows[0];
            });

            sendJson(req, res, 201, { evidence: mapAttemptEvidenceRow(createdEvidence) });
            return;
        }
    }
    match = pathname.match(/^\/api\/questions\/([^/]+)$/);
    if (match) {
        const { user } = await requireAuth(req);
        const questionId = decodeURIComponent(match[1]);
        const question = await getQuestionOrThrow(questionId);
        const test = await getTestOrThrow(question.test_id);
        await requireAdmin(user.id, test.org_id);
        const requestIp = getRequestIp(req);

        if (req.method === 'PATCH') {
            const updatedQuestion = await transaction(async (client) => {
                const result = await client.query(`
                    UPDATE questions
                    SET
                        title = COALESCE($1, title),
                        description = COALESCE($2, description),
                        image_url = COALESCE($3, image_url),
                        points = COALESCE($4, points),
                        category = COALESCE($5, category),
                        options = CASE WHEN type = 'mcq' AND $6::jsonb IS NOT NULL THEN $6::jsonb ELSE options END,
                        accepted_answers = CASE WHEN type = 'text' AND $7::jsonb IS NOT NULL THEN $7::jsonb ELSE accepted_answers END,
                        case_sensitive = CASE WHEN type = 'text' THEN COALESCE($8, case_sensitive) ELSE case_sensitive END,
                        numeric_answer = CASE WHEN type = 'numeric' THEN COALESCE($9, numeric_answer) ELSE numeric_answer END,
                        numeric_tolerance = CASE WHEN type = 'numeric' THEN COALESCE($10, numeric_tolerance) ELSE numeric_tolerance END,
                        answer = CASE WHEN type = 'mcq' THEN COALESCE($11, answer) ELSE answer END,
                        template = CASE WHEN type = 'code' THEN COALESCE($12, template) ELSE template END,
                        language = CASE WHEN type = 'code' THEN COALESCE($13, language) ELSE language END,
                        constraints = CASE WHEN type = 'code' AND $14::jsonb IS NOT NULL THEN $14::jsonb ELSE constraints END,
                        examples = CASE WHEN type = 'code' AND $15::jsonb IS NOT NULL THEN $15::jsonb ELSE examples END,
                        test_cases = CASE WHEN type = 'code' AND $16::jsonb IS NOT NULL THEN $16::jsonb ELSE test_cases END
                    WHERE id = $17
                    RETURNING *
                `, [
                    body.title !== undefined ? String(body.title).trim() : null,
                    body.description !== undefined ? String(body.description) : null,
                    body.image_url !== undefined || body.imageUrl !== undefined
                        ? String((body.image_url ?? body.imageUrl) || '').slice(0, 2_000_000)
                        : null,
                    body.points !== undefined ? Number(body.points) : null,
                    body.category !== undefined ? String(body.category).trim().toLowerCase() : null,
                    body.options !== undefined ? JSON.stringify(Array.isArray(body.options) ? body.options : []) : null,
                    body.accepted_answers !== undefined || body.acceptedAnswers !== undefined
                        ? JSON.stringify(normalizeAcceptedAnswers(body.accepted_answers ?? body.acceptedAnswers))
                        : null,
                    body.case_sensitive !== undefined || body.caseSensitive !== undefined
                        ? Boolean(body.case_sensitive ?? body.caseSensitive)
                        : null,
                    body.numeric_answer !== undefined || body.answer !== undefined
                        ? Number(body.numeric_answer ?? body.answer)
                        : null,
                    body.numeric_tolerance !== undefined || body.tolerance !== undefined
                        ? Math.max(0, Number(body.numeric_tolerance ?? body.tolerance))
                        : null,
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

                await insertAuditLog(client, {
                    orgId: test.org_id,
                    actorUserId: user.id,
                    action: 'question.updated',
                    entityType: 'question',
                    entityId: questionId,
                    metadata: { testId: test.id, title: result.rows[0].title, type: result.rows[0].type, points: result.rows[0].points },
                    ipAddress: requestIp,
                });

                return result.rows[0];
            });

            sendJson(req, res, 200, { question: mapQuestionRow(updatedQuestion) });
            return;
        }

        if (req.method === 'DELETE') {
            await transaction(async (client) => {
                await insertAuditLog(client, {
                    orgId: test.org_id,
                    actorUserId: user.id,
                    action: 'question.deleted',
                    entityType: 'question',
                    entityId: questionId,
                    metadata: { testId: test.id, title: question.title, type: question.type },
                    ipAddress: requestIp,
                });
                await client.query('DELETE FROM questions WHERE id = $1', [questionId]);
                const remaining = await client.query('SELECT id FROM questions WHERE test_id = $1 ORDER BY position ASC', [test.id]);
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
        const requestIp = getRequestIp(req);
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
        if (attempt.status !== 'active' && attempt.status !== 'in_progress') throw new HttpError(410, 'This attempt is no longer active.');

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

            await insertAuditLog(client, {
                orgId,
                actorUserId: user.id,
                action: 'submission.created',
                entityType: 'submission',
                entityId: submissionId,
                metadata: {
                    testId,
                    testTitle: test.title,
                    attemptId,
                    score,
                    totalPoints,
                    integrityScore,
                    violationsCount,
                },
                ipAddress: requestIp,
            });

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
        if (NODE_ENV !== 'production' && ALLOWED_ORIGINS.length === 0) {
            console.log('CORS also allows loopback development origins on any port.');
        }
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
