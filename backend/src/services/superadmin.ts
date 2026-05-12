import { randomBytes, pbkdf2Sync, randomUUID } from 'node:crypto';
import { query } from './db.ts';

const SUPERADMIN_EMAIL = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
const SUPERADMIN_PASSWORD = String(process.env.SUPERADMIN_PASSWORD || '');
const SUPERADMIN_NAME = String(process.env.SUPERADMIN_NAME || 'Super Admin').trim() || 'Super Admin';

const hashPassword = (password) => {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
    return `${salt}:${hash}`;
};

export const syncSuperadminFromEnv = async () => {
    if (!SUPERADMIN_EMAIL && !SUPERADMIN_PASSWORD) return;

    if (!SUPERADMIN_EMAIL || !SUPERADMIN_EMAIL.includes('@')) {
        throw new Error('SUPERADMIN_EMAIL must be set to a valid email address.');
    }

    if (!SUPERADMIN_PASSWORD || SUPERADMIN_PASSWORD.length < 8) {
        throw new Error('SUPERADMIN_PASSWORD must be at least 8 characters.');
    }

    const existing = await query(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [SUPERADMIN_EMAIL],
    );

    if (existing.rows.length > 0) {
        const row = existing.rows[0];
        await query(
            `UPDATE users
             SET name = $1, password_hash = $2, global_role = 'superadmin'
             WHERE id = $3`,
            [SUPERADMIN_NAME, hashPassword(SUPERADMIN_PASSWORD), row.id],
        );
        console.log(`Superadmin synced from environment: ${SUPERADMIN_EMAIL} (id: ${row.id})`);
        return;
    }

    const id = randomUUID();
    await query(
        `INSERT INTO users (id, name, email, password_hash, global_role, created_at)
         VALUES ($1, $2, $3, $4, 'superadmin', NOW())`,
        [id, SUPERADMIN_NAME, SUPERADMIN_EMAIL, hashPassword(SUPERADMIN_PASSWORD)],
    );

    console.log(`Superadmin created from environment: ${SUPERADMIN_EMAIL} (id: ${id})`);
};
