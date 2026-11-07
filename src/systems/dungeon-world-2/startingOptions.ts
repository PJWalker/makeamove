import type { ChoiceDef, OptionDef } from "../types";

interface StarterOption {
  id: string;
  name: string;
  text: string;
  items?: string[];
}

interface ClassStartingOptions {
  weaponLabel: string;
  weapons: StarterOption[];
  equipment: StarterOption[];
  appearance: [string[], string[]?];
}

/** Each class's starting kit: weapon, equipment and looks to choose from. */
export const CLASS_STARTING: Record<string, ClassStartingOptions> = {
  barbarian: {
    weaponLabel: "Starting weapon",
    weapons: [
      { id: "ancestral-longsword", name: "Ancestral longsword + shield", text: "1d6 damage; close range. Shield: one use to ignore all damage from one attack.", items: ["ancestral-longsword", "shield"] },
      { id: "bloodstained-greataxe", name: "Bloodstained greataxe", text: "1d8 damage; close, two-handed, forceful.", items: ["bloodstained-greataxe"] },
      { id: "dual-hammers", name: "Dual hammers", text: "1d6 damage; close, light; advantage on damage rolls.", items: ["dual-hammers"] },
    ],
    equipment: [
      { id: "adventuring-gear", name: "Adventuring gear", text: "3 uses to find a useful mundane item." },
      { id: "hearty-feast", name: "Hearty feast", text: "1 use; everyone recovers half their maximum HP." },
      { id: "potion-of-healing", name: "Potion of healing", text: "1 use; recover half maximum HP or clear a locked Condition." },
      { id: "provisions", name: "Provisions", text: "3 uses; turn a Comfort or Support answer from No to Yes." },
      { id: "trap-kit", name: "Trap kit", text: "2 uses to set a dangerous, impeding hazard." },
    ],
    appearance: [["Cultural raiment", "Hides and furs", "Intricate tattoos"], ["Massive stature", "Monster skull trophy", "Impressive scar"]],
  },
  bard: {
    weaponLabel: "Starting weapon",
    weapons: [
      { id: "nobles-crossbow", name: "A noble's crossbow", text: "1d8 damage; ammo, near, far, reload, two-handed.", items: ["nobles-crossbow"] },
      { id: "deadly-sword-cane", name: "Deadly-sharp sword cane", text: "1d6 damage; concealed, hand, precise, two-handed.", items: ["deadly-sword-cane"] },
      { id: "decorated-longsword", name: "Decorated longsword + shield", text: "1d6 damage; close. Shield: one use to ignore all damage from one attack.", items: ["decorated-longsword", "shield"] },
    ],
    equipment: [
      { id: "adventuring-gear", name: "Adventuring gear", text: "3 uses to find a useful mundane item." },
      { id: "artistic-samples", name: "Artistic samples", text: "2 uses to share with an NPC during Sense Motive for advantage." },
      { id: "bag-of-books", name: "Bag of books", text: "3 uses to find a relevant record for Spout Lore." },
      { id: "potion-of-healing", name: "Potion of healing", text: "1 use; recover half maximum HP or clear a locked Condition." },
      { id: "provisions", name: "Provisions", text: "3 uses; turn a Comfort or Support answer from No to Yes." },
    ],
    appearance: [["Colorful costume", "Fanciful suit/dress", "Masked leathers"], ["Durable lute", "Enormous wok", "Numerous paintbrushes"]],
  },
  cleric: {
    weaponLabel: "Starting blunt weapon",
    weapons: [
      { id: "consecrated-mace", name: "Consecrated mace + shield", text: "1d6 damage; hand range. Shield: one use to ignore all damage from one attack.", items: ["consecrated-mace", "shield"] },
      { id: "quarterstaff", name: "Plain quarterstaff", text: "1d6 damage; close, hand, two-handed.", items: ["quarterstaff"] },
      { id: "reinforced-net", name: "Reinforced net", text: "0 damage; close, hand; one use to trap creatures under it.", items: ["reinforced-net"] },
    ],
    equipment: [
      { id: "holy-water-vials", name: "Holy water vials", text: "Close, holy; 3 uses to ignore an enemy deity's Resists for a Scene." },
      { id: "light-armor", name: "Leather armor", text: "Armor 1; requires STR +1." },
      { id: "medicine", name: "Medicine", text: "2 uses to double the next HP someone recovers or cure a minor disease or poison." },
      { id: "pious-supplies", name: "Pious supplies", text: "3 uses to find a worship item." },
      { id: "provisions", name: "Provisions", text: "3 uses; turn a Comfort or Support answer from No to Yes." },
    ],
    appearance: [["Ancient uniform", "Prized hide coat", "Simple robes"], ["Animated tattoo", "Blessed amulet", "Stolen reliquary"]],
  },
  druid: {
    weaponLabel: "Starting weapon",
    weapons: [
      { id: "flowering-staff", name: "Flowering staff", text: "1d4 damage; close, two-handed; 2 uses to produce a natural alternative." },
      { id: "slingshot", name: "Vine slingshot", text: "1d6 damage; near, ammo, two-handed." },
      { id: "club", name: "Wooden club + shield", text: "1d6 damage; close. Shield: one use to ignore all damage from one attack.", items: ["club", "shield"] },
    ],
    equipment: [
      { id: "adventuring-gear", name: "Adventuring gear", text: "3 uses to find a useful mundane item." },
      { id: "alchemical-vials", name: "Alchemical vials", text: "3 uses to withdraw acid, fire, or smoke." },
      { id: "medicine", name: "Medicine", text: "2 uses to double the next HP someone recovers or cure a minor disease or poison." },
      { id: "potion-of-healing", name: "Potion of healing", text: "1 use; recover half maximum HP or clear a locked Condition." },
      { id: "provisions", name: "Provisions", text: "3 uses; turn a Comfort or Support answer from No to Yes." },
    ],
    appearance: [["Earthy robes", "Handmade leathers", "Leaf-covered vestments"], ["Carved idol", "Crown of antlers", "Orphan seedling"]],
  },
  fighter: {
    weaponLabel: "Starting additional weapon",
    weapons: [
      { id: "intimidating-greataxe", name: "Intimidating greataxe", text: "1d8 damage; hand, two-handed." },
      { id: "twin-shortswords", name: "Twin shortswords", text: "1d6 damage; hand, light, precise; advantage on damage rolls." },
      { id: "yew-longbow", name: "Yew longbow", text: "1d6 damage; ammo, near, far, reload, two-handed." },
    ],
    equipment: [
      { id: "adventuring-gear", name: "Adventuring gear", text: "3 uses to find a useful mundane item." },
      { id: "medium-armor", name: "Breastplate", text: "Armor 2; requires STR +2." },
      { id: "light-armor", name: "Studded leather", text: "Armor 1; requires STR +1." },
      { id: "medicine", name: "Medicine", text: "2 uses to double the next HP someone recovers or cure a minor disease or poison." },
      { id: "provisions", name: "Provisions", text: "3 uses; turn a Comfort or Support answer from No to Yes." },
      { id: "shield", name: "Shield", text: "1 use to ignore all damage from one attack." },
    ],
    appearance: [["Champion's belt", "Flowing cape", "Tattered military badge"], ["Battered greaves", "Iconic helmet", "Intricately decorated vambraces"]],
  },
  paladin: {
    weaponLabel: "Starting weapon",
    weapons: [
      { id: "bloodied-warhammer", name: "Bloodied warhammer", text: "1d8 damage; close, two-handed, forceful." },
      { id: "silver-tipped-crossbow", name: "Crossbow with silver-tipped bolts", text: "1d8 damage; ammo, near, far, reload, two-handed." },
      { id: "lieges-longsword", name: "Liege's longsword + gleaming shield", text: "1d6 damage; close. Shield: one use to ignore all damage from one attack." },
    ],
    equipment: [
      { id: "adventuring-gear", name: "Adventuring gear", text: "3 uses to find a useful mundane item." },
      { id: "medium-armor", name: "Half plate", text: "Armor 2; requires STR +2." },
      { id: "javelin", name: "Javelins", text: "1d4 damage; ammo, near, thrown." },
      { id: "potion-of-healing", name: "Potion of healing", text: "1 use; recover half maximum HP or clear a locked Condition." },
      { id: "provisions", name: "Provisions", text: "3 uses; turn a Comfort or Support answer from No to Yes." },
    ],
    appearance: [["Battered helm", "Modest cloak", "Rusted coif"], ["Forgotten banner", "Noticeable scar", "Recognizable blazon"]],
  },
  ranger: {
    weaponLabel: "Starting weapon",
    weapons: [
      { id: "composite-bow", name: "Composite bow", text: "1d6 damage; near, far, ammo, two-handed." },
      { id: "scimitar-shortsword", name: "Dual scimitars", text: "1d6 damage; hand, light, precise; advantage on damage rolls." },
      { id: "reliable-staff-sling", name: "Reliable staff and sling", text: "Staff: 1d6 damage; hand, close, two-handed. Sling: 1d4 damage; near, ammo." },
    ],
    equipment: [
      { id: "adventuring-gear", name: "Adventuring gear", text: "3 uses to find a useful mundane item." },
      { id: "light-armor", name: "Light armor", text: "Armor 1; requires STR +1." },
      { id: "medicine", name: "Medicine", text: "2 uses to double the next HP someone recovers or cure a minor disease or poison." },
      { id: "provisions", name: "Provisions", text: "3 uses; turn a Comfort or Support answer from No to Yes." },
      { id: "trap-kit", name: "Trap kit", text: "2 uses to set a dangerous, impeding hazard." },
    ],
    appearance: [["Hooded cloak", "Sturdy leathers", "Warm hides"], ["Monstrous trophy", "Natural camouflage", "Storied scars"]],
  },
  rogue: {
    weaponLabel: "Starting weapon",
    weapons: [
      { id: "collapsible-shortbow", name: "Collapsible shortbow", text: "1d6 damage; ammo, close, near, two-handed." },
      { id: "hidden-daggers", name: "Hidden daggers", text: "1d4 damage; ammo, concealed, hand, close, light, piercing, precise, thrown; advantage on damage rolls." },
      { id: "whip", name: "Reliable whip", text: "1d4 damage; close, near, precise. On a 10+ Trade Blows, disarm or grab an extremity." },
    ],
    equipment: [
      { id: "adventuring-gear", name: "Adventuring gear", text: "3 uses to find a useful mundane item." },
      { id: "alchemical-vials", name: "Alchemical vials", text: "3 uses to withdraw acid, fire, or smoke." },
      { id: "light-armor", name: "Leather armor", text: "Armor 1; requires STR +1." },
      { id: "provisions", name: "Provisions", text: "3 uses; turn a Comfort or Support answer from No to Yes." },
      { id: "thieves-tools", name: "Thieves' tools", text: "3 uses; on a 7-9 Defy Danger with a Roguish Skill, mark a use instead of another option." },
    ],
    appearance: [["Dark cloak", "Fashionable suit", "Forgettable face and attire"], ["Lucky charm", "List of vulnerable targets", "Sentimental jewelry"]],
  },
  wizard: {
    weaponLabel: "Starting arcane focus",
    weapons: [
      { id: "skull-cap-focus", name: "Bejeweled skull cap", text: "Arcane focus. Add 1 to your armor." },
      { id: "delicate-grimoire", name: "Delicate grimoire", text: "Arcane focus. Once per session, study it to Prepare a School instantly." },
      { id: "unwieldy-staff", name: "Unwieldy staff", text: "Arcane focus; 1d6 damage; close, hand, two-handed." },
    ],
    equipment: [
      { id: "adventuring-gear", name: "Adventuring gear", text: "3 uses to find a useful mundane item." },
      { id: "bag-of-books", name: "Bag of books", text: "3 uses to find a relevant record for Spout Lore." },
      { id: "razor-dagger", name: "Razor dagger", text: "1d4 damage; ammo, hand, close, piercing, precise, thrown." },
      { id: "potion-of-healing", name: "Potion of healing", text: "1 use; recover half maximum HP or clear a locked Condition." },
      { id: "provisions", name: "Provisions", text: "3 uses; turn a Comfort or Support answer from No to Yes." },
    ],
    appearance: [["Astral robes", "Inconspicuous cloak", "Mystical spectacles"]],
  },
};

const option = (
  classId: string,
  item: StarterOption,
  extra: Partial<OptionDef> = {},
): OptionDef => ({
  id: item.id,
  name: item.name,
  text: item.text,
  requires: { classId },
  grants: item.items ? { startingItems: item.items.join(",") } : { startingItems: item.id },
  ...extra,
});

export const CLASS_STARTING_CHOICES: ChoiceDef[] = Object.entries(CLASS_STARTING).flatMap(
  ([classId, starting]) => {
    const weapon: ChoiceDef = {
      id: `starting-weapon-${classId}`,
      label: starting.weaponLabel,
      field: `startingWeapon-${classId}`,
      at: "create",
      options: starting.weapons.map((item) => option(classId, item)),
    };
    const firstItemField = `startingItemOne-${classId}`;
    const firstEquipment: ChoiceDef = {
      id: `starting-item-one-${classId}`,
      label: "Starting equipment 1 of 2",
      field: firstItemField,
      at: "create",
      options: starting.equipment.map((item) => option(classId, item)),
    };
    const secondEquipment: ChoiceDef = {
      id: `starting-item-two-${classId}`,
      label: "Starting equipment 2 of 2",
      field: `startingItemTwo-${classId}`,
      at: "create",
      options: starting.equipment.map((item) =>
        option(classId, item, {
          notIncludes: [{ field: firstItemField, value: item.id }],
        }),
      ),
    };
    const appearances = starting.appearance.flatMap((row, rowIndex): ChoiceDef[] =>
      row
        ? [{
            id: `appearance-${rowIndex + 1}-${classId}`,
            label: `Appearance ${rowIndex + 1}`,
            field: `appearanceChoice${rowIndex + 1}-${classId}`,
            at: "create",
            options: row.map((name) => ({
              id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""),
              name,
              text: `Choose this ${rowIndex === 0 ? "look" : "detail"} or something else.`,
              requires: { classId },
              grants: { [`appearance${rowIndex + 1}`]: name },
            })),
          }]
        : [],
    );
    return [weapon, firstEquipment, secondEquipment, ...appearances];
  },
);