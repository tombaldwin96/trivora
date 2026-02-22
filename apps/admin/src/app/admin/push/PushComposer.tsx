'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TITLE_MAX = 65;
const BODY_MAX = 240;

type TokenCount = { platform: string; token_count: number };

export function PushComposer({ tokenCounts }: { tokenCounts: TokenCount[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'ios' | 'android'>('all');
  const [deepLink, setDeepLink] = useState('');
  const [sound, setSound] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const iosCount = tokenCounts.find((r) => r.platform === 'ios')?.token_count ?? 0;
  const androidCount = tokenCounts.find((r) => r.platform === 'android')?.token_count ?? 0;
  const total = iosCount + androidCount;
  const targetCount = target === 'all' ? total : target === 'ios' ? iosCount : androidCount;

  const titleLen = title.length;
  const bodyLen = body.length;
  const titleOver = titleLen > TITLE_MAX;
  const bodyOver = bodyLen > BODY_MAX;

  const canSend = (title.trim() || body.trim()) && !sending && targetCount > 0;

  async function handleSend(testOnly = false) {
    const hasContent = title.trim() || body.trim();
    if (!hasContent) return;
    if (!testOnly && !canSend) return;
    if (testOnly && targetCount === 0) return;
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || undefined,
          body: body.trim() || undefined,
          target,
          sound,
          data: deepLink.trim() ? { url: deepLink.trim() } : undefined,
          test: testOnly,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to send' });
        return;
      }
      setMessage({
        type: 'success',
        text: data.message || `Sent to ${data.sent} device(s)` + (testOnly ? ' (test)' : ''),
      });
      if (!testOnly) {
        setTitle('');
        setBody('');
        setDeepLink('');
      }
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Compose notification</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Daily Quiz is ready"
              className={`w-full rounded-lg border px-3 py-2 text-slate-900 placeholder-slate-400 ${
                titleOver ? 'border-red-400 bg-red-50' : 'border-slate-300'
              }`}
              maxLength={TITLE_MAX + 20}
            />
            <p className={`text-xs mt-1 ${titleOver ? 'text-red-600' : 'text-slate-500'}`}>
              {titleLen} / {TITLE_MAX} (recommended)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="e.g. Don't miss today's challenge. Open the app to play!"
              rows={4}
              className={`w-full rounded-lg border px-3 py-2 text-slate-900 placeholder-slate-400 resize-y ${
                bodyOver ? 'border-red-400 bg-red-50' : 'border-slate-300'
              }`}
              maxLength={BODY_MAX + 100}
            />
            <p className={`text-xs mt-1 ${bodyOver ? 'text-red-600' : 'text-slate-500'}`}>
              {bodyLen} / {BODY_MAX} (recommended)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Deep link (optional)</label>
            <input
              type="text"
              value={deepLink}
              onChange={(e) => setDeepLink(e.target.value)}
              placeholder="e.g. trivora://quiz/daily"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sound"
              checked={sound}
              onChange={(e) => setSound(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="sound" className="text-sm font-medium text-slate-700">Play sound</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Send to</label>
            <div className="flex flex-wrap gap-3">
              {[
                { value: 'all' as const, label: 'All devices', count: total },
                { value: 'ios' as const, label: 'iOS only', count: iosCount },
                { value: 'android' as const, label: 'Android only', count: androidCount },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 cursor-pointer transition-colors ${
                    target === opt.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="target"
                    value={opt.value}
                    checked={target === opt.value}
                    onChange={() => setTarget(opt.value)}
                    className="sr-only"
                  />
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-sm text-slate-500">({opt.count})</span>
                </label>
              ))}
            </div>
          </div>

          {message && (
            <div
              className={`rounded-lg px-4 py-3 text-sm ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleSend(false)}
              disabled={!canSend}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? 'Sending…' : 'Send to all'}
            </button>
            <button
              type="button"
              onClick={() => handleSend(true)}
              disabled={sending || targetCount === 0 || !(title.trim() || body.trim())}
              className="rounded-lg border-2 border-slate-300 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send test (1 device)
            </button>
            {targetCount === 0 && (
              <p className="text-sm text-amber-700">No devices registered for this target yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Preview</h3>
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-md">
          <p className="font-semibold text-slate-900">{title || 'Title'}</p>
          <p className="text-sm text-slate-600 mt-1">{body || 'Message body'}</p>
        </div>
      </div>

      {/* Tips */}
      <div className="rounded-xl border border-slate-200 bg-amber-50/50 p-6">
        <h3 className="text-sm font-semibold text-amber-800 mb-2">Tips</h3>
        <ul className="text-sm text-amber-900/90 space-y-1 list-disc list-inside">
          <li>Keep the title under 65 characters so it doesn’t get truncated on most devices.</li>
          <li>Keep the message under 240 characters for best visibility.</li>
          <li>Use “Send test” to try the notification on one device before sending to everyone.</li>
          <li>Target iOS or Android only when you need platform-specific messaging.</li>
        </ul>
      </div>
    </div>
  );
}
