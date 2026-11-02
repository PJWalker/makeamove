import abilitiesCsv from "../../../reference/daggerheart-srd-main/.build/02_csv/abilities.csv?raw";
import ancestriesCsv from "../../../reference/daggerheart-srd-main/.build/02_csv/ancestries.csv?raw";
import armorCsv from "../../../reference/daggerheart-srd-main/.build/02_csv/armor.csv?raw";
import classesCsv from "../../../reference/daggerheart-srd-main/.build/02_csv/classes.csv?raw";
import communitiesCsv from "../../../reference/daggerheart-srd-main/.build/02_csv/communities.csv?raw";
import subclassesCsv from "../../../reference/daggerheart-srd-main/.build/02_csv/subclasses.csv?raw";
import weaponsCsv from "../../../reference/daggerheart-srd-main/.build/02_csv/weapons.csv?raw";

export type CsvRecord = Record<string, string>;

function field(record: CsvRecord, key: string): string {
  const value = record[key];
  if (value === undefined) throw new Error(`Missing CSV column: ${key}`);
  return value;
}

/** Parse RFC-4180 fields, including commas and newlines inside quoted cells. */
export function parseCsv(source: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index] ?? "";
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && !cell) quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") cell += character;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...records] = rows;
  if (!header) return [];
  return records
    .filter((cells) => cells.some(Boolean))
    .map((cells) =>
      Object.fromEntries(
        header.map((key, index) => [
          key.replace(/^\uFEFF/, ""),
          cells[index] ?? "",
        ]),
      ),
    );
}

export const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const records = {
  classes: parseCsv(classesCsv),
  ancestries: parseCsv(ancestriesCsv),
  communities: parseCsv(communitiesCsv),
  subclasses: parseCsv(subclassesCsv),
  abilities: parseCsv(abilitiesCsv),
  weapons: parseCsv(weaponsCsv),
  armor: parseCsv(armorCsv),
};

export interface DaggerheartClass {
  id: string;
  name: string;
  description: string;
  domains: [string, string];
  evasion: number;
  hp: number;
  suggestedTraits: number[];
  items: string;
  hopeFeature: { name: string; text: string };
  features: { name: string; text: string }[];
  subclasses: [string, string];
}

const feature = (record: CsvRecord, index: number) => ({
  name: field(record, `Feature ${index} Name`),
  text: field(record, `Feature ${index} Text`),
});

export const CLASSES: DaggerheartClass[] = records.classes.map((record) => ({
  id: slug(field(record, "Name")),
  name: field(record, "Name"),
  description: field(record, "Description"),
  domains: [field(record, "Domain 1"), field(record, "Domain 2")],
  evasion: Number(field(record, "Evasion")),
  hp: Number(field(record, "HP")),
  suggestedTraits: (field(record, "Suggested Traits").match(/[+-]?\d+/g) ?? []).map(
    Number,
  ),
  items: field(record, "Items"),
  hopeFeature: {
    name: field(record, "Hope Feature Name"),
    text: field(record, "Hope Feature Text"),
  },
  features: [1, 2, 3]
    .map((index) => feature(record, index))
    .filter((entry) => entry.name),
  subclasses: [field(record, "Subclass 1"), field(record, "Subclass 2")],
}));

export const ANCESTRIES = records.ancestries.map((record) => ({
  id: slug(field(record, "Name")),
  name: field(record, "Name"),
  description: field(record, "Description"),
  features: [1, 2]
    .map((index) => feature(record, index))
    .filter((entry) => entry.name),
}));

export const COMMUNITIES = records.communities.map((record) => ({
  id: slug(field(record, "Name")),
  name: field(record, "Name"),
  description: field(record, "Description"),
  feature: { name: field(record, "Feature 1 Name"), text: field(record, "Feature 1 Text") },
}));

const classForSubclass = new Map<string, string>(
  CLASSES.flatMap((entry) =>
    entry.subclasses.map((name) => [name, entry.id] as const),
  ),
);
export const SUBCLASSES = records.subclasses.map((record) => ({
  id: slug(field(record, "Name")),
  classId: classForSubclass.get(field(record, "Name")) ?? "",
  name: field(record, "Name"),
  description: field(record, "Description"),
  spellcastTrait: field(record, "Spellcast Trait"),
  features: ["Foundation", "Specialization", "Mastery"].flatMap((tier) =>
    [1, 2]
      .map((index) => ({
        tier,
        name: field(record, `${tier} ${index} Name`),
        text: field(record, `${tier} ${index} Text`),
      }))
      .filter((entry) => entry.name),
  ),
}));

export const DOMAIN_CARDS = records.abilities
  .filter((record) => field(record, "Domain"))
  .map((record) => ({
    id: slug(field(record, "Name")),
    name: field(record, "Name"),
    domain: field(record, "Domain"),
    type: field(record, "Type"),
    level: Number(field(record, "Level")),
    recall: Number(field(record, "Recall")),
    text: field(record, "Text"),
  }));

export const WEAPONS = records.weapons.map((record) => ({
  id: slug(field(record, "Name")),
  name: field(record, "Name"),
  kind: field(record, "Primary or Secondary"),
  tier: Number(field(record, "Tier")),
  magical: field(record, "Physical or Magical") === "Magical",
  trait: field(record, "Trait"),
  range: field(record, "Range"),
  damage: field(record, "Damage"),
  burden: field(record, "Burden"),
  featureName: field(record, "Feature 1 Name"),
  featureText: field(record, "Feature 1 Text"),
}));

export const ARMOR = records.armor.map((record) => {
  const thresholds = field(record, "Base Thresholds").split("/").map(Number);
  const major = thresholds[0];
  const severe = thresholds[1];
  if (major === undefined || severe === undefined)
    throw new Error("Armor thresholds must contain major and severe values");
  return {
    id: slug(field(record, "Name")),
    name: field(record, "Name"),
    tier: Number(field(record, "Tier")),
    major,
    severe,
    score: Number(field(record, "Base Score")),
    featureName: field(record, "Feature 1 Name"),
    featureText: field(record, "Feature 1 Text"),
  };
});
