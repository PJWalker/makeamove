import type * as React from "react";
import type { ComponentType } from "react";

/*
 * Every icon in the app, named for what it means rather than what it shows.
 * Game-icons.net (CC BY 3.0) comes first; Material Symbols Rounded (filled)
 * covers interface glyphs Game-icons has no good fit for. Swap an icon here
 * and it changes everywhere.
 */

// Game-icons.net
import GiArrowCursor from "~icons/game-icons/arrow-cursor";
import GiBullseye from "~icons/game-icons/bullseye";
import GiCog from "~icons/game-icons/cog";
import GiCrossedSwords from "~icons/game-icons/crossed-swords";
import GiSwordClash from "~icons/game-icons/sword-clash";
import GiAnvilImpact from "~icons/game-icons/anvil-impact";
import GiFamilyTree from "~icons/game-icons/family-tree";
import MsPushPin from "~icons/material-symbols/push-pin";
import GiExitDoor from "~icons/game-icons/exit-door";
import GiStoneWall from "~icons/game-icons/stone-wall";
import GiLanternFlame from "~icons/game-icons/lantern-flame";
import GiMagicSwirl from "~icons/game-icons/magic-swirl";
import GiRaining from "~icons/game-icons/raining";
import GiSnowing from "~icons/game-icons/snowing";
import GiFog from "~icons/game-icons/fog";
import GiBurningEmbers from "~icons/game-icons/burning-embers";
import GiSparkles from "~icons/game-icons/sparkles";
import GiHand from "~icons/game-icons/hand";
import GiHelp from "~icons/game-icons/help";
import GiBookshelf from "~icons/game-icons/bookshelf";
import GiScrollUnfurled from "~icons/game-icons/scroll-unfurled";
import GiMeasureTape from "~icons/game-icons/measure-tape";
import GiOpenBook from "~icons/game-icons/open-book";
import GiPadlock from "~icons/game-icons/padlock";
import GiPadlockOpen from "~icons/game-icons/padlock-open";
import GiPawn from "~icons/game-icons/pawn";
import GiQuillInk from "~icons/game-icons/quill-ink";
import GiSecretBook from "~icons/game-icons/secret-book";
import GiRollingDices from "~icons/game-icons/rolling-dices";
import GiTalk from "~icons/game-icons/talk";
import GiThreeFriends from "~icons/game-icons/three-friends";
import GiTrashCan from "~icons/game-icons/trash-can";
import GiTreasureMap from "~icons/game-icons/treasure-map";
import GiVisoredHelm from "~icons/game-icons/visored-helm";
import GiCharacter from "~icons/game-icons/character";
import GiKnapsack from "~icons/game-icons/knapsack";
import GiSprint from "~icons/game-icons/sprint";

// Material Symbols Rounded (filled)
import MsSearch from "~icons/material-symbols/search-rounded";
import MsAdd from "~icons/material-symbols/add-rounded";
import MsCategory from "~icons/material-symbols/category-rounded";
import MsMyLocation from "~icons/material-symbols/my-location-rounded";
import MsCasino from "~icons/material-symbols/casino-rounded";
import MsSend from "~icons/material-symbols/send-rounded";
import MsClose from "~icons/material-symbols/close-rounded";
import MsMenu from "~icons/material-symbols/menu-rounded";
import MsVisibility from "~icons/material-symbols/visibility-rounded";
import MsVisibilityOff from "~icons/material-symbols/visibility-off-rounded";
import MsContentCopy from "~icons/material-symbols/content-copy-rounded";
import MsDockToRight from "~icons/material-symbols/dock-to-right-rounded";
import MsEdit from "~icons/material-symbols/edit-rounded";
import MsExpandMore from "~icons/material-symbols/expand-more-rounded";
import MsFitScreen from "~icons/material-symbols/fit-screen-rounded";
import MsFlipToBack from "~icons/material-symbols/flip-to-back-rounded";
import MsFlipToFront from "~icons/material-symbols/flip-to-front-rounded";
import MsGridOn from "~icons/material-symbols/grid-on-rounded";
import MsHandPackage from "~icons/material-symbols/hand-package-rounded";
import MsChevronLeft from "~icons/material-symbols/chevron-left-rounded";
import MsFolder from "~icons/material-symbols/folder-rounded";
import MsDownload from "~icons/material-symbols/download-rounded";
import MsUpload from "~icons/material-symbols/upload-rounded";
import MsFolderManaged from "~icons/material-symbols/folder-managed-rounded";
import MsImage from "~icons/material-symbols/image-rounded";
import MsKeyboard from "~icons/material-symbols/keyboard-rounded";
import MsInkEraser from "~icons/material-symbols/ink-eraser-rounded";
import MsLayers from "~icons/material-symbols/layers-rounded";
import MsRectangle from "~icons/material-symbols/rectangle-rounded";
import MsVerticalSplit from "~icons/material-symbols/vertical-split-rounded";
import MsPanelClose from "~icons/material-symbols/right-panel-close-rounded";
import MsOpenInNew from "~icons/material-symbols/open-in-new-rounded";
import MsCheck from "~icons/material-symbols/check-rounded";
import MsCreateNewFolder from "~icons/material-symbols/create-new-folder-rounded";
import MsPlayArrow from "~icons/material-symbols/play-arrow-rounded";
import MsSkipNext from "~icons/material-symbols/skip-next-rounded";
import MsSkipPrevious from "~icons/material-symbols/skip-previous-rounded";
import MsStop from "~icons/material-symbols/stop-rounded";
import MsPersonAdd from "~icons/material-symbols/person-add-rounded";
import MsPersonRemove from "~icons/material-symbols/person-remove-rounded";
import MsRemove from "~icons/material-symbols/remove-rounded";
import MsRedo from "~icons/material-symbols/redo-rounded";
import MsTitle from "~icons/material-symbols/title-rounded";
import MsUndo from "~icons/material-symbols/undo-rounded";

export type IconProps = Omit<React.SVGProps<SVGSVGElement>, "size"> & { size?: number };
export type Icon = ComponentType<IconProps>;

export function icon(Svg: ComponentType<React.SVGProps<SVGSVGElement>>): Icon {
  return function Icon({ size = 22, ...rest }) {
    return <Svg width={size} height={size} aria-hidden="true" {...rest} />;
  };
}

// Canvas tools
export const IconSelect = icon(GiArrowCursor);
export const IconPan = icon(GiHand);
export const IconDraw = icon(GiQuillInk);
export const IconEraser = icon(MsInkEraser);
export const IconShapes = icon(MsCategory);
export const IconText = icon(MsTitle);
export const IconMeasure = icon(GiMeasureTape);
export const IconPing = icon(GiBullseye);
export const IconWall = icon(GiStoneWall);
export const IconLight = icon(GiLanternFlame);
export const IconEffects = icon(GiMagicSwirl);
export const IconRain = icon(GiRaining);
export const IconSnow = icon(GiSnowing);
export const IconFog = icon(GiFog);
export const IconEmbers = icon(GiBurningEmbers);
export const IconMagic = icon(GiSparkles);

// Scene elements and canvas actions
export const IconToken = icon(GiPawn);
export const IconMap = icon(GiTreasureMap);
export const IconTarget = icon(MsMyLocation);
// Using an action: simple, bold glyphs that read at button size.
export const IconRoll = icon(MsCasino);
export const IconPost = icon(MsSend);
export const IconLock = icon(GiPadlock);
export const IconUnlock = icon(GiPadlockOpen);
export const IconImage = icon(MsImage);
export const IconBack = icon(MsChevronLeft);
export const IconFolder = icon(MsFolder);
export const IconNewFolder = icon(MsCreateNewFolder);
/** Campaign backups: save one to a file, bring one in, keep one in a folder. */
export const IconExport = icon(MsDownload);
export const IconImport = icon(MsUpload);
export const IconBackupFolder = icon(MsFolderManaged);
export const IconGrid = icon(MsGridOn);
export const IconLayers = icon(MsLayers);
export const IconToFront = icon(MsFlipToFront);
export const IconToBack = icon(MsFlipToBack);
export const IconDuplicate = icon(MsContentCopy);
export const IconGive = icon(MsHandPackage);
export const IconRename = icon(MsEdit);
export const IconShortcut = icon(MsKeyboard);
export const IconFit = icon(MsFitScreen);
export const IconUndo = icon(MsUndo);
export const IconRedo = icon(MsRedo);

// Sidebar panels
export const IconChat = icon(GiTalk);
export const IconCharacters = icon(GiVisoredHelm);
export const IconPlayerCharacter = icon(GiCharacter);
export const IconLibraries = icon(GiBookshelf);
export const IconReference = icon(GiScrollUnfurled);
export const IconNotes = icon(GiOpenBook);
/** A GM-only page. */
export const IconSecret = icon(GiSecretBook);
export const IconReveal = icon(MsVisibility);
export const IconObscure = icon(MsVisibilityOff);
export const IconMembers = icon(GiThreeFriends);

// Game actions
export const IconDice = icon(GiRollingDices);
export const IconCampaign = icon(GiCrossedSwords);
export const IconCombat = icon(GiSwordClash);
export const IconItems = icon(GiAnvilImpact);
export const IconNewGear = icon(GiKnapsack);
export const IconNewMove = icon(GiSprint);
export const IconStartCombat = icon(MsPlayArrow);
export const IconEndCombat = icon(MsStop);
export const IconNextTurn = icon(MsSkipNext);
export const IconPreviousTurn = icon(MsSkipPrevious);
export const IconRelationships = icon(GiFamilyTree);
export const IconPin = icon(MsPushPin);

// Members
export const IconRemoveMember = icon(MsPersonRemove);
export const IconAllowBack = icon(MsPersonAdd);

// Interface
export const IconSettings = icon(GiCog);
export const IconHelp = icon(GiHelp);
export const IconLeave = icon(GiExitDoor);
export const IconDelete = icon(GiTrashCan);
export const IconAdd = icon(MsAdd);
export const IconRemove = icon(MsRemove);
export const IconSearch = icon(MsSearch);
export const IconClose = icon(MsClose);
export const IconMenu = icon(MsMenu);
export const IconExpand = icon(MsExpandMore);
/** Two panes side by side, and one pane at a time. */
export const IconLayoutSplit = icon(MsVerticalSplit);
export const IconLayoutSingle = icon(MsRectangle);
export const IconSidebarHide = icon(MsPanelClose);
/** Open something in its panel, or in a window of its own. */
export const IconSidebar = icon(MsDockToRight);
export const IconOpenWindow = icon(MsOpenInNew);
/** A ticked menu item. */
export const IconCheck = icon(MsCheck);
