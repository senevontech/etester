import { read, utils } from 'xlsx';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf.mjs';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { McqQuestion, CodeQuestion } from '../types';

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export type ImportedQuestionDraft = Omit<McqQuestion, 'id'> | Omit<CodeQuestion, 'id'>;

export interface QuestionImportResult {
    questions: ImportedQuestionDraft[];
    warnings: string[];
}

const SUPPORTED_SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xls', 'csv']);
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set(['txt', 'md', 'doc', 'docx', 'pdf', 'json', 'rtf']);
const HEADER_ALIASES = {
    type: ['type', 'questiontype'],
    category: ['category', 'kind'],
    title: ['title', 'question', 'prompt', 'name'],
    description: ['description', 'details', 'body', 'statement'],
    points: ['points', 'marks', 'score'],
    options: ['options', 'choices'],
    answer: ['answer', 'correctanswer', 'correctoption'],
    language: ['language', 'lang'],
    template: ['template', 'startercode', 'starter', 'code', 'boilerplate'],
    constraints: ['constraints', 'constraint'],
    examples: ['examples', 'example'],
    testCases: ['testcases', 'judgecases', 'cases'],
} as const;

const getExtension = (name: string) => {
    const match = /\.([^.]+)$/.exec(name.toLowerCase());
    return match?.[1] ?? '';
};

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const normalizeCell = (value: unknown) => String(value ?? '').replace(/\r\n/g, '\n').trim();

const getFirstValue = (record: Record<string, unknown>, aliases: readonly string[]) => {
    for (const alias of aliases) {
        if (record[alias] !== undefined) return record[alias];
    }
    return '';
};

const parsePositiveInt = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};

const cleanListItem = (value: string) => value
    .trim()
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^[A-Za-z][.)]\s+/, '')
    .trim();

const splitLooseList = (value: unknown) => {
    const text = normalizeCell(value);
    if (!text) return [];

    const source = text.includes('\n')
        ? text.split('\n')
        : text.includes('|')
            ? text.split('|')
            : text.includes(';')
                ? text.split(';')
                : [text];

    return source.map(cleanListItem).filter(Boolean);
};

const splitOptionColumns = (record: Record<string, unknown>) => {
    const options = Object.entries(record)
        .filter(([key]) => /^option[0-9]+$/.test(key))
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([, value]) => normalizeCell(value))
        .filter(Boolean);

    return options;
};

const normalizeMcqAnswer = (rawAnswer: unknown, options: string[]) => {
    if (options.length === 0) return 0;

    const answerText = normalizeCell(rawAnswer);
    if (!answerText) return 0;

    const numeric = Number(answerText);
    if (Number.isInteger(numeric)) {
        if (numeric >= 1 && numeric <= options.length) return numeric - 1;
        if (numeric >= 0 && numeric < options.length) return numeric;
    }

    if (/^[A-Za-z]$/.test(answerText)) {
        const index = answerText.toUpperCase().charCodeAt(0) - 65;
        if (index >= 0 && index < options.length) return index;
    }

    const byText = options.findIndex((option) => option.toLowerCase() === answerText.toLowerCase());
    return byText >= 0 ? byText : 0;
};

const splitCaseSegments = (value: unknown) => {
    const text = normalizeCell(value);
    if (!text) return [];
    if (text.includes('||')) return text.split('||').map((segment) => segment.trim()).filter(Boolean);
    if (/\n\s*\n/.test(text)) return text.split(/\n\s*\n/).map((segment) => segment.trim()).filter(Boolean);
    return text.split('\n').map((segment) => segment.trim()).filter(Boolean);
};

const parseInputOutputSegment = (segment: string) => {
    const hidden = /\bhidden\b/i.test(segment) && !/\bpublic\b/i.test(segment);
    const cleaned = segment
        .replace(/^hidden\s*[:|-]?\s*/i, '')
        .replace(/^public\s*[:|-]?\s*/i, '')
        .trim();

    const arrowIndex = cleaned.indexOf('=>');
    if (arrowIndex >= 0) {
        const input = cleaned.slice(0, arrowIndex).replace(/^input\s*:\s*/i, '').trim();
        const output = cleaned.slice(arrowIndex + 2).replace(/^output\s*:\s*/i, '').trim();
        if (input || output) return { input, output, hidden };
    }

    const labeledMatch = cleaned.match(/input\s*:\s*([\s\S]*?)\noutput\s*:\s*([\s\S]*)/i);
    if (labeledMatch) {
        return {
            input: labeledMatch[1].trim(),
            output: labeledMatch[2].trim(),
            hidden,
        };
    }

    const pipeMatch = cleaned.match(/input\s*=\s*([\s\S]*?)\s*\|\s*output\s*=\s*([\s\S]*)/i);
    if (pipeMatch) {
        return {
            input: pipeMatch[1].trim(),
            output: pipeMatch[2].trim(),
            hidden,
        };
    }

    return null;
};

const parseExamples = (value: unknown) => splitCaseSegments(value)
    .map(parseInputOutputSegment)
    .filter((item): item is { input: string; output: string; hidden: boolean } => Boolean(item))
    .map(({ input, output }) => ({ input, output }));

const parseTestCases = (value: unknown) => splitCaseSegments(value)
    .map(parseInputOutputSegment)
    .filter((item): item is { input: string; output: string; hidden: boolean } => Boolean(item));

const inferQuestionType = (record: Record<string, unknown>) => {
    const explicit = normalizeCell(getFirstValue(record, HEADER_ALIASES.type));
    if (explicit.toLowerCase() === 'code') return 'code';
    if (explicit.toLowerCase() === 'mcq') return 'mcq';

    const language = normalizeCell(getFirstValue(record, HEADER_ALIASES.language));
    const template = normalizeCell(getFirstValue(record, HEADER_ALIASES.template));
    const testCases = normalizeCell(getFirstValue(record, HEADER_ALIASES.testCases));
    return language || template || testCases ? 'code' : 'mcq';
};

const inferQuestionCategory = (record: Record<string, unknown>, type: 'mcq' | 'code') => {
    const explicit = normalizeCell(getFirstValue(record, HEADER_ALIASES.category)).toLowerCase();
    if (explicit === 'aptitude') return 'aptitude';
    if (explicit === 'coding') return 'coding';
    if (explicit === 'mcq') return 'mcq';
    return type === 'code' ? 'coding' : 'mcq';
};

const isEmptyRecord = (record: Record<string, unknown>) =>
    Object.values(record).every((value) => normalizeCell(value) === '');

const buildQuestionFromRecord = (
    record: Record<string, unknown>,
    label: string,
    warnings: string[],
): ImportedQuestionDraft | null => {
    if (isEmptyRecord(record)) return null;

    const type = inferQuestionType(record);
    const category = inferQuestionCategory(record, type);
    const title = normalizeCell(getFirstValue(record, HEADER_ALIASES.title));
    const description = normalizeCell(getFirstValue(record, HEADER_ALIASES.description));
    const points = parsePositiveInt(getFirstValue(record, HEADER_ALIASES.points), type === 'code' ? 20 : 10);

    if (!title) {
        warnings.push(`${label} was skipped because it has no title.`);
        return null;
    }

    if (type === 'mcq') {
        const options = [
            ...splitLooseList(getFirstValue(record, HEADER_ALIASES.options)),
            ...splitOptionColumns(record),
        ].filter(Boolean);

        if (options.length < 2) {
            warnings.push(`${label} was skipped because MCQ items need at least two options.`);
            return null;
        }

        return {
            type: 'mcq',
            category,
            title,
            description,
            options,
            answer: normalizeMcqAnswer(getFirstValue(record, HEADER_ALIASES.answer), options),
            points,
        };
    }

    const language = normalizeCell(getFirstValue(record, HEADER_ALIASES.language)) || 'typescript';
    const template = normalizeCell(getFirstValue(record, HEADER_ALIASES.template)) || '// Write your solution here';
    const constraints = splitLooseList(getFirstValue(record, HEADER_ALIASES.constraints));
    const examples = parseExamples(getFirstValue(record, HEADER_ALIASES.examples));
    const testCases = parseTestCases(getFirstValue(record, HEADER_ALIASES.testCases));

    if (testCases.length > 0 && !testCases.some((testCase) => testCase.hidden)) {
        warnings.push(`${label} was imported without hidden code cases. Add at least one hidden judge case before publishing.`);
    }

    return {
        type: 'code',
        category: 'coding',
        title,
        description,
        template,
        language,
        constraints,
        examples,
        testCases,
        points,
    };
};

const normalizeObjectRecord = (record: Record<string, unknown>) => Object.fromEntries(
    Object.entries(record).map(([key, value]) => [normalizeHeader(key), value]),
);

const parseSpreadsheetFile = async (file: File) => {
    const workbook = read(await file.arrayBuffer(), { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    const rows = firstSheet
        ? utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: '' })
        : [];

    const warnings: string[] = [];
    const questions = rows
        .map((row, index) => buildQuestionFromRecord(normalizeObjectRecord(row), `Row ${index + 2}`, warnings))
        .filter((question): question is ImportedQuestionDraft => Boolean(question));

    if (rows.length === 0) {
        warnings.push('No rows were found in the first sheet.');
    }

    return { questions, warnings };
};

const parseJsonQuestions = (text: string) => {
    try {
        const parsed = JSON.parse(text) as unknown;
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown[] }).questions)) {
            return (parsed as { questions: unknown[] }).questions;
        }
        if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
        return null;
    }
    return null;
};

const splitStructuredBlocks = (text: string) => {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const byDivider = normalized.split(/\n\s*---+\s*\n/g).map((block) => block.trim()).filter(Boolean);
    if (byDivider.length > 1) return byDivider;

    return normalized
        .split(/\n{2,}(?=(?:Question\s+\d+|Q\d+|Type|Title)\s*:)/i)
        .map((block) => block.trim())
        .filter(Boolean);
};

const parseStructuredBlock = (block: string) => {
    const lines = block.replace(/\r\n/g, '\n').split('\n');
    const record: Record<string, string> = {};
    const preamble: string[] = [];
    let currentKey: string | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line.trim() && currentKey) {
            record[currentKey] = `${record[currentKey]}\n`;
            continue;
        }

        const fieldMatch = line.match(/^\s*([A-Za-z ]+?)\s*:\s*(.*)$/);
        if (fieldMatch) {
            currentKey = normalizeHeader(fieldMatch[1]);
            record[currentKey] = fieldMatch[2].trim();
            continue;
        }

        if (currentKey) {
            record[currentKey] = `${record[currentKey]}\n${line}`.trim();
        } else if (line.trim()) {
            preamble.push(line.trim());
        }
    }

    if (!record.title && !record.question && !record.prompt && preamble.length > 0) {
        record.title = preamble[0];
        if (preamble.length > 1) {
            record.description = preamble.slice(1).join('\n');
        }
    }

    return record;
};

const extractTextFromDocument = async (file: File) => {
    const extension = getExtension(file.name);

    if (extension === 'docx') {
        const mammoth = await import('mammoth') as unknown as {
            extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{
                value: string;
                messages: Array<{ message: string }>;
            }>;
        };
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        return {
            text: result.value,
            warnings: result.messages.map((message: { message: string }) => message.message),
        };
    }

    if (extension === 'pdf') {
        const document = await getDocument({ data: await file.arrayBuffer() }).promise;
        const pages: string[] = [];

        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
            const page = await document.getPage(pageNumber);
            const content = await page.getTextContent();
            pages.push(content.items.map(getPdfTextItem).join(' '));
        }

        return { text: pages.join('\n\n'), warnings: [] };
    }

    const text = await file.text();
    const warnings = extension === 'doc'
        ? ['Legacy .doc parsing is best-effort. Prefer .docx if the imported text looks incomplete.']
        : [];
    return { text, warnings };
};

const parseDocumentFile = async (file: File) => {
    const { text, warnings } = await extractTextFromDocument(file);
    const normalizedText = text.trim();
    if (!normalizedText) {
        return {
            questions: [],
            warnings: [...warnings, 'The file did not contain readable text.'],
        };
    }

    const jsonQuestions = parseJsonQuestions(normalizedText);
    if (jsonQuestions) {
        const jsonWarnings = [...warnings];
        const questions = jsonQuestions
            .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
            .map((entry, index) => buildQuestionFromRecord(normalizeObjectRecord(entry), `Item ${index + 1}`, jsonWarnings))
            .filter((question): question is ImportedQuestionDraft => Boolean(question));
        return { questions, warnings: jsonWarnings };
    }

    const blocks = splitStructuredBlocks(normalizedText);
    const parserWarnings = [...warnings];
    const questions = blocks
        .map((block, index) => buildQuestionFromRecord(parseStructuredBlock(block), `Block ${index + 1}`, parserWarnings))
        .filter((question): question is ImportedQuestionDraft => Boolean(question));

    if (blocks.length === 0) {
        parserWarnings.push('No recognizable question blocks were found.');
    }

    return { questions, warnings: parserWarnings };
};

const getPdfTextItem = (item: unknown) => {
    if (!item || typeof item !== 'object' || !('str' in item)) return '';
    return typeof item.str === 'string' ? item.str : '';
};

export const parseQuestionImportFile = async (file: File): Promise<QuestionImportResult> => {
    const extension = getExtension(file.name);

    if (SUPPORTED_SPREADSHEET_EXTENSIONS.has(extension)) {
        return parseSpreadsheetFile(file);
    }

    if (SUPPORTED_DOCUMENT_EXTENSIONS.has(extension)) {
        return parseDocumentFile(file);
    }

    return {
        questions: [],
        warnings: [`Unsupported file type ".${extension || 'unknown'}". Use Excel, CSV, DOCX, PDF, TXT, or JSON.`],
    };
};
