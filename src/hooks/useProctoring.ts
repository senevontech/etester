import { useState, useEffect, useCallback } from 'react';

export type ViolationType = 'TAB_SWITCH' | 'WINDOW_FOCUS_LOST' | 'CLIPBOARD_ACCESS';

export interface Violation {
    type: ViolationType;
    message: string;
    timestamp: string;
    occurredAt: string;
}

export interface UseProctoringReturn {
    violations: Violation[];
    isTabFocused: boolean;
    addViolation: (type: ViolationType, message: string) => void;
    clearViolations: () => void;
}

export const useProctoring = (isActive = true): UseProctoringReturn => {
    const [violations, setViolations] = useState<Violation[]>([]);
    const [isTabFocused, setIsTabFocused] = useState<boolean>(true);

    const addViolation = useCallback((type: ViolationType, message: string) => {
        const occurredAt = new Date().toISOString();
        const timestamp = new Date(occurredAt).toLocaleTimeString();
        setViolations((prev) => [...prev, { type, message, timestamp, occurredAt }]);
        console.warn(`[Proctoring] ${type}: ${message}`);
    }, []);

    const clearViolations = useCallback(() => setViolations([]), []);

    const handleVisibilityChange = useCallback(() => {
        const hidden = document.visibilityState === 'hidden';
        setIsTabFocused(!hidden);
        if (hidden && isActive) addViolation('TAB_SWITCH', 'Candidate switched tabs or minimised the browser.');
    }, [isActive, addViolation]);

    const handleFocusChange = useCallback(() => {
        if (!document.hasFocus() && isActive) addViolation('WINDOW_FOCUS_LOST', 'Test window lost focus.');
    }, [isActive, addViolation]);

    const handleCopyPaste = useCallback((e: Event) => {
        if (isActive) { e.preventDefault(); addViolation('CLIPBOARD_ACCESS', 'Copy/Paste is not allowed during a test.'); }
    }, [isActive, addViolation]);

    const blockContextMenu = useCallback((e: Event) => { if (isActive) e.preventDefault(); }, [isActive]);

    useEffect(() => {
        if (!isActive) return;
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleFocusChange);
        document.addEventListener('copy', handleCopyPaste);
        document.addEventListener('paste', handleCopyPaste);
        document.addEventListener('contextmenu', blockContextMenu);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleFocusChange);
            document.removeEventListener('copy', handleCopyPaste);
            document.removeEventListener('paste', handleCopyPaste);
            document.removeEventListener('contextmenu', blockContextMenu);
        };
    }, [isActive, handleVisibilityChange, handleFocusChange, handleCopyPaste, blockContextMenu]);

    return { violations, isTabFocused, addViolation, clearViolations };
};
