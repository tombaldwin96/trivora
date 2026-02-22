/**
 * Population-weighted coordinates (major city / population center) per country.
 * UK (GB) and Ireland (IE) use precise city-centre coordinates; rest are representative.
 */
export const COUNTRY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  US: { latitude: 38.5, longitude: -92.0 },
  GB: { latitude: 51.5074, longitude: -0.1278 },
  CA: { latitude: 43.65, longitude: -79.38 },
  AU: { latitude: -33.87, longitude: 151.21 },
  DE: { latitude: 50.1, longitude: 8.7 },
  FR: { latitude: 48.86, longitude: 2.35 },
  ES: { latitude: 40.42, longitude: -3.7 },
  IT: { latitude: 41.9, longitude: 12.5 },
  NL: { latitude: 52.37, longitude: 4.89 },
  IN: { latitude: 19.08, longitude: 72.88 },
  BR: { latitude: -23.55, longitude: -46.63 },
  MX: { latitude: 19.43, longitude: -99.13 },
  JP: { latitude: 35.68, longitude: 139.65 },
  KR: { latitude: 37.57, longitude: 126.98 },
  CN: { latitude: 31.23, longitude: 121.47 },
  IE: { latitude: 53.3498, longitude: -6.2603 },
  NZ: { latitude: -36.85, longitude: 174.76 },
  ZA: { latitude: -26.2, longitude: 28.04 },
  SE: { latitude: 59.33, longitude: 18.07 },
  NO: { latitude: 59.91, longitude: 10.75 },
  DK: { latitude: 55.68, longitude: 12.57 },
  FI: { latitude: 60.17, longitude: 24.94 },
  PL: { latitude: 52.23, longitude: 21.01 },
  PT: { latitude: 38.72, longitude: -9.14 },
  BE: { latitude: 50.85, longitude: 4.35 },
  AT: { latitude: 48.21, longitude: 16.37 },
  CH: { latitude: 47.38, longitude: 8.54 },
  AR: { latitude: -34.6, longitude: -58.38 },
  CO: { latitude: 4.71, longitude: -74.07 },
  CL: { latitude: -33.45, longitude: -70.67 },
  PH: { latitude: 14.6, longitude: 120.98 },
  SG: { latitude: 1.35, longitude: 103.82 },
  MY: { latitude: 3.14, longitude: 101.69 },
  AE: { latitude: 25.2, longitude: 55.27 },
  SA: { latitude: 24.71, longitude: 46.68 },
  EG: { latitude: 30.04, longitude: 31.24 },
  NG: { latitude: 6.45, longitude: 3.39 },
  KE: { latitude: -1.29, longitude: 36.82 },
  GH: { latitude: 5.6, longitude: -0.19 },
  IL: { latitude: 32.08, longitude: 34.78 },
  TR: { latitude: 41.01, longitude: 28.95 },
  RU: { latitude: 55.75, longitude: 37.62 },
  UA: { latitude: 50.45, longitude: 30.52 },
  GR: { latitude: 37.98, longitude: 23.73 },
  RO: { latitude: 44.43, longitude: 26.1 },
  CZ: { latitude: 50.08, longitude: 14.44 },
  HU: { latitude: 47.5, longitude: 19.04 },
  TH: { latitude: 13.75, longitude: 100.5 },
  VN: { latitude: 21.03, longitude: 105.85 },
  ID: { latitude: -6.21, longitude: 106.85 },
  PK: { latitude: 24.86, longitude: 67.01 },
  BD: { latitude: 23.81, longitude: 90.41 },
};

export function getCountryCoordinates(countryCode: string): { latitude: number; longitude: number } | null {
  const key = countryCode?.trim().toUpperCase();
  if (!key) return null;
  return COUNTRY_COORDINATES[key] ?? null;
}
