import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { query, transaction } from '../services/db.ts';
import { executeSnippet, getExecutionProvider } from '../services/codeExecution.ts';
import { syncSuperadminFromEnv } from '../services/superadmin.ts';

const PORT = Number(process.env.PORT || 3001);
export const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_TTL_HOURS = Math.max(1, Number(process.env.SESSION_TTL_HOURS || 24 * 7));
const ATTEMPT_HEARTBEAT_GRACE_SECONDS = Math.max(30, Number(process.env.ATTEMPT_HEARTBEAT_GRACE_SECONDS || 90));
const DEV_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
];
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
export const EFFECTIVE_ALLOWED_ORIGINS = ALLOWED_ORIGINS.length > 0 || NODE_ENV === 'production'
    ? ALLOWED_ORIGINS
    : DEV_ALLOWED_ORIGINS;
const MAX_CODE_TEST_CASES = 20;
const MAX_CODE_TEST_CASE_INPUT_BYTES = 4000;
const MAX_CODE_TEST_CASE_OUTPUT_BYTES = 4000;
const MAX_BULK_IMPORT_QUESTIONS = 200;
const MAX_SIGNAL_PAYLOAD_BYTES = 200_000;
const rateLimitStore = new Map();
const DEFAULT_TEST_SECURITY_SETTINGS = {
    webcam: true,
    microphone: true,
    tab_switch: true,
    fullscreen: true,
    laptop_only: false,
};

export class HttpError extends Error {
    status: number;

    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const now = () => new Date().toISOString();

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
        'Access-Control-Allow-Credentials': 'true',
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

export const sendJson = (req, res, status, payload) => {
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
    role: role ?? user.global_role ?? 'student',
});

const sanitizeSession = (session) => ({
    token: session.token,
    userId: session.user_id,
    createdAt: session.created_at instanceof Date ? session.created_at.toISOString() : session.created_at,
});

const serializeOrganizationForRole = (row, _role = null) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
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

const uniqueTestAccessCode = async (client) => {
    while (true) {
        const code = randomBytes(4).toString('hex').toUpperCase();
        const { rowCount } = await client.query('SELECT 1 FROM tests WHERE access_code = $1 LIMIT 1', [code]);
        if (rowCount === 0) return code;
    }
};

const uniqueAssignmentCode = async (client) => {
    while (true) {
        const code = randomBytes(4).toString('hex').toUpperCase();
        const { rowCount } = await client.query('SELECT 1 FROM test_assignments WHERE assignment_code = $1 LIMIT 1', [code]);
        if (rowCount === 0) return code;
    }
};

const uniqueInterviewCode = async (client) => {
    while (true) {
        const code = `INT-${randomBytes(3).toString('hex').toUpperCase()}`;
        const { rowCount } = await client.query('SELECT 1 FROM interviews WHERE interview_code = $1 LIMIT 1', [code]);
        if (rowCount === 0) return code;
    }
};

const normalizeAllowedEmails = (emails) => {
    if (!Array.isArray(emails)) return [];

    const unique = new Set();

    for (const value of emails) {
        const email = String(value || '').trim().toLowerCase();
        if (!email || !email.includes('@')) continue;
        unique.add(email);
        if (unique.size >= 500) break;
    }

    return Array.from(unique);
};

const normalizeTestSecuritySettings = (value) => {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

    return {
        webcam: source.webcam !== undefined ? Boolean(source.webcam) : DEFAULT_TEST_SECURITY_SETTINGS.webcam,
        microphone: source.microphone !== undefined ? Boolean(source.microphone) : DEFAULT_TEST_SECURITY_SETTINGS.microphone,
        tab_switch: source.tab_switch !== undefined ? Boolean(source.tab_switch) : source.tabSwitch !== undefined ? Boolean(source.tabSwitch) : DEFAULT_TEST_SECURITY_SETTINGS.tab_switch,
        fullscreen: source.fullscreen !== undefined ? Boolean(source.fullscreen) : DEFAULT_TEST_SECURITY_SETTINGS.fullscreen,
        laptop_only: source.laptop_only !== undefined ? Boolean(source.laptop_only) : source.laptopOnly !== undefined ? Boolean(source.laptopOnly) : DEFAULT_TEST_SECURITY_SETTINGS.laptop_only,
    };
};

const getTestSecuritySettings = (test) => normalizeTestSecuritySettings(test.security_settings);

const isMobileRequest = (req) => {
    const secUaMobile = String(req.headers['sec-ch-ua-mobile'] || '').toLowerCase();
    if (secUaMobile.includes('?1') || secUaMobile === '1' || secUaMobile === 'true') return true;

    const userAgent = String(req.headers['user-agent'] || '').toLowerCase();
    return /android|iphone|ipad|ipod|iemobile|mobile|windows phone|opera mini|blackberry|silk\//.test(userAgent);
};

const testAllowsEmail = (test, email) => {
    const allowedEmails = normalizeAllowedEmails(test.allowed_emails);
    if (allowedEmails.length === 0) return true;
    return allowedEmails.includes(String(email || '').trim().toLowerCase());
};

const assertTestEmailAccess = (test, email) => {
    if (!testAllowsEmail(test, email)) {
        throw new HttpError(403, 'This test is not available for your email address.');
    }
};

const assertTestAccessCode = (test, accessCode) => {
    if (!test.access_code) return;

    const normalizedCode = String(accessCode || '').trim();
    if (!normalizedCode) throw new HttpError(400, 'Exam code is required.');
    if (normalizedCode.toUpperCase() !== String(test.access_code).trim().toUpperCase()) {
        throw new HttpError(403, 'Invalid exam code.');
    }
};

const parseTestDateTime = (value, fieldName) => {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        throw new HttpError(400, `Valid ${fieldName} is required.`);
    }

    return parsed.toISOString();
};

const parseTestWindowInput = (startValue, endValue) => {
    const startAt = parseTestDateTime(startValue, 'exam start date and time');
    const endAt = parseTestDateTime(endValue, 'exam end date and time');

    if (startAt && endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
        throw new HttpError(400, 'Exam end date and time must be after the start date and time.');
    }

    return { startAt, endAt };
};

const parseInterviewDateTime = (value) => {
    const raw = String(value || '').trim();
    if (!raw) throw new HttpError(400, 'Interview date and time is required.');

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        throw new HttpError(400, 'Valid interview date and time is required.');
    }

    return parsed.toISOString();
};

const normalizeInterviewStatus = (value, fallback = 'scheduled') => {
    const status = String(value || fallback).trim().toLowerCase();
    return ['scheduled', 'live', 'completed', 'cancelled'].includes(status) ? status : fallback;
};

const normalizeInterviewRoomMode = (value, fallback = 'group') => {
    const mode = String(value || fallback).trim().toLowerCase();
    return mode === 'individual' ? 'individual' : 'group';
};

const normalizeSignalType = (value) => {
    const type = String(value || '').trim().toLowerCase();
    const allowed = new Set(['peer-joined', 'peer-left', 'offer', 'answer', 'ice-candidate', 'media-state']);
    if (!allowed.has(type)) throw new HttpError(400, 'Invalid signaling message type.');
    return type;
};

const normalizeClientId = (value) => {
    const clientId = String(value || '').trim().slice(0, 128);
    if (!clientId) throw new HttpError(400, 'Client id is required.');
    return clientId;
};

const normalizeParticipantName = (value, fallback = 'Participant') => {
    const name = String(value || '').trim().slice(0, 120);
    return name || fallback;
};

const normalizeSignalPayload = (value) => {
    const payload = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SIGNAL_PAYLOAD_BYTES) {
        throw new HttpError(413, 'Signaling payload is too large.');
    }
    return serialized;
};

const parseNegativeMarkValue = (value, fallback = 0) => {
    const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
    const parsed = Number(normalized ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.round(parsed * 100) / 100);
};

const getTestWindow = (test) => {
    if (!test.start_at || !test.end_at) return null;

    const startsAt = new Date(test.start_at);
    const endsAt = new Date(test.end_at);
    return { startsAt, endsAt };
};

const assertTestWindowOpen = (test) => {
    const window = getTestWindow(test);
    if (!window) return;

    const nowMs = Date.now();
    const startsAtMs = window.startsAt.getTime();
    const endsAtMs = window.endsAt.getTime();

    if (nowMs < startsAtMs) {
        throw new HttpError(403, `This exam starts at ${window.startsAt.toISOString()}.`);
    }

    if (nowMs > endsAtMs) {
        throw new HttpError(403, 'This exam window has ended.');
    }
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

const serializeQuestionForRole = (row, role, revealAnswers = false) => {
    const question = mapQuestionRow(row);

    if (role === 'subadmin' || role === 'admin') return question;
    if (revealAnswers) return question;

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

const mapTestRow = (row, questions = [], role = 'subadmin', options: { revealAnswers?: boolean } = {}) => ({
    ...row,
    tags: row.tags ?? [],
    negative_marking_enabled: Boolean(row.negative_marking_enabled),
    negative_mark_value: Number(row.negative_mark_value ?? 0),
    show_answers_after_exam: Boolean(row.show_answers_after_exam),
    allowed_emails: normalizeAllowedEmails(row.allowed_emails),
    security_settings: normalizeTestSecuritySettings(row.security_settings),
    has_access_code: Boolean(row.access_code),
    access_code: role === 'student' ? undefined : (row.access_code ?? null),
    access_code_hash: undefined,
    start_at: row.start_at instanceof Date ? row.start_at.toISOString() : row.start_at,
    end_at: row.end_at instanceof Date ? row.end_at.toISOString() : row.end_at,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    questions: questions.map((question) => serializeQuestionForRole(question, role, Boolean(options.revealAnswers))),
});

const mapSubmissionRow = (row) => ({
    ...row,
    answers: row.answers ?? [],
    score: Number(row.score ?? 0),
    total_points: Number(row.total_points ?? 0),
    integrity_events: row.integrity_events ?? [],
    submitted_at: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at,
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    expires_at: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
});

const mapAuditLogRow = (row) => ({
    ...row,
    metadata: row.metadata ?? {},
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

const mapAttemptRow = (row) => ({
    ...row,
    answers: row.answers ?? [],
    integrity_events: row.integrity_events ?? [],
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    last_heartbeat_at: row.last_heartbeat_at instanceof Date ? row.last_heartbeat_at.toISOString() : row.last_heartbeat_at,
    expires_at: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    submitted_at: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at,
});

const mapInterviewRow = (row) => ({
    id: row.id,
    org_id: row.org_id,
    title: row.title,
    candidate_name: row.candidate_name ?? '',
    candidate_email: row.candidate_email ?? '',
    description: row.description ?? '',
    scheduled_at: row.scheduled_at instanceof Date ? row.scheduled_at.toISOString() : row.scheduled_at,
    duration_minutes: Number(row.duration_minutes ?? 45),
    meeting_url: '',
    interview_code: row.interview_code,
    allow_screen_share: Boolean(row.allow_screen_share),
    enable_integrity_monitoring: Boolean(row.enable_integrity_monitoring),
    room_mode: row.room_mode ?? 'group',
    status: row.status ?? 'scheduled',
    participant_count: Number(row.participant_count ?? 0),
    created_by: row.created_by,
    creator_name: row.creator_name ?? '',
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
});

const mapStudentInterviewRow = (row) => {
    const interview = mapInterviewRow(row);
    delete interview.interview_code;
    return interview;
};

const mapInterviewSignalRow = (row) => ({
    id: row.id,
    interview_id: row.interview_id,
    sender_user_id: row.sender_user_id,
    sender_client_id: row.sender_client_id,
    sender_name: row.sender_name ?? '',
    target_client_id: row.target_client_id ?? null,
    type: row.type,
    payload: row.payload ?? {},
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

const getAttemptOrThrow = async (attemptId) => {
    const { rows } = await query('SELECT * FROM test_attempts WHERE id = $1 LIMIT 1', [attemptId]);
    if (rows.length === 0) throw new HttpError(404, 'Attempt not found.');
    return rows[0];
};

const assertNoSubmittedAttempt = async (testId, studentId) => {
    const { rows } = await query(`
        SELECT 1
        FROM test_attempts
        WHERE test_id = $1
          AND student_id = $2
          AND status IN ('submitted', 'completed')
        LIMIT 1
    `, [testId, studentId]);

    if (rows.length > 0) {
        throw new HttpError(409, 'This test has already been submitted.');
    }

    const submissionResult = await query(`
        SELECT 1
        FROM submissions
        WHERE test_id = $1
          AND student_id = $2
        LIMIT 1
    `, [testId, studentId]);

    if (submissionResult.rows.length > 0) {
        throw new HttpError(409, 'This test has already been submitted.');
    }
};

const isAttemptExpired = (attempt) => {
    const nowMs = Date.now();
    const expiresAtMs = new Date(attempt.expires_at).getTime();
    const heartbeatDeadlineMs = new Date(attempt.last_heartbeat_at).getTime() + ATTEMPT_HEARTBEAT_GRACE_SECONDS * 1000;
    return nowMs > expiresAtMs || nowMs > heartbeatDeadlineMs;
};

const expireAttemptIfNeeded = async (attempt) => {
    if (attempt.status !== 'active' && attempt.status !== 'in_progress') return attempt;
    if (!isAttemptExpired(attempt)) return attempt;

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
            u.password_hash,
            u.global_role
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
            global_role: row.global_role ?? null,
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

let negativeMarkingColumnsReady = false;
const ensureNegativeMarkingColumns = async () => {
    if (negativeMarkingColumnsReady) return;

    await query(`
        ALTER TABLE tests
        ADD COLUMN IF NOT EXISTS negative_marking_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await query(`
        ALTER TABLE tests
        ADD COLUMN IF NOT EXISTS negative_mark_value NUMERIC NOT NULL DEFAULT 0;
    `);

    await query(`
        ALTER TABLE tests
        ALTER COLUMN negative_mark_value TYPE NUMERIC
        USING negative_mark_value::numeric;
    `);

    await query(`
        ALTER TABLE tests
        ADD COLUMN IF NOT EXISTS show_answers_after_exam BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await query(`
        ALTER TABLE IF EXISTS submissions
        ALTER COLUMN score TYPE NUMERIC
        USING score::numeric;
    `);

    negativeMarkingColumnsReady = true;
};

const requireMembership = async (userId, orgId) => {
    const membership = await getMembership(userId, orgId);
    if (!membership) throw new HttpError(403, 'You are not a member of this organization.');
    return membership;
};

const requireSubAdmin = async (userId, orgId) => {
    const membership = await requireMembership(userId, orgId);
    if (membership.role !== 'subadmin' && membership.role !== 'admin') {
        throw new HttpError(403, 'Sub Admin access required.');
    }
    return membership;
};

const requireOrgManager = async (user, orgId) => {
    if (user?.global_role === 'superadmin') {
        return { role: user.global_role };
    }

    return requireSubAdmin(user.id, orgId);
};

const getTestOrThrow = async (testId) => {
    const { rows } = await query('SELECT * FROM tests WHERE id = $1 LIMIT 1', [testId]);
    if (rows.length === 0) throw new HttpError(404, 'Test not found.');
    return rows[0];
};

const getInterviewOrThrow = async (interviewId) => {
    const { rows } = await query('SELECT * FROM interviews WHERE id = $1 LIMIT 1', [interviewId]);
    if (rows.length === 0) throw new HttpError(404, 'Interview not found.');
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

const hasAttemptedAnswer = (question, normalized) => {
    if (question.type === 'mcq') return normalized.choice !== undefined;
    if (question.type === 'code') return Boolean(String(normalized.code || '').trim());
    return Boolean(String(normalized.response || '').trim());
};

const applyNegativeMarking = (question, normalized, options) => {
    if (!options.enabled || options.value <= 0) return normalized;
    if (!hasAttemptedAnswer(question, normalized)) return normalized;
    if (Number(normalized.pointsEarned || 0) > 0) return normalized;

    return {
        ...normalized,
        pointsEarned: -options.value,
        negativeMarkApplied: true,
    };
};

const buildSubmissionAnswers = async (questionRows, incomingAnswers, negativeMarking = {}) => {
    const negativeConfig: any = negativeMarking;
    const negativeOptions = {
        enabled: Boolean(negativeConfig.enabled),
        value: parseNegativeMarkValue(negativeConfig.value),
    };
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
            const normalized: any = {
                questionId: question.id,
                type: question.type,
                pointsEarned: 0,
            };
            const choice = Number.isInteger(submitted.choice) ? submitted.choice : undefined;
            if (choice !== undefined) normalized.choice = choice;
            if (choice === question.answer) {
                normalized.pointsEarned = question.points;
            }
            const graded = applyNegativeMarking(question, normalized, negativeOptions);
            score += graded.pointsEarned;
            answers.push(graded);
            continue;
        }

        if (question.type === 'text') {
            const normalized = applyNegativeMarking(question, evaluateTextAnswer(question, submitted), negativeOptions);
            score += normalized.pointsEarned;
            answers.push(normalized);
            continue;
        }

        if (question.type === 'numeric') {
            const normalized = applyNegativeMarking(question, evaluateNumericAnswer(question, submitted), negativeOptions);
            score += normalized.pointsEarned;
            answers.push(normalized);
            continue;
        }

        const normalized = applyNegativeMarking(question, await evaluateCodeAnswer(question, submitted), negativeOptions);
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

export const handleRequest = async (req, res) => {
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
        const password = String(body.password || body.newPassword || '');

        if (!name || !email || !password) throw new HttpError(400, 'Name, email, and password are required.');
        if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters long.');
        if (body.role !== undefined || body.global_role !== undefined) {
            throw new HttpError(403, 'Public signup only creates student accounts.');
        }

        const result = await transaction(async (client) => {
            const existing = await client.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);
            if (existing.rowCount > 0) throw new HttpError(409, 'An account with this email already exists.');

            const userId = randomUUID();
            const userResult = await client.query(`
                INSERT INTO users (id, name, email, password_hash, global_role, created_at)
                VALUES ($1, $2, $3, $4, NULL, $5)
                RETURNING id, name, email, global_role
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
        const superadminEnvEmail = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();

        // Self-heal superadmin credentials from environment before verifying login.
        if (superadminEnvEmail && email === superadminEnvEmail) {
            await syncSuperadminFromEnv();
        }

        const { rows } = await query('SELECT id, name, email, password_hash, global_role FROM users WHERE email = $1 LIMIT 1', [email]);
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
        if (user.global_role !== 'admin' && user.global_role !== 'superadmin') {
            throw new HttpError(403, 'Only admin accounts can create organizations.');
        }
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
                VALUES ($1, $2, $3, $4, $5)
            `, [randomUUID(), id, user.id, user.global_role === 'admin' ? 'admin' : 'subadmin', createdAt]);

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
            org: serializeOrganizationForRole(org, user.global_role === 'admin' ? 'admin' : 'subadmin'),
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
        await requireOrgManager(user, orgId);

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

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/members\/create$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        const manager = await requireOrgManager(user, orgId);
        const requestIp = getRequestIp(req);

        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || body.newPassword || '');
        const role = body.role === 'subadmin' ? 'subadmin' : null;

        if (!name || !email || !password) throw new HttpError(400, 'Name, email, and password are required.');
        if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
        if (!role) throw new HttpError(400, 'Admins and subadmins cannot create student accounts.');
        if (manager.role !== 'admin' && manager.role !== 'superadmin') {
            throw new HttpError(403, 'Only admins can create subadmin accounts.');
        }

        const createdMember = await transaction(async (client) => {
            const existingUser = await client.query(`
                SELECT id, name, email
                FROM users
                WHERE email = $1
                LIMIT 1
            `, [email]);

            let targetUserId;
            let targetName;
            let targetEmail;

            if (existingUser.rowCount > 0) {
                const existingMembership = await client.query(`
                    SELECT 1
                    FROM org_members
                    WHERE org_id = $1 AND user_id = $2
                    LIMIT 1
                `, [orgId, existingUser.rows[0].id]);

                if (existingMembership.rowCount > 0) {
                    throw new HttpError(409, 'This user is already a member of the organization.');
                }

                targetUserId = existingUser.rows[0].id;
                targetName = existingUser.rows[0].name;
                targetEmail = existingUser.rows[0].email;
            } else {
                targetUserId = randomUUID();
                targetName = name;
                targetEmail = email;

                await client.query(`
                    INSERT INTO users (id, name, email, password_hash, created_at)
                    VALUES ($1, $2, $3, $4, $5)
                `, [targetUserId, name, email, hashPassword(password), now()]);
            }

            const membershipResult = await client.query(`
                INSERT INTO org_members (id, org_id, user_id, role, joined_at)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [randomUUID(), orgId, targetUserId, role, now()]);

            await insertAuditLog(client, {
                orgId,
                actorUserId: user.id,
                action: 'org.member_created',
                entityType: 'org_member',
                entityId: membershipResult.rows[0].id,
                metadata: {
                    userId: targetUserId,
                    email: targetEmail,
                    role,
                },
                ipAddress: requestIp,
            });

            return {
                ...membershipResult.rows[0],
                profile: {
                    name: targetName,
                    email: targetEmail,
                },
            };
        });

        sendJson(req, res, 201, {
            member: {
                id: createdMember.id,
                org_id: createdMember.org_id,
                user_id: createdMember.user_id,
                role: createdMember.role,
                joined_at: createdMember.joined_at instanceof Date ? createdMember.joined_at.toISOString() : createdMember.joined_at,
                profile: createdMember.profile,
            },
        });
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/members\/([^/]+)\/role$/);
    if (req.method === 'PATCH' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        const targetUserId = decodeURIComponent(match[2]);
        const manager = await requireOrgManager(user, orgId);
        const requestIp = getRequestIp(req);
        const role = body.role === 'subadmin' ? 'subadmin' : null;

        if (!role) throw new HttpError(400, 'Admins and subadmins cannot assign student role.');
        if (manager.role !== 'admin' && manager.role !== 'superadmin') {
            throw new HttpError(403, 'Only admins can assign subadmin role.');
        }

        const updatedMember = await transaction(async (client) => {
            const currentMember = await client.query(`
                SELECT *
                FROM org_members
                WHERE org_id = $1 AND user_id = $2
                LIMIT 1
            `, [orgId, targetUserId]);

            if (currentMember.rowCount === 0) throw new HttpError(404, 'Member not found.');

            const result = await client.query(`
                UPDATE org_members
                SET role = $1
                WHERE org_id = $2 AND user_id = $3
                RETURNING *
            `, [role, orgId, targetUserId]);

            await insertAuditLog(client, {
                orgId,
                actorUserId: user.id,
                action: 'org.member_role_updated',
                entityType: 'org_member',
                entityId: result.rows[0].id,
                metadata: {
                    userId: targetUserId,
                    role,
                },
                ipAddress: requestIp,
            });

            return result.rows[0];
        });

        sendJson(req, res, 200, {
            member: {
                id: updatedMember.id,
                org_id: updatedMember.org_id,
                user_id: updatedMember.user_id,
                role: updatedMember.role,
                joined_at: updatedMember.joined_at instanceof Date ? updatedMember.joined_at.toISOString() : updatedMember.joined_at,
            },
        });
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/members\/([^/]+)$/);
    if (req.method === 'DELETE' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        const targetUserId = decodeURIComponent(match[2]);
        await requireOrgManager(user, orgId);
        const requestIp = getRequestIp(req);

        if (targetUserId === user.id) throw new HttpError(400, 'You cannot remove yourself.');

        await transaction(async (client) => {
            const existing = await client.query(`
                SELECT *
                FROM org_members
                WHERE org_id = $1 AND user_id = $2
                LIMIT 1
            `, [orgId, targetUserId]);

            if (existing.rowCount === 0) throw new HttpError(404, 'Member not found.');
            if (existing.rows[0].role !== 'subadmin' && existing.rows[0].role !== 'student') {
                throw new HttpError(400, 'This member cannot be removed here.');
            }

            await client.query(`
                DELETE FROM org_members
                WHERE org_id = $1 AND user_id = $2
            `, [orgId, targetUserId]);

            await insertAuditLog(client, {
                orgId,
                actorUserId: user.id,
                action: 'org.member_removed',
                entityType: 'org_member',
                entityId: existing.rows[0].id,
                metadata: {
                    userId: targetUserId,
                    role: existing.rows[0].role,
                },
                ipAddress: requestIp,
            });
        });

        sendEmpty(req, res, 204);
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/audit-logs$/);
    if (req.method === 'GET' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        await requireSubAdmin(user.id, orgId);
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

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/groups$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        await requireSubAdmin(user.id, orgId);
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
        await requireSubAdmin(user.id, gRows[0].org_id);

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
        await requireSubAdmin(user.id, orgId);

        const { rows: attempts } = await query(`
            SELECT
                a.id,
                u.name as student_name,
                u.email as student_email,
                t.title as test_title,
                t.id as test_id,
                a.status,
                a.started_at,
                a.last_heartbeat_at,
                a.violation_score,
                a.ip_address,
                a.integrity_events as violations
            FROM test_attempts a
            JOIN users u ON a.student_id = u.id
            JOIN tests t ON a.test_id = t.id
            WHERE a.org_id = $1 AND (a.status = 'active' OR a.status = 'in_progress')
            ORDER BY a.started_at DESC
        `, [orgId]);

        sendJson(req, res, 200, { attempts: attempts.map(mapAttemptRow) });
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/tests$/);
    if (req.method === 'GET' && match) {
        await ensureNegativeMarkingColumns();
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        const membership = await requireMembership(user.id, orgId);

        let testRows;
        if (membership.role === 'subadmin' || membership.role === 'admin') {
            testRows = await query(`
                SELECT * FROM tests WHERE org_id = $1 ORDER BY created_at DESC
            `, [orgId]);
        } else {
            // Students see tests that are either assigned to them (directly or via group)
            // or tests that have NO assignments in that org (public to all org members)
            testRows = await query(`
                SELECT t.*
                FROM tests t
                WHERE t.org_id = $1
                  AND t.published = TRUE
                  AND (
                    NOT EXISTS (SELECT 1 FROM test_assignments WHERE test_id = t.id)
                    OR EXISTS (
                      SELECT 1 FROM test_assignments ta
                      LEFT JOIN group_members gm ON gm.group_id = ta.group_id AND gm.user_id = $2
                      WHERE ta.test_id = t.id AND (ta.student_id = $2 OR gm.user_id IS NOT NULL)
                    )
                  )
                ORDER BY t.created_at DESC
            `, [orgId, user.id]);
        }

        const visibleTestRows = membership.role === 'subadmin' || membership.role === 'admin'
            ? testRows.rows
            : testRows.rows.filter((row) => testAllowsEmail(row, user.email));

        const testIds = visibleTestRows.map((row) => row.id);
        const questionRows = await fetchQuestionsByTestIds(testIds);
        let submittedTestIds = new Set();
        if (membership.role !== 'subadmin' && membership.role !== 'admin' && testIds.length > 0) {
            const submitted = await query(`
                SELECT DISTINCT test_id
                FROM submissions
                WHERE student_id = $1
                  AND test_id = ANY($2::text[])
            `, [user.id, testIds]);
            submittedTestIds = new Set(submitted.rows.map((row) => row.test_id));
        }

        sendJson(req, res, 200, {
            tests: visibleTestRows.map((row) => mapTestRow(
                row,
                questionRows.filter((question) => question.test_id === row.id),
                membership.role,
                { revealAnswers: Boolean(row.show_answers_after_exam) && submittedTestIds.has(row.id) },
            )),
        });
        return;
    }

    match = pathname.match(/^\/api\/orgs\/([^/]+)\/interviews$/);
    if (match) {
        const { user } = await requireAuth(req);
        const orgId = decodeURIComponent(match[1]);
        await requireSubAdmin(user.id, orgId);

        if (req.method === 'GET') {
            const { rows } = await query(`
                SELECT
                    i.*,
                    u.name AS creator_name,
                    COUNT(ip.id)::int AS participant_count
                FROM interviews i
                LEFT JOIN users u ON u.id = i.created_by
                LEFT JOIN interview_participants ip ON ip.interview_id = i.id
                WHERE i.org_id = $1
                GROUP BY i.id, u.name
                ORDER BY i.scheduled_at DESC, i.created_at DESC
            `, [orgId]);

            sendJson(req, res, 200, { interviews: rows.map(mapInterviewRow) });
            return;
        }

        if (req.method === 'POST') {
            const title = String(body.title || '').trim();
            if (!title) throw new HttpError(400, 'Interview title is required.');

            const scheduledAt = parseInterviewDateTime(body.scheduledAt ?? body.scheduled_at);
            const durationMinutes = Math.min(480, Math.max(15, Number(body.durationMinutes ?? body.duration_minutes ?? 45)));
            const candidateName = String(body.candidateName ?? body.candidate_name ?? '').trim().slice(0, 160);
            const candidateEmail = String(body.candidateEmail ?? body.candidate_email ?? '').trim().toLowerCase().slice(0, 254);
            const description = String(body.description || '').trim().slice(0, 3000);
            const meetingUrl = '';
            const allowScreenShare = Boolean(body.allowScreenShare ?? body.allow_screen_share);
            const enableIntegrityMonitoring = body.enableIntegrityMonitoring !== undefined || body.enable_integrity_monitoring !== undefined
                ? Boolean(body.enableIntegrityMonitoring ?? body.enable_integrity_monitoring)
                : true;
            const roomMode = normalizeInterviewRoomMode(body.roomMode ?? body.room_mode);
            const status = normalizeInterviewStatus(body.status);
            const requestIp = getRequestIp(req);

            const interview = await transaction(async (client) => {
                const interviewId = randomUUID();
                const interviewCode = await uniqueInterviewCode(client);
                const { rows } = await client.query(`
                    INSERT INTO interviews (
                        id, org_id, title, candidate_name, candidate_email, description,
                        scheduled_at, duration_minutes, meeting_url, interview_code,
                        allow_screen_share, enable_integrity_monitoring, room_mode, status,
                        created_by, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
                    RETURNING *
                `, [
                    interviewId,
                    orgId,
                    title,
                    candidateName,
                    candidateEmail,
                    description,
                    scheduledAt,
                    durationMinutes,
                    meetingUrl,
                    interviewCode,
                    allowScreenShare,
                    enableIntegrityMonitoring,
                    roomMode,
                    status,
                    user.id,
                    now(),
                ]);

                await insertAuditLog(client, {
                    orgId,
                    actorUserId: user.id,
                    action: 'interview.created',
                    entityType: 'interview',
                    entityId: interviewId,
                    metadata: { title, candidateEmail, scheduledAt, durationMinutes, roomMode, status, allowScreenShare, enableIntegrityMonitoring },
                    ipAddress: requestIp,
                });

                return rows[0];
            });

            sendJson(req, res, 201, { interview: mapInterviewRow(interview) });
            return;
        }
    }

    match = pathname.match(/^\/api\/interviews\/code\/([^/]+)$/);
    if (req.method === 'GET' && match) {
        const interviewCode = decodeURIComponent(match[1]).trim().toUpperCase();
        const { rows } = await query(`
            SELECT
                i.*,
                u.name AS creator_name,
                COUNT(ip.id)::int AS participant_count
            FROM interviews i
            LEFT JOIN users u ON u.id = i.created_by
            LEFT JOIN interview_participants ip ON ip.interview_id = i.id
            WHERE UPPER(i.interview_code) = $1
            GROUP BY i.id, u.name
            LIMIT 1
        `, [interviewCode]);

        if (rows.length === 0) throw new HttpError(404, 'Interview not found.');
        sendJson(req, res, 200, { interview: mapInterviewRow(rows[0]) });
        return;
    }

    match = pathname.match(/^\/api\/interviews\/([^/]+)\/join$/);
    if (req.method === 'POST' && match) {
        const { user } = await getAuth(req);
        const interviewId = decodeURIComponent(match[1]);
        const interview = await getInterviewOrThrow(interviewId);

        const clientId = normalizeClientId(body.clientId ?? body.client_id);
        const participantName = normalizeParticipantName(body.displayName ?? body.display_name, user?.name || user?.email || 'Participant');

        const joined = await transaction(async (client) => {
            const participantId = randomUUID();
            const joinedAt = now();
            if (!user) {
                const { rows } = await client.query(`
                    INSERT INTO interview_participants (
                        id, interview_id, user_id, guest_id, participant_name,
                        joined_at, last_seen_at, current_room
                    )
                    VALUES ($1, $2, NULL, $3, $4, $5, $5, $6)
                    ON CONFLICT (interview_id, guest_id)
                    WHERE guest_id <> ''
                    DO UPDATE SET
                        participant_name = EXCLUDED.participant_name,
                        last_seen_at = EXCLUDED.last_seen_at,
                        current_room = EXCLUDED.current_room
                    RETURNING *
                `, [participantId, interviewId, clientId, participantName, joinedAt, interview.room_mode]);
                return rows[0];
            }

            const { rows } = await client.query(`
                INSERT INTO interview_participants (
                    id, interview_id, user_id, guest_id, participant_name,
                    joined_at, last_seen_at, current_room
                )
                VALUES ($1, $2, $3, '', $4, $5, $5, $6)
                ON CONFLICT (interview_id, user_id)
                DO UPDATE SET
                    participant_name = EXCLUDED.participant_name,
                    last_seen_at = EXCLUDED.last_seen_at,
                    current_room = EXCLUDED.current_room
                RETURNING *
            `, [participantId, interviewId, user.id, participantName, joinedAt, interview.room_mode]);
            return rows[0];
        });

        sendJson(req, res, 200, {
            participant: {
                id: joined.id,
                interview_id: joined.interview_id,
                user_id: joined.user_id ?? null,
                guest_id: joined.guest_id ?? '',
                participant_name: joined.participant_name ?? '',
                joined_at: joined.joined_at instanceof Date ? joined.joined_at.toISOString() : joined.joined_at,
                current_room: joined.current_room,
            },
            interview: mapInterviewRow(interview),
        });
        return;
    }

    match = pathname.match(/^\/api\/interviews\/([^/]+)\/signals$/);
    if (match) {
        const { user } = await getAuth(req);
        const interviewId = decodeURIComponent(match[1]);
        await getInterviewOrThrow(interviewId);

        if (req.method === 'GET') {
            const clientId = normalizeClientId(url.searchParams.get('clientId'));
            const sinceRaw = String(url.searchParams.get('since') || '').trim();
            const since = sinceRaw && !Number.isNaN(new Date(sinceRaw).getTime())
                ? new Date(sinceRaw).toISOString()
                : new Date(Date.now() - 10 * 60 * 1000).toISOString();

            await query(`
                DELETE FROM interview_signals
                WHERE interview_id = $1
                  AND created_at < NOW() - INTERVAL '1 day'
            `, [interviewId]);

            const { rows } = await query(`
                SELECT
                    s.*,
                    COALESCE(NULLIF(s.sender_name, ''), u.name, 'Participant') AS sender_name
                FROM interview_signals s
                LEFT JOIN users u ON u.id = s.sender_user_id
                WHERE s.interview_id = $1
                  AND s.sender_client_id <> $2
                  AND (s.target_client_id IS NULL OR s.target_client_id = $2)
                  AND s.created_at > $3
                ORDER BY s.created_at ASC
                LIMIT 150
            `, [interviewId, clientId, since]);

            sendJson(req, res, 200, {
                server_time: now(),
                signals: rows.map(mapInterviewSignalRow),
            });
            return;
        }

        if (req.method === 'POST') {
            const clientId = normalizeClientId(body.clientId ?? body.client_id);
            const targetClientIdRaw = String(body.targetClientId ?? body.target_client_id ?? '').trim();
            const targetClientId = targetClientIdRaw ? targetClientIdRaw.slice(0, 128) : null;
            const type = normalizeSignalType(body.type);
            const payload = normalizeSignalPayload(body.payload);
            const senderName = normalizeParticipantName(body.displayName ?? body.display_name, user?.name || user?.email || 'Participant');

            const { rows } = await query(`
                INSERT INTO interview_signals (
                    id, interview_id, sender_user_id, sender_client_id,
                    sender_name, target_client_id, type, payload, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
                RETURNING *
            `, [randomUUID(), interviewId, user?.id ?? null, clientId, senderName, targetClientId, type, payload, now()]);

            await query(`
                DELETE FROM interview_signals
                WHERE interview_id = $1
                  AND created_at < NOW() - INTERVAL '1 day'
            `, [interviewId]);

            sendJson(req, res, 201, { signal: mapInterviewSignalRow(rows[0]) });
            return;
        }
    }

    match = pathname.match(/^\/api\/interviews\/([^/]+)$/);
    if (match) {
        const { user } = await requireAuth(req);
        const interviewId = decodeURIComponent(match[1]);
        const interview = await getInterviewOrThrow(interviewId);
        await requireSubAdmin(user.id, interview.org_id);

        if (req.method === 'PATCH') {
            const requestIp = getRequestIp(req);
            const scheduledAtProvided = body.scheduledAt !== undefined || body.scheduled_at !== undefined;
            const updatedInterview = await transaction(async (client) => {
                const { rows } = await client.query(`
                    UPDATE interviews
                    SET
                        title = COALESCE($1, title),
                        candidate_name = COALESCE($2, candidate_name),
                        candidate_email = COALESCE($3, candidate_email),
                        description = COALESCE($4, description),
                        scheduled_at = COALESCE($5, scheduled_at),
                        duration_minutes = COALESCE($6, duration_minutes),
                        meeting_url = COALESCE($7, meeting_url),
                        allow_screen_share = COALESCE($8, allow_screen_share),
                        enable_integrity_monitoring = COALESCE($9, enable_integrity_monitoring),
                        room_mode = COALESCE($10, room_mode),
                        status = COALESCE($11, status),
                        updated_at = $12
                    WHERE id = $13
                    RETURNING *
                `, [
                    body.title !== undefined ? String(body.title).trim() : null,
                    body.candidateName !== undefined || body.candidate_name !== undefined ? String(body.candidateName ?? body.candidate_name ?? '').trim().slice(0, 160) : null,
                    body.candidateEmail !== undefined || body.candidate_email !== undefined ? String(body.candidateEmail ?? body.candidate_email ?? '').trim().toLowerCase().slice(0, 254) : null,
                    body.description !== undefined ? String(body.description).trim().slice(0, 3000) : null,
                    scheduledAtProvided ? parseInterviewDateTime(body.scheduledAt ?? body.scheduled_at) : null,
                    body.durationMinutes !== undefined || body.duration_minutes !== undefined ? Math.min(480, Math.max(15, Number(body.durationMinutes ?? body.duration_minutes))) : null,
                    body.meetingUrl !== undefined || body.meeting_url !== undefined ? '' : null,
                    body.allowScreenShare !== undefined || body.allow_screen_share !== undefined ? Boolean(body.allowScreenShare ?? body.allow_screen_share) : null,
                    body.enableIntegrityMonitoring !== undefined || body.enable_integrity_monitoring !== undefined ? Boolean(body.enableIntegrityMonitoring ?? body.enable_integrity_monitoring) : null,
                    body.roomMode !== undefined || body.room_mode !== undefined ? normalizeInterviewRoomMode(body.roomMode ?? body.room_mode, interview.room_mode) : null,
                    body.status !== undefined ? normalizeInterviewStatus(body.status, interview.status) : null,
                    now(),
                    interviewId,
                ]);

                await insertAuditLog(client, {
                    orgId: interview.org_id,
                    actorUserId: user.id,
                    action: 'interview.updated',
                    entityType: 'interview',
                    entityId: interviewId,
                    metadata: { title: rows[0].title, status: rows[0].status, roomMode: rows[0].room_mode, allowScreenShare: rows[0].allow_screen_share, enableIntegrityMonitoring: rows[0].enable_integrity_monitoring },
                    ipAddress: requestIp,
                });

                return rows[0];
            });

            sendJson(req, res, 200, { interview: mapInterviewRow(updatedInterview) });
            return;
        }

        if (req.method === 'DELETE') {
            const requestIp = getRequestIp(req);
            await transaction(async (client) => {
                await insertAuditLog(client, {
                    orgId: interview.org_id,
                    actorUserId: user.id,
                    action: 'interview.deleted',
                    entityType: 'interview',
                    entityId: interviewId,
                    metadata: { title: interview.title, interviewCode: interview.interview_code },
                    ipAddress: requestIp,
                });
                await client.query('DELETE FROM interviews WHERE id = $1', [interviewId]);
            });
            sendJson(req, res, 200, { success: true });
            return;
        }
    }

    if (req.method === 'GET' && pathname === '/api/student/tests') {
        await ensureNegativeMarkingColumns();
        const { user } = await requireAuth(req);

        const testRows = await query(`
            SELECT *
            FROM tests
            WHERE published = TRUE
            ORDER BY created_at DESC
        `);

        const visibleTestRows = testRows.rows.filter((row) => testAllowsEmail(row, user.email));
        const testIds = visibleTestRows.map((row) => row.id);
        const questionRows = await fetchQuestionsByTestIds(testIds);
        let submittedTestIds = new Set();
        if (testIds.length > 0) {
            const submitted = await query(`
                SELECT DISTINCT test_id
                FROM submissions
                WHERE student_id = $1
                  AND test_id = ANY($2::text[])
            `, [user.id, testIds]);
            submittedTestIds = new Set(submitted.rows.map((row) => row.test_id));
        }

        sendJson(req, res, 200, {
            tests: visibleTestRows.map((row) => mapTestRow(
                row,
                questionRows.filter((question) => question.test_id === row.id),
                'student',
                { revealAnswers: Boolean(row.show_answers_after_exam) && submittedTestIds.has(row.id) },
            )),
        });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/student/interviews') {
        const { user } = await requireAuth(req);
        const email = String(user.email || '').trim().toLowerCase();
        if (!email) {
            sendJson(req, res, 200, { interviews: [] });
            return;
        }

        const { rows } = await query(`
            SELECT
                i.*,
                u.name AS creator_name,
                COUNT(ip.id)::int AS participant_count
            FROM interviews i
            LEFT JOIN users u ON u.id = i.created_by
            LEFT JOIN interview_participants ip ON ip.interview_id = i.id
            WHERE LOWER(i.candidate_email) = $1
              AND i.status <> 'cancelled'
            GROUP BY i.id, u.name
            ORDER BY i.scheduled_at ASC, i.created_at DESC
        `, [email]);

        sendJson(req, res, 200, { interviews: rows.map(mapStudentInterviewRow) });
        return;
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)\/assignments$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireSubAdmin(user.id, test.org_id);

        const { studentId, groupId } = body;
        if (!studentId && !groupId) throw new HttpError(400, 'Either studentId or groupId is required.');

        await query(`
            INSERT INTO test_assignments (id, test_id, student_id, group_id, assignment_code, assigned_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [randomUUID(), testId, studentId || null, groupId || null, await transaction(async (client) => uniqueAssignmentCode(client)), now()]);

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
        if (user.global_role === 'admin' || user.global_role === 'superadmin') {
            throw new HttpError(403, 'Only student accounts can start test attempts.');
        }
        if (!test.published) throw new HttpError(403, 'Only published tests can be attempted.');
        assertTestEmailAccess(test, user.email);
        assertTestAccessCode(test, body.accessCode);
        assertTestWindowOpen(test);
        const securitySettings = getTestSecuritySettings(test);
        if (securitySettings.laptop_only && isMobileRequest(req)) {
            throw new HttpError(403, 'This exam can only be started on a laptop or desktop device.');
        }
        await assertNoSubmittedAttempt(testId, user.id);

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
        const durationExpiresAt = new Date(Date.now() + Math.max(1, Number(test.duration || 60)) * 60 * 1000);
        const testWindow = getTestWindow(test);
        const expiresAt = testWindow && testWindow.endsAt < durationExpiresAt
            ? testWindow.endsAt.toISOString()
            : durationExpiresAt.toISOString();
        const attemptId = randomUUID();
        let attempt;

        try {
            const { rows } = await query(`
                INSERT INTO test_attempts (
                    id, test_id, org_id, student_id, status, started_at, last_heartbeat_at, expires_at, ip_address, user_agent
                )
                VALUES ($1, $2, $3, $4, 'active', $5, $5, $6, $7, $8)
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

    match = pathname.match(/^\/api\/attempts\/([^/]+)\/heartbeat$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const attemptId = decodeURIComponent(match[1]);
        const attempt = await getAttemptOrThrow(attemptId);
        if (attempt.student_id !== user.id) throw new HttpError(403, 'Unauthorized.');

        if (attempt.status !== 'in_progress' && attempt.status !== 'active') {
            throw new HttpError(410, `Assessment session is ${attempt.status}.`);
        }

        const updated = await query(`
            UPDATE test_attempts 
            SET last_heartbeat_at = $1, ip_address = $2, user_agent = $3
            WHERE id = $4 
            RETURNING *
        `, [now(), getRequestIp(req), req.headers['user-agent'], attemptId]);

        sendJson(req, res, 200, { attempt: mapAttemptRow(updated.rows[0]) });
        return;
    }

    match = pathname.match(/^\/api\/attempts\/([^/]+)\/violations$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const attemptId = decodeURIComponent(match[1]);
        const type = String(body.type || 'UNKNOWN').slice(0, 64);
        const message = String(body.message || '').slice(0, 500);
        
        const attempt = await getAttemptOrThrow(attemptId);
        if (attempt.student_id !== user.id) throw new HttpError(403, 'Unauthorized.');

        const violation = {
            type,
            message,
            timestamp: now(),
            occurredAt: now(),
        };

        const updated = await query(`
            UPDATE test_attempts
            SET 
                integrity_events = COALESCE(integrity_events, '[]'::jsonb) || $1::jsonb,
                violations_count = violations_count + 1,
                violation_score = violation_score + $2
            WHERE id = $3
            RETURNING *
        `, [JSON.stringify([violation]), type === 'TAB_SWITCH' ? 10 : 5, attemptId]);

        sendJson(req, res, 200, { attempt: mapAttemptRow(updated.rows[0]) });
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

    match = pathname.match(/^\/api\/attempts\/([^/]+)\/logs$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const attemptId = decodeURIComponent(match[1]);
        const attempt = await getAttemptOrThrow(attemptId);
        if (attempt.student_id !== user.id) throw new HttpError(403, 'Unauthorized.');

        const eventType = String(body.type || 'UNKNOWN').slice(0, 64);
        const details = body.details || {};

        await query(`
            INSERT INTO attempt_logs (id, attempt_id, event_type, details, timestamp)
            VALUES ($1, $2, $3, $4::jsonb, $5)
        `, [randomUUID(), attemptId, eventType, JSON.stringify(details), now()]);

        // If it's a violation, increment violation_score
        if (['tab_switch', 'camera_off', 'face_not_detected', 'multiple_faces', 'suspicious'].includes(eventType)) {
            await query('UPDATE test_attempts SET violation_score = violation_score + 1 WHERE id = $1', [attemptId]);
        }

        sendEmpty(req, res, 204);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/tests') {
        await ensureNegativeMarkingColumns();
        const { user } = await requireAuth(req);
        const orgId = String(body.orgId || '');
        await requireSubAdmin(user.id, orgId);
        const requestIp = getRequestIp(req);

        const title = String(body.title || '').trim();
        if (!title) throw new HttpError(400, 'Test title is required.');

        const testId = randomUUID();
        const description = String(body.description || '');
        const duration = Number(body.duration || 60);
        const { startAt, endAt } = parseTestWindowInput(body.startAt ?? body.start_at, body.endAt ?? body.end_at);
        if (!startAt) throw new HttpError(400, 'Exam start date and time is required.');
        if (!endAt) throw new HttpError(400, 'Exam end date and time is required.');
        const difficulty = '';
        const tags = Array.isArray(body.tags) ? body.tags : [];
        const negativeMarkingEnabled = Boolean(body.negativeMarkingEnabled ?? body.negative_marking_enabled);
        const negativeMarkValue = parseNegativeMarkValue(body.negativeMarkValue ?? body.negative_mark_value);
        const showAnswersAfterExam = Boolean(body.showAnswersAfterExam ?? body.show_answers_after_exam);
        const allowedEmails = normalizeAllowedEmails(body.allowedEmails ?? body.allowed_emails);
        const securitySettings = normalizeTestSecuritySettings(body.securitySettings ?? body.security_settings);
        const accessCode = await transaction(async (client) => uniqueTestAccessCode(client));

        const createdTest = await transaction(async (client) => {
            const result = await client.query(`
                INSERT INTO tests (
                    id, org_id, title, description, duration, difficulty, tags, published,
                    negative_marking_enabled, negative_mark_value, show_answers_after_exam,
                    allowed_emails, access_code, access_code_hash, security_settings, start_at, end_at, created_by, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, FALSE, $8, $9, $10, $11::jsonb, $12, $13, $14::jsonb, $15, $16, $17, $18)
                RETURNING *
            `, [
                testId,
                orgId,
                title,
                description,
                duration,
                difficulty,
                JSON.stringify(tags),
                negativeMarkingEnabled,
                negativeMarkValue,
                showAnswersAfterExam,
                JSON.stringify(allowedEmails),
                accessCode,
                null,
                JSON.stringify(securitySettings),
                startAt,
                endAt,
                user.id,
                now(),
            ]);

            await insertAuditLog(client, {
                orgId,
                actorUserId: user.id,
                action: 'test.created',
                entityType: 'test',
                entityId: testId,
                metadata: {
                    title,
                    duration,
                    startAt,
                    endAt,
                    tags,
                    negativeMarkingEnabled,
                    negativeMarkValue,
                    showAnswersAfterExam,
                    allowedEmailCount: allowedEmails.length,
                    securitySettings,
                    hasAccessCode: Boolean(accessCode),
                },
                ipAddress: requestIp,
            });

            return result.rows[0];
        });

        sendJson(req, res, 201, { test: mapTestRow(createdTest, []) });
        return;
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)$/);
    if (match) {
        await ensureNegativeMarkingColumns();
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);

        if (req.method === 'PATCH') {
            const membership = await requireMembership(user.id, test.org_id);
            if (membership.role !== 'subadmin' && membership.role !== 'admin') {
                throw new HttpError(403, 'Only admin/subadmin can update exam schedule in test editor.');
            }
            const allowedEmailsProvided = body.allowedEmails !== undefined || body.allowed_emails !== undefined;
            const allowedEmails = allowedEmailsProvided
                ? normalizeAllowedEmails(body.allowedEmails ?? body.allowed_emails)
                : normalizeAllowedEmails(test.allowed_emails);
            const securitySettingsProvided = body.securitySettings !== undefined || body.security_settings !== undefined;
            const securitySettings = securitySettingsProvided
                ? normalizeTestSecuritySettings(body.securitySettings ?? body.security_settings)
                : normalizeTestSecuritySettings(test.security_settings);
            const negativeMarkingProvided = body.negativeMarkingEnabled !== undefined || body.negative_marking_enabled !== undefined;
            const negativeMarkValueProvided = body.negativeMarkValue !== undefined || body.negative_mark_value !== undefined;
            const negativeMarkingEnabled = negativeMarkingProvided
                ? Boolean(body.negativeMarkingEnabled ?? body.negative_marking_enabled)
                : null;
            const negativeMarkValue = negativeMarkValueProvided
                ? parseNegativeMarkValue(body.negativeMarkValue ?? body.negative_mark_value)
                : null;
            const showAnswersProvided = body.showAnswersAfterExam !== undefined || body.show_answers_after_exam !== undefined;
            const showAnswersAfterExam = showAnswersProvided
                ? Boolean(body.showAnswersAfterExam ?? body.show_answers_after_exam)
                : null;
            const shouldEnsureAccessCode = body.published === true && !test.access_code;
            const startAtProvided = body.startAt !== undefined || body.start_at !== undefined;
            const endAtProvided = body.endAt !== undefined || body.end_at !== undefined;
            const { startAt, endAt } = parseTestWindowInput(
                startAtProvided ? (body.startAt ?? body.start_at) : null,
                endAtProvided ? (body.endAt ?? body.end_at) : null,
            );
            const nextStartAt = startAt ?? (test.start_at instanceof Date ? test.start_at.toISOString() : test.start_at);
            const nextEndAt = endAt ?? (test.end_at instanceof Date ? test.end_at.toISOString() : test.end_at);
            if ((startAtProvided || endAtProvided) && nextStartAt && nextEndAt && new Date(nextEndAt).getTime() <= new Date(nextStartAt).getTime()) {
                throw new HttpError(400, 'Exam end date and time must be after the start date and time.');
            }

            if (body.published === true) {
                await assertTestReadyForPublish(testId);
                if (allowedEmails.length === 0) {
                    throw new HttpError(400, 'At least one allowed email is required before publishing.');
                }
                if (!startAt && !test.start_at) {
                    throw new HttpError(400, 'Exam start date and time is required before publishing.');
                }
                if (!endAt && !test.end_at) {
                    throw new HttpError(400, 'Exam end date and time is required before publishing.');
                }
            }
            const requestIp = getRequestIp(req);

            const updatedTest = await transaction(async (client) => {
                const nextAccessCode = shouldEnsureAccessCode ? await uniqueTestAccessCode(client) : null;
                const result = await client.query(`
                    UPDATE tests
                    SET
                        title = COALESCE($1, title),
                        description = COALESCE($2, description),
                        duration = COALESCE($3, duration),
                        tags = COALESCE($4::jsonb, tags),
                        published = COALESCE($5, published),
                        allowed_emails = COALESCE($6::jsonb, allowed_emails),
                        access_code = COALESCE($7, access_code),
                        start_at = COALESCE($8, start_at),
                        end_at = COALESCE($9, end_at),
                        security_settings = COALESCE($10::jsonb, security_settings),
                        negative_marking_enabled = COALESCE($11::boolean, negative_marking_enabled),
                        negative_mark_value = COALESCE($12::numeric, negative_mark_value),
                        show_answers_after_exam = COALESCE($13::boolean, show_answers_after_exam)
                    WHERE id = $14
                    RETURNING *
                `, [
                    body.title !== undefined ? String(body.title).trim() : null,
                    body.description !== undefined ? String(body.description) : null,
                    body.duration !== undefined ? Number(body.duration) : null,
                    body.tags !== undefined ? JSON.stringify(Array.isArray(body.tags) ? body.tags : []) : null,
                    body.published !== undefined ? Boolean(body.published) : null,
                    allowedEmailsProvided ? JSON.stringify(allowedEmails) : null,
                    nextAccessCode,
                    startAt,
                    endAt,
                    securitySettingsProvided ? JSON.stringify(securitySettings) : null,
                    negativeMarkingEnabled,
                    negativeMarkValue,
                    showAnswersAfterExam,
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
                        published: nextTest.published,
                        duration: nextTest.duration,
                        startAt: nextTest.start_at,
                        endAt: nextTest.end_at,
                        negativeMarkingEnabled: nextTest.negative_marking_enabled,
                        negativeMarkValue: nextTest.negative_mark_value,
                        showAnswersAfterExam: nextTest.show_answers_after_exam,
                        securitySettings: normalizeTestSecuritySettings(nextTest.security_settings),
                        allowedEmailCount: normalizeAllowedEmails(nextTest.allowed_emails).length,
                        hasAccessCode: Boolean(nextTest.access_code),
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
            await requireSubAdmin(user.id, test.org_id);
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
    
    match = pathname.match(/^\/api\/tests\/([^/]+)\/assignments$/);
    if (match) {
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        
        if (req.method === 'GET') {
            await requireSubAdmin(user.id, test.org_id);
            const { rows } = await query(`
                SELECT
                    ta.*,
                    u.name AS student_name,
                    u.email AS student_email,
                    g.name AS group_name
                FROM test_assignments ta
                LEFT JOIN users u ON u.id = ta.student_id
                LEFT JOIN groups g ON g.id = ta.group_id
                WHERE ta.test_id = $1
                ORDER BY ta.assigned_at ASC
            `, [testId]);
            sendJson(req, res, 200, { assignments: rows });
            return;
        }

        if (req.method === 'POST') {
            await requireSubAdmin(user.id, test.org_id);
            const { groupIds = [], studentIds = [] } = body;
            const requestIp = getRequestIp(req);

            await transaction(async (client) => {
                await client.query('DELETE FROM test_assignments WHERE test_id = $1', [testId]);
                for (const gid of groupIds) {
                    await client.query(
                        'INSERT INTO test_assignments (id, test_id, group_id, assignment_code, assigned_at) VALUES ($1, $2, $3, $4, $5)',
                        [randomUUID(), testId, gid, await uniqueAssignmentCode(client), now()],
                    );
                }
                for (const sid of studentIds) {
                    await client.query(
                        'INSERT INTO test_assignments (id, test_id, student_id, assignment_code, assigned_at) VALUES ($1, $2, $3, $4, $5)',
                        [randomUUID(), testId, sid, await uniqueAssignmentCode(client), now()],
                    );
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

            sendJson(req, res, 200, { message: 'Assignments updated' });
            return;
        }
    }

    match = pathname.match(/^\/api\/tests\/([^/]+)\/questions$/);
    if (req.method === 'POST' && match) {
        const { user } = await requireAuth(req);
        const testId = decodeURIComponent(match[1]);
        const test = await getTestOrThrow(testId);
        await requireSubAdmin(user.id, test.org_id);
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
        await requireSubAdmin(user.id, test.org_id);
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
        await requireSubAdmin(user.id, test.org_id);
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
        if (membership.role !== 'subadmin' && !test.published) {
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
        await requireSubAdmin(user.id, test.org_id);
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
            SELECT
                s.*,
                ta.started_at,
                ta.expires_at,
                ta.ip_address,
                ta.user_agent
            FROM submissions s
            LEFT JOIN test_attempts ta ON ta.id = s.attempt_id
            WHERE s.org_id = $1
              AND ($2 IN ('admin', 'subadmin') OR s.student_id = $3)
            ORDER BY s.submitted_at DESC
        `, [orgId, membership.role, user.id]);

        sendJson(req, res, 200, { submissions: rows.map(mapSubmissionRow) });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/student/submissions') {
        const { user } = await requireAuth(req);

        const { rows } = await query(`
            SELECT
                s.*,
                ta.started_at,
                ta.expires_at,
                ta.ip_address,
                ta.user_agent
            FROM submissions s
            LEFT JOIN test_attempts ta ON ta.id = s.attempt_id
            WHERE s.student_id = $1
            ORDER BY s.submitted_at DESC
        `, [user.id]);

        sendJson(req, res, 200, { submissions: rows.map(mapSubmissionRow) });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/submissions') {
        await ensureNegativeMarkingColumns();
        enforceRateLimit(req, 'submission-create', { limit: 20, windowMs: 5 * 60 * 1000 });
        const { user } = await requireAuth(req);
        const testId = String(body.test_id || '');
        const attemptId = String(body.attempt_id || '');
        const requestIp = getRequestIp(req);
        if (user.global_role === 'admin' || user.global_role === 'superadmin') {
            throw new HttpError(403, 'Only student accounts can submit test attempts.');
        }
        if (!attemptId) throw new HttpError(400, 'Attempt ID is required.');

        const test = await getTestOrThrow(testId);
        const orgId = test.org_id;
        if (!test.published) throw new HttpError(403, 'Only published tests can be submitted.');
        assertTestEmailAccess(test, user.email);

        let attempt = await getAttemptOrThrow(attemptId);
        if (attempt.student_id !== user.id) throw new HttpError(403, 'You can only submit your own attempt.');
        if (attempt.test_id !== testId || attempt.org_id !== orgId) {
            throw new HttpError(400, 'Attempt does not belong to this test or organization.');
        }

        attempt = await expireAttemptIfNeeded(attempt);
        if (attempt.status === 'submitted') throw new HttpError(409, 'This attempt has already been submitted.');
        if (attempt.status !== 'active' && attempt.status !== 'in_progress') throw new HttpError(410, 'This attempt is no longer active.');
        await assertNoSubmittedAttempt(testId, user.id);

        const questionResult = await query('SELECT * FROM questions WHERE test_id = $1 ORDER BY position ASC', [testId]);
        const { answers, score, totalPoints } = await buildSubmissionAnswers(
            questionResult.rows.map(mapQuestionRow),
            body.answers,
            {
                enabled: test.negative_marking_enabled,
                value: test.negative_mark_value,
            },
        );
        const integrityEvents = mergeIntegrityEvents(attempt.integrity_events, body.integrity_events);
        const violationsCount = integrityEvents.length;
        const integrityScore = Math.max(0, 100 - Math.min(violationsCount, 20) * 5);
        const autoSubmitReason = String(body.auto_submit_reason || '').trim().slice(0, 500);
        const autoSubmitted = autoSubmitReason.length > 0;

        const submittedAt = now();
        const submission = await transaction(async (client) => {
            const submissionId = randomUUID();
            const submissionResult = await client.query(`
                INSERT INTO submissions (
                    id, test_id, org_id, student_id, student_name, attempt_id, answers,
                    score, total_points, integrity_score, violations_count, integrity_events,
                    auto_submitted, auto_submit_reason, submitted_at
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7::jsonb,
                    $8, $9, $10, $11, $12::jsonb, $13, $14, $15
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
                autoSubmitted,
                autoSubmitReason || null,
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
                    autoSubmitted,
                    autoSubmitReason: autoSubmitReason || null,
                },
                ipAddress: requestIp,
            });

            return submissionResult.rows[0];
        });

        sendJson(req, res, 201, { submission: mapSubmissionRow(submission) });
        return;
    }

    // ── Super Admin Routes ────────────────────────────────────────────────────

    const requireSuperAdmin = async () => {
        const { session, user } = await requireAuth(req);
        if (user.global_role !== 'superadmin') throw new HttpError(403, 'Super Admin access required.');
        return { session, user };
    };

    // GET /api/superadmin/users — list all admin/superadmin accounts
    if (req.method === 'GET' && pathname === '/api/superadmin/users') {
        await requireSuperAdmin();
        const { rows } = await query(`
            SELECT
                u.id,
                u.name,
                u.email,
                u.global_role AS role,
                u.created_at,
                COUNT(DISTINCT m.org_id)::int AS org_count
            FROM users u
            LEFT JOIN org_members m ON m.user_id = u.id
            WHERE u.global_role IN ('superadmin', 'admin')
            GROUP BY u.id
            ORDER BY
                CASE u.global_role WHEN 'superadmin' THEN 0 ELSE 1 END,
                u.created_at ASC
        `);
        sendJson(req, res, 200, {
            users: rows.map((r) => ({
                id: r.id,
                name: r.name,
                email: r.email,
                role: r.role,
                org_count: r.org_count,
                created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
            })),
        });
        return;
    }

    // POST /api/superadmin/users — create a new admin or superadmin account
    match = pathname.match(/^\/api\/superadmin\/admins\/([^/]+)\/details$/);
    if (req.method === 'GET' && match) {
        await requireSuperAdmin();
        const adminId = decodeURIComponent(match[1]);

        const adminResult = await query(`
            SELECT
                u.id,
                u.name,
                u.email,
                u.global_role AS role,
                u.created_at,
                COUNT(DISTINCT m.org_id)::int AS org_count
            FROM users u
            LEFT JOIN org_members m ON m.user_id = u.id
            WHERE u.id = $1
              AND u.global_role IN ('admin', 'superadmin')
            GROUP BY u.id
            LIMIT 1
        `, [adminId]);

        if (adminResult.rows.length === 0) throw new HttpError(404, 'Admin user not found.');
        const admin = adminResult.rows[0];

        const orgResult = await query(`
            SELECT
                o.id,
                o.name,
                o.slug,
                o.created_at,
                COUNT(DISTINCT sub.user_id)::int AS subadmin_count,
                COUNT(DISTINCT student.user_id)::int AS student_count,
                COUNT(DISTINCT t.id)::int AS exam_count,
                COUNT(DISTINCT ta.id)::int AS attempt_count,
                COUNT(DISTINCT s.id)::int AS submission_count
            FROM org_members owner
            JOIN organizations o ON o.id = owner.org_id
            LEFT JOIN org_members sub ON sub.org_id = o.id AND sub.role = 'subadmin'
            LEFT JOIN org_members student ON student.org_id = o.id AND student.role = 'student'
            LEFT JOIN tests t ON t.org_id = o.id
            LEFT JOIN test_attempts ta ON ta.org_id = o.id
            LEFT JOIN submissions s ON s.org_id = o.id
            WHERE owner.user_id = $1
              AND owner.role = 'admin'
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `, [adminId]);

        const summary = orgResult.rows.reduce((acc, row) => ({
            organizations: acc.organizations + 1,
            subadmins: acc.subadmins + Number(row.subadmin_count || 0),
            students: acc.students + Number(row.student_count || 0),
            exams: acc.exams + Number(row.exam_count || 0),
            attempts: acc.attempts + Number(row.attempt_count || 0),
            submissions: acc.submissions + Number(row.submission_count || 0),
        }), {
            organizations: 0,
            subadmins: 0,
            students: 0,
            exams: 0,
            attempts: 0,
            submissions: 0,
        });

        sendJson(req, res, 200, {
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                org_count: admin.org_count,
                created_at: admin.created_at instanceof Date ? admin.created_at.toISOString() : admin.created_at,
            },
            summary,
            organizations: orgResult.rows.map((row) => ({
                id: row.id,
                name: row.name,
                slug: row.slug,
                created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
                subadmin_count: row.subadmin_count,
                student_count: row.student_count,
                exam_count: row.exam_count,
                attempt_count: row.attempt_count,
                submission_count: row.submission_count,
            })),
        });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/superadmin/users') {
        await requireSuperAdmin();
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const role = body.role === 'superadmin' ? 'superadmin' : 'admin';

        if (!name || !email || !password) throw new HttpError(400, 'Name, email, and password are required.');
        if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');

        const existing = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
        if (existing.rows.length > 0) throw new HttpError(409, 'An account with that email already exists.');

        const userId = randomUUID();
        const { rows } = await query(`
            INSERT INTO users (id, name, email, password_hash, global_role, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, name, email, global_role, created_at
        `, [userId, name, email, hashPassword(password), role, now()]);

        const created = rows[0];
        sendJson(req, res, 201, {
            user: {
                id: created.id,
                name: created.name,
                email: created.email,
                role: created.global_role,
                org_count: 0,
                created_at: created.created_at instanceof Date ? created.created_at.toISOString() : created.created_at,
            },
        });
        return;
    }

    // PATCH /api/superadmin/users/:id/role — change global role
    match = pathname.match(/^\/api\/superadmin\/users\/([^/]+)\/role$/);
    if (req.method === 'PATCH' && match) {
        const { user: actor } = await requireSuperAdmin();
        const targetId = decodeURIComponent(match[1]);
        if (targetId === actor.id) throw new HttpError(400, 'You cannot change your own role.');
        const newRole = body.role === 'superadmin' ? 'superadmin' : 'admin';

        const { rows } = await query(`
            UPDATE users SET global_role = $1 WHERE id = $2 AND global_role IN ('superadmin', 'admin')
            RETURNING id, name, email, global_role, created_at
        `, [newRole, targetId]);

        if (rows.length === 0) throw new HttpError(404, 'Admin user not found.');
        const u = rows[0];
        sendJson(req, res, 200, {
            user: {
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.global_role,
                created_at: u.created_at instanceof Date ? u.created_at.toISOString() : u.created_at,
            },
        });
        return;
    }

    // DELETE /api/superadmin/users/:id — remove an admin/superadmin account
    match = pathname.match(/^\/api\/superadmin\/users\/([^/]+)\/password$/);
    if (req.method === 'PATCH' && match) {
        await requireSuperAdmin();
        const targetId = decodeURIComponent(match[1]);
        const password = String(body.password || '');

        if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');

        const { rows } = await query(`
            UPDATE users
            SET password_hash = $1
            WHERE id = $2
              AND global_role IN ('superadmin', 'admin')
            RETURNING id, name, email, global_role, created_at
        `, [hashPassword(password), targetId]);

        if (rows.length === 0) throw new HttpError(404, 'Admin user not found.');
        await query('DELETE FROM sessions WHERE user_id = $1', [targetId]);
        const u = rows[0];
        sendJson(req, res, 200, {
            user: {
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.global_role,
                created_at: u.created_at instanceof Date ? u.created_at.toISOString() : u.created_at,
            },
        });
        return;
    }

    match = pathname.match(/^\/api\/superadmin\/users\/([^/]+)$/);
    if (req.method === 'DELETE' && match) {
        const { user: actor } = await requireSuperAdmin();
        const targetId = decodeURIComponent(match[1]);
        if (targetId === actor.id) throw new HttpError(400, 'You cannot delete your own account.');

        const { rowCount } = await query(
            `DELETE FROM users WHERE id = $1 AND global_role IN ('superadmin', 'admin')`,
            [targetId],
        );
        if (rowCount === 0) throw new HttpError(404, 'Admin user not found.');
        sendEmpty(req, res, 204);
        return;
    }

    throw new HttpError(404, 'Route not found.');
};
