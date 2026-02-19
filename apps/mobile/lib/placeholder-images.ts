// Stable placeholder images (picsum.photos by seed). Replace with real assets later.
const W = 400;
const H = 220;
const base = (seed: string) => `https://picsum.photos/seed/${seed}/${W}/${H}`;

export const PLACEHOLDER_IMAGES = {
  dailyQuiz: base('mahan-daily'),
  oneVone: base('mahan-1v1'),
  leaderboards: base('mahan-leaderboard'),
  liveQuiz: base('mahan-live'),
  arena: base('mahan-arena'),
  tournament: base('mahan-tournament'),
  profile: base('mahan-profile'),
  signIn: base('mahan-signin'),
  signUp: base('mahan-signup'),
} as const;
