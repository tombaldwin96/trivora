'use client';

import { useCallback, useEffect, useState } from 'react';

export type UserRow = {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  level: number;
  xp: number;
  is_admin: boolean;
  is_blocked?: boolean;
  country: string | null;
  created_at: string;
  total_quizzes_taken?: number;
  total_questions_correct?: number;
  total_questions_incorrect?: number;
};

export function UserList() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [blocking, setBlocking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchUsers = useCallback(async (q: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('q', q);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to load users');
        setUsers([]);
        return;
      }
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('Network error');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(search, page);
  }, [search, page, fetchUsers]);

  const handleSave = async (payload: Record<string, unknown>) => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to update');
        return;
      }
      setEditing(null);
      fetchUsers(search, page);
    } finally {
      setSaving(false);
    }
  };

  const handleBlock = async (u: UserRow) => {
    if (!confirm(`Block ${u.username}? They will not be able to sign in or use the app.`)) return;
    setBlocking(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_blocked: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to block');
        return;
      }
      fetchUsers(search, page);
    } finally {
      setBlocking(null);
    }
  };

  const handleUnblock = async (u: UserRow) => {
    setBlocking(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_blocked: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to unblock');
        return;
      }
      fetchUsers(search, page);
    } finally {
      setBlocking(null);
    }
  };

  const handleDelete = async (u: UserRow) => {
    if (!confirm(`Permanently delete ${u.username}? This cannot be undone. Their account and data will be removed.`)) return;
    setDeleting(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to delete');
        return;
      }
      fetchUsers(search, page);
    } finally {
      setDeleting(null);
    }
  };

  const totalPages = Math.ceil(total / 50) || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <input
          type="search"
          placeholder="Search by username or display name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 min-w-[240px]"
        />
        <span className="text-slate-500 text-sm">{total} user{total !== 1 ? 's' : ''}</span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading...</div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Login / User</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Level / XP</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Stats</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{u.username}</p>
                      <p className="text-sm text-slate-500">{u.display_name || '—'}</p>
                      <p className="text-xs text-slate-400">{u.email || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">Level {u.level}</p>
                      <p className="text-sm text-slate-600">{u.xp} XP</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <p>Quizzes: {u.total_quizzes_taken ?? 0}</p>
                      <p>Correct: {u.total_questions_correct ?? 0} / Incorrect: {u.total_questions_incorrect ?? 0}</p>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_blocked ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Blocked</span>
                      ) : u.is_admin ? (
                        <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">Admin</span>
                      ) : (
                        <span className="text-slate-400 text-sm">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(u)}
                          className="text-indigo-600 text-sm font-medium hover:underline"
                        >
                          Edit
                        </button>
                        {u.is_blocked ? (
                          <button
                            type="button"
                            onClick={() => handleUnblock(u)}
                            disabled={blocking === u.id}
                            className="text-emerald-600 text-sm font-medium hover:underline disabled:opacity-50"
                          >
                            {blocking === u.id ? '…' : 'Unblock'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleBlock(u)}
                            disabled={blocking === u.id}
                            className="text-amber-600 text-sm font-medium hover:underline disabled:opacity-50"
                          >
                            {blocking === u.id ? '…' : 'Block'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
                          disabled={deleting === u.id}
                          className="text-red-600 text-sm font-medium hover:underline disabled:opacity-50"
                        >
                          {deleting === u.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 bg-slate-50">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-sm font-medium text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-sm font-medium text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
  onSave,
  saving,
}: {
  user: UserRow;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.display_name ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [level, setLevel] = useState(String(user.level));
  const [xp, setXp] = useState(String(user.xp));
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [country, setCountry] = useState(user.country ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      username: username.trim(),
      display_name: displayName.trim() || null,
      email: email.trim() || undefined,
      level: Math.max(1, parseInt(level, 10) || 1),
      xp: Math.max(0, parseInt(xp, 10) || 0),
      is_admin: isAdmin,
      country: country.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Edit user: {user.username}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email (login)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">XP</label>
                <input
                  type="number"
                  min={0}
                  value={xp}
                  onChange={(e) => setXp(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Country code</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. GB, US"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                maxLength={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_admin"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <label htmlFor="is_admin" className="text-sm font-medium text-slate-700">Admin</label>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
