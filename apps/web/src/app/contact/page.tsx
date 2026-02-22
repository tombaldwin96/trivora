import Link from 'next/link';
import { Card } from '@trivora/ui';
import { IdeaForm } from './idea-form';

export default async function ContactPage({
  searchParams,
}: {
  searchParams: { sent?: string };
}) {
  const sent = searchParams.sent;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block">
          ← Back to dashboard
        </Link>
        <Card className="p-6">
          <h1 className="text-2xl font-bold text-center mb-2">Share your idea</h1>
          <p className="text-slate-600 text-center text-sm mb-6">
            We’d love to hear from you. Fill out the form below and we’ll take a look.
          </p>
          {sent === '1' ? (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
              <p className="text-green-800 font-medium">Thanks for submitting!</p>
              <p className="text-green-700 text-sm mt-1">We’ll review your idea and get back to you if needed.</p>
            </div>
          ) : (
            <IdeaForm />
          )}
        </Card>
      </div>
    </main>
  );
}
