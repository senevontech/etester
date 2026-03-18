import { useState, useEffect, useCallback } from 'react';

export type ViolationType = 'TAB_SWITCH' | 'WINDOW_FOCUS_LOST' | 'CLIPBOARD_ACCESS' | 'FULLSCREEN_EXIT';

export interface Violation {
    type: ViolationType;
    message: string;
    timestamp: string;
    occurredAt: string;
}

export interface UseProctoringReturn {
    violations: Violation[];
    isTabFocused: boolean;
    isFullscreen: boolean;
    tabSwitchCount: number;
    fullscreenExitCount: number;
    enterFullscreen: () => Promise<void>;
    addViolation: (type: ViolationType, message: string) => void;
    clearViolations: () => void;
}

export const useProctoring = (isActive = true): UseProctoringReturn => {
    const [violations, setViolations] = useState<Violation[]>([]);
    const [isTabFocused, setIsTabFocused] = useState<boolean>(true);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);
    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [fullscreenExitCount, setFullscreenExitCount] = useState(0);

    const addViolation = useCallback((type: ViolationType, message: string) => {
        const occurredAt = new Date().toISOString();
        const timestamp = new Date(occurredAt).toLocaleTimeString();
        setViolations((prev) => [...prev, { type, message, timestamp, occurredAt }]);
        console.warn(`[Proctoring] ${type}: ${message}`);
    }, []);

    const clearViolations = useCallback(() => setViolations([]), []);

    const enterFullscreen = useCallback(async () => {
        try {
            await document.documentElement.requestFullscreen();
        } catch {
            // user denied or browser unsupported
        }
    }, []);

    const handleVisibilityChange = useCallback(() => {
        const hidden = document.visibilityState === 'hidden';
        setIsTabFocused(!hidden);
        if (hidden && isActive) {
            addViolation('TAB_SWITCH', 'Candidate switched tabs or minimised the browser.');
            setTabSwitchCount((prev) => prev + 1);
        }
    }, [isActive, addViolation]);

    const handleFocusChange = useCallback(() => {
        if (!document.hasFocus() && isActive) addViolation('WINDOW_FOCUS_LOST', 'Test window lost focus.');
    }, [isActive, addViolation]);

    const handleCopyPaste = useCallback((e: Event) => {
        if (isActive) { e.preventDefault(); addViolation('CLIPBOARD_ACCESS', 'Copy/Paste is not allowed during a test.'); }
    }, [isActive, addViolation]);

    const blockContextMenu = useCallback((e: Event) => { if (isActive) e.preventDefault(); }, [isActive]);

    const handleFullscreenChange = useCallback(() => {
        const inFullscreen = !!document.fullscreenElement;
        setIsFullscreen(inFullscreen);
        if (!inFullscreen && isActive) {
            addViolation('FULLSCREEN_EXIT', 'Candidate exited fullscreen mode.');
            setFullscreenExitCount((prev) => prev + 1);
        }
    }, [isActive, addViolation]);

    useEffect(() => {
        if (!isActive) return;
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleFocusChange);
        document.addEventListener('copy', handleCopyPaste);
        document.addEventListener('paste', handleCopyPaste);
        document.addEventListener('contextmenu', blockContextMenu);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleFocusChange);
            document.removeEventListener('copy', handleCopyPaste);
            document.removeEventListener('paste', handleCopyPaste);
            document.removeEventListener('contextmenu', blockContextMenu);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [isActive, handleVisibilityChange, handleFocusChange, handleCopyPaste, blockContextMenu, handleFullscreenChange]);

    return { violations, isTabFocused, isFullscreen, tabSwitchCount, fullscreenExitCount, enterFullscreen, addViolation, clearViolations };
};
