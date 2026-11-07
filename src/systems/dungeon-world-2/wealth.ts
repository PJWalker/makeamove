export interface WealthTier {
  id: string;
  name: string;
  rank: number;
  slots: number;
}

export type ServiceRank = 2 | 3 | 4;

export interface DungeonWorld2Service {
  id: string;
  name: string;
  examples: Record<ServiceRank, string>;
}

export const DW2_SERVICES: DungeonWorld2Service[] = [
  {
    id: "stay",
    name: "A week's stay at…",
    examples: {
      2: "a shared room in a simple inn",
      3: "separate rooms at a luxurious inn",
      4: "a noble's manor or palace wing",
    },
  },
  {
    id: "property",
    name: "Buying or building a…",
    examples: {
      2: "simple one-room cottage",
      3: "comfortable multi-room house",
      4: "large homestead or manor",
    },
  },
  {
    id: "passage",
    name: "Guided passage through an area that is…",
    examples: {
      2: "inconvenient or unpleasant",
      3: "dangerous or unforgiving",
      4: "deadly or unfathomable",
    },
  },
  {
    id: "entertainment",
    name: "A night of song, dance, or companionship with…",
    examples: {
      2: "someone ordinary",
      3: "someone prestigious or elusive",
      4: "someone royal, magical, or divine",
    },
  },
  {
    id: "organization",
    name: "Access to an organization that is…",
    examples: {
      2: "an everyday club or association",
      3: "a noble court or prominent guild",
      4: "a secret cabal or legendary group",
    },
  },
  {
    id: "information",
    name: "Information about…",
    examples: {
      2: "a public figure or recent event",
      3: "a private figure or obscure history",
      4: "a shadowy mastermind or ancient mystery",
    },
  },
  {
    id: "repair",
    name: "Repair of…",
    examples: {
      2: "standard equipment or a small house",
      3: "masterwork equipment, most magic items, or a manor",
      4: "Artifacts, ancient magic items, a palace, or a fortress",
    },
  },
  {
    id: "fine",
    name: "A fine, bounty, or bribe for a…",
    examples: {
      2: "small crime, such as pickpocketing",
      3: "significant crime, such as assault or arson",
      4: "capital crime, such as murder or treason",
    },
  },
];

export const WEALTH_TIERS: WealthTier[] = [
  { id: "broke", name: "Broke", rank: 0, slots: 4 },
  { id: "poor", name: "Poor", rank: 1, slots: 6 },
  { id: "modest", name: "Modest", rank: 2, slots: 8 },
  { id: "comfortable", name: "Comfortable", rank: 3, slots: 10 },
  { id: "rich", name: "Rich", rank: 4, slots: 12 },
  { id: "aristocratic", name: "Aristocratic", rank: 5, slots: 0 },
] as const;

export const INITIAL_TREASURE_BOXES = WEALTH_TIERS[0]!.slots;
export const MAX_TREASURE_BOXES = WEALTH_TIERS.reduce((total, tier) => total + tier.slots, 0);

export function clampTreasureBoxes(boxes: number): number {
  return Math.max(0, Math.min(MAX_TREASURE_BOXES, Math.floor(boxes)));
}

export function addTreasureBoxes(boxes: number, amount: number): number {
  return clampTreasureBoxes(boxes + amount);
}

export function wealthTierForBoxes(boxes: number) {
  const filled = clampTreasureBoxes(boxes);
  let threshold = 0;
  for (const tier of WEALTH_TIERS) {
    threshold += tier.slots;
    if (tier.rank === 5 || filled < threshold) return tier;
  }
  return WEALTH_TIERS[WEALTH_TIERS.length - 1]!;
}

/** Returns the remaining track boxes, or null when the purchase is unaffordable. */
export function purchaseAtWealth(boxes: number, costRank: number): number | null {
  const current = clampTreasureBoxes(boxes);
  const wealth = wealthTierForBoxes(current).rank;
  if (costRank < wealth) return current;
  if (costRank > wealth || current === 0) return null;
  return current - 1;
}
