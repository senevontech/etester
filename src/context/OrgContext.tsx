import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiOrgMember, ApiOrgMembership, ApiOrganization } from '../lib/api';
import { useAuth } from './AuthContext';

export type Organization = ApiOrganization;
export type OrgMember = ApiOrgMember;

export interface Group {
    id: string;
    orgId: string;
    name: string;
    description: string;
    createdAt: string;
}

export interface GroupMember {
    userId: string;
    name: string;
    email: string;
}

interface OrgContextValue {
    activeOrg: Organization | null;
    orgMembers: OrgMember[];
    userOrgs: Organization[];
    groups: Group[];
    loading: boolean;
    createOrg: (name: string) => Promise<{ data: Organization | null; error: string | null }>;
    joinOrgByInviteCode: (code: string) => Promise<{ error: string | null }>;
    switchOrg: (orgId: string) => Promise<void>;
    refreshMembers: () => Promise<void>;
    generateNewInviteCode: () => Promise<void>;
    refreshGroups: () => Promise<void>;
    createGroup: (name: string, description: string) => Promise<Group | null>;
    deleteGroup: (groupId: string) => Promise<void>;
    addGroupMember: (groupId: string, userId: string) => Promise<void>;
    removeGroupMember: (groupId: string, userId: string) => Promise<void>;
    getGroupMembers: (groupId: string) => Promise<GroupMember[]>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

const ACTIVE_ORG_KEY = 'etester-active-org';

interface MineOrgsResponse {
    orgs: ApiOrgMembership[];
}

interface MembershipResponse {
    role: 'admin' | 'student';
}

interface MembersResponse {
    members: OrgMember[];
}

interface OrgResponse {
    org: Organization;
}

interface GroupsResponse {
    groups: any[];
}

interface GroupResponse {
    group: any;
}

interface GroupMembersResponse {
    members: GroupMember[];
}

export const OrgProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, setUserRole } = useAuth();
    const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
    const [userOrgs, setUserOrgs] = useState<Organization[]>([]);
    const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const fetchVersionRef = useRef(0);

    const userId = user?.id;
    const activeOrgId = activeOrg?.id;

    const rowToGroup = (row: any): Group => ({
        id: row.id,
        orgId: row.org_id,
        name: row.name,
        description: row.description || '',
        createdAt: row.created_at,
    });

    const fetchUserOrgs = useCallback(async () => {
        const fetchVersion = ++fetchVersionRef.current;

        if (!userId) {
            setUserOrgs([]);
            setActiveOrg(null);
            setOrgMembers([]);
            setGroups([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const data = await apiRequest<MineOrgsResponse>('/orgs/mine');
            if (fetchVersion !== fetchVersionRef.current) return;

            const memberships = data.orgs ?? [];
            const orgs = memberships.map(item => item.org);

            setUserOrgs(orgs);

            if (orgs.length === 0) {
                setActiveOrg(null);
                setOrgMembers([]);
                setGroups([]);
                setLoading(false);
                return;
            }

            const storedOrgId = localStorage.getItem(ACTIVE_ORG_KEY);
            const nextOrg = orgs.find(org => org.id === storedOrgId) ?? orgs[0];
            setActiveOrg(nextOrg);
            localStorage.setItem(ACTIVE_ORG_KEY, nextOrg.id);

            const membership = memberships.find(item => item.org.id === nextOrg.id);
            if (membership?.role && membership.role !== user?.role) setUserRole(membership.role);
        } catch {
            if (fetchVersion !== fetchVersionRef.current) return;
            setUserOrgs([]);
            setActiveOrg(null);
            setOrgMembers([]);
            setGroups([]);
        } finally {
            if (fetchVersion === fetchVersionRef.current) setLoading(false);
        }
    }, [setUserRole, user?.role, userId]);

    useEffect(() => {
        void fetchUserOrgs();
    }, [fetchUserOrgs]);

    const refreshMembers = useCallback(async () => {
        if (!activeOrgId || user?.role !== 'admin') {
            setOrgMembers([]);
            return;
        }

        try {
            const data = await apiRequest<MembersResponse>(`/orgs/${activeOrgId}/members`);
            setOrgMembers(data.members ?? []);
        } catch {
            setOrgMembers([]);
        }
    }, [activeOrgId, user?.role]);

    useEffect(() => {
        void refreshMembers();
    }, [refreshMembers]);

    const refreshGroups = useCallback(async () => {
        if (!activeOrgId || user?.role !== 'admin') {
            setGroups([]);
            return;
        }

        try {
            const data = await apiRequest<GroupsResponse>(`/orgs/${activeOrgId}/groups`);
            setGroups((data.groups ?? []).map(rowToGroup));
        } catch {
            setGroups([]);
        }
    }, [activeOrgId, user?.role]);

    useEffect(() => {
        void refreshGroups();
    }, [refreshGroups]);

    const createGroup = useCallback(async (name: string, description: string): Promise<Group | null> => {
        if (!activeOrgId) return null;
        try {
            const result = await apiRequest<GroupResponse>(`/orgs/${activeOrgId}/groups`, {
                method: 'POST',
                body: { name, description },
            });
            const group = rowToGroup(result.group);
            setGroups(prev => [...prev, group]);
            return group;
        } catch {
            return null;
        }
    }, [activeOrgId]);

    const deleteGroup = useCallback(async (groupId: string) => {
        try {
            await apiRequest(`/groups/${groupId}`, { method: 'DELETE' });
            setGroups(prev => prev.filter(g => g.id !== groupId));
        } catch {
            // ignore
        }
    }, []);

    const addGroupMember = useCallback(async (groupId: string, userId: string) => {
        await apiRequest(`/groups/${groupId}/members`, {
            method: 'POST',
            body: { userId },
        });
    }, []);

    const removeGroupMember = useCallback(async (groupId: string, userId: string) => {
        await apiRequest(`/groups/${groupId}/members/${userId}`, {
            method: 'DELETE',
        });
    }, []);

    const getGroupMembers = useCallback(async (groupId: string): Promise<GroupMember[]> => {
        const data = await apiRequest<GroupMembersResponse>(`/groups/${groupId}/members`);
        return data.members ?? [];
    }, []);

    const createOrg = useCallback(async (name: string): Promise<{ data: Organization | null; error: string | null }> => {
        if (!userId) return { data: null, error: 'Not authenticated.' };

        try {
            fetchVersionRef.current += 1;
            const data = await apiRequest<OrgResponse>('/orgs', {
                method: 'POST',
                body: { name },
            });
            setUserOrgs(prev => [...prev, data.org]);
            setActiveOrg(data.org);
            localStorage.setItem(ACTIVE_ORG_KEY, data.org.id);
            setUserRole('admin');
            return { data: data.org, error: null };
        } catch (error) {
            return { data: null, error: error instanceof Error ? error.message : 'Failed to create organization.' };
        }
    }, [setUserRole, userId]);

    const joinOrgByInviteCode = useCallback(async (code: string): Promise<{ error: string | null }> => {
        if (!userId) return { error: 'Not authenticated.' };

        try {
            fetchVersionRef.current += 1;
            await apiRequest('/orgs/join', {
                method: 'POST',
                body: { code },
            });
            await fetchUserOrgs();
            return { error: null };
        } catch (error) {
            return { error: error instanceof Error ? error.message : 'Invalid invite code. Please check and try again.' };
        }
    }, [fetchUserOrgs, userId]);

    const switchOrg = useCallback(async (orgId: string) => {
        const org = userOrgs.find(item => item.id === orgId);
        if (!org) return;

        try {
            const data = await apiRequest<MembershipResponse>('/orgs/switch', {
                method: 'POST',
                body: { orgId },
            });
            setActiveOrg(org);
            localStorage.setItem(ACTIVE_ORG_KEY, orgId);
            setUserRole(data.role);
        } catch {
            // Leave the current org unchanged if the switch request fails.
        }
    }, [setUserRole, userOrgs]);

    const generateNewInviteCode = useCallback(async () => {
        if (!activeOrgId) return;

        try {
            const data = await apiRequest<OrgResponse>(`/orgs/${activeOrgId}/invite-code/regenerate`, {
                method: 'POST',
            });
            setActiveOrg(data.org);
            setUserOrgs(prev => prev.map(org => (org.id === data.org.id ? data.org : org)));
        } catch {
            // Keep existing invite code if regeneration fails.
        }
    }, [activeOrgId]);

    return (
        <OrgContext.Provider value={{
            activeOrg,
            orgMembers,
            userOrgs,
            groups,
            loading,
            createOrg,
            joinOrgByInviteCode,
            switchOrg,
            refreshMembers,
            generateNewInviteCode,
            refreshGroups,
            createGroup,
            deleteGroup,
            addGroupMember,
            removeGroupMember,
            getGroupMembers,
        }}
        >
            {children}
        </OrgContext.Provider>
    );
};

export const useOrg = () => {
    const ctx = useContext(OrgContext);
    if (!ctx) throw new Error('useOrg must be used within OrgProvider');
    return ctx;
};
