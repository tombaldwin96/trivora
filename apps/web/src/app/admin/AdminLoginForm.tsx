// Server component: plain form POST, no JavaScript required
export function AdminLoginForm({
  error,
  formAction,
}: {
  error?: string | null;
  formAction?: string;
}) {
  const message = error ? decodeURIComponent(error.replace(/\+/g, ' ')) : null;
  const action = formAction ?? '/api/admin/login';
  return (
    <form action={action} method="post" className="space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
          Username
        </label>
        <input
          id="username"
          type="text"
          name="username"
          placeholder="Username"
          autoComplete="username"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          required
        />
      </div>
      {message && (
        <p className="text-sm text-red-600" role="alert">
          {message}
        </p>
      )}
      <button
        type="submit"
        className="w-full rounded-lg bg-slate-800 py-2.5 text-white font-medium hover:bg-slate-700 transition-colors"
      >
        Sign in
      </button>
    </form>
  );
}
