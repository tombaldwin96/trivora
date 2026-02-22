'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@trivora/ui';
import { submitIdea } from './actions';

export function IdeaForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const result = await submitIdea(formData);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push('/contact?sent=1');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-slate-700 mb-1">
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Jane"
          />
        </div>
        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-slate-700 mb-1">
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Doe"
          />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="jane@example.com"
        />
      </div>
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
          Description of idea
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 resize-none"
          placeholder="Tell us your idea..."
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={loading}>
        {loading ? 'Submitting…' : 'Submit'}
      </Button>
    </form>
  );
}
