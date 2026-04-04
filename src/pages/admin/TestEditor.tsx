import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import {
    ArrowLeft,
    Plus,
    Trash2,
    Code2,
    ListChecks,
    Sigma,
    TextCursorInput,
    GripVertical,
    Globe,
    EyeOff,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Save,
    Upload,
    AlertTriangle,
    Pencil,
    House,
    Check,
} from 'lucide-react';
import { useTests } from '../../context/TestContext';
import { useOrg } from '../../context/OrgContext';
import { useTheme } from '../../context/ThemeContext';
import { ApiError, apiRequest } from '../../lib/api';
import {
    Question,
    McqQuestion,
    CodeQuestion,
    Difficulty,
    NumericQuestion,
    TextQuestion,
    QUESTION_CATEGORY_LABELS,
    type QuestionCategory,
    type TestVisibility,
} from '../../types';
import { ImportedQuestionDraft, parseQuestionImportFile } from '../../utils/questionImport';

interface AddQModalProps { testId: string; onClose: () => void; }
interface ImportQModalProps { testId: string; onClose: () => void; }
interface EditQModalProps { testId: string; question: Question; onClose: () => void; }

const MCQ_TEMPLATE: Omit<McqQuestion, 'id'> = {
    type: 'mcq',
    category: 'mcq',
    title: '',
    description: '',
    imageUrl: '',
    options: ['', '', '', ''],
    answer: 0,
    points: 10,
};

const CODE_TEMPLATE: Omit<CodeQuestion, 'id'> = {
    type: 'code',
    category: 'coding',
    title: '',
    description: '',
    imageUrl: '',
    template: '// Write your solution here\n',
    language: 'typescript',
    constraints: [''],
    examples: [{ input: '', output: '' }],
    testCases: [{ input: '', output: '', hidden: true }],
    points: 20,
};

const TEXT_TEMPLATE: Omit<TextQuestion, 'id'> = {
    type: 'text',
    category: 'saq',
    title: '',
    description: '',
    imageUrl: '',
    acceptedAnswers: [''],
    caseSensitive: false,
    points: 10,
};

const NUMERIC_TEMPLATE: Omit<NumericQuestion, 'id'> = {
    type: 'numeric',
    category: 'numerical',
    title: '',
    description: '',
    imageUrl: '',
    answer: 0,
    tolerance: 0,
    points: 10,
};

type QuestionPresetId = 'mcq' | 'aptitude' | 'saq' | 'numerical' | 'coding';

const QUESTION_PRESETS: Array<{
    id: QuestionPresetId;
    type: Question['type'];
    label: string;
    icon: React.ComponentType<{ size?: number }>;
}> = [
    { id: 'mcq', type: 'mcq', label: 'Multiple Choice', icon: ListChecks },
    { id: 'aptitude', type: 'mcq', label: 'Aptitude', icon: CheckCircle2 },
    { id: 'saq', type: 'text', label: 'Short Answer', icon: TextCursorInput },
    { id: 'numerical', type: 'numeric', label: 'Numerical', icon: Sigma },
    { id: 'coding', type: 'code', label: 'Coding', icon: Code2 },
];

const getPresetIdForQuestion = (question: Pick<Question, 'type' | 'category'>): QuestionPresetId => {
    if (question.type === 'mcq' && question.category === 'aptitude') return 'aptitude';
    if (question.type === 'text') return 'saq';
    if (question.type === 'numeric') return 'numerical';
    if (question.type === 'code') return 'coding';
    return 'mcq';
};

const getQuestionCategoryLabel = (question: Pick<Question, 'category'>) => QUESTION_CATEGORY_LABELS[question.category];

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
});

const cloneQuestionForForm = (question: Question): any => {
    if (question.type === 'mcq') {
        return {
            type: 'mcq',
            category: question.category,
            title: question.title,
            description: question.description,
            imageUrl: question.imageUrl ?? '',
            options: [...question.options],
            answer: question.answer ?? 0,
            points: question.points,
        };
    }

    if (question.type === 'text') {
        return {
            type: 'text',
            category: 'saq',
            title: question.title,
            description: question.description,
            imageUrl: question.imageUrl ?? '',
            acceptedAnswers: [...question.acceptedAnswers],
            caseSensitive: question.caseSensitive,
            points: question.points,
        };
    }

    if (question.type === 'numeric') {
        return {
            type: 'numeric',
            category: 'numerical',
            title: question.title,
            description: question.description,
            imageUrl: question.imageUrl ?? '',
            answer: question.answer ?? 0,
            tolerance: question.tolerance,
            points: question.points,
        };
    }

    return {
        type: 'code',
        category: 'coding',
        title: question.title,
        description: question.description,
        imageUrl: question.imageUrl ?? '',
        template: question.template,
        language: question.language,
        constraints: [...question.constraints],
        examples: question.examples.map((example) => ({ ...example })),
        testCases: (question.testCases ?? []).map((testCase) => ({ ...testCase })),
        points: question.points,
    };
};

interface QuestionModalProps {
    title: string;
    submitLabel: string;
    initialType?: Question['type'];
    initialQuestion?: Omit<Question, 'id'>;
    onClose: () => void;
    onSave: (question: any) => Promise<void> | void;
    lockType?: boolean;
}

const QuestionModal: React.FC<QuestionModalProps> = ({
    title,
    submitLabel,
    initialType = 'mcq',
    initialQuestion,
    onClose,
    onSave,
    lockType = false,
}) => {
    const { theme } = useTheme();
    const [selectedPreset, setSelectedPreset] = useState<QuestionPresetId>(
        initialQuestion ? getPresetIdForQuestion(initialQuestion) : initialType === 'code' ? 'coding' : 'mcq',
    );
    const [mcq, setMcq] = useState<Omit<McqQuestion, 'id'>>(
        initialQuestion?.type === 'mcq'
            ? {
                ...initialQuestion as McqQuestion,
                options: [...(initialQuestion as McqQuestion).options],
            } as any
            : {
                ...MCQ_TEMPLATE,
                options: [...MCQ_TEMPLATE.options],
            },
    );
    const [textQuestion, setTextQuestion] = useState<Omit<TextQuestion, 'id'>>(
        initialQuestion?.type === 'text'
            ? {
                ...initialQuestion as TextQuestion,
                acceptedAnswers: [...(initialQuestion as TextQuestion).acceptedAnswers],
            } as any
            : {
                ...TEXT_TEMPLATE,
                acceptedAnswers: [...TEXT_TEMPLATE.acceptedAnswers],
            },
    );
    const [numericQuestion, setNumericQuestion] = useState<Omit<NumericQuestion, 'id'>>(
        initialQuestion?.type === 'numeric'
            ? {
                ...initialQuestion as any,
            } as any
            : {
                ...NUMERIC_TEMPLATE,
            },
    );
    const [code, setCode] = useState<Omit<CodeQuestion, 'id'>>(
        initialQuestion?.type === 'code'
            ? {
                ...initialQuestion as CodeQuestion,
                constraints: [...(initialQuestion as CodeQuestion).constraints],
                examples: (initialQuestion as CodeQuestion).examples.map((example) => ({ ...example })),
                testCases: ((initialQuestion as CodeQuestion).testCases ?? []).map((testCase: any) => ({ ...testCase })),
            } as any
            : {
                ...CODE_TEMPLATE,
                constraints: [...CODE_TEMPLATE.constraints],
                examples: CODE_TEMPLATE.examples.map((example) => ({ ...example })),
                testCases: (CODE_TEMPLATE.testCases ?? []).map((testCase) => ({ ...testCase })),
            },
    );
    const [saving, setSaving] = useState(false);
    const [imageError, setImageError] = useState('');
    const activePreset = QUESTION_PRESETS.find((preset) => preset.id === selectedPreset) ?? QUESTION_PRESETS[0];
    const activeType = activePreset.type;
    const activeImageUrl = activeType === 'mcq'
        ? mcq.imageUrl
        : activeType === 'text'
            ? textQuestion.imageUrl
            : activeType === 'numeric'
                ? numericQuestion.imageUrl
                : code.imageUrl;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        if (activeType === 'mcq') {
            if (!mcq.title.trim()) {
                setSaving(false);
                return;
            }
            await onSave({
                ...mcq,
                category: selectedPreset === 'aptitude' ? 'aptitude' : 'mcq',
            } as any);
        } else if (activeType === 'text') {
            if (!textQuestion.title.trim()) {
                setSaving(false);
                return;
            }
            await onSave({
                ...textQuestion,
                acceptedAnswers: textQuestion.acceptedAnswers.map((answer) => answer.trim()).filter(Boolean),
            } as any);
        } else if (activeType === 'numeric') {
            if (!numericQuestion.title.trim()) {
                setSaving(false);
                return;
            }
            await onSave(numericQuestion);
        } else {
            if (!code.title.trim()) {
                setSaving(false);
                return;
            }
            await onSave(code);
        }

        setSaving(false);
        onClose();
    };

    const updateOption = (i: number, val: string) =>
        setMcq((q) => ({ ...q, options: q.options.map((o, idx) => idx === i ? val : o) }));

    const updateImage = (imageUrl: string) => {
        setImageError('');
        if (activeType === 'mcq') setMcq((q) => ({ ...q, imageUrl }));
        else if (activeType === 'text') setTextQuestion((q) => ({ ...q, imageUrl }));
        else if (activeType === 'numeric') setNumericQuestion((q) => ({ ...q, imageUrl }));
        else setCode((q) => ({ ...q, imageUrl }));
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setImageError('Please select an image file.');
            return;
        }
        if (file.size > 1_500_000) {
            setImageError('Image must be 1.5 MB or smaller.');
            return;
        }

        try {
            const dataUrl = await readFileAsDataUrl(file);
            updateImage(dataUrl);
        } catch (error) {
            setImageError(error instanceof Error ? error.message : 'Failed to load image.');
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', overflowY: 'auto' }}>
            <div className="anim-fade-up" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', width: '100%', maxWidth: '560px', boxShadow: 'var(--shadow-lg)', margin: 'auto' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 className="t-h3">{title}</h2>
                    <button className="icon-btn" onClick={onClose}>x</button>
                </div>

                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {QUESTION_PRESETS.map((preset) => {
                        const Icon = preset.icon;
                        return (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => !lockType && setSelectedPreset(preset.id)}
                            className={`btn btn-sm ${selectedPreset === preset.id ? 'btn-primary' : 'btn-outline'}`}
                            style={{ gap: '0.375rem', opacity: lockType && selectedPreset !== preset.id ? 0.6 : 1 }}
                            disabled={lockType}
                        >
                            <Icon size={13} />
                            {preset.label}
                        </button>
                        );
                    })}
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <p className="label" style={{ marginBottom: '0.375rem' }}>Question Title *</p>
                        <input
                            className="input"
                            placeholder="Short, clear question heading"
                            value={activeType === 'mcq'
                                ? mcq.title
                                : activeType === 'text'
                                    ? textQuestion.title
                                    : activeType === 'numeric'
                                        ? numericQuestion.title
                                        : code.title}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (activeType === 'mcq') setMcq((q) => ({ ...q, title: value }));
                                else if (activeType === 'text') setTextQuestion((q) => ({ ...q, title: value }));
                                else if (activeType === 'numeric') setNumericQuestion((q) => ({ ...q, title: value }));
                                else setCode((q) => ({ ...q, title: value }));
                            }}
                            required
                        />
                    </div>
                    <div>
                        <p className="label" style={{ marginBottom: '0.375rem' }}>Description / Prompt</p>
                        <textarea
                            className="input"
                            placeholder="Full description of the question..."
                            rows={3}
                            style={{ resize: 'vertical', fontFamily: 'Manrope, sans-serif' }}
                            value={activeType === 'mcq'
                                ? mcq.description
                                : activeType === 'text'
                                    ? textQuestion.description
                                    : activeType === 'numeric'
                                        ? numericQuestion.description
                                        : code.description}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (activeType === 'mcq') setMcq((q) => ({ ...q, description: value }));
                                else if (activeType === 'text') setTextQuestion((q) => ({ ...q, description: value }));
                                else if (activeType === 'numeric') setNumericQuestion((q) => ({ ...q, description: value }));
                                else setCode((q) => ({ ...q, description: value }));
                            }}
                        />
                    </div>
                    {selectedPreset === 'aptitude' && (
                        <div>
                            <p className="label" style={{ marginBottom: '0.375rem' }}>Question Image</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                <label className="btn btn-sm btn-outline" style={{ width: 'fit-content', gap: '0.375rem', cursor: 'pointer' }}>
                                    <Upload size={13} /> Upload Image
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                                </label>
                                {imageError && <p className="t-small" style={{ color: 'var(--danger)' }}>{imageError}</p>}
                                {activeImageUrl && (
                                    <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface)' }}>
                                        <img
                                            src={activeImageUrl}
                                            alt="Question reference"
                                            style={{ width: '100%', maxHeight: '220px', objectFit: 'contain', display: 'block', background: 'var(--bg-subtle)' }}
                                        />
                                        <div style={{ padding: '0.625rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => updateImage('')}>Remove Image</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <div>
                        <p className="label" style={{ marginBottom: '0.375rem' }}>Points</p>
                        <input
                            className="input"
                            type="number"
                            min={1}
                            max={100}
                            value={activeType === 'mcq'
                                ? mcq.points
                                : activeType === 'text'
                                    ? textQuestion.points
                                    : activeType === 'numeric'
                                        ? numericQuestion.points
                                        : code.points}
                            onChange={(e) => {
                                const value = Number(e.target.value);
                                if (activeType === 'mcq') setMcq((q) => ({ ...q, points: value }));
                                else if (activeType === 'text') setTextQuestion((q) => ({ ...q, points: value }));
                                else if (activeType === 'numeric') setNumericQuestion((q) => ({ ...q, points: value }));
                                else setCode((q) => ({ ...q, points: value }));
                            }}
                        />
                    </div>

                    {activeType === 'mcq' && (
                        <div>
                            <p className="label" style={{ marginBottom: '0.375rem' }}>Category</p>
                            <input className="input" value={selectedPreset === 'aptitude' ? 'Aptitude' : 'Multiple Choice'} readOnly />
                        </div>
                    )}

                    {activeType === 'mcq' && (
                        <div>
                            <p className="label" style={{ marginBottom: '0.5rem' }}>Answer Options - click radio to mark correct</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {mcq.options.map((opt, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                        <button
                                            type="button"
                                            style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${mcq.answer === i ? 'var(--text)' : 'var(--border-strong)'}`, background: mcq.answer === i ? 'var(--text)' : 'transparent', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            onClick={() => setMcq((q) => ({ ...q, answer: i }))}
                                        >
                                            {mcq.answer === i && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-fg)' }} />}
                                        </button>
                                        <input className="input" placeholder={`Option ${i + 1}`} value={opt} onChange={(e) => updateOption(i, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {activeType === 'text' && (
                        <>
                            <div>
                                <p className="label" style={{ marginBottom: '0.375rem' }}>Accepted Answers</p>
                                <textarea
                                    className="input"
                                    placeholder="One accepted answer per line"
                                    rows={3}
                                    style={{ resize: 'vertical', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}
                                    value={textQuestion.acceptedAnswers.join('\n')}
                                    onChange={(e) => setTextQuestion((q) => ({ ...q, acceptedAnswers: e.target.value.split('\n') }))}
                                />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px', fontWeight: 700, color: 'var(--text-2)' }}>
                                <input
                                    type="checkbox"
                                    checked={textQuestion.caseSensitive}
                                    onChange={(e) => setTextQuestion((q) => ({ ...q, caseSensitive: e.target.checked }))}
                                />
                                Match case exactly
                            </label>
                        </>
                    )}
                    {activeType === 'numeric' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div>
                                <p className="label" style={{ marginBottom: '0.375rem' }}>Correct Answer</p>
                                <input
                                    className="input"
                                    type="number"
                                    step="any"
                                    value={numericQuestion.answer ?? 0}
                                    onChange={(e) => setNumericQuestion((q) => ({ ...q, answer: Number(e.target.value) }))}
                                />
                            </div>
                            <div>
                                <p className="label" style={{ marginBottom: '0.375rem' }}>Tolerance</p>
                                <input
                                    className="input"
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={numericQuestion.tolerance}
                                    onChange={(e) => setNumericQuestion((q) => ({ ...q, tolerance: Math.max(0, Number(e.target.value)) }))}
                                />
                            </div>
                        </div>
                    )}
                    {activeType === 'code' && (
                        <>
                            <div>
                                <p className="label" style={{ marginBottom: '0.375rem' }}>Language</p>
                                <select className="input" value={code.language} onChange={(e) => setCode((q) => ({ ...q, language: e.target.value }))}>
                                    {['typescript', 'javascript', 'python', 'java', 'cpp'].map((l) => <option key={l}>{l}</option>)}
                                </select>
                            </div>
                            <div>
                                <p className="label" style={{ marginBottom: '0.375rem' }}>Starter Code</p>
                                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', height: '160px' }}>
                                    <Editor
                                        height="160px"
                                        language={code.language}
                                        theme={theme === 'dark' ? 'vs-dark' : 'light'}
                                        value={code.template}
                                        onChange={(v) => setCode((q) => ({ ...q, template: v ?? '' }))}
                                        options={{ minimap: { enabled: false }, fontSize: 12, fontFamily: 'JetBrains Mono', scrollBeyondLastLine: false, padding: { top: 8 } }}
                                    />
                                </div>
                            </div>
                            <div>
                                <p className="label" style={{ marginBottom: '0.375rem' }}>Constraints (one per line)</p>
                                <textarea
                                    className="input"
                                    placeholder="e.g. O(n) time complexity"
                                    rows={2}
                                    style={{ resize: 'vertical', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}
                                    value={code.constraints.join('\n')}
                                    onChange={(e) => setCode((q) => ({ ...q, constraints: e.target.value.split('\n') }))}
                                />
                            </div>
                            <div>
                                <p className="label" style={{ marginBottom: '0.5rem' }}>Examples</p>
                                {code.examples.map((ex, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <input className="input" placeholder="Input" value={ex.input} onChange={(e) => setCode((q) => ({ ...q, examples: q.examples.map((ex2, j) => j === i ? { ...ex2, input: e.target.value } : ex2) }))} />
                                        <input className="input" placeholder="Output" value={ex.output} onChange={(e) => setCode((q) => ({ ...q, examples: q.examples.map((ex2, j) => j === i ? { ...ex2, output: e.target.value } : ex2) }))} />
                                    </div>
                                ))}
                                <button type="button" className="btn btn-sm btn-ghost" style={{ gap: '0.3rem' }} onClick={() => setCode((q) => ({ ...q, examples: [...q.examples, { input: '', output: '' }] }))}>
                                    <Plus size={12} /> Add example
                                </button>
                            </div>
                            <div>
                                <p className="label" style={{ marginBottom: '0.5rem' }}>Judge Test Cases</p>
                                <p className="t-small" style={{ color: 'var(--text-muted)', marginBottom: '0.625rem' }}>
                                    Hidden cases are used for scoring and are never sent to students.
                                </p>
                                {(code.testCases ?? []).map((testCase, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                        <input
                                            className="input"
                                            placeholder="stdin input"
                                            value={testCase.input}
                                            onChange={(e) => setCode((q) => ({
                                                ...q,
                                                testCases: (q.testCases ?? []).map((entry, index) => index === i ? { ...entry, input: e.target.value } : entry),
                                            }))}
                                        />
                                        <input
                                            className="input"
                                            placeholder="expected stdout"
                                            value={testCase.output}
                                            onChange={(e) => setCode((q) => ({
                                                ...q,
                                                testCases: (q.testCases ?? []).map((entry, index) => index === i ? { ...entry, output: e.target.value } : entry),
                                            }))}
                                        />
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px', fontWeight: 700, color: 'var(--text-2)' }}>
                                            <input
                                                type="checkbox"
                                                checked={testCase.hidden}
                                                onChange={(e) => setCode((q) => ({
                                                    ...q,
                                                    testCases: (q.testCases ?? []).map((entry, index) => index === i ? { ...entry, hidden: e.target.checked } : entry),
                                                }))}
                                            />
                                            Hidden
                                        </label>
                                    </div>
                                ))}
                                <button type="button" className="btn btn-sm btn-ghost" style={{ gap: '0.3rem' }} onClick={() => setCode((q) => ({ ...q, testCases: [...(q.testCases ?? []), { input: '', output: '', hidden: true }] }))}>
                                    <Plus size={12} /> Add judge case
                                </button>
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                        <button type="button" className="btn btn-md btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-md btn-primary hover-glow" style={{ flex: 1, gap: '0.375rem' }} disabled={saving}>
                            <Save size={14} /> {saving ? 'Saving...' : submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AddQModal: React.FC<AddQModalProps> = ({ testId, onClose }) => {
    const { addQuestion } = useTests();

    return (
        <QuestionModal
            title="Add Question"
            submitLabel="Save Question"
            onClose={onClose}
            onSave={async (question) => {
                await addQuestion(testId, question);
            }}
        />
    );
};

const EditQModal: React.FC<EditQModalProps> = ({ testId, question, onClose }) => {
    const { updateQuestion } = useTests();

    return (
        <QuestionModal
            title="Edit Question"
            submitLabel="Update Question"
            initialQuestion={cloneQuestionForForm(question)}
            initialType={question.type}
            lockType
            onClose={onClose}
            onSave={async (nextQuestion) => {
                await updateQuestion(testId, question.id, nextQuestion);
            }}
        />
    );
};

const ImportQModal: React.FC<ImportQModalProps> = ({ testId, onClose }) => {
    const { addQuestionsBulk } = useTests();
    const [fileName, setFileName] = useState('');
    const [questions, setQuestions] = useState<ImportedQuestionDraft[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        setError(null);
        setQuestions([]);
        setWarnings([]);
        setFileName(file?.name ?? '');

        if (!file) return;

        setLoading(true);
        try {
            const result = await parseQuestionImportFile(file);
            setQuestions(result.questions);
            setWarnings(result.warnings);
            if (result.questions.length === 0) {
                setError('No valid questions were found in the selected file.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to parse the selected file.');
        } finally {
            setLoading(false);
            event.target.value = '';
        }
    };

    const handleImport = async () => {
        if (questions.length === 0) return;

        setImporting(true);
        setError(null);
        const result = await addQuestionsBulk(testId, questions);
        setImporting(false);

        if (result.error) {
            setError(result.error);
            return;
        }

        onClose();
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', overflowY: 'auto' }}>
            <div className="anim-fade-up" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', width: '100%', maxWidth: '820px', boxShadow: 'var(--shadow-lg)', margin: 'auto' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                        <h2 className="t-h3">Import Questions</h2>
                        <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Upload `.xlsx`, `.xls`, `.csv`, `.docx`, `.pdf`, `.txt`, or `.json` to add multiple questions at once.
                        </p>
                    </div>
                    <button className="icon-btn" onClick={onClose}>x</button>
                </div>

                <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: '1rem' }}>
                    <div className="card" style={{ padding: '1rem' }}>
                        <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Import File</p>

                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', padding: '0.75rem', border: '1px solid rgba(241,141,19,0.25)', background: 'var(--warning-bg)', color: 'var(--warning)', borderRadius: '10px', marginBottom: '0.75rem' }}>
                            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                            <div>
                                <p className="t-small" style={{ fontWeight: 800, marginBottom: '0.2rem' }}>Match the required format before importing</p>
                                <p className="t-small">
                                    Keep spreadsheet columns or document field labels aligned with the expected format below. If the structure is inconsistent, some questions may be skipped or imported incorrectly.
                                </p>
                            </div>
                        </div>

                        <label className="btn btn-md btn-outline" style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <Upload size={14} /> Choose File
                            <input
                                type="file"
                                accept=".xlsx,.xls,.csv,.doc,.docx,.pdf,.txt,.md,.json,.rtf"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                        </label>
                        <p className="t-small" style={{ color: 'var(--text-muted)' }}>
                            {fileName || 'No file selected yet'}
                        </p>

                        <div style={{ marginTop: '1rem', padding: '0.875rem', border: '1px solid var(--border)', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                            <p className="label" style={{ marginBottom: '0.5rem' }}>Expected columns / fields</p>
                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>
                                `type`, `category`, `title`, `description`, `points`, `options`, `answer`, `language`, `template`, `constraints`, `examples`, `testCases`
                            </p>
                            <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                Use `|` to split list values. For examples or test cases, use `input =&gt; output` and separate multiple items with `||`.
                            </p>
                        </div>

                        <div style={{ marginTop: '1rem', padding: '0.875rem', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '10px' }}>
                            <p className="label" style={{ marginBottom: '0.5rem' }}>Document format example</p>
                            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.5 }}>{`Type: mcq
Category: aptitude
Title: HTML stands for?
Description: Pick the correct expansion.
Options:
- Hyper Text Markup Language
- High Text Markdown Language
Answer: 1
Points: 5
---
Type: code
Title: Sum two numbers
Language: python
Template: a, b = map(int, input().split())
Examples: 1 2 => 3
TestCases: hidden: 4 6 => 10`}</pre>
                        </div>
                    </div>

                    <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', minHeight: '420px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <div>
                                <p className="label" style={{ color: 'var(--text-muted)' }}>Preview</p>
                                <p className="t-small" style={{ color: 'var(--text-muted)' }}>{questions.length} parsed questions</p>
                            </div>
                            {loading && <span className="badge badge-neutral">Parsing...</span>}
                        </div>

                        {error && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', padding: '0.75rem', border: '1px solid rgba(207,58,48,0.25)', background: 'var(--danger-bg)', color: 'var(--danger)', marginBottom: '0.75rem' }}>
                                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                                <span className="t-small" style={{ fontWeight: 700 }}>{error}</span>
                            </div>
                        )}

                        {warnings.length > 0 && (
                            <div style={{ marginBottom: '0.75rem', padding: '0.75rem', border: '1px solid rgba(241,141,19,0.25)', background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                                <p className="t-small" style={{ fontWeight: 800, marginBottom: '0.35rem' }}>Warnings</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    {warnings.slice(0, 6).map((warning, index) => (
                                        <p key={`${warning}-${index}`} className="t-small">{warning}</p>
                                    ))}
                                    {warnings.length > 6 && <p className="t-small">+{warnings.length - 6} more warnings</p>}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
                            {questions.length === 0 && !loading ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border)', borderRadius: '10px', padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <p className="t-small">Select a file to preview the imported questions here.</p>
                                </div>
                            ) : (
                                questions.map((question, index) => (
                                    <div key={`${question.title}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem', background: 'var(--surface)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                                            <span className={`badge ${question.type === 'mcq' ? 'badge-success' : 'badge-warning'}`}>{getQuestionCategoryLabel(question as Question)}</span>
                                            <span className="badge badge-neutral">{question.points} pts</span>
                                            {question.type === 'code' && <span className="badge badge-neutral">{question.language}</span>}
                                        </div>
                                        <p className="t-small" style={{ fontWeight: 800, color: 'var(--text)', marginBottom: '0.25rem' }}>{question.title}</p>
                                        {question.description && <p className="t-small" style={{ color: 'var(--text-muted)' }}>{question.description}</p>}
                                        {question.type === 'mcq' && (
                                            <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                                                {question.options.length} options, correct answer #{(question.answer ?? 0) + 1}
                                            </p>
                                        )}
                                        {question.type === 'code' && (
                                            <p className="t-small" style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                                                {question.examples.length} examples, {(question.testCases ?? []).length} judge cases
                                            </p>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', padding: '0 1.5rem 1.5rem' }}>
                    <button type="button" className="btn btn-md btn-ghost" style={{ flex: 1 }} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-md btn-primary hover-glow"
                        style={{ flex: 1, gap: '0.375rem' }}
                        onClick={handleImport}
                        disabled={questions.length === 0 || importing || loading}
                    >
                        <Upload size={14} /> {importing ? 'Importing...' : `Import ${questions.length || ''}`.trim()}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface QCardProps {
    q: Question;
    onDelete: () => void;
    onEdit: () => void;
    index: number;
    total: number;
}

const QCard: React.FC<QCardProps> = ({ q, onDelete, onEdit, index, total: _total }) => {
    const [open, setOpen] = useState(false);

    return (
        <div className="card hover-antigravity" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
                <GripVertical size={16} style={{ color: 'var(--border-strong)', flexShrink: 0 }} />
                <span className="badge badge-neutral" style={{ flexShrink: 0 }}>Q{index + 1}</span>
                <span className={`badge ${q.type === 'mcq' ? 'badge-success' : q.type === 'code' ? 'badge-warning' : 'badge-neutral'}`} style={{ flexShrink: 0 }}>{getQuestionCategoryLabel(q)}</span>
                <span className="t-h3" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title || <em style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Untitled</em>}</span>
                <span className="t-small" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{q.points} pts</span>
                <button className="icon-btn" style={{ color: 'var(--text-muted)', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                    <Pencil size={13} />
                </button>
                <button className="icon-btn" style={{ color: 'var(--danger)', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                    <Trash2 size={13} />
                </button>
                {open ? <ChevronUp size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronDown size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
            </div>
            {open && (
                <div style={{ padding: '0.75rem 1rem 1rem', borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                        <button type="button" className="btn btn-sm btn-outline" style={{ gap: '0.375rem' }} onClick={onEdit}>
                            <Pencil size={13} /> Edit Question
                        </button>
                    </div>
                    {q.imageUrl && (
                        <div style={{ marginBottom: '0.75rem', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface)' }}>
                            <img src={q.imageUrl} alt={`${q.title} reference`} style={{ width: '100%', maxHeight: '260px', objectFit: 'contain', display: 'block', background: 'var(--bg-subtle)' }} />
                        </div>
                    )}
                    {q.description && <p className="t-body" style={{ marginBottom: '0.75rem' }}>{q.description}</p>}
                    {q.type === 'mcq' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                            {q.options.map((o, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.5rem', borderRadius: '6px', background: q.answer === i ? 'var(--success-bg)' : 'transparent' }}>
                                    {q.answer === i ? <CheckCircle2 size={13} style={{ color: 'var(--success)', flexShrink: 0 }} /> : <div style={{ width: '13px', height: '13px', borderRadius: '50%', border: '1px solid var(--border-strong)', flexShrink: 0 }} />}
                                    <span className="t-small" style={{ color: q.answer === i ? 'var(--success)' : 'var(--text-2)' }}>{o || <em style={{ opacity: 0.4 }}>Empty option</em>}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {q.type === 'code' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem 1rem', color: 'var(--text-2)', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                                {q.template}
                            </div>
                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>
                                {(q.testCases ?? []).filter((testCase) => testCase.hidden).length} hidden judge cases
                            </p>
                        </div>
                    )}
                    {q.type === 'text' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <p className="t-small" style={{ color: 'var(--text-muted)' }}>
                                {q.acceptedAnswers.length} accepted answer{q.acceptedAnswers.length !== 1 ? 's' : ''}
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                                {q.acceptedAnswers.map((answer) => (
                                    <span key={answer} className="badge badge-neutral">{answer}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {q.type === 'numeric' && (
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <span className="badge badge-neutral">Answer: {q.answer ?? 0}</span>
                            <span className="badge badge-neutral">Tolerance: {q.tolerance}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const TestEditor: React.FC = () => {
    const { testId } = useParams<{ testId: string }>();
    const navigate = useNavigate();
    const { getTest, updateTest, deleteQuestion, publishTest, unpublishTest } = useTests();
    const { groups, orgMembers, refreshGroups, refreshMembers } = useOrg();
    
    const [showAdd, setShowAdd] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
    const [testAssignments, setTestAssignments] = useState<{ groupId?: string; studentId?: string }[]>([]);
    const [savingAssignments, setSavingAssignments] = useState(false);
    const [publishError, setPublishError] = useState<string | null>(null);

    const test = getTest(testId ?? '');

    useEffect(() => {
        if (testId) {
            void refreshGroups();
            void refreshMembers();
            void loadAssignments();
        }
    }, [testId]);

    const loadAssignments = async () => {
        try {
            const data = await apiRequest<{ assignments: { group_id?: string; student_id?: string }[] }>(`/tests/${testId}/assignments`);
            setTestAssignments(data.assignments.map(a => ({ groupId: a.group_id, studentId: a.student_id })));
        } catch (err) {
            console.error('Failed to load assignments', err);
        }
    };

    const handlePublishToggle = async () => {
        if (!test) return;
        setPublishError(null);
        try {
            if (test.published) {
                await unpublishTest(test.id);
                return;
            }
            await publishTest(test.id);
        } catch (error) {
            setPublishError(error instanceof ApiError ? error.message : 'Unable to update publish state right now.');
        }
    };

    const handleToggleAssignment = async (type: 'group' | 'student', id: string) => {
        const isAssigned = testAssignments.some(a => type === 'group' ? a.groupId === id : a.studentId === id);
        let next: { groupId?: string; studentId?: string }[];
        
        if (isAssigned) {
            next = testAssignments.filter(a => type === 'group' ? a.groupId !== id : a.studentId !== id);
        } else {
            next = [...testAssignments, type === 'group' ? { groupId: id } : { studentId: id }];
        }
        
        setTestAssignments(next);
        setSavingAssignments(true);
        try {
            await apiRequest(`/tests/${testId}/assignments`, {
                method: 'POST',
                body: {
                    groupIds: next.filter(a => a.groupId).map(a => a.groupId),
                    studentIds: next.filter(a => a.studentId).map(a => a.studentId)
                }
            });
        } catch (err) {
            console.error('Failed to save assignments', err);
        } finally {
            setSavingAssignments(false);
        }
    };

    if (!test) return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
                <p className="t-h2" style={{ marginBottom: '1rem' }}>Test not found</p>
                <button className="btn btn-md btn-primary hover-glow" onClick={() => navigate('/admin')}>Back to Admin</button>
            </div>
        </div>
    );

    const totalPoints = test.questions.reduce((a, q) => a + q.points, 0);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <div className="container" style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => navigate('/')} style={{ gap: '0.375rem' }}>
                            <House size={14} /> Home
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => navigate('/admin')} style={{ gap: '0.375rem' }}>
                            <ArrowLeft size={14} /> Back
                        </button>
                        <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />
                        <div>
                            <h1 className="t-h3" style={{ lineHeight: 1 }}>{test.title}</h1>
                            <p className="t-small" style={{ color: 'var(--text-muted)', lineHeight: 1, marginTop: '2px' }}>
                                {test.questions.length} questions - {test.duration} min - {totalPoints} pts
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/admin/test/${test.id}/results`)}>
                            View Results
                        </button>
                        <span className={`badge ${test.published ? 'badge-solid' : 'badge-neutral'}`}>{test.published ? 'Published' : 'Draft'}</span>
                        <button
                            className={`btn btn-sm ${test.published ? 'btn-outline' : 'btn-primary'}`}
                            style={{ gap: '0.375rem' }}
                            onClick={() => void handlePublishToggle()}
                        >
                            {test.published ? <><EyeOff size={13} /> Unpublish</> : <><Globe size={13} /> Publish</>}
                        </button>
                    </div>
                </div>
            </header>

            <main className="container" style={{ paddingTop: '1.5rem', paddingBottom: '4rem', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: '1.5rem', alignItems: 'start' }}>
                {publishError && (
                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: '0.625rem', padding: '0.875rem 1rem', borderRadius: '10px', border: '1px solid rgba(207,58,48,0.25)', background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                        <div>
                            <p className="t-small" style={{ fontWeight: 800, marginBottom: '0.2rem' }}>Cannot publish this test yet</p>
                            <p className="t-small" style={{ lineHeight: 1.45 }}>{publishError}</p>
                        </div>
                    </div>
                )}
                <section>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <p className="label" style={{ color: 'var(--text-muted)' }}>Questions ({test.questions.length})</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button className="btn btn-sm btn-outline" style={{ gap: '0.375rem' }} onClick={() => setShowImport(true)}>
                                <Upload size={14} /> Import Questions
                            </button>
                            <button className="btn btn-sm btn-primary hover-glow" style={{ gap: '0.375rem' }} onClick={() => setShowAdd(true)}>
                                <Plus size={14} /> Add Question
                            </button>
                        </div>
                    </div>
                    {test.questions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem', border: '2px dashed var(--border)', borderRadius: '10px', color: 'var(--text-muted)' }}>
                            <Code2 size={48} className="antigravity" style={{ margin: '0 auto 0.75rem', color: 'var(--accent)', opacity: 0.8 }} />
                            <p className="t-h3" style={{ marginBottom: '0.5rem' }}>No questions yet</p>
                            <p className="t-body" style={{ marginBottom: '1.25rem' }}>Add MCQ, aptitude, short-answer, numerical, or coding questions manually or import a file.</p>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button className="btn btn-md btn-outline" style={{ gap: '0.375rem' }} onClick={() => setShowImport(true)}>
                                    <Upload size={14} /> Import Questions
                                </button>
                                <button className="btn btn-md btn-primary hover-glow" style={{ gap: '0.375rem' }} onClick={() => setShowAdd(true)}>
                                    <Plus size={14} /> Add First Question
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {test.questions.map((q, i) => (
                                <QCard
                                    key={q.id}
                                    q={q}
                                    index={i}
                                    total={test.questions.length}
                                    onEdit={() => setEditingQuestion(q)}
                                    onDelete={() => { if (confirm('Delete this question?')) deleteQuestion(test.id, q.id); }}
                                />
                            ))}
                        </div>
                    )}
                </section>

                <aside style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="card" style={{ padding: '1.125rem' }}>
                        <p className="label" style={{ marginBottom: '0.875rem', color: 'var(--text-muted)' }}>Test Settings</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                            <div>
                                <p className="label" style={{ marginBottom: '0.3rem' }}>Title</p>
                                <input className="input" value={test.title} onChange={(e) => updateTest(test.id, { title: e.target.value })} />
                            </div>
                            <div>
                                <p className="label" style={{ marginBottom: '0.3rem' }}>Description</p>
                                <textarea className="input" rows={2} style={{ resize: 'vertical', fontFamily: 'Manrope, sans-serif', fontSize: '0.85rem' }} value={test.description} onChange={(e) => updateTest(test.id, { description: e.target.value })} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <div>
                                    <p className="label" style={{ marginBottom: '0.3rem' }}>Duration (min)</p>
                                    <input className="input" type="number" min={5} value={test.duration} onChange={(e) => updateTest(test.id, { duration: Number(e.target.value) })} />
                                </div>
                                <div>
                                    <p className="label" style={{ marginBottom: '0.3rem' }}>Difficulty</p>
                                    <select className="input" value={test.difficulty} onChange={(e) => updateTest(test.id, { difficulty: e.target.value as Difficulty })}>
                                        {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map((d) => <option key={d}>{d}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <p className="label" style={{ marginBottom: '0.3rem' }}>Tags</p>
                                <input className="input" placeholder="SQL, Python, ..." value={test.tags.join(', ')} onChange={(e) => updateTest(test.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
                            </div>
                            <div>
                                <p className="label" style={{ marginBottom: '0.3rem' }}>Visibility</p>
                                <select className="input" value={test.visibility} onChange={(e) => updateTest(test.id, { visibility: e.target.value as TestVisibility })}>
                                    <option value="assigned_only">Assigned only</option>
                                    <option value="org_public">Entire organization</option>
                                </select>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.45 }}>
                                    {test.visibility === 'assigned_only'
                                        ? 'Only assigned groups and students can start this test after it is published.'
                                        : 'Every student in the organization can start this test once it is published.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <p className="label" style={{ color: 'var(--text-muted)' }}>Access Control</p>
                            {savingAssignments && <div style={{ width: '12px', height: '12px', border: '2px solid transparent', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 800, textTransform: 'uppercase' }}>Groups</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                    {groups.length === 0 ? (
                                        <p className="t-small" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No groups found</p>
                                    ) : groups.map(g => {
                                        const assigned = testAssignments.some(a => a.groupId === g.id);
                                        return (
                                            <button key={g.id} onClick={() => handleToggleAssignment('group', g.id)} className="hover-surface" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.625rem', borderRadius: '6px', border: `1px solid ${assigned ? 'var(--accent)' : 'var(--border)'}`, background: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                                <span className="t-small" style={{ fontWeight: 700, color: assigned ? 'var(--accent)' : 'var(--text)' }}>{g.name}</span>
                                                {assigned && <Check size={12} style={{ color: 'var(--accent)' }} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 800, textTransform: 'uppercase' }}>Students</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: '200px', overflowY: 'auto' }}>
                                    {orgMembers.filter(m => m.role === 'student').length === 0 ? (
                                        <p className="t-small" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No students found</p>
                                    ) : orgMembers.filter(m => m.role === 'student').map(m => {
                                        const assigned = testAssignments.some(a => a.studentId === m.user_id);
                                        return (
                                            <button key={m.user_id} onClick={() => handleToggleAssignment('student', m.user_id)} className="hover-surface" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.625rem', borderRadius: '6px', border: `1px solid ${assigned ? 'var(--accent)' : 'var(--border)'}`, background: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                                <span className="t-small" style={{ fontWeight: 700, color: assigned ? 'var(--accent)' : 'var(--text)' }}>{m.profile?.name || 'Unknown'}</span>
                                                {assigned && <Check size={12} style={{ color: 'var(--accent)' }} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        
                        <p className="t-micro" style={{ color: 'var(--text-muted)', marginTop: '0.75rem', lineHeight: 1.4 }}>
                            {test.visibility === 'assigned_only'
                                ? 'Assigned-only tests must include at least one selected group or student before publishing.'
                                : 'Assignments do not restrict access in organization-wide mode. Once published, every student in the organization can see this test.'}
                        </p>
                    </div>

                    <div className="card" style={{ padding: '1rem' }}>
                        <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Summary</p>
                        {[
                            ...(['mcq', 'aptitude', 'saq', 'numerical', 'coding'] as QuestionCategory[]).map((category) => ({
                                label: QUESTION_CATEGORY_LABELS[category],
                                value: test.questions.filter((q) => q.category === category).length,
                            })),
                            { label: 'Total Points', value: totalPoints },
                        ].filter(({ value, label }) => label === 'Total Points' || value > 0).map(({ label, value }) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                                <span className="t-small" style={{ color: 'var(--text-muted)' }}>{label}</span>
                                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text)' }}>{value}</span>
                            </div>
                        ))}
                    </div>
                </aside>
            </main>

            {showAdd && <AddQModal testId={test.id} onClose={() => setShowAdd(false)} />}
            {showImport && <ImportQModal testId={test.id} onClose={() => setShowImport(false)} />}
            {editingQuestion && <EditQModal testId={test.id} question={editingQuestion} onClose={() => setEditingQuestion(null)} />}

            <style>{`@media(max-width:768px){ main.container { grid-template-columns:1fr!important; } }`}</style>
        </div>
    );
};

export default TestEditor;
