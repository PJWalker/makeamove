import source from "../../../reference/Dungeon World 2 Beta v3.md?raw";
import type { ArtifactDef, ItemDef, ReferenceSectionDef } from "../types";

export interface Dw2PathMove {
  name: string;
  text: string;
  /** The text formatted, with buttons for its costs. */
  rich: string;
  trigger: string;
  stat?: string;
  outcomes?: Record<"strong" | "weak" | "miss", string>;
}

export interface Dw2Path {
  id: string;
  classId: string;
  name: string;
  /** The line under the Path's heading. */
  tagline: string;
  moves: string[];
  rules: Dw2PathMove[];
}

/**
 * A rulebook cell as formatted text (see workspace/FormattedText): its emphasis
 * kept, each result band and each listed option on its own line, and its
 * XP and Treasure costs as buttons.
 */
export const richText = (raw: string) =>
  raw
    .replace(/\[([^\]]+)\]\((?:\\.|[^)])*\)/g, "$1")
    .replace(/\\\*/g, "∗")
    .replace(/\\([\\!+_#.|(){}[\]-])/g, "$1")
    .replace(/\{#[^}]+\}/g, "")
    .replace(/__([^_]+)__/g, "**$1**")
    .replace(/[ \t]+/g, " ")
    // "+STR if you…" options, as a list.
    .replace(/\s\+(STR|DEX|INT|WIS|CHA)\b(?=\s+(?:if|when|to)\b)/g, "\n- **+$1**")
    // "*Carouse*. Spend…" options, as a list.
    .replace(/(^|[\s:.])\*([A-Z][^*\n]{0,40}?)\*([.:])\s/g, "$1\n- *$2*$3 ")
    // "*Quickly, risking it all* — …" options, as a list.
    .replace(/(^|\s)\*([A-Z][^*\n]{0,40}?)\*\s+—\s/g, "$1\n- *$2* — ")
    // "*It's risky*; …" options, as a list.
    .replace(/(^|\s)\*([A-Z][^*\n]{0,40}?)\*;\s/g, "$1\n- *$2*; ")
    // An italic run of questions, one to a line.
    .replace(
      /:\s*\*([^*\n]+\?)\*\s*/g,
      (_m, qs: string) =>
        `:\n${qs
          .split(/(?<=\?)\s+/)
          .map((q) => `- *${q.trim()}*`)
          .join("\n")}\n\n`,
    )
    // Each result band its own paragraph.
    .replace(/\s*[✷✶]\s*On a (10\+|12\+|7-9|6-)([,:]?)\s*/g, "\n\n**On a $1$2** ")
    .replace(/\b(?:mark|marks) (?:1 )?XP\b/gi, (m) => `[[+1 XP|${m}]]`)
    .replace(/\b(?:spend|spends) (\d+) Treasure\b/gi, (m, n: string) => `[[-${n} Treasure|${m}]]`)
    .replace(/ *\n */g, "\n")
    .trim();

const plain = (text: string) =>
  text
    .replace(/\[([^\]]+)\]\((?:\\.|[^)])*\)/g, "$1")
    .replace(/\\([\\!*+_#.|(){}[\]-])/g, "$1")
    .replace(/[*_]/g, "")
    .replace(/\{#[^}]+\}/g, "")
    .trim();

const key = (text: string) =>
  plain(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const moveHeadings = [...source.matchAll(/^### (.+)$/gm)];
const headings = [...source.matchAll(/^(?:[-*+] \[[x ]\] )?#### (.+)$/gm)];

const artifactDefinitions: Record<string, ArtifactDef> = {
  "Alveric’s Soulstealer Blade": {
    track: "Trapped Souls",
    capacity: 5,
    unlockMode: "choose",
    requiresEquipped: true,
    unlocks: ["Gravity-Defying Menace", "Reality Rifter", "The Great Banisher"].map((name) => ({
      id: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      name,
    })),
  },
  "Caliburnus, The Sword That Heals": {
    track: "Ruin",
    capacity: 5,
    unlockMode: "choose",
    requiresEquipped: true,
    unlocks: ["A New Dawn", "Bright Eyes", "Promised Victory"].map((name) => ({
      id: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      name,
    })),
  },
  "Elleovene’s Circlet of Supreme Mesmerism": {
    track: "Stone Heart",
    capacity: 5,
    unlockMode: "choose",
    requiresEquipped: true,
    unlocks: ["Master of Puppets", "Spy the World’s Mind Web", "Willbreaker"].map((name) => ({
      id: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      name,
    })),
  },
  "Indelible Mark of Drakon": {
    track: "Spreading Scales",
    capacity: 5,
    unlockMode: "choose",
    unlocks: ["Claws Like Steel", "Fire Tongue", "Sinewy Wings"].map((name) => ({
      id: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      name,
    })),
  },
  "Gwendolen’s Branch of the Green": {
    track: "Growth",
    capacity: 5,
    unlockMode: "sequential-replace",
    requiresEquipped: true,
    unlocks: ["Spring’s Saplings", "Summer’s Blooms", "Autumn’s Fruits", "Winter’s Solace"].map(
      (name) => ({
        id: name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        name,
      }),
    ),
  },
  "Lazurite Dragon Orb": {
    track: "Mastery",
    capacity: 5,
    unlockMode: "choose",
    requiresEquipped: true,
    unlocks: ["Draconic Might", "Draconic Magic", "Draconic Power", "Draconic Sway"].map(
      (name) => ({
        id: name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        name,
      }),
    ),
  },
};

export const sourceMagicItems = (): ItemDef[] => {
  const magicStart = source.indexOf("### Example Magic Items");
  const artifactStart = source.indexOf("### Example Artifacts");
  const campaignStart = source.indexOf("# Campaign Mode");
  if (magicStart < 0 || artifactStart < 0 || campaignStart < 0)
    throw new Error("Missing Dungeon World 2 magic-item sections");

  const sections = [
    { source: source.slice(magicStart, artifactStart), artifact: false },
    { source: source.slice(artifactStart, campaignStart), artifact: true },
  ];
  return sections.flatMap(({ source: section, artifact }) => {
    const entries = [...section.matchAll(/^#### (.+)$/gm)];
    return entries.flatMap((heading, index): ItemDef[] => {
      const rawName = heading[1];
      if (!rawName || heading.index === undefined || !heading[0]) return [];
      const end = entries[index + 1]?.index ?? section.length;
      const body = section.slice(heading.index + heading[0].length, end);
      const nameText = rawName
        .replace(/\\_{3,}/g, "___")
        .replace(/^\*/, "")
        .replace(/\*\s*(?:—.*)?$/, "");
      const name = plain(nameText).replace(/\s+/g, " ").trim();
      const description = plain(
        body
          .split(/\r?\n/)
          .filter((line) => line.trim() && !/^\s*\|\s*:?[-]+/.test(line))
          .map((line) => line.replace(/^\s*\|\s?|\s*\|\s*$/g, ""))
          .join(" "),
      )
        .replace(/\s+/g, " ")
        .trim();
      const uses = (rawName.match(/◯/g) ?? []).length;
      if (!name || !description) return [];
      const artifactDefinition = artifact ? artifactDefinitions[name] : undefined;
      if (artifact && !artifactDefinition)
        throw new Error(`Missing Dungeon World 2 Artifact metadata: ${name}`);
      const artifactUnlocks = artifactDefinition?.unlocks.map((unlock) => {
        const start = description.indexOf(`${unlock.name}.`);
        const end = Math.min(
          ...artifactDefinition.unlocks
            .filter((candidate) => candidate.id !== unlock.id)
            .map((candidate) => {
              const candidateStart = description.indexOf(`${candidate.name}.`);
              return candidateStart > start ? candidateStart : description.length;
            }),
        );
        return { ...unlock, ...(start >= 0 ? { text: description.slice(start, end).trim() } : {}) };
      });
      return [
        {
          id: `dw2-${artifact ? "artifact" : "magic"}-${name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")}`,
          name,
          description,
          weight: 0,
          tags: ["magic", artifact ? "artifact" : "magic-item"],
          ...(uses > 0 ? { uses } : {}),
          ...(name === "animated shield" || name === "magic wand" ? { resetUsesAtCamp: true } : {}),
          ...(name === "magic wand" ? { itemUse: "magic-wand" as const } : {}),
          ...(artifactDefinition?.requiresEquipped ? { equippable: true } : {}),
          ...(artifactDefinition
            ? { artifact: { ...artifactDefinition, unlocks: artifactUnlocks! } }
            : {}),
        },
      ];
    });
  });
};

export const sourceGmReference = (): ReferenceSectionDef[] => {
  const sections = [
    ["agenda", "Agenda"],
    ["principles", "Principles"],
    ["gm-moves", "GM Moves"],
    ["develop-important-npcs", "Develop Important NPCs"],
    ["major-npcs", "Major NPCs"],
  ] as const;
  return sections.map(([id, title]) => {
    const start = source.indexOf(`## ${title} `);
    if (start < 0) throw new Error(`Missing Dungeon World 2 GM reference: ${title}`);
    const headingEnd = source.indexOf("\n", start);
    const next = [...source.matchAll(/^## /gm)].find((heading) => (heading.index ?? 0) > start);
    const text = source
      .slice(headingEnd + 1, next?.index ?? source.length)
      .split(/\r?\n/)
      .filter((line) => !/^\s*\|\s*:?[-]+/.test(line))
      .map((line) => plain(line.replace(/^\s*\|\s?|\s*\|\s*$/g, "")))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { id, title, text };
  });
};

export const sourceClassSectionText = (classId: string, sectionName: string): string => {
  const classHeading = [...source.matchAll(/^## The (.+?) \{#[^}]+\}$/gm)].find(
    (heading) => key(heading[1] ?? "") === key(classId),
  );
  if (!classHeading?.index) throw new Error(`Missing Dungeon World 2 class: ${classId}`);
  const nextClass = [...source.matchAll(/^## /gm)].find(
    (heading) => (heading.index ?? 0) > classHeading.index,
  );
  const classEnd = nextClass?.index ?? source.length;
  const sectionHeading = moveHeadings.find(
    (heading) =>
      (heading.index ?? 0) > classHeading.index &&
      (heading.index ?? 0) < classEnd &&
      key(heading[1] ?? "").startsWith(key(sectionName)),
  );
  if (!sectionHeading?.index || !sectionHeading[0])
    throw new Error(`Missing ${sectionName} prompt for ${classId}`);
  const nextSection = moveHeadings.find((heading) => (heading.index ?? 0) > sectionHeading.index);
  const sectionEnd = Math.min(nextSection?.index ?? classEnd, classEnd);
  return plain(source.slice(sectionHeading.index + sectionHeading[0].length, sectionEnd));
};

export const sourceMoveText = (name: string, level: 3 | 4 = 3): string => {
  const candidates = level === 3 ? moveHeadings : headings;
  const index = candidates.findIndex((heading) => key(heading[1] ?? "").startsWith(key(name)));
  if (index < 0) throw new Error(`Missing Dungeon World 2 move: ${name}`);
  const heading = candidates[index]!;
  if (heading.index === undefined || !heading[0])
    throw new Error(`Malformed Dungeon World 2 move heading: ${name}`);
  const section = source.slice(
    heading.index + heading[0].length,
    candidates[index + 1]?.index ?? source.length,
  );
  const rule = section
    .split("\n")
    .find((line) => /^\s*\|/.test(line) && !/^\s*\|\s*:?-+/.test(line));
  if (!rule) throw new Error(`Missing Dungeon World 2 move text: ${name}`);
  return plain(rule.replace(/^\s*\|\s?|\s*\|\s*$/g, "")).replace(/\s+/g, " ");
};

/** A move's rule from the rulebook as formatted text, with buttons for its costs. */
export const sourceMoveRichText = (name: string, level: 3 | 4 = 3): string => {
  const candidates = level === 3 ? moveHeadings : headings;
  const heading = candidates.find((h) => key(h[1] ?? "").startsWith(key(name)));
  const at = heading?.index;
  if (!heading || at === undefined) throw new Error(`Missing Dungeon World 2 move: ${name}`);
  const next = candidates[candidates.indexOf(heading) + 1]?.index ?? source.length;
  const rule = source
    .slice(at + heading[0].length, next)
    .split("\n")
    .find((line) => /^\s*\|/.test(line) && !/^\s*\|\s*:?-+/.test(line));
  if (!rule) throw new Error(`Missing Dungeon World 2 move text: ${name}`);
  return richText(rule.replace(/^\s*\|\s?|\s*\|\s*$/g, ""));
};

export const sourceMoveOutcomes = (
  name: string,
  level: 3 | 4 = 3,
): Record<"strong" | "weak" | "miss", string> | undefined => {
  const text = sourceMoveText(name, level);
  const markers = [...text.matchAll(/[✷✶]\s*On a (10\+|7-9|6-)[,:]?\s*/g)];
  if (markers.length !== 3) return undefined;
  const entries = markers.map((marker, index) => {
    const band = marker[1] === "10+" ? "strong" : marker[1] === "7-9" ? "weak" : "miss";
    const start = (marker.index ?? 0) + marker[0].length;
    const end = markers[index + 1]?.index ?? text.length;
    return [band, text.slice(start, end).trim()] as const;
  });
  return Object.fromEntries(entries) as Record<"strong" | "weak" | "miss", string>;
};

const ruleFor = (name: string): Dw2PathMove => {
  const index = headings.findIndex(
    (heading) => (heading[1] ?? "").length > 0 && key(heading[1] ?? "").startsWith(key(name)),
  );
  if (index < 0) throw new Error(`Missing Dungeon World 2 Path move: ${name}`);
  const heading = headings[index]!;
  if (heading.index === undefined || !heading[0])
    throw new Error(`Malformed Dungeon World 2 Path heading: ${name}`);
  const section =
    source
      .slice(heading.index + heading[0].length, headings[index + 1]?.index ?? source.length)
      .split(/^### /m)[0] ?? "";
  const cells = section
    .split("\n")
    .filter((line) => !/^\s*\|\s*:?-+/.test(line))
    .map((line) => line.replace(/^\s*\|\s?|\s?\|\s*$/g, ""))
    .join("\n");
  const text = plain(cells).trim();
  const markers = [...text.matchAll(/✷\s*On a (10\+|7-9|6-)[,:]?\s*/g)];
  const outcomes = Object.fromEntries(
    markers.flatMap((marker, position) => {
      const threshold = marker[1];
      if (!threshold || marker.index === undefined || !marker[0]) return [];
      return [
        [
          threshold === "10+" ? "strong" : threshold === "7-9" ? "weak" : "miss",
          text
            .slice(marker.index + marker[0].length, markers[position + 1]?.index ?? text.length)
            .trim(),
        ],
      ];
    }),
  );
  const statName = text.match(/roll\s*\+\s*(STR|DEX|INT|WIS|CHA)/i)?.[1];
  const stat = statName?.toLowerCase();
  const strong = outcomes.strong;
  const weak = outcomes.weak;
  const miss = outcomes.miss;
  return {
    name,
    text,
    rich: richText(cells.replace(/\n\s*\n/g, "\n\n")),
    trigger: (text.split(/\broll\s*\+/i).at(0) ?? "").split("\n").at(0)?.trim() ?? "",
    ...(stat && strong && weak && miss ? { stat, outcomes: { strong, weak, miss } } : {}),
  };
};

const taglineFor = (name: string) => {
  const at = source.search(
    new RegExp(`^### ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"),
  );
  const line =
    at < 0
      ? undefined
      : source
          .slice(at)
          .split("\n")
          .slice(1)
          .find((l) => l.trim());
  return line && /^\*[^*]/.test(line.trim()) ? plain(line) : "";
};

const path = (classId: string, name: string, moves: string[]): Dw2Path => ({
  id: `${classId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  classId,
  name,
  tagline: taglineFor(name),
  moves,
  rules: moves.map(ruleFor),
});

export const PATHS: Dw2Path[] = [
  path("barbarian", "Berserker", [
    "Trance-Like Fury",
    "Red Nails",
    "Spine-Chilling Countenance",
    "The Beast Within",
    "When It Earns Me",
  ]),
  path("barbarian", "Hedonist", [
    "Herculean Appetite",
    "Basking in Victory",
    "Forthright Speech",
    "Insatiable",
    "Strong as a Bull",
  ]),
  path("barbarian", "Outlander", [
    "Where I Come From",
    "Pack Reader",
    "Sacrificial Rite",
    "Tread the Jeweled Thrones",
    "Unerring Intuition",
  ]),
  path("bard", "Dabbler", [
    "Bardic Lore",
    "A Kind of Magic",
    "A Knave, a Rascal",
    "Artisan's Apprentice",
    "Virtuoso’s Mind",
  ]),
  path("bard", "Diplomat", [
    "The Oldest Game",
    "Cards on the Table",
    "Countercharm",
    "Friends in High Places",
    "Parley!",
  ]),
  path("bard", "Swashbuckler", [
    "Style Is Everything",
    "Fly Into the Face of Danger",
    "I Am Not Left-Handed",
    "Very Intricate Backstory",
    "Watch Me Shine",
  ]),
  path("cleric", "Caregiver", [
    "The Greatest Miracle",
    "Awake! The Shadow Is Gone",
    "Face of an Angel",
    "I'll Carry it For You",
    "Mass Cure Wounds",
  ]),
  path("cleric", "Oracle", [
    "Visions From Above",
    "A Moth to the Sacred Flame",
    "Haruspication",
    "Sacred Truth",
    "True Colors",
  ]),
  path("cleric", "Warpriest", [
    "Punishment Divine",
    "Divine Intuition",
    "Drink From the Cup of Wrath",
    "Not the End",
    "Spiritual Weapon",
  ]),
  path("druid", "Animist", [
    "Anima Mundi",
    "Back to Basics",
    "Commune with Nature",
    "Death & Regrowth",
    "Eye of the Storm",
  ]),
  path("druid", "Stargazer", [
    "Eye in the Sky",
    "Augury",
    "Doomsayer",
    "Forecaster",
    "Scion of Sunrise and Sunset",
  ]),
  path("druid", "Wildheart", [
    "Primeval Whisperer",
    "Call of the Wild",
    "Raised by Wolves",
    "Rumour From the Earth",
    "Together as One",
  ]),
  path("fighter", "Bulwark", [
    "Stalwart Protector",
    "Armiger",
    "Second Wind",
    "Silent Protector",
    "Taunting Shout",
  ]),
  path("fighter", "Weaponmaster", [
    "The Blade Reforged",
    "Advanced Fighting Styles",
    "Boot Knife",
    "Secret Weapon",
    "Snap the Blade",
  ]),
  path("fighter", "Tactician", [
    "Plans Within Plans",
    "Eye for Destruction",
    "Honed Instincts",
    "Old Comrades & Former Foes",
    "Veteran of a Hundred Battles",
  ]),
  path("paladin", "Inquisitor", [
    "Beware My Power",
    "By the Power Invested in Me",
    "Mystical Imprisonment",
    "Nomosmancy",
    "Public Condemnation",
  ]),
  path("paladin", "Paragon", [
    "Safeguard the Helpless",
    "A Shot at Redemption",
    "For the Honor Of",
    "Inspiring Presence",
    "You Will Not Break Me",
  ]),
  path("paladin", "Questing Knight", [
    "On a Mission",
    "I Dub Thee",
    "The Great Uniter",
    "Throw Down the Gauntlet",
    "Trusted Squire",
  ]),
  path("ranger", "Beastmaster", [
    "No Mere Creature",
    "In This Together",
    "Kindred Spirits",
    "Superior Companion",
    "Warbeast",
  ]),
  path("ranger", "Deadeye", [
    "Death from Afar",
    "Find Weakness",
    "Sniper Nest",
    "Spotter",
    "Trick Arrows",
  ]),
  path("ranger", "Scout", [
    "Lay of the Land",
    "Hunter's Mark",
    "Peerless Wayfarer",
    "The Wild Provides",
    "Natural Historian",
  ]),
  path("rogue", "Assassin", [
    "Dirty Deeds",
    "Always a Way Out",
    "Backstab",
    "Poisoncraft",
    "Stalker in Shadows",
  ]),
  path("rogue", "Burglar", [
    "Expert Treasure-hunter",
    "Better Lucky Than Good",
    "Breaking & Entering",
    "Quick on the Draw",
    "Vanishing Act",
  ]),
  path("rogue", "Spy", [
    "The One for the Job",
    "Hand Trick",
    "Maven Saboteur",
    "Underworld Connections",
    "You Know My Name",
  ]),
  path("wizard", "Evoker", [
    "Evocation Magic",
    "Contingency",
    "Elemental Cloak",
    "Instant Fireball!",
    "Power Weapon",
  ]),
  path("wizard", "Illusionist", [
    "Illusion Magic",
    "Alter Perception",
    "Fool Me Once",
    "Mirror Image",
    "The Mirror Stares Back",
  ]),
  path("wizard", "Necromancer", [
    "Necromantic Magic",
    "A Ghost at the Feast",
    "Lifeforce Is a Resource",
    "Sanctum to Unlife",
    "Shed This Mortal Coil",
  ]),
];
