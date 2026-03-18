import { apiRequest } from '../lib/api';

export interface ExecuteResult {
    provider?: string;
    run: {
        stdout: string;
        stderr: string;
        output: string;
        code: number;
        signal: string | null;
    };
}

export const executeCode = async (
    testId: string,
    questionId: string,
    language: string,
    code: string
): Promise<ExecuteResult> => {
    return apiRequest<ExecuteResult>(`/tests/${testId}/questions/${questionId}/run`, {
        method: 'POST',
        body: { language, code },
    });
};
