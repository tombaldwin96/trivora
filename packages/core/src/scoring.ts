import type { ScoringParams, AttemptDetail } from './types';
import { DEFAULT_SCORING } from './types';

/** Minimum human reaction time (ms) - anti-cheat floor */
export const MIN_HUMAN_REACTION_MS = 300;
/** Suspicious if consistently under this (ms) */
export const SUSPICIOUS_FAST_MS = 400;

/**
 * Calculate points for a single question answer.
 * Formula: basePoints + timeBonus (faster = more), wrong = wrongAnswerPoints.
 */
export function scoreSingleAnswer(
  correct: boolean,
  timeMs: number,
  timeLimitMs: number,
  params: Partial<ScoringParams> = {}
): number {
  const p = { ...DEFAULT_SCORING, ...params };
  if (!correct) return p.wrongAnswerPoints;
  const timeBonus =
    timeMs <= p.timeLimitMs
      ? Math.round(p.maxTimeBonus * (1 - timeMs / p.timeLimitMs))
      : 0;
  return p.basePoints + timeBonus;
}

/**
 * Total score from attempt details.
 */
export function totalScoreFromDetails(
  details: AttemptDetail[],
  timeLimitMs: number = DEFAULT_SCORING.timeLimitMs
): number {
  const params = { ...DEFAULT_SCORING, timeLimitMs };
  return details.reduce(
    (sum, d) =>
      sum +
      scoreSingleAnswer(d.correct, d.timeMs, timeLimitMs, params),
    0
  );
}

/**
 * Anti-cheat: clamp time to human minimum.
 */
export function clampReactionTime(timeMs: number): number {
  return Math.max(timeMs, MIN_HUMAN_REACTION_MS);
}

/**
 * Check if timing is suspicious (too fast repeatedly).
 */
export function isSuspiciousTiming(timesMs: number[]): boolean {
  const tooFast = timesMs.filter((t) => t < SUSPICIOUS_FAST_MS).length;
  return tooFast >= Math.ceil(timesMs.length * 0.8);
}

/**
 * Match points for 1v1: Win +3, Draw +1, Loss -2.
 */
export function matchPoints(result: 'win' | 'draw' | 'loss'): number {
  switch (result) {
    case 'win':
      return 3;
    case 'draw':
      return 1;
    case 'loss':
      return -2;
    default:
      return 0;
  }
}

/**
 * Canonical rank score: weighted combination with recency decay.
 * Weights: daily 0.25, 1v1 0.35, live 0.2, arena/tournament 0.2.
 */
export function rankScoreWeights(): Record<string, number> {
  return {
    daily: 0.25,
    '1v1': 0.35,
    live: 0.2,
    arena: 0.1,
    tournament: 0.1,
  };
}

/**
 * Recency decay factor (e.g. last 30 days = 1, older = decay).
 */
export function recencyDecay(daysAgo: number, halfLifeDays: number = 30): number {
  if (daysAgo <= 0) return 1;
  return Math.pow(0.5, daysAgo / halfLifeDays);
}
