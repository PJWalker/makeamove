import source from "../../../reference/Dungeon World 2 Beta v3.md?raw";


export interface Dw2PathMove {
  name: string;
  text: string;
  trigger: string;
  stat?: string;
  outcomes?: Record<"strong" | "weak" | "miss", string>;
}

export interface Dw2Path {
  id: string;
  classId: string;
  name: string;
  moves: string[];
  rules: Dw2PathMove[];
}

const plain = (text: string) =>
  text
    .replace(/\[([^\]]+)\]\([^\n]*?\)/g, "$1")
    .replace(/\\([\\!*+_#.|(){}\[\]-])/g, "$1")
    .replace(/[*_]/g, "")
    .replace(/\{#[^}]+\}/g, "")
    .trim();

const key = (text: string) =>
  plain(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const headings = [...source.matchAll(/^(?:- \[[x ]\] )?#### (.+)$/gm)];
const ruleFor = (name: string): Dw2PathMove => {
  const index = headings.findIndex((heading) =>
    (heading[1] ?? "").length > 0 && key(heading[1] ?? "").startsWith(key(name)),
  );
  if (index < 0) throw new Error(`Missing Dungeon World 2 Path move: ${name}`);
  const heading = (headings)[index]!;
  if (heading.index === undefined || !heading[0])
    throw new Error(`Malformed Dungeon World 2 Path heading: ${name}`);
  const section = source
    .slice(
      heading.index + heading[0].length,
      headings[index + 1]?.index ?? source.length,
    )
    .split(/^### /m)[0] ?? "";
  const text = plain(
    section
      .split("\n")
      .filter((line) => !/^\s*\|\s*:?-+/.test(line))
      .map((line) => line.replace(/^\s*\|\s?|\s?\|\s*$/g, ""))
      .join("\n"),
  ).trim();
  const markers = [...text.matchAll(/✷\s*On a (10\+|7-9|6-)[,:]?\s*/g)];
  const outcomes = Object.fromEntries(
    markers.flatMap((marker, position) => {
      const threshold = marker[1];
      if (!threshold || marker.index === undefined || !marker[0]) return [];
      return [[
      threshold === "10+" ? "strong" : threshold === "7-9" ? "weak" : "miss",
      text
        .slice(
          marker.index + marker[0].length,
          markers[position + 1]?.index ?? text.length,
        )
        .trim(),
      ]];
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
    trigger: (text.split(/\broll\s*\+/i).at(0) ?? "")
      .split("\n").at(0)?.trim() ?? "",
    ...(stat && strong && weak && miss
      ? { stat, outcomes: { strong, weak, miss } }
      : {}),
  };
};

const path = (classId: string, name: string, moves: string[]): Dw2Path => ({
  id: `${classId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  classId,
  name,
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
