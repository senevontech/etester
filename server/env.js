import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
