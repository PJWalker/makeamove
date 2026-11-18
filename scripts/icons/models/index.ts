import type { Object3D } from "three";
import {
  archeryTarget,
  cog,
  dice,
  lantern,
  openBook,
  padlock,
  quillAndInkpot,
  treasureMap,
} from "./core";
import * as tools from "./tools";
import * as scene from "./scene";
import * as panels from "./panels";
import * as game from "./game";
import * as ui from "./interface";

/**
 * One model per icon, keyed by the file it renders to. Each matches an
 * export of src/ui/icons.tsx: "new-folder" renders IconNewFolder.
 */
export const MODELS = {
  // Canvas tools
  select: tools.select,
  pan: tools.pan,
  draw: quillAndInkpot,
  eraser: tools.eraser,
  shapes: tools.shapes,
  text: tools.text,
  bold: tools.bold,
  italic: tools.italic,
  measure: tools.measure,
  ping: archeryTarget,
  wall: tools.wall,
  light: lantern,
  effects: tools.effects,
  rain: tools.rain,
  snow: tools.snow,
  fog: tools.fog,
  embers: tools.embers,
  magic: tools.magic,
  // Scene elements and canvas actions
  token: scene.token,
  map: treasureMap,
  target: scene.target,
  roll: scene.roll,
  post: scene.post,
  lock: () => padlock(),
  unlock: scene.unlock,
  image: scene.image,
  back: scene.back,
  folder: scene.folder,
  "new-folder": scene.newFolder,
  export: scene.exportCampaign,
  import: scene.importCampaign,
  "backup-folder": scene.backupFolder,
  grid: scene.grid,
  "to-front": scene.toFront,
  "to-back": scene.toBack,
  duplicate: scene.duplicate,
  give: scene.give,
  rename: scene.rename,
  shortcut: scene.shortcut,
  fit: scene.fitView,
  undo: scene.undo,
  redo: scene.redo,
  // Sidebar panels
  chat: panels.chat,
  characters: panels.characters,
  "player-character": panels.playerCharacter,
  libraries: panels.libraries,
  reference: panels.reference,
  notes: openBook,
  secret: panels.secret,
  reveal: panels.reveal,
  obscure: panels.obscure,
  members: panels.members,
  // Game actions
  dice,
  combat: game.combat,
  items: game.items,
  "new-gear": game.newGear,
  "new-move": game.newMove,
  "start-combat": game.startCombat,
  "end-combat": game.endCombat,
  "next-turn": game.nextTurn,
  "previous-turn": game.previousTurn,
  relationships: game.relationships,
  pin: game.pin,
  "remove-member": game.removeMember,
  "allow-back": game.allowBack,
  // Interface
  settings: cog,
  help: ui.help,
  leave: ui.leave,
  delete: ui.deleteItem,
  add: ui.add,
  remove: ui.remove,
  search: ui.search,
  close: ui.close,
  menu: ui.menu,
  expand: ui.expand,
  "layout-split": ui.layoutSplit,
  "layout-single": ui.layoutSingle,
  "sidebar-hide": ui.sidebarHide,
  sidebar: ui.sidebar,
  "open-window": ui.openWindow,
  check: ui.check,
} satisfies Record<string, () => Object3D>;

export type IconName = keyof typeof MODELS;
