'use client';

import { logoutAction } from './actions';

export function AdminLogout() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        Sign out
      </button>
    </form>
  );
}
