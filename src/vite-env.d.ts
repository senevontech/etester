/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare module 'pdfjs-dist/build/pdf.mjs' {
    export * from 'pdfjs-dist';
}

declare module 'pdfjs-dist/build/pdf.worker.mjs?url' {
    const workerUrl: string;
    export default workerUrl;
}
