import React, { useState, useEffect } from 'react';
import Navbar from '../../components/Layout/Navbar';
import { Users, Plus, Trash2, UserPlus, X, Search } from 'lucide-react';
import { useOrg, Group, GroupMember } from '../../context/OrgContext';

const AdminGroups: React.FC = () => {
    const { groups, orgMembers, createGroup, deleteGroup, addGroupMember, removeGroupMember, getGroupMembers } = useOrg();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    
    // Create Group Form
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [creating, setCreating] = useState(false);

    // Add Member Search
    const [memberSearch, setMemberSearch] = useState('');

    useEffect(() => {
        if (selectedGroup) {
            void fetchMembers(selectedGroup.id);
        }
    }, [selectedGroup]);

    const fetchMembers = async (groupId: string) => {
        setLoadingMembers(true);
        try {
            const members = await getGroupMembers(groupId);
            setGroupMembers(members);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingMembers(false);
        }
    };

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        setCreating(true);
        try {
            await createGroup(newName, newDesc);
            setIsCreateModalOpen(false);
            setNewName('');
            setNewDesc('');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteGroup = async (groupId: string) => {
        if (!window.confirm('Are you sure you want to delete this group?')) return;
        await deleteGroup(groupId);
        if (selectedGroup?.id === groupId) setSelectedGroup(null);
    };

    const handleAddMember = async (userId: string) => {
        if (!selectedGroup) return;
        try {
            await addGroupMember(selectedGroup.id, userId);
            await fetchMembers(selectedGroup.id);
        } catch (err) {
            alert('Failed to add member. They might already be in the group.');
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!selectedGroup) return;
        try {
            await removeGroupMember(selectedGroup.id, userId);
            await fetchMembers(selectedGroup.id);
        } catch (err) {
            console.error(err);
        }
    };

    const eligibleMembers = orgMembers.filter(m => 
        !groupMembers.some(gm => gm.userId === m.user_id) &&
        ((m.profile?.name || '').toLowerCase().includes(memberSearch.toLowerCase()) || 
         (m.profile?.email || '').toLowerCase().includes(memberSearch.toLowerCase()))
    );

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Navbar activeTab="admin" />
            
            <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h1 className="t-h1" style={{ marginBottom: '0.5rem' }}>Groups & Batches</h1>
                        <p className="t-body" style={{ color: 'var(--text-muted)' }}>Manage student groups for targeted test assignments.</p>
                    </div>
                    <button className="btn btn-md btn-primary hover-glow" onClick={() => setIsCreateModalOpen(true)} style={{ gap: '0.5rem' }}>
                        <Plus size={18} /> Create Group
                    </button>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem' }}>
                    {/* Sidebar: Group List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <p className="t-micro" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>YOUR GROUPS ({groups.length})</p>
                        {groups.length === 0 ? (
                            <div className="card" style={{ padding: '2rem 1rem', textAlign: 'center', borderStyle: 'dashed' }}>
                                <Users size={32} style={{ color: 'var(--border-strong)', margin: '0 auto 1rem' }} />
                                <p className="t-small" style={{ color: 'var(--text-muted)' }}>No groups created yet.</p>
                            </div>
                        ) : (
                            groups.map(group => (
                                <div 
                                    key={group.id} 
                                    className={`card hover-antigravity ${selectedGroup?.id === group.id ? 'active' : ''}`}
                                    onClick={() => setSelectedGroup(group)}
                                    style={{ 
                                        padding: '1rem', 
                                        cursor: 'pointer', 
                                        position: 'relative',
                                        borderColor: selectedGroup?.id === group.id ? 'var(--accent)' : 'var(--border)',
                                        background: selectedGroup?.id === group.id ? 'var(--surface-raised)' : 'var(--surface)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{group.name}</h3>
                                        <button 
                                            className="icon-btn" 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                                            style={{ color: 'var(--text-muted)', opacity: 0.6 }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{group.description || 'No description'}</p>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Main Content: Group Details & Members */}
                    <div className="card" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
                        {selectedGroup ? (
                            <>
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Users size={18} color="white" />
                                        </div>
                                        <h2 className="t-h2">{selectedGroup.name}</h2>
                                    </div>
                                    <p className="t-body" style={{ color: 'var(--text-muted)' }}>{selectedGroup.description || 'No description provided.'}</p>
                                </div>

                                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
                                    {/* Current Members */}
                                    <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                                            <h3 className="t-micro" style={{ color: 'var(--text-muted)' }}>MEMBERS ({groupMembers.length})</h3>
                                        </div>
                                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                                            {loadingMembers ? (
                                                <p className="t-small" style={{ textAlign: 'center', padding: '2rem' }}>Loading...</p>
                                            ) : groupMembers.length === 0 ? (
                                                <p className="t-small" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No members in this group.</p>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {groupMembers.map(member => (
                                                        <div key={member.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                            <div>
                                                                <p style={{ fontSize: '0.85rem', fontWeight: 700 }}>{member.name}</p>
                                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{member.email}</p>
                                                            </div>
                                                            <button className="icon-btn" style={{ color: 'var(--danger)', opacity: 0.6 }} onClick={() => handleRemoveMember(member.userId)}>
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Add Members */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                                            <h3 className="t-micro" style={{ color: 'var(--text-muted)' }}>ADD MEMBERS</h3>
                                        </div>
                                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ position: 'relative' }}>
                                                <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                                <input 
                                                    type="text" 
                                                    className="input input-sm" 
                                                    placeholder="Search classmates..." 
                                                    style={{ paddingLeft: '2.25rem' }}
                                                    value={memberSearch}
                                                    onChange={(e) => setMemberSearch(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                                            {eligibleMembers.length === 0 ? (
                                                <p className="t-small" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No more eligible members found.</p>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {eligibleMembers.map(member => (
                                                        <div key={member.user_id} className="hover-surface" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => handleAddMember(member.user_id)}>
                                                            <div>
                                                                <p style={{ fontSize: '0.85rem', fontWeight: 700 }}>{member.profile?.name || 'Unknown'}</p>
                                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{member.profile?.email || 'No email'}</p>
                                                            </div>
                                                            <UserPlus size={16} style={{ color: 'var(--accent)' }} />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                                <Users size={48} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
                                <h3 className="t-h3">Select a group</h3>
                                <p className="t-body">Choose a group from the sidebar to manage its members and details.</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Create Group Modal */}
            {isCreateModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                    <div className="card anim-scale-up" style={{ width: '400px', padding: '2rem' }}>
                        <h2 className="t-h3" style={{ marginBottom: '1.5rem' }}>Create New Group</h2>
                        <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label className="label">Group Name</label>
                                <input 
                                    className="input" 
                                    placeholder="e.g. Computer Science - Batch A" 
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    autoFocus
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">Description (Optional)</label>
                                <textarea 
                                    className="input" 
                                    rows={3} 
                                    placeholder="Brief description of this group..." 
                                    value={newDesc}
                                    onChange={(e) => setNewDesc(e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-md btn-outline" style={{ flex: 1 }} onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-md btn-primary hover-glow" style={{ flex: 1 }} disabled={creating || !newName.trim()}>
                                    {creating ? 'Creating...' : 'Create Group'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminGroups;
