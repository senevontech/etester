import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');

const loadEnvFile = async () => {
    try {
        const raw = await fs.readFile(ENV_FILE, 'utf8');
        raw.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const separatorIndex = trimmed.indexOf('=');
            if (separatorIndex <= 0) return;
            const key = trimmed.slice(0, separatorIndex).trim();
            const value = trimmed.slice(separatorIndex + 1).trim();
            if (!process.env[key]) process.env[key] = value;
        });
    } catch {
        // .env is optional if variables already exist in the environment.
    }
};

await loadEnvFile();

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
        CREATE TABLE IF NOT EXISTS tests (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            duration INTEGER NOT NULL DEFAULT 60,
            difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
            tags JSONB NOT NULL DEFAULT '[]'::jsonb,
            published BOOLEAN NOT NULL DEFAULT FALSE,
            created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK (type IN ('mcq', 'code')),
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            points INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0,
            options JSONB,
            answer INTEGER,
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
            status TEXT NOT NULL CHECK (status IN ('active', 'submitted', 'expired', 'abandoned')),
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            submitted_at TIMESTAMPTZ,
            violations_count INTEGER NOT NULL DEFAULT 0,
            integrity_events JSONB NOT NULL DEFAULT '[]'::jsonb
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
        ADD COLUMN IF NOT EXISTS test_cases JSONB;
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
};

export const closeDb = async () => {
    await pool.end();
};
