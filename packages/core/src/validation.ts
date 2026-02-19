/** Username: alphanumeric + underscore, 3–24 chars */
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
/** Team name length */
const TEAM_NAME_MIN = 2;
const TEAM_NAME_MAX = 32;

/** Leetspeak substitutions for profanity check (stub; real impl in edge function) */
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  '$': 's',
};

export function normalizeForProfanity(text: string): string {
  let t = text.toLowerCase();
  for (const [k, v] of Object.entries(LEET_MAP)) {
    t = t.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), v);
  }
  return t.replace(/[^a-z]/g, '');
}

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

export function isValidTeamName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= TEAM_NAME_MIN && trimmed.length <= TEAM_NAME_MAX;
}

export function sanitizeDisplayName(name: string): string {
  return name.trim().slice(0, 48);
}
