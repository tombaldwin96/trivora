// Stable placeholder images (picsum.photos by seed). Replace with real assets later.
const W = 400;
const H = 220;
const base = (seed: string) => `https://picsum.photos/seed/${seed}/${W}/${H}`;

export const PLACEHOLDER_IMAGES = {
  dailyQuiz: base('trivora-daily'),
  oneVone: base('trivora-1v1'),
  leaderboards: base('trivora-leaderboard'),
  liveQuiz: base('trivora-live'),
  arena: base('trivora-arena'),
  quickFire: base('trivora-quickfire'),
  tournament: base('trivora-tournament'),
  profile: base('trivora-profile'),
  signIn: base('trivora-signin'),
  signUp: base('trivora-signup'),
} as const;
