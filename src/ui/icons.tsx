import type { ComponentType } from "react";
import { art } from "./iconArt";

/*
 * Every icon in the app, named for what it means rather than what it shows:
 * full-colour objects from the adventurer's kit, modelled in scripts/icons
 * and rendered by `npm run generate:icons`. Swap an icon here and it changes
 * everywhere.
 */

export type IconProps = { size?: number; className?: string };
export type Icon = ComponentType<IconProps>;

/** Icons on the main toolbar and the sidebar tabs: large enough to show their detail. */
export const PROMINENT_ICON_SIZE = 32;

// Canvas tools
export const IconSelect = art("select");
export const IconPan = art("pan");
export const IconDraw = art("draw");
export const IconEraser = art("eraser");
export const IconShapes = art("shapes");
export const IconText = art("text");
export const IconBold = art("bold");
export const IconItalic = art("italic");
export const IconMeasure = art("measure");
export const IconPing = art("ping");
export const IconWall = art("wall");
export const IconLight = art("light");
export const IconEffects = art("effects");
export const IconRain = art("rain");
export const IconSnow = art("snow");
export const IconFog = art("fog");
export const IconEmbers = art("embers");
export const IconMagic = art("magic");

// Scene elements and canvas actions
export const IconToken = art("token");
export const IconMap = art("map");
export const IconTarget = art("target");
// Using an action: simple, bold glyphs that read at button size.
export const IconRoll = art("roll");
export const IconPost = art("post");
export const IconLock = art("lock");
export const IconUnlock = art("unlock");
export const IconImage = art("image");
export const IconBack = art("back");
export const IconFolder = art("folder");
export const IconNewFolder = art("new-folder");
/** Campaign backups: save one to a file, bring one in, keep one in a folder. */
export const IconExport = art("export");
export const IconImport = art("import");
export const IconBackupFolder = art("backup-folder");
export const IconGrid = art("grid");
export const IconToFront = art("to-front");
export const IconToBack = art("to-back");
export const IconDuplicate = art("duplicate");
export const IconGive = art("give");
export const IconRename = art("rename");
export const IconShortcut = art("shortcut");
export const IconFit = art("fit");
export const IconUndo = art("undo");
export const IconRedo = art("redo");

// Sidebar panels
export const IconChat = art("chat");
export const IconCharacters = art("characters");
export const IconPlayerCharacter = art("player-character");
export const IconLibraries = art("libraries");
export const IconReference = art("reference");
export const IconNotes = art("notes");
/** A GM-only page. */
export const IconSecret = art("secret");
export const IconReveal = art("reveal");
export const IconObscure = art("obscure");
export const IconMembers = art("members");

// Game actions
export const IconDice = art("dice");
export const IconCombat = art("combat");
export const IconItems = art("items");
export const IconNewGear = art("new-gear");
export const IconNewMove = art("new-move");
export const IconStartCombat = art("start-combat");
export const IconEndCombat = art("end-combat");
export const IconNextTurn = art("next-turn");
export const IconPreviousTurn = art("previous-turn");
export const IconRelationships = art("relationships");
export const IconPin = art("pin");

// Members
export const IconRemoveMember = art("remove-member");
export const IconAllowBack = art("allow-back");

// Interface
export const IconSettings = art("settings");
export const IconHelp = art("help");
export const IconLeave = art("leave");
export const IconDelete = art("delete");
export const IconAdd = art("add");
export const IconRemove = art("remove");
export const IconSearch = art("search");
export const IconClose = art("close");
export const IconMenu = art("menu");
export const IconExpand = art("expand");
/** Two panes side by side, and one pane at a time. */
export const IconLayoutSplit = art("layout-split");
export const IconLayoutSingle = art("layout-single");
export const IconSidebarHide = art("sidebar-hide");
/** Open something in its panel, or in a window of its own. */
export const IconSidebar = art("sidebar");
export const IconOpenWindow = art("open-window");
/** A ticked menu item. */
export const IconCheck = art("check");
