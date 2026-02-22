/**
 * Terms that cannot appear in usernames (substring match, case-insensitive).
 * Keep in sync with DB seed in 20250218000005_blocked_username_terms.sql.
 * Used for immediate app-side validation; DB trigger is the source of truth.
 */
const BLOCKED_USERNAME_TERMS = [
  'fuck', 'shit', 'ass', 'bitch', 'dick', 'cunt', 'cock', 'pussy', 'whore', 'slut',
  'nigger', 'nigga', 'faggot', 'fag ', 'retard', 'rape', 'rapist', 'nazi', 'hitler',
  'kys', 'kill yourself', 'die ',
];

export function isUsernameAllowed(username: string): boolean {
  const lower = username.trim().toLowerCase();
  if (!lower) return false;
  for (const term of BLOCKED_USERNAME_TERMS) {
    if (lower.includes(term)) return false;
  }
  return true;
}
