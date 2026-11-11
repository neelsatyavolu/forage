import { describe, expect, it } from "vitest";
import { adjacent, familiesOf } from "./families";
import { kindOf, noteTags, placeTags, slug, splitCuisine, valueOf } from "./vocab";

describe("slug", () => {
  it("lowercases, strips accents and joins words", () => {
    expect(slug("Hand-pulled Noodles!")).toBe("hand_pulled_noodles");
    expect(slug("Crème Brûlée")).toBe("creme_brulee");
    expect(slug("  ")).toBe("");
  });
});

describe("splitCuisine", () => {
  it("splits OSM multi-values", () => {
    expect(splitCuisine(["ramen;japanese", "Thai, Lao"])).toEqual(["ramen", "japanese", "thai", "lao"]);
  });
});

describe("noteTags", () => {
  it("matches whole words and phrases only", () => {
    expect(noteTags("Very spicy broth, cozy room, natural wine list")).toEqual(["vibe:cozy", "attr:spicy", "attr:natural_wine", "attr:wine"]);
    expect(noteTags("cloudy day")).toEqual([]);
  });
});

describe("placeTags", () => {
  it("collects cuisine, price, amenity, card tags, OSM flags and user extras", () => {
    const tags = placeTags(
      {
        cuisine: ["ramen;japanese"],
        priceLevel: 2,
        tags: { amenity: "restaurant", dishes: ["Tonkotsu"], vibe: ["lively"], attributes: ["counter"], occasions: ["casual"], outdoor_seating: "yes" },
      },
      { dishes: ["gyoza", "tonkotsu"], notes: ["long wait but worth it"] },
    );
    expect(tags).toEqual([
      "amenity:restaurant",
      "attr:counter",
      "attr:long_wait",
      "attr:outdoor_seating",
      "cuisine:japanese",
      "cuisine:ramen",
      "dish:gyoza",
      "dish:tonkotsu",
      "occasion:casual",
      "price:2",
      "vibe:lively",
    ]);
  });

  it("ignores malformed tag values", () => {
    expect(placeTags({ cuisine: [], priceLevel: null, tags: { dishes: "nope" as unknown as string[], vibe: [3 as unknown as string] } })).toEqual([]);
  });

  it("splits a tag into kind and value", () => {
    expect(kindOf("dish:gyoza")).toBe("dish");
    expect(kindOf("weird:x")).toBeNull();
    expect(valueOf("dish:dan_dan")).toBe("dan_dan");
  });
});

describe("cuisine families", () => {
  it("knows neighbours", () => {
    expect(adjacent("ramen", "korean")).toBe(true);
    expect(adjacent("thai", "lao")).toBe(true);
    expect(adjacent("thai", "mexican")).toBe(false);
    expect(adjacent("thai", "Thai")).toBe(false);
    expect(familiesOf("sushi")).toEqual(["east_asian", "seafood"]);
    expect(familiesOf("unknown")).toEqual([]);
  });
});
