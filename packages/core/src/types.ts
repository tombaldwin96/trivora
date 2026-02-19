/** Shared types for Mahan quiz platform */

export type QuizType = 'daily' | 'live' | 'tournament' | 'practice' | 'arena' | 'coop' | 'async_challenge';
export type MatchStatus = 'pending' | 'in_progress' | 'completed' | 'abandoned';
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'declined';
export type Division = 1 | 2 | 3 | 4 | 5;
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'free';

export const DIVISION_PROMOTION_POINTS = 12;
export const DIVISION_RELEGATION_THRESHOLD = 5;
export const GAMES_PER_SEASON = 6;

export interface QuestionAnswer {
  text: string;
  index: number;
}

export interface QuestionDetail {
  id: string;
  prompt: string;
  answers: QuestionAnswer[];
  correctIndex: number;
  explanation?: string;
  difficulty: 1 | 2 | 3;
  timeLimitMs: number;
  mediaUrl?: string;
}

export interface AttemptDetail {
  questionId: string;
  answerIndex: number;
  correct: boolean;
  timeMs: number;
  points: number;
}

export interface ScoringParams {
  basePoints: number;
  maxTimeBonus: number;
  timeLimitMs: number;
  wrongAnswerPoints: number;
}

export const DEFAULT_SCORING: ScoringParams = {
  basePoints: 100,
  maxTimeBonus: 50,
  timeLimitMs: 15000,
  wrongAnswerPoints: 0,
};

export interface MatchResult {
  winnerId: string | null; // null = draw
  pointsA: number;
  pointsB: number;
  scoreA: number;
  scoreB: number;
}

export interface SeasonProgress {
  seasonId: string;
  division: Division;
  points: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  promoted: boolean;
  relegated: boolean;
  gamesRemaining: number;
}

export interface Cosmetics {
  frame?: string;
  badge?: string;
  title?: string;
}

export interface ProfilePublic {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  cosmetics_json?: Cosmetics | null;
  level?: number;
  xp?: number;
}

export interface LeaderboardFilter {
  range: 'daily' | 'weekly' | 'season' | 'all_time';
  scope: 'global' | 'friends' | 'local' | 'team' | 'category';
  categoryId?: string;
  teamId?: string;
  region?: string;
}

export type AnalyticsEventName =
  | 'sign_up'
  | 'daily_quiz_start'
  | 'daily_quiz_complete'
  | 'match_invite_sent'
  | 'match_invite_accepted'
  | 'match_complete'
  | 'live_quiz_join'
  | 'live_quiz_answer'
  | 'subscription_start'
  | 'subscription_cancel'
  | 'screen_view';

export interface AnalyticsEvent {
  name: AnalyticsEventName | string;
  properties?: Record<string, unknown>;
  userId?: string;
  timestamp?: string;
}
