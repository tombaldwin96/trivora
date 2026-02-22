export function countryToFlagEmoji(countryCode: string) {
  if (!countryCode || countryCode.length !== 2) return null;
  const code = countryCode.toUpperCase();
  const a = 0x1f1e6; // Regional Indicator A
  return String.fromCodePoint(...[...code].map((c) => a + (c.charCodeAt(0) - 65)));
}

export const COUNTRY_OPTIONS: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' }, { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' }, { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' }, { code: 'IT', name: 'Italy' }, { code: 'NL', name: 'Netherlands' },
  { code: 'IN', name: 'India' }, { code: 'BR', name: 'Brazil' }, { code: 'MX', name: 'Mexico' },
  { code: 'JP', name: 'Japan' }, { code: 'KR', name: 'South Korea' }, { code: 'CN', name: 'China' },
  { code: 'IE', name: 'Ireland' }, { code: 'NZ', name: 'New Zealand' }, { code: 'ZA', name: 'South Africa' },
  { code: 'SE', name: 'Sweden' }, { code: 'NO', name: 'Norway' }, { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' }, { code: 'PL', name: 'Poland' }, { code: 'PT', name: 'Portugal' },
  { code: 'BE', name: 'Belgium' }, { code: 'AT', name: 'Austria' }, { code: 'CH', name: 'Switzerland' },
  { code: 'AR', name: 'Argentina' }, { code: 'CO', name: 'Colombia' }, { code: 'CL', name: 'Chile' },
  { code: 'PH', name: 'Philippines' }, { code: 'SG', name: 'Singapore' }, { code: 'MY', name: 'Malaysia' },
  { code: 'AE', name: 'United Arab Emirates' }, { code: 'SA', name: 'Saudi Arabia' }, { code: 'EG', name: 'Egypt' },
  { code: 'NG', name: 'Nigeria' }, { code: 'KE', name: 'Kenya' }, { code: 'GH', name: 'Ghana' },
  { code: 'IL', name: 'Israel' }, { code: 'TR', name: 'Turkey' }, { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' }, { code: 'GR', name: 'Greece' }, { code: 'RO', name: 'Romania' },
  { code: 'CZ', name: 'Czech Republic' }, { code: 'HU', name: 'Hungary' }, { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' }, { code: 'ID', name: 'Indonesia' }, { code: 'PK', name: 'Pakistan' },
  { code: 'BD', name: 'Bangladesh' },
];

export function countryCodeToName(code: string | undefined): string {
  if (!code) return '—';
  const c = COUNTRY_OPTIONS.find((o) => o.code.toUpperCase() === code.toUpperCase());
  return c ? c.name : code;
}
