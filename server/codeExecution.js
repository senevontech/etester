import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const EXECUTION_PROVIDER = process.env.CODE_EXECUTION_PROVIDER || 'disabled';
const EXECUTION_TIMEOUT_MS = Math.max(1000, Number(process.env.CODE_EXECUTION_TIMEOUT_MS || 4000));
const MAX_OUTPUT_BYTES = Math.max(1024, Number(process.env.CODE_EXECUTION_MAX_OUTPUT_BYTES || 8192));
const MAX_STDIN_BYTES = Math.max(256, Number(process.env.CODE_EXECUTION_MAX_STDIN_BYTES || 16384));
const EXECUTION_API_URL = process.env.CODE_EXECUTION_API_URL || '';
const EXECUTION_API_TOKEN = process.env.CODE_EXECUTION_API_TOKEN || '';
const SUPPORTED_LOCAL_LANGUAGES = new Set(['javascript', 'typescript']);

const clampOutput = (value) => {
    if (value.length <= MAX_OUTPUT_BYTES) return value;
    return `${value.slice(0, MAX_OUTPUT_BYTES)}\n...[truncated]`;
};

const clampInput = (value) => String(value || '').slice(0, MAX_STDIN_BYTES);

const normalizeRunResult = (result) => {
    const run = result?.run ?? result ?? {};
    const stdout = clampOutput(String(run.stdout || ''));
    const stderr = clampOutput(String(run.stderr || ''));
    const output = clampOutput(String(run.output || stdout || stderr || 'No output'));
    const numericCode = Number(run.code);
    const code = Number.isFinite(numericCode) ? numericCode : 1;
    const signal = run.signal === null || run.signal === undefined ? null : String(run.signal);

    return {
        run: {
            stdout,
            stderr,
            output,
            code,
            signal,
        },
    };
};

const transpileTypescript = async (source) => {
    const esbuild = await import('esbuild');
    const result = await esbuild.transform(source, {
        loader: 'ts',
        format: 'esm',
        target: 'es2020',
    });
    return result.code;
};

const runLocalNode = async (language, code, stdin = '') => {
    if (!SUPPORTED_LOCAL_LANGUAGES.has(language)) {
        throw new Error(`Local execution does not support ${language}.`);
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'etester-run-'));
    const filePath = path.join(tempDir, `${randomUUID()}.mjs`);
    const executableCode = language === 'typescript' ? await transpileTypescript(code) : code;

    try {
        await fs.writeFile(filePath, executableCode, 'utf8');

        return await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [filePath], {
                cwd: tempDir,
                env: {},
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });

            let stdout = '';
            let stderr = '';
            let settled = false;
            let killedForTimeout = false;

            const finish = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };

            const fail = (error) => {
                if (settled) return;
                settled = true;
                reject(error);
            };

            const timeout = setTimeout(() => {
                killedForTimeout = true;
                child.kill();
            }, EXECUTION_TIMEOUT_MS);

            child.stdout.on('data', (chunk) => {
                stdout = clampOutput(stdout + chunk.toString('utf8'));
            });

            child.stderr.on('data', (chunk) => {
                stderr = clampOutput(stderr + chunk.toString('utf8'));
            });

            child.stdin.on('error', () => {
                // Ignore stdin pipe closure after process exit.
            });

            if (stdin) {
                child.stdin.write(clampInput(stdin), 'utf8');
            }
            child.stdin.end();

            child.on('error', (error) => {
                clearTimeout(timeout);
                fail(error);
            });

            child.on('close', (codeValue, signal) => {
                clearTimeout(timeout);

                if (killedForTimeout) {
                    finish({
                        run: {
                            stdout: clampOutput(stdout),
                            stderr: 'Execution timed out.',
                            output: clampOutput(stdout || stderr || 'Execution timed out.'),
                            code: 124,
                            signal: signal ?? 'SIGTERM',
                        },
                    });
                    return;
                }

                const normalizedStdout = clampOutput(stdout);
                const normalizedStderr = clampOutput(stderr);
                finish({
                    run: {
                        stdout: normalizedStdout,
                        stderr: normalizedStderr,
                        output: clampOutput(normalizedStdout || normalizedStderr || 'No output'),
                        code: typeof codeValue === 'number' ? codeValue : 1,
                        signal: signal ?? null,
                    },
                });
            });
        });
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
};

const runRemoteExecution = async (language, code, stdin = '') => {
    if (!EXECUTION_API_URL) {
        throw new Error('CODE_EXECUTION_API_URL is required for the http execution provider.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT_MS);

    try {
        const response = await fetch(EXECUTION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(EXECUTION_API_TOKEN ? { Authorization: `Bearer ${EXECUTION_API_TOKEN}` } : {}),
            },
            body: JSON.stringify({
                language,
                code,
                stdin: clampInput(stdin),
            }),
            signal: controller.signal,
        });

        let payload;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!response.ok) {
            const message = payload?.error || payload?.message || `Execution provider returned ${response.status}.`;
            throw new Error(String(message));
        }

        return normalizeRunResult(payload);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return normalizeRunResult({
                run: {
                    stderr: 'Execution timed out.',
                    output: 'Execution timed out.',
                    code: 124,
                    signal: 'timeout',
                },
            });
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
};

export const executeSnippet = async (language, code, options = {}) => {
    const normalizedLanguage = String(language || 'javascript').toLowerCase();
    const stdin = clampInput(options.stdin ?? '');

    if (EXECUTION_PROVIDER === 'disabled') {
        throw new Error('Code execution is disabled on this deployment.');
    }

    if (EXECUTION_PROVIDER === 'local') {
        return runLocalNode(normalizedLanguage, code, stdin);
    }

    if (EXECUTION_PROVIDER === 'http') {
        return runRemoteExecution(normalizedLanguage, code, stdin);
    }

    throw new Error(`Unknown code execution provider: ${EXECUTION_PROVIDER}`);
};

export const getExecutionProvider = () => EXECUTION_PROVIDER;
