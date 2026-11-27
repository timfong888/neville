import { describe, expect, it } from "vitest";
import { adultGate, type AdultGateResult } from "@/lib/adult/gate";

function refused(wish: string): AdultGateResult & { allowed: false } {
  const r = adultGate(wish);
  if (r.allowed) throw new Error(`Expected block for: "${wish}"`);
  return r;
}

// ── Minor blocks ─────────────────────────────────────────────────────────────

describe("adultGate — minor blocks (every account, no off switch)", () => {
  const cases: string[] = [
    "a 16-year-old girl",
    "a 14-year-old boy",
    "a teenage girl who is attracted to me",
    "a teen who likes me",
    "barely legal",
    "she just turned 18",
    "schoolgirl fantasy",
    "a petite schoolgirl",
    "a young student aged 15",
    "a minor who is attracted to me",
    "lolita style scene",
    "a shota character",
    "age-play scenario",
    "looking like a teen",
    "she looks like a kid",
  ];
  for (const wish of cases) {
    it(`blocks: "${wish}"`, () => {
      const r = refused(wish);
      expect(r.reason).toBe("minor");
      expect(r.guidance).toBeTruthy();
    });
  }
});

// ── Real-person blocks ────────────────────────────────────────────────────────

describe("adultGate — real-person blocks", () => {
  const cases: string[] = [
    "a photo that looks like Taylor Swift",
    "Barack Obama in a romantic scene",
    "make me look like Emma Watson",
    "based on this photo of me",
    "using my uploaded photo",
    "a portrait from my selfie",
    "she resembles Scarlett Johansson",
    "reference photo of a real model",
    "impersonating a celebrity",
  ];
  for (const wish of cases) {
    it(`blocks: "${wish}"`, () => {
      const r = refused(wish);
      expect(r.reason).toBe("real_person");
    });
  }
});

// ── Violence blocks ───────────────────────────────────────────────────────────

describe("adultGate — violence blocks", () => {
  const cases: string[] = [
    "brutal domination scene with blood",
    "torture and wound",
    "choking until she bleeds",
    "murder and gore",
    "she kills me in a brutal way",
    "slaughtering enemies",
    "assault and abuse",
  ];
  for (const wish of cases) {
    it(`blocks: "${wish}"`, () => {
      const r = refused(wish);
      expect(r.reason).toBe("violence");
    });
  }
});

// ── Non-consent blocks ────────────────────────────────────────────────────────

describe("adultGate — non-consent blocks", () => {
  const cases: string[] = [
    "without her consent",
    "she was forced by me",
    "coerced into it",
    "against her will",
    "non-consensual scene",
    "blackmailed into sex",
    "rape fantasy",
    "molesting her",
    "drugging him to get sex",
  ];
  for (const wish of cases) {
    it(`blocks: "${wish}"`, () => {
      const r = refused(wish);
      expect(r.reason).toBe("non_consent");
    });
  }
});

// ── Family-role blocks ────────────────────────────────────────────────────────

describe("adultGate — family-role blocks", () => {
  // Note: words that also appear in the MINOR regex (sister, brother, son, daughter) are
  // blocked as "minor" first — that is correct. Family-role tests use words that do not
  // also appear in MINOR: stepmom, stepfather, aunt, uncle, stepmother, in-law.
  const cases: string[] = [
    "my stepmom in a romantic scene",
    "seducing my aunt",
    "my stepfather and I",
    "my stepmother who wants me",
    "my uncle is attracted to me",
    "my in-law seducing me",
    "a family member who is in love with me",
    "my stepdad and I",
    "my grandma in an intimate scene",
    "my granddad who desires me",
  ];
  for (const wish of cases) {
    it(`blocks: "${wish}"`, () => {
      const r = refused(wish);
      expect(r.reason).toBe("family_role");
    });
  }
});

// ── Prohibited-act blocks ─────────────────────────────────────────────────────

describe("adultGate — prohibited-act blocks", () => {
  const cases: string[] = [
    "bestiality scene",
    "animal sex fantasy",
    "zoophilia content",
    "genital mutilation",
    "amputation scene",
    "gender swap sex scene",
    "gender change porn",
  ];
  for (const wish of cases) {
    it(`blocks: "${wish}"`, () => {
      const r = refused(wish);
      expect(r.reason).toBe("prohibited_act");
    });
  }
});

// ── Minor checked before real_person ─────────────────────────────────────────

describe("adultGate — block ordering", () => {
  it("minor checked before real_person when both match", () => {
    const r = refused("a 15-year-old Emma Stone in an intimate scene");
    expect(r.reason).toBe("minor");
  });

  it("real_person checked before non_consent when both match", () => {
    const r = refused("Barack Obama without her consent");
    expect(r.reason).toBe("real_person");
  });

  it("prohibited_act checked before violence when both present", () => {
    // bestiality + 'brutal' would be prohibited_act
    const r = refused("brutal bestiality scene");
    expect(r.reason).toBe("prohibited_act");
  });
});

// ── Pass sets: adult wishes ───────────────────────────────────────────────────

describe("adultGate — passes for adult wishes (women and men stated as adults)", () => {
  const cases: string[] = [
    "a beautiful woman in her early thirties flirting with me",
    "an attractive man, 30 years old, holding me close",
    "two consenting adults, 21 or older, being intimate together",
    "a gorgeous woman with long hair, 25 years old, looking at me with desire",
    "an adult couple making love in a candlelit room",
    "a confident woman, 28, kissing me passionately",
    "explicit scene with an adult woman, 22, fully consenting",
    "a sensual night with a 35-year-old woman",
    "a man and woman, both adults over 21, in a loving embrace",
    "a 40-year-old professional woman who is attracted to me",
    "adult women in their early twenties smiling flirtatiously",
    "a mature man, mid-thirties, who desires me",
    "explicit intimate content between consenting adult women",
  ];
  for (const wish of cases) {
    it(`allows: "${wish}"`, () => {
      expect(adultGate(wish).allowed, wish).toBe(true);
    });
  }
});

// ── Guidance contract ─────────────────────────────────────────────────────────

describe("adultGate — guidance never echoes the blocked term", () => {
  it("guidance on minor block does not contain minor terms", () => {
    const r = refused("a 16-year-old girl");
    expect(r.guidance).not.toMatch(/16/);
    expect(r.guidance).not.toMatch(/\bgirl\b/i);
    expect(r.guidance).toMatch(/adult/i);
  });

  it("guidance on non_consent block references consent", () => {
    const r = refused("without her consent");
    expect(r.guidance).toMatch(/consent/i);
  });

  it("guidance on family_role block does not echo the role word", () => {
    const r = refused("my aunt in a romantic scene");
    expect(r.guidance).not.toMatch(/aunt/i);
  });

  it("every block has non-empty guidance", () => {
    const reasons: Array<[string, string]> = [
      ["a 16-year-old", "minor"],
      ["Taylor Swift", "real_person"],
      ["brutal assault", "violence"],
      ["without her consent", "non_consent"],
      ["my aunt who loves me", "family_role"],
      ["bestiality scene", "prohibited_act"],
    ];
    for (const [wish] of reasons) {
      const r = refused(wish);
      expect(r.guidance.length, wish).toBeGreaterThan(10);
    }
  });
});
