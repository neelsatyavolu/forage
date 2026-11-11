import { slug } from "./vocab";

// Cuisines grouped into families, so Stretch can suggest a cuisine you haven't
// tried that sits next to one you like (ramen -> korean, thai -> lao).
// Values are OSM cuisine slugs plus common synonyms.

const FAMILIES: Record<string, readonly string[]> = {
  east_asian: ["chinese", "japanese", "korean", "taiwanese", "cantonese", "sichuan", "szechuan", "hunan", "shanghainese", "hong_kong", "ramen", "sushi", "udon", "soba", "izakaya", "dim_sum", "dumplings", "dumpling", "noodles", "noodle", "hot_pot", "yakitori", "tonkatsu", "mongolian"],
  southeast_asian: ["thai", "vietnamese", "lao", "laotian", "malaysian", "indonesian", "filipino", "burmese", "singaporean", "cambodian", "pho"],
  south_asian: ["indian", "pakistani", "nepalese", "nepali", "sri_lankan", "bangladeshi", "himalayan", "tibetan", "curry"],
  middle_eastern: ["lebanese", "turkish", "persian", "iranian", "israeli", "middle_eastern", "arab", "syrian", "afghan", "falafel", "kebab", "shawarma", "uzbek"],
  mediterranean: ["greek", "italian", "spanish", "mediterranean", "pizza", "pasta", "tapas", "portuguese", "basque", "sicilian", "neapolitan"],
  latin_american: ["mexican", "tacos", "taco", "burrito", "tex_mex", "salvadoran", "peruvian", "colombian", "venezuelan", "brazilian", "argentinian", "argentine", "cuban", "caribbean", "puerto_rican", "latin_american", "oaxacan", "arepa"],
  african: ["ethiopian", "eritrean", "moroccan", "nigerian", "senegalese", "west_african", "african", "somali", "egyptian", "south_african"],
  american: ["american", "burger", "bbq", "barbecue", "diner", "sandwich", "chicken", "fried_chicken", "steak_house", "steakhouse", "southern", "cajun", "hot_dog", "wings", "regional"],
  european: ["french", "german", "british", "irish", "polish", "russian", "ukrainian", "georgian", "austrian", "scandinavian", "nordic", "belgian", "swiss", "european", "bistro"],
  cafe_bakery: ["coffee_shop", "cafe", "bakery", "pastry", "donut", "bagel", "breakfast", "brunch", "crepe", "dessert", "ice_cream", "tea", "bubble_tea"],
  seafood: ["seafood", "fish", "fish_and_chips", "oyster", "poke", "sushi"],
  plant_based: ["vegan", "vegetarian", "salad", "juice", "healthy"],
};

const FAMILY_OF: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const [family, members] of Object.entries(FAMILIES)) {
    for (const m of members) map.set(m, [...(map.get(m) ?? []), family]);
  }
  return map;
})();

/** The families a cuisine belongs to (sushi is both east_asian and seafood). */
export function familiesOf(cuisine: string): readonly string[] {
  return FAMILY_OF.get(slug(cuisine)) ?? [];
}

/** True when two different cuisines share a family. */
export function adjacent(a: string, b: string): boolean {
  if (slug(a) === slug(b)) return false;
  const fa = familiesOf(a);
  return familiesOf(b).some((f) => fa.includes(f));
}
