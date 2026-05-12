/**
 * seed.ts - seeds the superadmin account.
 *
 * Usage:
 *   node src/seed.ts
 *
 * Override defaults via environment variables:
 *   SUPERADMIN_EMAIL=owner@example.com SUPERADMIN_PASSWORD=MySecret123 node src/seed.ts
 */

import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import './utils/env.ts';
import { initDb, query, closeDb } from './services/db.ts';

const SUPERADMIN_EMAIL    = process.env.SUPERADMIN_EMAIL    || 'superadmin@etester.com';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@2025';
const SUPERADMIN_NAME     = process.env.SUPERADMIN_NAME     || 'Super Admin';

const hashPassword = (password) => {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
    return `${salt}:${hash}`;
};

const run = async () => {
    console.log('⏳  Initialising database schema…');
    await initDb();

    // Check if a superadmin already exists
    const existing = await query(
        `SELECT id, email FROM users WHERE global_role = 'superadmin' LIMIT 1`,
    );

    if (existing.rows.length > 0) {
        const sa = existing.rows[0];
        console.log(`✅  Superadmin already exists → ${sa.email} (id: ${sa.id})`);
        console.log('    To reset credentials, delete the row and re-run this script.');
        await closeDb();
        return;
    }

    // Check if the target email is already taken by a non-superadmin account
    const emailTaken = await query(
        `SELECT id, global_role FROM users WHERE email = $1 LIMIT 1`,
        [SUPERADMIN_EMAIL],
    );

    if (emailTaken.rows.length > 0) {
        const row = emailTaken.rows[0];
        if (row.global_role !== 'superadmin') {
            // Promote the existing user to superadmin
            await query(
                `UPDATE users SET global_role = 'superadmin' WHERE id = $1`,
                [row.id],
            );
            console.log(`⬆️   Promoted existing user ${SUPERADMIN_EMAIL} to superadmin (id: ${row.id})`);
        }
        await closeDb();
        return;
    }

    // Create fresh superadmin
    const id = randomUUID();
    await query(
        `INSERT INTO users (id, name, email, password_hash, global_role, created_at)
         VALUES ($1, $2, $3, $4, 'superadmin', NOW())`,
        [id, SUPERADMIN_NAME, SUPERADMIN_EMAIL, hashPassword(SUPERADMIN_PASSWORD)],
    );

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║        SUPERADMIN ACCOUNT CREATED            ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Email    : ${SUPERADMIN_EMAIL.padEnd(32)} ║`);
    console.log(`║  Password : ${SUPERADMIN_PASSWORD.padEnd(32)} ║`);
    console.log(`║  ID       : ${id.slice(0, 32)} ║`);
    console.log('╠══════════════════════════════════════════════╣');
    console.log('║  ⚠️  Change the password after first login!   ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');

    await closeDb();
};

run().catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
