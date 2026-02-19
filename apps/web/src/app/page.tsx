import Link from 'next/link';
import { Card, Button } from '@mahan/ui';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 text-center">
        <h1 className="text-4xl font-bold text-brand-600">Mahan</h1>
        <p className="text-slate-600">Daily quiz. 1v1 battles. Live events. Level up.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/auth/signin">
            <Button variant="primary" size="lg">Sign in</Button>
          </Link>
          <Link href="/auth/signup">
            <Button variant="secondary" size="lg">Create account</Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
          <Link href="/quiz/daily">
            <Card className="cursor-pointer hover:shadow-md transition">
              <h2 className="font-semibold text-brand-600">Daily Quiz</h2>
              <p className="text-sm text-slate-500 mt-1">10 questions. Score + time bonus.</p>
            </Card>
          </Link>
          <Link href="/modes">
            <Card className="cursor-pointer hover:shadow-md transition">
              <h2 className="font-semibold text-brand-600">1v1 & More</h2>
              <p className="text-sm text-slate-500 mt-1">Invite friends, climb divisions.</p>
            </Card>
          </Link>
        </div>
      </div>
    </main>
  );
}
