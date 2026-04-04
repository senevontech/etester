import { Pool } from 'pg';
import './env.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL. Add it to .env before starting the server.');
}

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export const query = (text, params = []) => pool.query(text, params);

export const transaction = async (fn) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const initDb = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS organizations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            invite_code TEXT NOT NULL UNIQUE,
            invite_code_expiry TIMESTAMPTZ,
            invite_code_max_usage INTEGER,
            created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
            actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            ip_address TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS org_members (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
            joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (org_id, user_id)
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS groups (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS group_members (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (group_id, user_id)
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS tests (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            duration INTEGER NOT NULL DEFAULT 60,
            difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
            tags JSONB NOT NULL DEFAULT '[]'::jsonb,
            visibility TEXT NOT NULL DEFAULT 'assigned_only' CHECK (visibility IN ('assigned_only', 'org_public')),
            published BOOLEAN NOT NULL DEFAULT FALSE,
            start_at TIMESTAMPTZ,
            created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS test_assignments (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
            student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK ((student_id IS NOT NULL AND group_id IS NULL) OR (student_id IS NULL AND group_id IS NOT NULL))
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK (type IN ('mcq', 'code', 'text', 'numeric')),
            category TEXT NOT NULL DEFAULT 'mcq',
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            image_url TEXT,
            points INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0,
            options JSONB,
            answer INTEGER,
            accepted_answers JSONB,
            case_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
            numeric_answer DOUBLE PRECISION,
            numeric_tolerance DOUBLE PRECISION NOT NULL DEFAULT 0,
            template TEXT,
            language TEXT,
            constraints JSONB,
            examples JSONB,
            test_cases JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS test_attempts (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL CHECK (status IN ('active', 'submitted', 'expired', 'abandoned', 'in_progress', 'completed')),
            answers JSONB NOT NULL DEFAULT '[]'::jsonb,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            submitted_at TIMESTAMPTZ,
            violations_count INTEGER NOT NULL DEFAULT 0,
            violation_score INTEGER DEFAULT 0,
            integrity_events JSONB NOT NULL DEFAULT '[]'::jsonb,
            ip_address TEXT,
            user_agent TEXT
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS attempt_logs (
            id TEXT PRIMARY KEY,
            attempt_id TEXT NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS attempt_evidence (
            id TEXT PRIMARY KEY,
            attempt_id TEXT NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK (kind IN ('webcam_snapshot')),
            mime_type TEXT NOT NULL,
            image_data TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            sha256 TEXT NOT NULL,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            captured_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS submissions (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            student_name TEXT NOT NULL,
            attempt_id TEXT UNIQUE,
            answers JSONB NOT NULL DEFAULT '[]'::jsonb,
            score INTEGER NOT NULL DEFAULT 0,
            total_points INTEGER NOT NULL DEFAULT 0,
            integrity_score INTEGER NOT NULL DEFAULT 100,
            violations_count INTEGER NOT NULL DEFAULT 0,
            integrity_events JSONB NOT NULL DEFAULT '[]'::jsonb,
            submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        ALTER TABLE questions
        ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'mcq';
    `);

    await query(`
        ALTER TABLE tests
        ADD COLUMN IF NOT EXISTS visibility TEXT;
    `);

    await query(`
        UPDATE tests t
        SET visibility = CASE
            WHEN EXISTS (SELECT 1 FROM test_assignments ta WHERE ta.test_id = t.id) THEN 'assigned_only'
            ELSE 'org_public'
        END
        WHERE visibility IS NULL;
    `);

    await query(`
        ALTER TABLE tests
        ALTER COLUMN visibility SET DEFAULT 'assigned_only';
    `);

    await query(`
        ALTER TABLE tests
        DROP CONSTRAINT IF EXISTS tests_visibility_check;
    `);

    await query(`
        ALTER TABLE tests
        ADD CONSTRAINT tests_visibility_check CHECK (visibility IN ('assigned_only', 'org_public'));
    `);

    await query(`
        ALTER TABLE tests
        ALTER COLUMN visibility SET NOT NULL;
    `);

    await query(`
        ALTER TABLE questions
        ADD COLUMN IF NOT EXISTS image_url TEXT;
    `);

    await query(`
        ALTER TABLE questions
        ADD COLUMN IF NOT EXISTS test_cases JSONB;
    `);

    await query(`
        ALTER TABLE questions
        ADD COLUMN IF NOT EXISTS accepted_answers JSONB;
    `);

    await query(`
        ALTER TABLE questions
        ADD COLUMN IF NOT EXISTS case_sensitive BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await query(`
        ALTER TABLE questions
        ADD COLUMN IF NOT EXISTS numeric_answer DOUBLE PRECISION;
    `);

    await query(`
        ALTER TABLE questions
        ADD COLUMN IF NOT EXISTS numeric_tolerance DOUBLE PRECISION NOT NULL DEFAULT 0;
    `);

    await query(`
        ALTER TABLE questions
        DROP CONSTRAINT IF EXISTS questions_type_check;
    `);

    await query(`
        ALTER TABLE questions
        ADD CONSTRAINT questions_type_check CHECK (type IN ('mcq', 'code', 'text', 'numeric'));
    `);

    await query(`
        ALTER TABLE test_attempts
        ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);

    await query(`
        ALTER TABLE submissions
        ADD COLUMN IF NOT EXISTS integrity_events JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);

    await query(`
        ALTER TABLE submissions
        ADD COLUMN IF NOT EXISTS attempt_id TEXT;
    `);

    await query('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);');
    await query('CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_members(org_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_tests_org_id ON tests(org_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_questions_test_id ON questions(test_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_test_attempts_test_student ON test_attempts(test_id, student_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_test_attempts_status ON test_attempts(status);');
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_test_attempts_active_unique ON test_attempts (test_id, student_id) WHERE status = 'active';`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_test_attempts_submitted_unique ON test_attempts (test_id, student_id) WHERE status = 'submitted';`);
    await query('CREATE INDEX IF NOT EXISTS idx_submissions_org_id ON submissions(org_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions(student_id);');
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_attempt_id_unique ON submissions (attempt_id) WHERE attempt_id IS NOT NULL;`);

    await query('CREATE INDEX IF NOT EXISTS idx_groups_org_id ON groups(org_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_test_assignments_test_id ON test_assignments(test_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_attempt_logs_attempt_id ON attempt_logs(attempt_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_attempt_evidence_attempt_id ON attempt_evidence(attempt_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_attempt_evidence_captured_at ON attempt_evidence(captured_at DESC);');
};

export const closeDb = async () => {
    await pool.end();
};
