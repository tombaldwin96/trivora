export const APP_NAME = 'Mahan';
export const DEFAULT_AVATAR_PATH = 'avatars/default.png';

export const STREAK_FREEZE_SUBSCRIBER = true;
export const STREAK_MILESTONE_DAYS = [3, 7, 14, 30];

export const DIVISIONS = [1, 2, 3, 4, 5] as const;
export const DIVISION_NAMES: Record<number, string> = {
  1: 'Elite',
  2: 'Gold',
  3: 'Silver',
  4: 'Bronze',
  5: 'Starter',
};

export const DAILY_QUIZ_QUESTION_COUNT = 10;
export const ASYNC_CHALLENGE_EXPIRY_HOURS = 24;
export const INVITE_EXPIRY_HOURS = 72;

export const LEADERBOARD_PAGE_SIZE = 50;
export const MAX_TEAM_MEMBERS = 4;
