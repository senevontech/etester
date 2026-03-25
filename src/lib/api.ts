const normalizeApiBaseUrl = (value?: string) => {
    const fallback = 'http://localhost:3001/api';
    const raw = (value || fallback).trim();

    try {
        const url = new URL(raw);
        if (!url.pathname || url.pathname === '/') {
            url.pathname = '/api';
        }
        return url.toString().replace(/\/$/, '');
    } catch {
        const trimmed = raw.replace(/\/$/, '');
        return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
    }
};

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);

const TOKEN_KEY = 'etester-api-token';

export type Role = 'admin' | 'student';

export interface ApiSession {
    token: string;
    userId: string;
    createdAt: string;
}

export interface ApiAuthUser {
    id: string;
    name: string;
    email: string;
    role: Role | null;
}

export interface ApiProfile {
    name: string;
    email: string;
}

export interface ApiOrganization {
    id: string;
    name: string;
    slug: string;
    invite_code?: string;
    created_by: string;
    created_at: string;
}

export interface ApiOrgMembership {
    org: ApiOrganization;
    role: Role;
}

export interface ApiOrgMember {
    id: string;
    org_id: string;
    user_id: string;
    role: 'admin' | 'student';
    joined_at: string;
    profile?: ApiProfile;
}

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);

export const storeToken = (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
};

export const clearStoredToken = () => {
    localStorage.removeItem(TOKEN_KEY);
};

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
    body?: unknown;
    token?: string | null;
}

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
    const token = options.token ?? getStoredToken();
    const headers = new Headers(options.headers);

    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
        throw new ApiError(data?.error ?? 'Request failed.', response.status);
    }

    return data as T;
};
