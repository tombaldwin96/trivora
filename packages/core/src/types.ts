/** Shared types for Trivora quiz platform */

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
  timeLimitMs: 60000, // 60s per question for 1v1 / quick-fire-style modes
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

// --- The Trivora Global Quiz Rankings (championship tournament) ---
export type TournamentType = 'global' | 'national';
export type TournamentStatus =
  | 'upcoming'
  | 'registration_open'
  | 'in_progress'
  | 'finals'
  | 'completed'
  | 'draft'
  | 'published'
  | 'live'
  | 'ended';
export type TournamentRegistrationPaymentStatus = 'unpaid' | 'paid' | 'refunded';
export type TournamentMatchStatus = 'scheduled' | 'live' | 'completed' | 'forfeit';

export interface ChampionshipTournament {
  id: string;
  type: TournamentType | null;
  name: string | null;
  title: string;
  description: string | null;
  entry_fee_pence: number | null;
  prize_pence: number | null;
  location_city: string | null;
  location_country: string | null;
  finals_venue_name: string | null;
  registration_opens_at: string | null;
  games_begin_at: string | null;
  starts_at: string;
  ends_at: string;
  finals_at: string | null;
  finals_time_window: string | null;
  awards_at: string | null;
  finals_top_n: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TournamentRegistration {
  id: string;
  tournament_id: string;
  user_id: string;
  payment_status: TournamentRegistrationPaymentStatus;
  payment_provider: string | null;
  created_at: string;
}

export interface TournamentRound {
  id: string;
  tournament_id: string;
  round_number: number;
  label: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  round_number: number;
  player_a_id: string | null;
  player_b_id: string | null;
  status: TournamentMatchStatus;
  scheduled_at: string | null;
  completed_at: string | null;
  winner_user_id: string | null;
  player_a_score: number;
  player_b_score: number;
  created_at: string;
}

export interface TournamentHonour {
  id: string;
  tournament_id: string;
  placement: number;
  user_id: string;
  note: string | null;
  created_at: string;
}
