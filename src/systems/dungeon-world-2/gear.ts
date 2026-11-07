import type { ItemDef } from "../types";
import { sourceMagicItems } from "./paths";

const WEALTH = ["Broke", "Poor", "Modest", "Comfortable", "Rich"];
const parsedMagicItems = sourceMagicItems();
const sourceHealingPotion = parsedMagicItems.find((item) => item.name === "potion of healing")!;

function gearItem(
  id: string,
  name: string,
  description: string,
  rank: number | undefined,
  tags: string[] = [],
  extra: Partial<Pick<ItemDef, "uses" | "resetUsesAtCamp" | "itemUse" | "equippable" | "active" | "effects">> = {},
): ItemDef {
  return {
    id,
    name,
    description,
    weight: 0,
    ...(rank !== undefined ? { wealthCost: { rank, tier: WEALTH[rank]! } } : {}),
    tags,
    ...extra,
  };
}

export const DW2_GEAR: ItemDef[] = [
  gearItem("light-armor", "Light armor", "Reduces damage taken by 1, to a minimum of 1; requires STR +1.", 2, [], {
    equippable: true,
    active: "equipped",
    effects: [{ type: "modify", path: "armor", op: "min", value: 1 }],
  }),
  gearItem("medium-armor", "Medium armor", "Reduces damage taken by 2, to a minimum of 1; requires STR +2.", 3, [], {
    equippable: true,
    active: "equipped",
    effects: [{ type: "modify", path: "armor", op: "min", value: 2 }],
  }),
  gearItem("heavy-armor", "Heavy armor", "Reduces damage taken by 3, to a minimum of 1; requires STR +3.", 4, [], {
    equippable: true,
    active: "equipped",
    effects: [{ type: "modify", path: "armor", op: "min", value: 3 }],
  }),
  gearItem("shield", "Shield", "Once per camp, mark a use to ignore all damage from one attack.", 2, [], {
    uses: 1,
    resetUsesAtCamp: true,
    equippable: true,
  }),
  gearItem("brass-knuckles", "Brass knuckles", "1d4 damage; hand range.", 0, ["hand"], { equippable: true }),
  gearItem("club", "Club", "1d6 damage; close range.", 0, ["close"], { equippable: true }),
  gearItem("dagger", "Dagger", "1d4 damage.", 0, ["ammo", "hand", "close", "light", "precise", "thrown"], { equippable: true }),
  gearItem("greataxe-greatsword", "Greataxe or greatsword", "1d8 damage.", 3, ["close", "two-handed", "forceful"], { equippable: true }),
  gearItem("longspear-halberd", "Longspear or halberd", "1d6 damage.", 2, ["close", "near", "two-handed"], { equippable: true }),
  gearItem("longsword", "Longsword", "1d6 damage.", 2, ["close"], { equippable: true }),
  gearItem("mace", "Mace", "1d6 damage.", 2, ["close"], { equippable: true }),
  gearItem("scimitar-shortsword", "Scimitar or shortsword", "1d6 damage.", 2, ["hand", "light", "precise"], { equippable: true }),
  gearItem("shortspear", "Shortspear", "1d6 damage.", 1, ["close", "hand"], { equippable: true }),
  gearItem("sword-cane", "Sword cane", "1d6 damage.", 3, ["concealed", "hand", "precise", "two-handed"], { equippable: true }),
  gearItem("quarterstaff", "Quarterstaff", "1d6 damage.", 0, ["close", "hand", "two-handed"], { equippable: true }),
  gearItem("unarmed", "Unarmed", "1d4-1 damage; hand range; optionally precise.", 0, ["hand"], { equippable: true }),
  gearItem("whip", "Whip", "1d4 damage. On a 10+ when you Trade Blows, you may make the target drop something they hold or grab one of their extremities.", 1, ["close", "near"], { equippable: true }),
  gearItem("arbalest", "Arbalest", "1d8 damage.", 4, ["ammo", "near", "far", "reload", "piercing", "two-handed"], { equippable: true }),
  gearItem("crossbow", "Crossbow", "1d8 damage.", 3, ["ammo", "near", "far", "reload", "two-handed"], { equippable: true }),
  gearItem("hand-crossbow", "Hand crossbow", "1d4 damage.", 4, ["ammo", "near", "piercing", "reload"], { equippable: true }),
  gearItem("javelin", "Javelin", "1d4 damage.", 1, ["ammo", "near", "thrown"], { equippable: true }),
  gearItem("longbow", "Longbow", "1d6 damage.", 3, ["ammo", "near", "far", "reload", "two-handed"], { equippable: true }),
  gearItem("net", "Net", "0 damage. Mark a use to trap one medium creature or some small creatures under it.", 1, ["close", "hand"], { uses: 1, equippable: true }),
  gearItem("sling", "Sling", "1d4 damage.", 0, ["near", "ammo"], { equippable: true }),
  gearItem("shortbow", "Shortbow", "1d6 damage.", 2, ["ammo", "near", "reload", "two-handed"], { equippable: true }),
  gearItem("slingshot", "Slingshot", "1d6 damage.", 1, ["near", "ammo", "two-handed"], { equippable: true }),
  gearItem("adventuring-gear", "Adventuring gear", "3 uses. Mark one to rummage through and find a useful mundane item.", 1, [], { uses: 3 }),
  gearItem("alchemical-vials", "Alchemical vials", "3 uses. Mark one to withdraw acid, fire, or smoke.", 3, [], { uses: 3 }),
  gearItem("artistic-samples", "Artistic samples", "2 uses. Mark one to share with an NPC while you Sense Motive for advantage. Usually made rather than bought.", 3, [], { uses: 2 }),
  gearItem("bag-of-books", "Bag of books", "3 uses. Mark one to find a relevant record for Spout Lore.", 3, [], { uses: 3 }),
  gearItem("fishing-rod", "Fishing rod", "While fishing with someone, you may Pull Strings +WIS or Sense Motive +CHA against them. On a 12+, also catch something valuable and gain 1 Treasure.", 1),
  gearItem("hearty-feast", "Hearty feast", "1 use. Mark it to share with your allies; everyone recovers half their maximum HP, rounded down.", 4, [], { uses: 1, itemUse: "hearty-feast" }),
  gearItem("holy-water-vials", "Holy water vials", "Close, holy; 3 uses. Mark one to ignore all Resists of an enemy of your deity until the end of the Scene.", 1, ["close", "holy"], { uses: 3 }),
  gearItem("medicine", "Medicine", "2 uses. Mark one to double the HP someone next recovers or cure a minor disease or poison.", 1, [], { uses: 2 }),
  gearItem("pious-supplies", "Pious supplies", "3 uses. Mark one to find an item used in your deity's worship, such as candles, a censer, incense, or holy vestments.", 1, [], { uses: 3 }),
  gearItem("poisoners-kit", "Poisoner's kit", "Dangerous for the untrained; 3 uses. Mark one to produce a poison on the spot. State its effect, then choose two: touch delivery instead of ingestion; no GM 'and' or 'but'; undetectable; or clear a kit use.", 4, [], { uses: 3 }),
  gearItem("potion-of-healing", "Potion of healing", sourceHealingPotion.description, 4, ["magic"], { uses: 1, itemUse: "healing-potion" }),
  gearItem("provisions", "Provisions", "3 uses. Mark one during Comfort or Support to turn a 'No' into a 'Yes'.", 1, [], { uses: 3 }),
  gearItem("spellbook", "Spellbook", "Requires the Wizard's Weave the Arcane. Once per session, reference or study it to Prepare a School instantly.", 3),
  gearItem("thieves-tools", "Thieves' tools", "Requires the Rogue's Tricks of the Trade; 3 uses. When you Defy Danger with a Roguish Skill, on a 7-9 mark a use instead of another option.", 1, [], { uses: 3 }),
  gearItem("trap-kit", "Trap kit", "2 uses. Spend time setting up a trap, then mark one use to create a dangerous, impeding hazard in range; typically deals 1d4 damage.", 1, [], { uses: 2 }),
];

export const DW2_CLASS_GEAR: ItemDef[] = [
  gearItem("ancestral-longsword", "Ancestral longsword", "1d6 damage; close range. Includes a shield with one use to ignore all damage from an attack.", undefined, ["close"], { uses: 1, resetUsesAtCamp: true, equippable: true }),
  gearItem("bloodstained-greataxe", "Bloodstained greataxe", "1d8 damage; close range; two-handed; forceful.", undefined, ["close", "two-handed", "forceful"], { equippable: true }),
  gearItem("dual-hammers", "Dual hammers", "1d6 damage; close range; light. Advantage on damage rolls when wielded together.", undefined, ["close", "light"], { equippable: true }),
  gearItem("deadly-sword-cane", "Deadly-sharp sword cane", "1d6 damage.", undefined, ["concealed", "hand", "precise", "two-handed"], { equippable: true }),
  gearItem("decorated-longsword", "Decorated longsword", "1d6 damage; close range. Includes a shield with one use to ignore all damage from an attack.", undefined, ["close"], { uses: 1, resetUsesAtCamp: true, equippable: true }),
  gearItem("nobles-crossbow", "A noble's crossbow", "1d8 damage.", undefined, ["ammo", "near", "far", "reload", "two-handed"], { equippable: true }),
  gearItem("consecrated-mace", "Consecrated mace", "1d6 damage; hand range. Includes a shield with one use to ignore all damage from an attack.", undefined, ["hand"], { uses: 1, resetUsesAtCamp: true, equippable: true }),
  gearItem("reinforced-net", "Reinforced net", "0 damage; close and hand range. One use to trap one medium or some small creatures under it.", undefined, ["close", "hand"], { uses: 1, equippable: true }),
  gearItem("flowering-staff", "Flowering staff", "1d4 damage; close range; two-handed. 2 uses to produce a natural alternative instead of another item.", undefined, ["close", "two-handed"], { uses: 2, equippable: true }),
  gearItem("intimidating-greataxe", "Intimidating greataxe", "1d8 damage; hand range; two-handed.", undefined, ["hand", "two-handed"], { equippable: true }),
  gearItem("twin-shortswords", "Twin shortswords", "1d6 damage; hand range; light and precise. Advantage on damage rolls when wielded together.", undefined, ["hand", "light", "precise"], { equippable: true }),
  gearItem("yew-longbow", "Yew longbow", "1d6 damage.", undefined, ["ammo", "near", "far", "reload", "two-handed"], { equippable: true }),
  gearItem("bloodied-warhammer", "Bloodied warhammer", "1d8 damage; close range; two-handed; forceful.", undefined, ["close", "two-handed", "forceful"], { equippable: true }),
  gearItem("silver-tipped-crossbow", "Crossbow with silver-tipped bolts", "1d8 damage.", undefined, ["ammo", "near", "far", "reload", "two-handed"], { equippable: true }),
  gearItem("lieges-longsword", "Liege's longsword", "1d6 damage; close range. Includes a gleaming shield with one use to ignore all damage from an attack.", undefined, ["close"], { uses: 1, resetUsesAtCamp: true, equippable: true }),
  gearItem("composite-bow", "Composite bow", "1d6 damage.", undefined, ["near", "far", "ammo", "two-handed"], { equippable: true }),
  gearItem("reliable-staff-sling", "Reliable staff and sling", "Staff: 1d6 damage; hand and close range; two-handed. Sling: 1d4 damage; near range; ammo.", undefined, ["hand", "close", "two-handed", "near", "ammo"], { equippable: true }),
  gearItem("collapsible-shortbow", "Collapsible shortbow", "1d6 damage.", undefined, ["ammo", "close", "near", "two-handed"], { equippable: true }),
  gearItem("hidden-daggers", "Hidden daggers", "1d4 damage; ammo, concealed, hand, close, light, piercing, precise, and thrown. Advantage on damage rolls when wielded together.", undefined, ["ammo", "concealed", "hand", "close", "light", "piercing", "precise", "thrown"], { equippable: true }),
  gearItem("skull-cap-focus", "Bejeweled skull cap", "Arcane focus. Add 1 to your armor while wearing it.", undefined, [], {
    equippable: true,
    active: "equipped",
    effects: [{ type: "modify", path: "armor", op: "add", value: 1 }],
  }),
  gearItem("delicate-grimoire", "Delicate grimoire", "Arcane focus. Once per session, reference or study it to Prepare a School instantly.", undefined),
  gearItem("unwieldy-staff", "Unwieldy staff", "Arcane focus; 1d6 damage; close and hand range; two-handed.", undefined, ["close", "hand", "two-handed"], { equippable: true }),
  gearItem("razor-dagger", "Razor dagger", "1d4 damage; ammo, hand, close, piercing, precise, and thrown.", undefined, ["ammo", "hand", "close", "piercing", "precise", "thrown"], { equippable: true }),
];

export const DW2_MAGIC_ITEMS = parsedMagicItems.filter((item) => item.name !== "potion of healing");