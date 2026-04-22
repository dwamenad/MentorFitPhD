export const SUPPORTED_COUNTRIES = [
  { code: 'US', label: 'United States', shortLabel: 'US' },
  { code: 'GB', label: 'United Kingdom', shortLabel: 'UK' },
  { code: 'FR', label: 'France', shortLabel: 'France' },
  { code: 'CA', label: 'Canada', shortLabel: 'Canada' },
] as const;

export type SupportedCountryCode = typeof SUPPORTED_COUNTRIES[number]['code'];

const COUNTRY_LABELS = Object.fromEntries(
  SUPPORTED_COUNTRIES.map((country) => [country.code, country.label]),
) as Record<SupportedCountryCode, string>;

export function isSupportedCountryCode(value: string): value is SupportedCountryCode {
  return SUPPORTED_COUNTRIES.some((country) => country.code === value);
}

export function normalizePreferredCountries(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as SupportedCountryCode[];
  }

  return [...new Set(
    value
      .map((country) => `${country}`.trim().toUpperCase())
      .filter(isSupportedCountryCode),
  )];
}

export function getCountryLabel(code?: string | null) {
  if (!code) {
    return undefined;
  }

  const normalized = code.trim().toUpperCase();
  return isSupportedCountryCode(normalized) ? COUNTRY_LABELS[normalized] : normalized;
}
