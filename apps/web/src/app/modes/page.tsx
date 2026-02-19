import Link from 'next/link';
import { Card, Button } from '@mahan/ui';

export default function ModesPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Game modes</h1>
      <div className="grid gap-4">
        <Link href="/modes/1v1">
          <Card className="p-6 flex items-center justify-between hover:shadow-md transition cursor-pointer">
            <div>
              <h2 className="font-semibold text-lg">1v1</h2>
              <p className="text-slate-500 text-sm">Invite or matchmake · Divisions & seasons</p>
            </div>
            <Button variant="secondary" size="sm">Play</Button>
          </Card>
        </Link>
        <Card className="p-6 flex items-center justify-between opacity-75">
          <div>
            <h2 className="font-semibold text-lg">Arena</h2>
            <p className="text-slate-500 text-sm">8–32 players · Elimination (V1)</p>
          </div>
          <span className="text-xs text-slate-400">Coming soon</span>
        </Card>
        <Card className="p-6 flex items-center justify-between opacity-75">
          <div>
            <h2 className="font-semibold text-lg">Team vs Team</h2>
            <p className="text-slate-500 text-sm">4v4 · Team leaderboard (V1)</p>
          </div>
          <span className="text-xs text-slate-400">Coming soon</span>
        </Card>
        <Card className="p-6 flex items-center justify-between opacity-75">
          <div>
            <h2 className="font-semibold text-lg">Co-op</h2>
            <p className="text-slate-500 text-sm">2 players vs timer (V1)</p>
          </div>
          <span className="text-xs text-slate-400">Coming soon</span>
        </Card>
        <Link href="/tournaments">
          <Card className="p-6 flex items-center justify-between hover:shadow-md transition cursor-pointer">
            <div>
              <h2 className="font-semibold text-lg">Tournaments</h2>
              <p className="text-slate-500 text-sm">Weekend cups · Brackets (V1)</p>
            </div>
            <Button variant="ghost" size="sm">View</Button>
          </Card>
        </Link>
      </div>
    </div>
  );
}
