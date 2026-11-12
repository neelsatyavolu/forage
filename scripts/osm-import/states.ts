// Geofabrik's US extracts: the 50 states, DC and Puerto Rico.
// https://download.geofabrik.de/north-america/us/<name>-latest.osm.pbf

export const GEOFABRIK_US = "https://download.geofabrik.de/north-america/us";

export const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "district-of-columbia",
  "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new-hampshire", "new-jersey", "new-mexico", "new-york", "north-carolina", "north-dakota", "ohio", "oklahoma", "oregon",
  "pennsylvania", "puerto-rico", "rhode-island", "south-carolina", "south-dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west-virginia", "wisconsin", "wyoming",
] as const;

/** The states named in a comma- or space-separated list, all of them when it's empty. Throws on an unknown name. */
export function parseStates(list: string | undefined): string[] {
  const names = (list ?? "").split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (names.length === 0) return [...US_STATES];
  const unknown = names.filter((n) => !(US_STATES as readonly string[]).includes(n));
  if (unknown.length) throw new Error(`Unknown state(s): ${unknown.join(", ")}. Use Geofabrik names, e.g. rhode-island, new-york.`);
  return [...new Set(names)];
}
