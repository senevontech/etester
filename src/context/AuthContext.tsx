import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
    apiRequest,
    ApiAuthUser,
    ApiSession,
    clearStoredToken,
    getStoredToken,
    type Role,
} from '../lib/api';

export type { Role };

export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: Role | null;
}

interface AuthResult {
    success: boolean;
    error?: string;
    pendingEmailConfirmation?: boolean;
}

interface AuthContextValue {
    user: AuthUser | null;
    session: ApiSession | null;
    isAuthenticated: boolean;
    loading: boolean;
    signup: (name: string, email: string, password: string) => Promise<AuthResult>;
    login: (email: string, password: string) => Promise<AuthResult>;
    logout: () => Promise<void>;
    setUserRole: (role: Role) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionResponse {
    session: ApiSession | null;
    user: ApiAuthUser | null;
}

interface AuthResponse extends SessionResponse {
    pendingEmailConfirmation?: boolean;
}

const ACTIVE_ROLE_KEY = 'etester-active-role';

const mergeStoredRole = (user: ApiAuthUser | null): AuthUser | null => {
    if (!user) return null;
    const storedRole = localStorage.getItem(ACTIVE_ROLE_KEY) as Role | null;
    return { ...user, role: storedRole ?? user.role ?? null };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<ApiSession | null>(null);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    const syncAuthState = useCallback((nextSession: ApiSession | null, nextUser: ApiAuthUser | null) => {
        setSession(nextSession);
        setUser(mergeStoredRole(nextUser));
        clearStoredToken();
    }, []);

    useEffect(() => {
        const token = getStoredToken();

        const restore = async () => {
            try {
                const data = await apiRequest<SessionResponse>('/auth/session', { token });
                syncAuthState(data.session, data.user);
            } catch {
                syncAuthState(null, null);
            } finally {
                setLoading(false);
            }
        };

        void restore();
    }, [syncAuthState]);

    const signup = useCallback(async (name: string, email: string, password: string): Promise<AuthResult> => {
        try {
            const data = await apiRequest<AuthResponse>('/auth/signup', {
                method: 'POST',
                body: { name, email, password },
                token: null,
            });

            if (data.pendingEmailConfirmation) {
                syncAuthState(null, null);
                return { success: true, pendingEmailConfirmation: true };
            }

            if (!data.session || !data.user) {
                return { success: false, error: 'Registration completed, but no session was returned.' };
            }

            syncAuthState(data.session, data.user);
            return { success: true };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Registration failed.' };
        }
    }, [syncAuthState]);

    const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
        try {
            const data = await apiRequest<AuthResponse>('/auth/login', {
                method: 'POST',
                body: { email, password },
                token: null,
            });

            if (!data.session || !data.user) {
                return { success: false, error: 'Sign-in did not create a session.' };
            }

            syncAuthState(data.session, data.user);
            return { success: true };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Login failed.' };
        }
    }, [syncAuthState]);

    const logout = useCallback(async () => {
        try {
            await apiRequest('/auth/logout', { method: 'POST' });
        } catch {
            // Local cleanup still matters if the server session was already gone.
        }

        localStorage.removeItem(ACTIVE_ROLE_KEY);
        localStorage.removeItem('etester-active-org');
        syncAuthState(null, null);
    }, [syncAuthState]);

    const setUserRole = useCallback((role: Role) => {
        localStorage.setItem(ACTIVE_ROLE_KEY, role);
        setUser(prev => {
            if (!prev || prev.role === role) return prev;
            return { ...prev, role };
        });
    }, []);

    return (
        <AuthContext.Provider value={{ user, session, isAuthenticated: !!session, loading, signup, login, logout, setUserRole }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
