import { resolveEffects } from '../effects'
import type { ActionDef, ClassDef, GameSystem, ItemDef, TagDef, TargetSpec } from '../types'

/*
 * Dungeon World, core rules. Move and class text is a condensed paraphrase of
 * the Dungeon World SRD (Sage LaCroix and Adam Koebel), used under CC BY 3.0.
 * https://creativecommons.org/licenses/by/3.0/
 *
 * Moves are written in Dungeon World's own terms (roll +STAT, outcomes on
 * 10+ / 7-9 / 6-) and turned into the core's actions below: each rolled move
 * is one check step.
 */

type Band = 'strong' | 'weak' | 'miss'

interface DwMove {
  id: string
  name: string
  category: 'basic' | 'special' | 'class'
  classId?: string
  trigger: string
  text: string
  /** A stat id, 'choose' to ask which, 'bond' to ask for the bond's bonus, or 'none' for a plain roll. */
  roll?: { stat: string }
  outcomes?: Record<Band, string>
  suggest?: Partial<Record<Band, ('xp' | 'damage')[]>>
  /** Who it's aimed at, when that's someone on the map. */
  target?: TargetSpec
  tags?: string[]
}

interface DwClass {
  id: string
  name: string
  baseHp: number
  /** Damage die sides. */
  damage: number
  /** Load capacity before adding STR. */
  load: number
  blurb: string
  icon?: string
}

const BASIC: DwMove[] = [
  {
    id: 'hack-and-slash',
    target: { prompt: 'Target the enemy you’re attacking in melee', min: 1, max: 1 },
    name: 'Hack and Slash',
    category: 'basic',
    trigger: 'When you attack an enemy in melee',
    text: 'Roll +STR. On a 10+ you deal your damage and avoid their attack; you may instead choose to deal +1d6 damage and expose yourself to their attack. On a 7-9 you deal your damage and the enemy makes an attack against you.',
    roll: { stat: 'str' },
    outcomes: {
      strong: 'You deal your damage to the enemy and avoid their attack. You may choose to deal +1d6 damage, but then you expose yourself to the enemy’s attack.',
      weak: 'You deal your damage to the enemy and the enemy makes an attack against you.',
      miss: 'The GM makes a move.',
    },
    suggest: { strong: ['damage'], weak: ['damage'], miss: ['xp'] },
    tags: ['melee', 'attack', 'fight'],
  },
  {
    id: 'volley',
    target: { prompt: 'Target what you’re shooting at', min: 1, max: 1 },
    name: 'Volley',
    category: 'basic',
    trigger: 'When you take aim and shoot at an enemy at range',
    text: 'Roll +DEX. On a 10+ you have a clear shot and deal your damage. On a 7-9 choose one: you have to move to get the shot, placing you in danger; you have to take what you can get, for -1d6 damage; or you have to take several shots, reducing your ammo by one.',
    roll: { stat: 'dex' },
    outcomes: {
      strong: 'You have a clear shot: deal your damage.',
      weak: 'Choose one: you have to move to get the shot, placing you in danger as described by the GM; you have to take what you can get, for -1d6 damage; or you have to take several shots, reducing your ammo by one.',
      miss: 'The GM makes a move.',
    },
    suggest: { strong: ['damage'], weak: ['damage'], miss: ['xp'] },
    tags: ['ranged', 'attack', 'shoot', 'bow'],
  },
  {
    id: 'defy-danger',
    name: 'Defy Danger',
    category: 'basic',
    trigger: 'When you act despite an imminent threat or suffer a calamity',
    text: 'Say how you deal with it, then roll with the stat that fits: powering through is +STR, getting out of the way or acting fast +DEX, enduring +CON, using knowledge or expertise +INT, using intuition or resolve +WIS, charm and social grace +CHA. On a 10+ you do what you set out to, and the threat doesn’t come to bear. On a 7-9 you stumble, hesitate or flinch: the GM offers a worse outcome, a hard bargain or an ugly choice.',
    roll: { stat: 'choose' },
    outcomes: {
      strong: 'You do what you set out to, and the threat doesn’t come to bear.',
      weak: 'You stumble, hesitate, or flinch: the GM will offer you a worse outcome, a hard bargain, or an ugly choice.',
      miss: 'The GM makes a move.',
    },
    suggest: { miss: ['xp'] },
    tags: ['danger', 'save'],
  },
  {
    id: 'defend',
    target: { prompt: 'Target the person, item or place you’re defending', min: 1, max: 1 },
    name: 'Defend',
    category: 'basic',
    trigger: 'When you stand in defence of a person, item or location under attack',
    text: 'Roll +CON. On a 10+ hold 3; on a 7-9 hold 1. While you stay in defence, when you or the thing you defend is attacked you may spend hold, 1 for 1: redirect an attack from the thing you defend to yourself; halve the attack’s effect or damage; open up the attacker to an ally, giving that ally +1 forward against them; or deal damage to the attacker equal to your level.',
    roll: { stat: 'con' },
    outcomes: {
      strong: 'Hold 3. Spend it, 1 for 1, to redirect an attack to yourself, halve its effect or damage, open the attacker to an ally (+1 forward for them), or deal your level in damage to the attacker.',
      weak: 'Hold 1. Spend it, 1 for 1, as above.',
      miss: 'The GM makes a move.',
    },
    suggest: { miss: ['xp'] },
    tags: ['protect', 'guard'],
  },
  {
    id: 'spout-lore',
    name: 'Spout Lore',
    category: 'basic',
    trigger: 'When you consult your accumulated knowledge about something',
    text: 'Roll +INT. On a 10+ the GM tells you something interesting and useful about the subject relevant to your situation. On a 7-9 the GM tells you something interesting; it’s up to you to make it useful. The GM may ask how you know this.',
    roll: { stat: 'int' },
    outcomes: {
      strong: 'The GM will tell you something interesting and useful about the subject relevant to your situation.',
      weak: 'The GM will only tell you something interesting; it’s on you to make it useful.',
      miss: 'The GM makes a move.',
    },
    suggest: { miss: ['xp'] },
    tags: ['knowledge', 'lore', 'recall'],
  },
  {
    id: 'discern-realities',
    name: 'Discern Realities',
    category: 'basic',
    trigger: 'When you closely study a situation or person',
    text: 'Roll +WIS. On a 10+ hold 3; on a 7-9 hold 1. Spend hold, 1 for 1, to ask the GM questions: What happened here recently? What is about to happen? What should I be on the lookout for? What here is useful or valuable to me? Who’s really in control here? What here is not what it appears to be? Take +1 forward when acting on the answers.',
    roll: { stat: 'wis' },
    outcomes: {
      strong: 'Hold 3. Spend it, 1 for 1, to ask the GM questions (see the move). Take +1 forward when acting on the answers.',
      weak: 'Hold 1. Spend it to ask one of the questions. Take +1 forward when acting on the answer.',
      miss: 'The GM makes a move.',
    },
    suggest: { miss: ['xp'] },
    tags: ['investigate', 'search', 'perception'],
  },
  {
    id: 'parley',
    target: { prompt: 'Target who you’re pressing', min: 1, max: 1 },
    name: 'Parley',
    category: 'basic',
    trigger: 'When you have leverage on a GM character and manipulate them',
    text: 'Leverage is something they want or need. Roll +CHA. On a 10+ they do what you ask. On a 7-9 they will do what you ask, but need some concrete assurance first.',
    roll: { stat: 'cha' },
    outcomes: {
      strong: 'They do what you ask.',
      weak: 'They will do what you ask, but need some concrete assurance, proof or promise first.',
      miss: 'The GM makes a move.',
    },
    suggest: { miss: ['xp'] },
    tags: ['social', 'persuade', 'negotiate'],
  },
  {
    id: 'aid-or-interfere',
    target: { prompt: 'Target the character you’re helping or getting in the way of', min: 1, max: 1 },
    name: 'Aid or Interfere',
    category: 'basic',
    trigger: 'When you help or hinder someone else who is making a roll',
    text: 'Roll +Bond with them. On a 10+ they take +1 or -2, your choice. On a 7-9 you also expose yourself to danger, retribution or cost.',
    roll: { stat: 'bond' },
    outcomes: {
      strong: 'They take +1 or -2 to their roll, your choice.',
      weak: 'They take +1 or -2 to their roll, your choice, but you also expose yourself to danger, retribution or cost.',
      miss: 'The GM makes a move.',
    },
    suggest: { miss: ['xp'] },
    tags: ['help', 'bond', 'hinder'],
  },
]

const SPECIAL: DwMove[] = [
  {
    id: 'last-breath',
    name: 'Last Breath',
    category: 'special',
    trigger: 'When you’re dying, you catch a glimpse of what lies beyond the Black Gates of Death',
    text: 'Roll, with no modifier. On a 10+ you’ve cheated death: you’re in a bad spot, but stable. On a 7-9 Death offers you a bargain; take it and stabilise, or refuse and pass beyond the Gates. On a 6- your fate is sealed.',
    roll: { stat: 'none' },
    outcomes: {
      strong: 'You’ve cheated death: you’re in a bad spot, but stable.',
      weak: 'Death offers you a bargain. Take it and stabilise, or refuse and pass beyond the Black Gates.',
      miss: 'Your fate is sealed. The GM tells you what happens next.',
    },
    suggest: { miss: ['xp'] },
    tags: ['death', 'dying'],
  },
  {
    id: 'take-watch',
    name: 'Take Watch',
    category: 'special',
    trigger: 'When you’re on watch and something approaches the camp',
    text: 'Roll +WIS. On a 10+ you’re able to wake the camp and prepare a response; everyone takes +1 forward. On a 7-9 you get the alarm up, but the camp is not ready. On a 6- the GM makes a move.',
    roll: { stat: 'wis' },
    outcomes: {
      strong: 'You wake the camp in time and prepare a response. Everyone takes +1 forward.',
      weak: 'You get the alarm up, but the camp is not ready for what comes.',
      miss: 'The GM makes a move.',
    },
    suggest: { miss: ['xp'] },
    tags: ['camp', 'watch'],
  },
  {
    id: 'encumbrance',
    name: 'Encumbrance',
    category: 'special',
    trigger: 'When you carry more than your Load',
    text: 'If you carry weight up to your Load you take no penalty. At more than Load, take -1 ongoing until you drop weight. At more than Load + 2 you must drop something or you can’t do anything but stagger.',
    tags: ['load', 'weight'],
  },
  {
    id: 'make-camp',
    name: 'Make Camp',
    category: 'special',
    trigger: 'When you settle in to rest',
    text: 'Consume a ration. If you’re in a dangerous place, decide the watch order. If you have enough XP, you may level up. When you’ve rested, heal damage equal to half your max HP.',
    tags: ['rest', 'camp'],
  },
  {
    id: 'perilous-journey',
    name: 'Undertake a Perilous Journey',
    category: 'special',
    trigger: 'When you travel through hostile territory',
    text: 'Choose a scout, a quartermaster and a trailblazer. The quartermaster rolls +CON to see that supplies hold out, the trailblazer +WIS to find the way, and the scout +WIS to spot danger. Each result is read as on a 10+, 7-9 or 6-; the GM describes the journey.',
    tags: ['travel', 'journey'],
  },
  {
    id: 'level-up',
    name: 'Level Up',
    category: 'special',
    trigger: 'When you have downtime, an hour or two, and XP equal to your level + 7',
    text: 'Subtract your level + 7 from your XP and increase your level by one. Choose a new advanced move from your class. Increase one stat by 1 (to a maximum of 18), and update your modifier.',
    tags: ['xp', 'advance'],
  },
  {
    id: 'end-of-session',
    name: 'End of Session',
    category: 'special',
    trigger: 'When the session ends',
    text: 'Choose one of your bonds that you feel is resolved and mark XP. Then answer the questions as a group: Did we learn something new about the world? Did we overcome a notable monster or enemy? Did we loot a memorable treasure? Mark XP for each yes. Then update your bonds.',
    tags: ['xp', 'bonds'],
  },
  {
    id: 'carouse',
    name: 'Carouse',
    category: 'special',
    trigger: 'When you return triumphant and throw a big party',
    text: 'Spend some coin on revelry and see what the night brings. The GM tells you what you get from it; roll as the move directs.',
    tags: ['party', 'downtime'],
  },
  {
    id: 'supply',
    name: 'Supply',
    category: 'special',
    trigger: 'When you go to buy something with coin on hand',
    text: 'If it’s something readily available, the GM tells you the price. If it’s something special or hard to find, you’ll have to hunt for it, and the GM will say what it takes.',
    tags: ['buy', 'shop', 'gear'],
  },
  {
    id: 'recover',
    name: 'Recover',
    category: 'special',
    trigger: 'When you do nothing but rest in comfort and safety',
    text: 'After a full day of rest you recover all your HP. After three days of rest you remove one debility of your choice. If under a healer’s care, you heal as the healer’s moves say.',
    tags: ['rest', 'heal'],
  },
  {
    id: 'recruit',
    name: 'Recruit',
    category: 'special',
    trigger: 'When you put out word that you’re looking to hire help',
    text: 'Tell the GM what kind of help you’re after. They’ll tell you who’s available and what they want. Hirelings carry their own loyalty and cost.',
    tags: ['hire', 'hireling'],
  },
  {
    id: 'outstanding-warrants',
    name: 'Outstanding Warrants',
    category: 'special',
    trigger: 'When you return to a civilised place where you’ve caused trouble before',
    text: 'The GM tells you what trouble has caught up with you, and the price of making it right.',
    tags: ['reputation', 'law'],
  },
  {
    id: 'bolster',
    name: 'Bolster',
    category: 'special',
    trigger: 'When you spend time with a hireling or follower to lift their spirits',
    text: 'Spend time and coin to raise their loyalty. The GM tells you how it lands.',
    tags: ['hireling', 'loyalty'],
  },
]

// Each class shows a handful of its starting moves, condensed.
const CLASS_MOVES: DwMove[] = [
  { id: 'bend-bars', name: 'Bend Bars, Lift Gates', category: 'class', classId: 'fighter', trigger: 'When you use pure strength to destroy an inanimate obstacle', text: 'Roll +STR. On a 10+ choose 3; on a 7-9 choose 2: it doesn’t take a very long time; nothing of value is damaged; it doesn’t make an inordinate amount of noise; you can fix the thing again without too much effort.', roll: { stat: 'str' }, outcomes: { strong: 'Choose 3: it doesn’t take long; nothing of value is damaged; it isn’t very noisy; you can fix it again easily.', weak: 'Choose 2 of those four.', miss: 'The GM makes a move.' }, suggest: { miss: ['xp'] } },
  { id: 'armored', name: 'Armored', category: 'class', classId: 'fighter', trigger: 'Passive', text: 'You ignore the clumsy tag on armor you wear.' },
  { id: 'cast-a-spell', name: 'Cast a Spell', category: 'class', classId: 'wizard', trigger: 'When you release a spell you’ve prepared', text: 'Roll +INT. On a 10+ the spell is successfully cast and you don’t forget it. On a 7-9 the spell is cast, but choose one: you draw unwelcome attention or put yourself in a spot; the spell disturbs the fabric of reality (the GM chooses); or after it is cast, the spell is forgotten.', roll: { stat: 'int' }, outcomes: { strong: 'The spell is successfully cast and you don’t forget it.', weak: 'The spell is cast, but choose one: you draw unwelcome attention or put yourself in a spot; the spell disturbs reality; or the spell is forgotten.', miss: 'The GM makes a move, and the spell is forgotten.' }, suggest: { miss: ['xp'] } },
  { id: 'spellbook', name: 'Spellbook', category: 'class', classId: 'wizard', trigger: 'Passive', text: 'You have mastered several spells and inscribed them in your spellbook. You can prepare spells from it, using your level + 1 in spell levels.' },
  { id: 'prepare-spells', name: 'Prepare Spells', category: 'class', classId: 'wizard', trigger: 'When you spend uninterrupted time (an hour or so) in quiet contemplation of your spellbook', text: 'Erase your prepared spells and prepare new ones from your spellbook, up to your level + 1 in total spell levels. You also always have the cantrips prepared.' },
  { id: 'divine-guidance', name: 'Divine Guidance', category: 'class', classId: 'cleric', trigger: 'When you petition your deity according to their precepts', text: 'Ask the GM what your deity would have you do, or what they would tell you, and the GM will answer honestly in the character of your god.' },
  { id: 'turn-undead', target: { prompt: 'Target the undead you hold at bay', min: 1 }, name: 'Turn Undead', category: 'class', classId: 'cleric', trigger: 'When you hold up your holy symbol and call on your deity for protection', text: 'Roll +WIS. On a 10+ the undead flee or are held at bay for a time. On a 7-9 they do, but they may return, or you attract attention. The GM will say how.', roll: { stat: 'wis' }, outcomes: { strong: 'The undead are held at bay or flee while you call on your deity.', weak: 'The undead falter, but the GM chooses a cost: they may return, or something else notices you.', miss: 'The GM makes a move.' }, suggest: { miss: ['xp'] } },
  { id: 'cleric-cast-a-spell', name: 'Cleric: Cast a Spell', category: 'class', classId: 'cleric', trigger: 'When you offer a prayer to your deity to cast a prepared spell', text: 'Roll +WIS. On a 10+ the spell is successfully cast and your deity does not revoke it. On a 7-9 the spell is cast, but choose one: you incur your deity’s disfavour (−1 ongoing to Cast a Spell until you earn it back), or the spell is revoked.', roll: { stat: 'wis' }, outcomes: { strong: 'The spell is successfully cast and your deity doesn’t revoke it.', weak: 'The spell is cast, but you incur disfavour (-1 ongoing to Cast a Spell until you atone) or the spell is revoked.', miss: 'The GM makes a move.' }, suggest: { miss: ['xp'] } },
  { id: 'trap-expert', name: 'Trap Expert', category: 'class', classId: 'thief', trigger: 'When you spend a moment to survey a dangerous area', text: 'Roll +DEX. On a 10+ hold 3; on a 7-9 hold 1. Spend hold, 1 for 1, to ask: Is there a trap here, and what activates it? What does it do when triggered? What else is hidden here? You take +1 forward when acting on the answers.', roll: { stat: 'dex' }, outcomes: { strong: 'Hold 3. Spend it to ask about traps and hidden things here. Take +1 forward when acting on the answers.', weak: 'Hold 1. Spend it to ask one of those questions.', miss: 'The GM makes a move.' }, suggest: { miss: ['xp'] } },
  { id: 'backstab', name: 'Backstab', category: 'class', classId: 'thief', trigger: 'When you attack a surprised or defenceless enemy with a melee weapon', text: 'When you attack a surprised or defenceless enemy with a melee weapon, you get an advantage over an ordinary attack. See the SRD for the exact options.' },
  { id: 'tricks-of-the-trade', name: 'Tricks of the Trade', category: 'class', classId: 'thief', trigger: 'When you pick locks or pockets or disable traps', text: 'Roll +DEX. On a 10+ you do it, no problem. On a 7-9 the GM will offer you a worse outcome, hard bargain, or ugly choice.', roll: { stat: 'dex' }, outcomes: { strong: 'You do it, no problem.', weak: 'The GM will offer you a worse outcome, a hard bargain, or an ugly choice.', miss: 'The GM makes a move.' }, suggest: { miss: ['xp'] } },
  { id: 'called-shot', name: 'Called Shot', category: 'class', classId: 'ranger', trigger: 'When you attack a defenceless or surprised enemy at range', text: 'You may stop and deal your damage, or name a target on the enemy and roll +DEX. On a 10+ you deal your damage and the effect you wanted (disarm, hobble, blind…). On a 7-9 you deal damage and the effect, but choose one: you have to move to get the shot, or the enemy gets a response.', roll: { stat: 'dex' }, outcomes: { strong: 'You deal your damage and the effect you wanted.', weak: 'You deal your damage and get the effect, but choose one: you have to move, or the enemy gets a response.', miss: 'The GM makes a move.' }, suggest: { strong: ['damage'], weak: ['damage'], miss: ['xp'] } },
  { id: 'hunt-and-track', name: 'Hunt and Track', category: 'class', classId: 'ranger', trigger: 'When you follow a trail of clues left behind by passing creatures', text: 'Roll +WIS. On a 10+ you follow the creature’s trail until there’s a significant change in its direction or mode of travel, and you also choose 1. On a 7-9 you follow the trail, but the GM chooses 1 as well.', roll: { stat: 'wis' }, outcomes: { strong: 'You follow the trail until something significant changes, and you choose one boon.', weak: 'You follow the trail, but the GM also chooses one to complicate it.', miss: 'The GM makes a move.' }, suggest: { miss: ['xp'] } },
  { id: 'lay-on-hands', target: { prompt: 'Target who you touch', min: 1, max: 1 }, name: 'Lay on Hands', category: 'class', classId: 'paladin', trigger: 'When you touch someone, skin to skin, and pray for their well-being', text: 'Roll +CHA. On a 10+ you heal them of 1d8 damage, or remove one disease or curse. On a 7-9 it works, but you also take the damage or effect, or your power is drawn through you.', roll: { stat: 'cha' }, outcomes: { strong: 'It works: heal 1d8 damage, or remove one disease or curse.', weak: 'It works, but the GM chooses a cost: you take the damage or effect on yourself, or your power is drawn through you.', miss: 'The GM makes a move.' }, suggest: { miss: ['xp'] } },
  { id: 'i-am-the-law', name: 'I Am the Law', category: 'class', classId: 'paladin', trigger: 'When you give an NPC an order based on your divine authority', text: 'Roll +CHA. On a 10+ they choose to obey or to suffer the consequences. On a 7-9 they choose to obey, or to hold out for their own reasons, and make a move on you.', roll: { stat: 'cha' }, outcomes: { strong: 'They choose: obey, or suffer the consequences you name.', weak: 'They choose: obey, or hold out for their own reasons and make a move on you.', miss: 'The GM makes a move.' }, suggest: { miss: ['xp'] } },
  { id: 'arcane-art', target: { prompt: 'Target the ally your performance is for', min: 1, max: 1 }, name: 'Arcane Art', category: 'class', classId: 'bard', trigger: 'When you weave a performance into a spell', text: 'Choose an ally and an effect (heal, grant +1d4 damage, or give +1 forward), then roll +CHA. On a 10+ it works; on a 7-9 it works, but you also attract unwelcome attention.', roll: { stat: 'cha' }, outcomes: { strong: 'It works, no problem.', weak: 'It works, but you attract unwelcome attention or put yourself in a spot.', miss: 'The GM makes a move.' }, suggest: { miss: ['xp'] } },
  { id: 'bardic-lore', name: 'Bardic Lore', category: 'class', classId: 'bard', trigger: 'When you first encounter an important creature, location or thing', text: 'Ask the GM for any lore you’d have: tales, songs, rumours. The GM tells you what you know, and you may ask for more by rolling Spout Lore.' },
  { id: 'spirit-tongue', name: 'Spirit Tongue', category: 'class', classId: 'druid', trigger: 'When you call to the spirits', text: 'You take the form of an animal you’ve studied, and can speak with and be understood by animals of that kind.' },
  { id: 'the-spirits-sing', name: 'The Spirits Sing', category: 'class', classId: 'druid', trigger: 'When you enter a new place and listen to the spirits', text: 'Roll +WIS. On a 10+ hold 3; on a 7-9 hold 1. Spend hold, 1 for 1, to ask the spirits a question about this place or the creatures in it.', roll: { stat: 'wis' }, outcomes: { strong: 'Hold 3. Spend it to ask the spirits questions about this place.', weak: 'Hold 1. Spend it to ask one question.', miss: 'The GM makes a move.' }, suggest: { miss: ['xp'] } },
]

const CLASSES: DwClass[] = [
  { id: 'bard', name: 'The Bard', baseHp: 6, damage: 6, load: 9, blurb: 'Performer, lorekeeper and charming rogue.', icon: 'bard' },
  { id: 'cleric', name: 'The Cleric', baseHp: 8, damage: 6, load: 7, blurb: 'Servant of a deity, healer and turner of undead.', icon: 'cleric' },
  { id: 'druid', name: 'The Druid', baseHp: 6, damage: 6, load: 5, blurb: 'Shapeshifter who speaks with the spirits of the land.', icon: 'druid' },
  { id: 'fighter', name: 'The Fighter', baseHp: 10, damage: 10, load: 12, blurb: 'Weapon master and frontline defender.', icon: 'fighter' },
  { id: 'paladin', name: 'The Paladin', baseHp: 10, damage: 10, load: 12, blurb: 'Holy warrior sworn to a quest.', icon: 'paladin' },
  { id: 'ranger', name: 'The Ranger', baseHp: 8, damage: 8, load: 11, blurb: 'Hunter and tracker with an animal companion.', icon: 'ranger' },
  { id: 'thief', name: 'The Thief', baseHp: 6, damage: 8, load: 9, blurb: 'Burglar, backstabber and trap expert.', icon: 'thief' },
  { id: 'wizard', name: 'The Wizard', baseHp: 4, damage: 4, load: 7, blurb: 'Scholar of the arcane with a spellbook.', icon: 'wizard' },
]

const ITEMS: ItemDef[] = [
  { id: 'dungeon-rations', name: 'Dungeon Rations', description: 'Dried, salted and hardy. Eaten to Make Camp.', weight: 1, uses: 5, tags: ['ration'], icon: 'rations' },
  { id: 'adventuring-gear', name: 'Adventuring Gear', description: 'Rope, torches, flint and the like. Spend a use to have just what you need.', weight: 1, uses: 5, tags: [], icon: 'gear' },
  { id: 'healing-potion', name: 'Healing Potion', description: 'Heals 10 damage and removes a debility.', weight: 0, uses: 1, tags: ['potion'], icon: 'potion' },
  { id: 'antitoxin', name: 'Antitoxin Herbs', description: 'Neutralise a poison.', weight: 1, uses: 1, tags: ['slow'], icon: 'herbs' },
  { id: 'poultice', name: 'Poultice and Herbs', description: 'Heals damage as the GM allows.', weight: 1, uses: 2, tags: ['slow'], icon: 'poultice' },
  { id: 'bag-of-books', name: 'Bag of Books', description: 'Spend a use to gain knowledge: take +1 to Spout Lore on the subject.', weight: 2, uses: 5, tags: [], icon: 'books' },
  { id: 'dagger', name: 'Dagger', description: 'Small, easy to hide.', weight: 1, tags: ['hand'], equippable: true, icon: 'dagger' },
  { id: 'short-sword', name: 'Short Sword', description: 'A sharp short blade.', weight: 1, tags: ['close'], equippable: true, icon: 'sword' },
  { id: 'axe', name: 'Axe', description: 'A heavy chopping weapon.', weight: 1, tags: ['close'], equippable: true, icon: 'axe' },
  { id: 'spear', name: 'Spear', description: 'Long enough to keep them at a distance.', weight: 1, tags: ['reach', 'thrown', 'near'], equippable: true, icon: 'spear' },
  { id: 'halberd', name: 'Halberd', description: 'A heavy pole weapon.', weight: 2, tags: ['reach', '+1 damage', 'two-handed'], equippable: true, effects: [{ type: 'modify', path: 'damageBonus', op: 'add', value: 1 }], active: 'equipped', icon: 'polearm' },
  { id: 'rapier', name: 'Rapier', description: 'A precise duelling blade.', weight: 1, tags: ['close', 'precise'], equippable: true, icon: 'rapier' },
  { id: 'bow', name: 'Bow', description: 'Needs arrows to be used.', weight: 2, tags: ['near'], equippable: true, icon: 'bow' },
  { id: 'arrows', name: 'Bundle of Arrows', description: 'Ammo for a bow.', weight: 1, uses: 3, tags: ['ammo'], icon: 'arrows' },
  { id: 'chainmail', name: 'Chainmail', description: 'Armour you wear.', weight: 1, tags: ['1 armor', 'worn'], equippable: true, active: 'equipped', effects: [{ type: 'modify', path: 'armor', op: 'add', value: 1 }], icon: 'chainmail' },
  { id: 'scale-armor', name: 'Scale Armor', description: 'Heavy, armour you wear.', weight: 3, tags: ['2 armor', 'worn', 'clumsy'], equippable: true, active: 'equipped', effects: [{ type: 'modify', path: 'armor', op: 'add', value: 2 }], icon: 'scale-armor' },
  { id: 'shield', name: 'Shield', description: 'Carried in one hand.', weight: 2, tags: ['+1 armor'], equippable: true, active: 'equipped', effects: [{ type: 'modify', path: 'armor', op: 'add', value: 1 }], icon: 'shield' },
  { id: 'holy-symbol', name: 'Holy Symbol', description: 'A sacred emblem of your deity.', weight: 0, tags: [], icon: 'holy-symbol' },
  { id: 'spellbook', name: 'Spellbook', description: 'Your book of spells.', weight: 1, tags: [], icon: 'spellbook' },
  { id: 'thieves-tools', name: 'Thieves’ Tools', description: 'Picks and wires for locks and traps.', weight: 1, tags: [], icon: 'tools' },
]

const TAGS: TagDef[] = [
  { id: 'hand', name: 'Hand', text: 'Useful for attacking at hand range, within arm’s reach.' },
  { id: 'close', name: 'Close', text: 'Useful for attacking at close range, where you can see the whites of their eyes.' },
  { id: 'reach', name: 'Reach', text: 'Useful for attacking at reach: a bit further than close.' },
  { id: 'near', name: 'Near', text: 'Useful for attacking at a distance, about a stone’s throw.' },
  { id: 'far', name: 'Far', text: 'Useful for attacking at long range, as far as you can see.' },
  { id: 'thrown', name: 'Thrown', text: 'Can be thrown at range; it will be out of your hands afterwards.' },
  { id: 'precise', name: 'Precise', text: 'You use DEX rather than STR to Hack and Slash with it.' },
  { id: 'ration', name: 'Ration', text: 'Eaten to Make Camp. Each ration is a use.' },
  { id: 'slow', name: 'Slow', text: 'Takes a while to apply or work.' },
  { id: 'clumsy', name: 'Clumsy', text: 'Awkward to wear or wield: −1 ongoing while it is used (Fighters and Paladins ignore it).' },
  { id: 'worn', name: 'Worn', text: 'Armour or other gear you wear, so it only counts while equipped.' },
  { id: 'two-handed', name: 'Two-handed', text: 'Takes both hands to use.' },
  { id: 'ammo', name: 'Ammo', text: 'Each use is a shot; when it’s gone, you’re out.' },
  { id: 'potion', name: 'Potion', text: 'Drunk to take effect; each use is a dose.' },
]

const modifierOf = (score: number) =>
  score <= 3 ? -3 : score <= 5 ? -2 : score <= 8 ? -1 : score <= 12 ? 0 : score <= 15 ? 1 : score <= 17 ? 2 : 3

const BOND = { kind: 'number', label: 'Bond', prompt: 'Bond bonus', min: 0, max: 3 } as const

/** A move as a core action: rolled moves are one check step. */
function toAction(m: DwMove): ActionDef {
  const stat = m.roll?.stat
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    ...(m.classId ? { classId: m.classId } : {}),
    trigger: m.trigger,
    text: m.text,
    ...(m.tags ? { tags: m.tags } : {}),
    ...(m.target ? { target: m.target } : {}),
    steps:
      stat && m.outcomes
        ? [
            {
              kind: 'check',
              ...(stat === 'choose'
                ? { ask: { kind: 'stat' } as const }
                : stat === 'bond'
                  ? { ask: BOND }
                  : stat === 'none'
                    ? {}
                    : { stat }),
              outcomes: m.outcomes,
              ...(m.suggest ? { followUps: m.suggest } : {}),
            },
          ]
        : [],
  }
}

const toClass = (k: DwClass): ClassDef => ({
  id: k.id,
  name: k.name,
  blurb: k.blurb,
  ...(k.icon ? { icon: k.icon } : {}),
  values: { baseHp: k.baseHp, damage: k.damage, load: k.load },
})

const signed = (n: number, label: string) => `${n < 0 ? '-' : '+'}${Math.abs(n)}[${label}]`

const STATS = [
  { id: 'str', name: 'Strength', abbr: 'STR', debility: { id: 'weak', name: 'Weak' } },
  { id: 'dex', name: 'Dexterity', abbr: 'DEX', debility: { id: 'shaky', name: 'Shaky' } },
  { id: 'con', name: 'Constitution', abbr: 'CON', debility: { id: 'sick', name: 'Sick' } },
  { id: 'int', name: 'Intelligence', abbr: 'INT', debility: { id: 'stunned', name: 'Stunned' } },
  { id: 'wis', name: 'Wisdom', abbr: 'WIS', debility: { id: 'confused', name: 'Confused' } },
  { id: 'cha', name: 'Charisma', abbr: 'CHA', debility: { id: 'scarred', name: 'Scarred' } },
]

/** Hit points a new NPC starts with. */
const NPC_HP = 6

const ACTIONS = [...BASIC, ...SPECIAL, ...CLASS_MOVES].map(toAction)

export const dungeonWorld: GameSystem = {
  id: 'dungeon-world',
  name: 'Dungeon World',
  version: '0.1.0',
  stats: STATS.map(({ id, name, abbr }) => ({ id, name, abbr })),
  modifier: modifierOf,
  baseRoll: '2d6',
  results: [
    { id: 'strong', label: 'Full success', tone: 'good' },
    { id: 'weak', label: 'Partial success', tone: 'mixed' },
    { id: 'miss', label: 'Miss', tone: 'bad' },
  ],
  result: (total) => (total >= 10 ? 'strong' : total >= 7 ? 'weak' : 'miss'),
  actions: ACTIONS,
  actionCategories: [
    { id: 'class', label: 'Class' },
    { id: 'basic', label: 'Basic' },
    { id: 'special', label: 'Special', onHotbar: false },
  ],
  followUps: [
    { id: 'xp', kind: 'bump', label: 'Mark XP', field: 'xp', by: 1 },
    {
      id: 'damage',
      kind: 'roll',
      label: 'Roll damage',
      comment: 'Damage',
      formula: (_c, d) => `d${d.values.damage}${d.values.damageBonus ? signed(d.values.damageBonus, 'Gear') : ''}`,
    },
  ],
  classes: CLASSES.map(toClass),
  items: ITEMS,
  tags: TAGS,
  // Debilities: each takes 1 from rolls with its stat.
  conditions: STATS.map((s) => ({
    id: s.debility.id,
    name: s.debility.name,
    stat: s.id,
    effects: [{ type: 'rollBonus' as const, stat: s.id, value: -1 }],
  })),
  modifiers: [
    { id: 'forward', label: 'Forward', until: 'next-roll' },
    { id: 'ongoing', label: 'Ongoing', until: 'removed' },
  ],
  resources: [{ id: 'hp', name: 'HP', max: 'maxHp' }],
  characterData: [
    { id: 'race', default: '' },
    { id: 'alignment', default: '' },
    { id: 'xp', default: 0, for: 'pc' },
    { id: 'coin', default: 0, for: 'pc' },
    /** Added to the computed maximum HP, for the odd homebrew change. */
    { id: 'hpBonus', default: 0, for: 'pc' },
    /** An NPC's maximum HP, set by hand. */
    { id: 'maxHp', default: NPC_HP, for: 'npc' },
  ],
  // Dungeon World's size tags, as token sizes.
  sizes: [
    { id: 'tiny', name: 'Tiny', cells: 0.5 },
    { id: 'small', name: 'Small', cells: 1 },
    { id: 'human', name: 'Human-sized', cells: 1 },
    { id: 'large', name: 'Large', cells: 2 },
    { id: 'huge', name: 'Huge', cells: 3 },
  ],
  // Ranges are fictional (hand, close, near, far), so feet are only a guide.
  scene: { unit: 5, unitName: 'ft', diagonal: 'one' },
  npcFields: [
    { id: 'damage', label: 'Damage', type: 'text' },
    { id: 'armor', label: 'Armor', type: 'number' },
    { id: 'tags', label: 'Tags', type: 'text' },
    { id: 'instinct', label: 'Instinct', type: 'text' },
    { id: 'moves', label: 'Moves', type: 'longtext' },
  ],
  derive(c, sources) {
    const cls = CLASSES.find((k) => k.id === c.classId) ?? CLASSES[0]
    const mods: Record<string, number> = {}
    for (const s of STATS) mods[s.id] = modifierOf(c.scores[s.id] ?? 10)
    const resolved = resolveEffects(
      {
        maxHp: c.kind === 'npc' ? Number(c.data.maxHp ?? NPC_HP) : cls.baseHp + (c.scores.con ?? 10) + Number(c.data.hpBonus ?? 0),
        armor: 0,
        damage: cls.damage,
        damageBonus: 0,
        maxLoad: cls.load + (mods.str ?? 0),
      },
      sources,
    )
    return {
      mods,
      resolved,
      values: {
        ...resolved.values,
        load: c.inventory.reduce((n, i) => n + i.weight, 0),
        /** XP needed to level up. */
        xpNeeded: c.level + 7,
      },
    }
  },
  actionsFor(c, d) {
    if (c.kind === 'npc') return []
    const granted = new Set(d.resolved.moves)
    return ACTIONS.filter((m) => m.category !== 'class' || m.classId === c.classId || granted.has(m.id))
  },
  tokenStats: (c, d) => {
    const hp = c.resources.hp ?? 0
    const max = d.values.maxHp
    return [{ id: 'hp', label: 'HP', value: hp, max, colour: hp <= max / 4 ? '#d04a3a' : hp <= max / 2 ? '#d49a32' : '#4aa35a' }]
  },
  attribution:
    'Condensed from the Dungeon World SRD by Sage LaCroix and Adam Koebel, used under CC BY 3.0. Check the SRD for exact wording.',
}
