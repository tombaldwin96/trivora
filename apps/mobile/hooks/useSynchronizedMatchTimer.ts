/**
 * Drives intro → playing and playing → outro transitions using server time.
 * Never blocks gameplay: if intro time has passed on load, phase is 'playing' immediately.
 */
import { useEffect, useState } from 'react';
import { estimatedServerTimeMs, syncServerTime, shouldSkipIntro } from '@/utils/serverTimeSync';

export type MatchPhase = 'intro' | 'playing' | 'outro' | 'complete';

export interface IntroTiming {
  introStartedAt: string | null;
  introDurationMs: number;
  matchStartAt: string | null;
}

export interface OutroTiming {
  outroStartedAt: string | null;
  outroDurationMs: number;
}

/**
 * Returns current phase and whether to show intro/outro overlay.
 * - intro: show HeadToHeadIntro until server time >= match_start_at
 * - playing: hide intro, show game
 * - outro: show HeadToHeadOutro when outro_started_at is set, until server time >= outro_started_at + outro_duration_ms
 * - complete: hide outro, show result modal
 */
export function useSynchronizedMatchTimer(
  intro: IntroTiming,
  outro: OutroTiming,
  status: string
): {
  phase: MatchPhase;
  showIntro: boolean;
  showOutro: boolean;
  msUntilMatchStart: number | null;
  msUntilOutroEnd: number | null;
  introSkippedDueToLatency: boolean;
} {
  const [now, setNow] = useState(0);
  const [introSkippedDueToLatency, setIntroSkippedDueToLatency] = useState(false);

  // Sync server time when we have intro or match_start_at
  useEffect(() => {
    if (status !== 'in_progress') return;
    if (intro.introStartedAt || intro.matchStartAt) {
      syncServerTime().then(() => setNow(estimatedServerTimeMs()));
    }
  }, [intro.introStartedAt, intro.matchStartAt, status]);

  // Tick to update phase from server time (tick when intro started so we see match_start_at when both ready)
  useEffect(() => {
    if (!intro.introStartedAt && !intro.matchStartAt && !outro.outroStartedAt) return;
    const interval = setInterval(() => setNow(estimatedServerTimeMs()), 100);
    return () => clearInterval(interval);
  }, [intro.introStartedAt, intro.matchStartAt, outro.outroStartedAt]);

  const serverNow = now || estimatedServerTimeMs();
  const matchStartMs = intro.matchStartAt ? new Date(intro.matchStartAt).getTime() : null;
  const outroStartMs = outro.outroStartedAt ? new Date(outro.outroStartedAt).getTime() : null;
  const outroEndMs =
    outroStartMs != null ? outroStartMs + outro.outroDurationMs : null;

  const skipIntro = intro.matchStartAt != null && shouldSkipIntro(intro.matchStartAt);

  useEffect(() => {
    if (skipIntro) setIntroSkippedDueToLatency(true);
  }, [skipIntro]);

  let phase: MatchPhase = 'playing';
  let showIntro = false;
  let showOutro = false;
  let msUntilMatchStart: number | null = null;
  let msUntilOutroEnd: number | null = null;

  if (status === 'completed' && outroStartMs != null) {
    if (outroEndMs != null && serverNow < outroEndMs) {
      phase = 'outro';
      showOutro = true;
      msUntilOutroEnd = outroEndMs - serverNow;
    } else {
      phase = 'complete';
    }
  } else if (status === 'in_progress') {
    // Show intro when intro started and (no match_start yet = waiting for ready, or server time before match start)
    if (intro.introStartedAt && (matchStartMs == null || (serverNow < matchStartMs && !skipIntro))) {
      phase = 'intro';
      showIntro = true;
      msUntilMatchStart = matchStartMs != null ? matchStartMs - serverNow : null;
    } else {
      phase = 'playing';
    }
  }

  return {
    phase,
    showIntro,
    showOutro,
    msUntilMatchStart,
    msUntilOutroEnd,
    introSkippedDueToLatency,
  };
}
