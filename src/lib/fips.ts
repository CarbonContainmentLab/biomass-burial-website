/**
 * FIPS codes are zero-padded strings, never numbers.
 *
 * The failure this guards against is specific and quiet: if a code arrives as
 * an integer, `06001` becomes `6001`, every California county fails to join, and
 * the interface shows a plausible map with 58 counties missing. The pipeline
 * asserts the join on its side (01 §5, Stage 03); this is the browser's half.
 */

export type Geoid2 = string;
export type Geoid5 = string;

export const STATE_FIPS_LENGTH = 2;
export const COUNTY_GEOID_LENGTH = 5;

/** `'4'` → `'04'`, `'4001'` → `'04001'`, `4001` → `'04001'`. */
export function padFips(value: string | number, length: number): string {
  return String(value).trim().padStart(length, '0');
}

export const stateFips = (value: string | number): Geoid2 => padFips(value, STATE_FIPS_LENGTH);
export const countyGeoid = (value: string | number): Geoid5 => padFips(value, COUNTY_GEOID_LENGTH);

/** The state half of a county GEOID. `'04001'` → `'04'`. */
export const stateOfGeoid = (geoid: Geoid5): Geoid2 => geoid.slice(0, STATE_FIPS_LENGTH);

export const isStateFips = (value: unknown): value is Geoid2 =>
  typeof value === 'string' && /^\d{2}$/.test(value);

export const isCountyGeoid = (value: unknown): value is Geoid5 =>
  typeof value === 'string' && /^\d{5}$/.test(value);

/**
 * The eleven study-area states (01 §5, Stage 02). Names, not the FIPS map, are
 * what the interface shows, so both directions live here.
 */
export const STATE_NAMES: Readonly<Record<Geoid2, string>> = {
  '04': 'Arizona',
  '06': 'California',
  '08': 'Colorado',
  '16': 'Idaho',
  '30': 'Montana',
  '32': 'Nevada',
  '35': 'New Mexico',
  '41': 'Oregon',
  '49': 'Utah',
  '53': 'Washington',
  '56': 'Wyoming',
};

export const stateName = (fips: Geoid2): string => STATE_NAMES[fips] ?? fips;

/** A–Z by name, which is the order both the dropdown and the search use. */
export const STATES_ALPHABETICAL: readonly { fips: Geoid2; name: string }[] = Object.entries(
  STATE_NAMES,
)
  .map(([fips, name]) => ({ fips, name }))
  .sort((a, b) => a.name.localeCompare(b.name));
