import { createServer } from 'node:http';
import { closeDb, initDb } from './services/db.ts';
import { getExecutionProvider } from './services/codeExecution.ts';
import {
    ALLOWED_ORIGINS,
    EFFECTIVE_ALLOWED_ORIGINS,
    HttpError,
    NODE_ENV,
    sendJson,
} from './controllers/apiController.ts';
import { routeRequest } from './routes/apiRoutes.ts';

const PORT = Number(process.env.PORT || 3001);

await initDb();

const server = createServer(async (req, res) => {
    try {
        await routeRequest(req, res);
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
