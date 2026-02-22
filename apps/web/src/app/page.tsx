import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0614] text-white overflow-hidden">
      {/* Hero */}
      <header className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-950/60 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(124,58,237,0.35),transparent)]" />
        <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
          <span className="text-xl font-bold tracking-tight">Trivora</span>
          <a
            href="#download"
            className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold backdrop-blur-sm border border-white/20 hover:bg-white/20 transition"
          >
            Get the app
          </a>
        </nav>
        <div className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-28 text-center">
          <p className="text-violet-300 text-sm font-semibold tracking-[0.3em] uppercase mb-4">
            Outthink. Outplay. Outrank.
          </p>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6">
            The quiz app that
            <br />
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">
              plays like a game
            </span>
          </h1>
          <p className="text-slate-300 text-lg sm:text-xl max-w-2xl mx-auto mb-10">
            Daily challenges. Live events. 1v1 duels. Global leaderboards. Level up, compete with friends, and prove you’re the best.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="#live"
              className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-4 text-lg font-bold shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition"
            >
              Live quizzes
            </a>
            <a
              href="#modes"
              className="rounded-xl bg-white/10 px-8 py-4 text-lg font-bold border border-white/20 backdrop-blur-sm hover:bg-white/20 transition"
            >
              Game modes
            </a>
          </div>
        </div>
      </header>

      {/* Live quizzes */}
      <section id="live" className="relative py-24 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-950/20 to-transparent" />
        <div className="relative max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-sm font-semibold tracking-wider uppercase">Live</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold mb-4">
            Live quizzes
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mb-12">
            Join scheduled real-time quiz events. Qualify to play, then compete on a live leaderboard. Top finishers get recognition—track your wins and top-10 finishes on your profile.
          </p>
          <ul className="grid sm:grid-cols-2 gap-4 max-w-3xl text-slate-300 space-y-2">
            <li className="flex items-center gap-3">
              <span className="text-violet-400 font-bold">•</span>
              Scheduled events at set times—join when it’s live
            </li>
            <li className="flex items-center gap-3">
              <span className="text-violet-400 font-bold">•</span>
              Qualification rounds to earn your spot
            </li>
            <li className="flex items-center gap-3">
              <span className="text-violet-400 font-bold">•</span>
              Live leaderboard so you see where you stand as you play
            </li>
            <li className="flex items-center gap-3">
              <span className="text-violet-400 font-bold">•</span>
              Winners and stars—top finishers get permanent bragging rights
            </li>
          </ul>
        </div>
      </section>

      {/* Game modes */}
      <section id="modes" className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <span className="text-violet-400 text-sm font-semibold tracking-wider uppercase">Game modes</span>
          <h2 className="text-4xl sm:text-5xl font-bold mt-2 mb-4">
            Every way to play
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mb-16">
            From quick blitz rounds to full 1v1 duels and unlimited practice. Pick a mode and climb.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: 'Daily quiz',
                desc: 'One fresh 10-question quiz per day. Score with correctness and speed. Streaks, days played, and a daily leaderboard.',
                accent: 'from-violet-600 to-purple-700',
              },
              {
                title: 'Quick Fire 10',
                desc: '10 questions, 60 seconds. How fast and accurate can you go?',
                accent: 'from-amber-600 to-orange-700',
              },
              {
                title: 'Category modes',
                desc: 'History, Geography, Capital Cities, Science, Language—each a 10-question, 60-second themed round.',
                accent: 'from-emerald-600 to-teal-700',
              },
              {
                title: '1v1',
                desc: 'Duel another player. Same 10 questions, same time limit; highest score wins. Quick match or invite a friend. Climb divisions and track wins, draws, and losses.',
                accent: 'from-fuchsia-600 to-pink-700',
              },
              {
                title: 'Tournaments',
                desc: 'Global and national tournaments. View upcoming events and brackets. Top 16 advance to live finals.',
                accent: 'from-cyan-600 to-blue-700',
              },
              {
                title: 'Unlimited quiz',
                desc: 'Practice with no limit. No time pressure—just questions whenever you want.',
                accent: 'from-slate-600 to-slate-700',
              },
            ].map((mode) => (
              <div
                key={mode.title}
                className={`rounded-2xl bg-gradient-to-br ${mode.accent} p-6 sm:p-8 border border-white/10 shadow-xl`}
              >
                <h3 className="text-xl font-bold mb-3">{mode.title}</h3>
                <p className="text-white/90 text-sm leading-relaxed">{mode.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tournaments */}
      <section id="tournaments" className="relative py-24 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-950/10 to-transparent" />
        <div className="relative max-w-6xl mx-auto">
          <span className="text-amber-400 text-sm font-semibold tracking-wider uppercase">Competitive</span>
          <h2 className="text-4xl sm:text-5xl font-bold mt-2 mb-4">
            Tournaments
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mb-8">
            Compete in global and national tournaments. View upcoming events, brackets, and qualification. Top 16 advance to live finals—real stakes, real recognition.
          </p>
          <ul className="grid sm:grid-cols-2 gap-4 max-w-3xl text-slate-300 space-y-2">
            <li className="flex items-center gap-3">
              <span className="text-amber-400 font-bold">•</span>
              Global and country-based tournaments
            </li>
            <li className="flex items-center gap-3">
              <span className="text-amber-400 font-bold">•</span>
              Clear brackets and progression (Top 16 → Live Finals)
            </li>
            <li className="flex items-center gap-3">
              <span className="text-amber-400 font-bold">•</span>
              Upcoming events and schedules in the app
            </li>
          </ul>
        </div>
      </section>

      {/* Leaderboards & progression */}
      <section className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <span className="text-violet-400 text-sm font-semibold tracking-wider uppercase">Progression</span>
          <h2 className="text-4xl sm:text-5xl font-bold mt-2 mb-4">
            Leaderboards & XP
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mb-8">
            Global, country, and friends leaderboards. Sort by XP or wins. Level up from correct answers and bonuses—refer 3 friends to earn 500 XP. Your rank is always visible.
          </p>
        </div>
      </section>

      {/* CTA / Download */}
      <section id="download" className="relative py-28 px-6">
        <div className="absolute inset-0 bg-gradient-to-t from-violet-950/50 via-transparent to-transparent" />
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4">
            Ready to compete?
          </h2>
          <p className="text-slate-400 text-lg mb-10">
            Download Trivora on iOS or Android. Sign in on the web to play from your browser.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/auth/signin"
              className="rounded-xl bg-white text-slate-900 px-8 py-4 text-lg font-bold hover:bg-slate-100 transition"
            >
              Sign in (web)
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-xl bg-white/10 border border-white/30 px-8 py-4 text-lg font-bold hover:bg-white/20 transition"
            >
              Create account
            </Link>
          </div>
          <p className="text-slate-500 text-sm mt-8">
            www.trivoraapp.com
          </p>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-semibold">Trivora</span>
          <span className="text-slate-500 text-sm">Outthink. Outplay. Outrank.</span>
        </div>
      </footer>
    </div>
  );
}
