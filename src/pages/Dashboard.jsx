import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';

const Dashboard = () => {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/');
    }
  };
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [joinGroupId, setJoinGroupId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchGroups();
  }, [userData]);

  const fetchGroups = async () => {
    if (!userData) return;
    
    setLoading(true);
    try {
      // Efficient approach: get the groups the user belongs to and include their members in the same query
      const { data: memberships, error: membershipsError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userData.id);

      if (membershipsError) throw membershipsError;

      if (!memberships || memberships.length === 0) {
        setGroups([]);
        return;
      }

      const groupIds = memberships.map((m) => m.group_id);

      // Fetch groups and embed their members in one request, then compute counts locally
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('*, group_members(user_id)')
        .in('id', groupIds)
        .order('created_at', { ascending: false });

      if (groupsError) throw groupsError;

      const enriched = (groupsData || []).map((g) => ({
        ...g,
        membersCount: (g.group_members && g.group_members.length) || 0,
        teacherName: g.created_by_name || 'Unknown Teacher',
      }));

      setGroups(enriched);
    } catch (err) {
      console.error('Error fetching groups:', err);
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    setError('');

    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }

    try {
      const { data: group, error } = await supabase
        .from('groups')
        .insert({
          name: groupName,
          description: groupDescription,
          created_by: userData.id,
          created_by_name: userData.name,
        })
        .select()
        .single();

      if (error) throw error;

      // Add teacher as a member
      const { error: memberError } = await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: userData.id,
      });

      if (memberError) {
        console.error('Error adding teacher as member:', memberError);
        // Even if member insert fails, still navigate to the group
      }

      setShowCreateModal(false);
      setGroupName('');
      setGroupDescription('');
      await fetchGroups();
      navigate(`/group/${group.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create group');
    }
  };

  const joinGroup = async (e) => {
    e.preventDefault();
    setError('');

    if (!joinGroupId.trim()) {
      setError('Group ID is required');
      return;
    }

    try {
      // Validate user data
      if (!userData || !userData.id) {
        setError('User data not available. Please refresh the page and try again.');
        return;
      }

      // Check group exists
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', joinGroupId)
        .single();

      if (groupError || !group) {
        setError('Group not found');
        return;
      }

      // Check membership
      const { data: existing, error: existingError } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', joinGroupId)
        .eq('user_id', userData.id)
        .maybeSingle();

      if (existingError) {
        console.error('Membership check error:', existingError);
        setError('Error checking membership: ' + existingError.message);
        return;
      }

      if (existing) {
        setError('You are already a member of this group');
        navigate(`/group/${joinGroupId}`);
        return;
      }

      // Add user to group
      const { error: insertError } = await supabase.from('group_members').insert({
        group_id: joinGroupId,
        user_id: userData.id,
      });

      if (insertError) {
        console.error('Group join error:', insertError);
        setError('Failed to join group: ' + insertError.message);
        return;
      }

      setShowJoinModal(false);
      setJoinGroupId('');
      fetchGroups();
      navigate(`/group/${joinGroupId}`);
    } catch (err) {
      setError(err.message || 'Failed to join group');
    }
  };

  const handleJoinGroup = async (groupId) => {
    try {
      // Validate user data
      if (!userData || !userData.id) {
        setError('User data not available. Please refresh the page and try again.');
        return;
      }

      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (groupError || !group) {
        setError('Group not found');
        return;
      }

      const { data: existing, error: existingError } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId)
        .eq('user_id', userData.id)
        .maybeSingle();

      if (existingError) {
        console.error('Membership check error:', existingError);
        setError('Error checking membership: ' + existingError.message);
        return;
      }

      if (!existing) {
        const { error: insertError } = await supabase.from('group_members').insert({
          group_id: groupId,
          user_id: userData.id,
        });

        if (insertError) {
          console.error('Group join error:', insertError);
          setError('Failed to join group: ' + insertError.message);
          return;
        }
      }

      fetchGroups();
      navigate(`/group/${groupId}`);
    } catch (err) {
      setError(err.message || 'Failed to join group');
    }
  };

  const handleDeleteGroup = async (group) => {
    if (!userData || userData.id !== group.created_by) {
      alert('Only the teacher who created this group can delete it.');
      return;
    }

    const confirmDelete = window.confirm(
      `Delete group "${group.name}"? This will remove all messages, files, sessions, and memberships.`,
    );

    if (!confirmDelete) return;

    try {
      await supabase.from('messages').delete().eq('group_id', group.id);
      await supabase.from('files').delete().eq('group_id', group.id);
      await supabase.from('sessions').delete().eq('group_id', group.id);
      await supabase.from('group_members').delete().eq('group_id', group.id);

      const { error } = await supabase.from('groups').delete().eq('id', group.id);
      if (error) throw error;

      fetchGroups();
    } catch (err) {
      console.error('Error deleting group:', err);
      setError(err.message || 'Failed to delete group');
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="border-b border-slate-800/80 px-4 sm:px-8 py-4 flex items-center justify-between gap-3 bg-slate-950/80">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
            Dashboard
          </h2>
          <p className="text-xs text-slate-400">
            Welcome back, {userData?.name}. Organize your classes and sessions.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs sm:text-sm">
          <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
            Role: <span className="font-semibold capitalize">{userData?.role}</span>
          </span>
          <button
            onClick={handleLogout}
            className="bg-red-500/90 text-white px-3 sm:px-4 py-1.5 rounded-full hover:bg-red-500 transition text-xs sm:text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-8 pb-8 pt-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Your Groups</p>
            <p className="text-2xl font-semibold text-slate-50">{groups.length}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Spaces where you collaborate with others.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Role</p>
            <p className="text-lg font-semibold capitalize text-slate-50">
              {userData?.role}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {userData?.role === 'teacher'
                ? 'Create groups, plan sessions, and guide students.'
                : 'Join groups, attend sessions, and use AI to revise.'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Today</p>
            <p className="text-lg font-semibold text-slate-50">
              {new Date().toLocaleDateString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              A good day to learn something new.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          {userData?.role === 'teacher' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 bg-sky-500 text-white px-4 py-2 rounded-full hover:bg-sky-400 transition text-sm"
            >
              <span className="h-2 w-2 rounded-full bg-white" />
              Create new group
            </button>
          )}
          <button
            onClick={() => setShowJoinModal(true)}
            className="inline-flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-full hover:bg-emerald-400 transition text-sm"
          >
            Join with group ID
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-100 px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400" />
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {groups.map((group) => (
              <div
                key={group.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-sky-500/70 hover:shadow-[0_18px_35px_rgba(15,23,42,0.9)] transition cursor-pointer group"
              >
                <h3 className="text-lg font-semibold text-slate-50 mb-1">
                  {group.name}
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  {group.description || 'No description yet. Add context in your first session.'}
                </p>
                <div className="mb-4">
                  <p className="text-[11px] text-slate-500 mb-1">Group ID</p>
                  <p className="text-xs font-mono bg-slate-950/90 border border-slate-800/80 px-3 py-2 rounded-lg break-all text-slate-200">
                    {group.id}
                  </p>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs text-slate-400">
                    Teacher:{' '}
                    <span className="font-medium text-slate-200">{group.created_by_name}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {group.membersCount || 0} members
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => navigate(`/group/${group.id}`)}
                    className="w-full bg-sky-500 text-white py-2 px-4 rounded-full hover:bg-sky-400 transition text-sm"
                  >
                    Open Group
                  </button>
                  {userData?.id === group.created_by && (
                    <button
                      onClick={() => handleDeleteGroup(group)}
                      className="w-full bg-red-700/90 text-white py-2 px-4 rounded-full hover:bg-red-600 transition text-xs"
                    >
                      Delete Group
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-400">
            <p>No groups yet. Create or join a group to get started.</p>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md text-black">
            <h2 className="text-2xl font-bold mb-4">Create Study Group</h2>
            <form onSubmit={createGroup}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter group name"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Enter group description"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setGroupName('');
                    setGroupDescription('');
                    setError('');
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Group Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md text-black">
            <h2 className="text-2xl font-bold mb-4">Join Study Group</h2>
            <form onSubmit={joinGroup}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group ID
                </label>
                <input
                  type="text"
                  value={joinGroupId}
                  onChange={(e) => setJoinGroupId(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter group ID"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition"
                >
                  Join
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setJoinGroupId('');
                    setError('');
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

