import type { ComponentType, JSX } from 'preact'

/*
 * Every icon in the app, named for what it means rather than what it shows.
 * Game-icons.net (CC BY 3.0) comes first; Material Symbols Rounded (filled)
 * covers interface glyphs Game-icons has no good fit for. Swap an icon here
 * and it changes everywhere.
 */

// Game-icons.net
import GiArrowCursor from '~icons/game-icons/arrow-cursor'
import GiBullseye from '~icons/game-icons/bullseye'
import GiCog from '~icons/game-icons/cog'
import GiCrossedSwords from '~icons/game-icons/crossed-swords'
import GiExitDoor from '~icons/game-icons/exit-door'
import GiFog from '~icons/game-icons/fog'
import GiHand from '~icons/game-icons/hand'
import GiHelp from '~icons/game-icons/help'
import GiKnapsack from '~icons/game-icons/knapsack'
import GiMeasureTape from '~icons/game-icons/measure-tape'
import GiOpenBook from '~icons/game-icons/open-book'
import GiPadlock from "~icons/game-icons/padlock";
import GiPadlockOpen from "~icons/game-icons/padlock-open";
import GiPawn from "~icons/game-icons/pawn";
import GiQuillInk from '~icons/game-icons/quill-ink'
import GiRollingDices from '~icons/game-icons/rolling-dices'
import GiTalk from '~icons/game-icons/talk'
import GiThreeFriends from '~icons/game-icons/three-friends'
import GiTrashCan from '~icons/game-icons/trash-can'
import GiTreasureMap from "~icons/game-icons/treasure-map";
import GiVisoredHelm from '~icons/game-icons/visored-helm'

// Material Symbols Rounded (filled)
import MsSearch from '~icons/material-symbols/search-rounded'
import MsAdd from '~icons/material-symbols/add-rounded'
import MsCategory from '~icons/material-symbols/category-rounded'
import MsClose from '~icons/material-symbols/close-rounded'
import MsContentCopy from "~icons/material-symbols/content-copy-rounded";
import MsDockToRight from '~icons/material-symbols/dock-to-right-rounded'
import MsDragIndicator from '~icons/material-symbols/drag-indicator-rounded'
import MsEdit from "~icons/material-symbols/edit-rounded";
import MsExpandMore from '~icons/material-symbols/expand-more-rounded'
import MsFitScreen from "~icons/material-symbols/fit-screen-rounded";
import MsFlipToBack from "~icons/material-symbols/flip-to-back-rounded";
import MsFlipToFront from "~icons/material-symbols/flip-to-front-rounded";
import MsGridOn from "~icons/material-symbols/grid-on-rounded";
import MsChevronLeft from '~icons/material-symbols/chevron-left-rounded'
import MsFolder from '~icons/material-symbols/folder-rounded'
import MsImage from "~icons/material-symbols/image-rounded";
import MsInkEraser from "~icons/material-symbols/ink-eraser-rounded";
import MsLayers from "~icons/material-symbols/layers-rounded";
import MsLink from '~icons/material-symbols/link-rounded'
import MsPanelClose from '~icons/material-symbols/right-panel-close-rounded'
import MsPanelOpen from '~icons/material-symbols/right-panel-open-rounded'
import MsPersonAdd from '~icons/material-symbols/person-add-rounded'
import MsPersonRemove from '~icons/material-symbols/person-remove-rounded'
import MsRedo from "~icons/material-symbols/redo-rounded";
import MsTitle from '~icons/material-symbols/title-rounded'
import MsUndo from "~icons/material-symbols/undo-rounded";

export type IconProps = Omit<JSX.SVGAttributes<SVGSVGElement>, 'size'> & { size?: number }
export type Icon = ComponentType<IconProps>

function icon(Svg: ComponentType<JSX.SVGAttributes<SVGSVGElement>>): Icon {
  return ({ size = 22, ...rest }) => (
    <Svg width={size} height={size} aria-hidden="true" {...rest} />
  );
}

// Canvas tools
export const IconSelect = icon(GiArrowCursor)
export const IconPan = icon(GiHand)
export const IconDraw = icon(GiQuillInk)
export const IconEraser = icon(MsInkEraser);
export const IconShapes = icon(MsCategory)
export const IconText = icon(MsTitle)
export const IconMeasure = icon(GiMeasureTape)
export const IconPing = icon(GiBullseye)
export const IconFog = icon(GiFog)

// Scene elements and canvas actions
export const IconToken = icon(GiPawn)
export const IconMap = icon(GiTreasureMap)
export const IconLock = icon(GiPadlock)
export const IconUnlock = icon(GiPadlockOpen)
export const IconImage = icon(MsImage)
export const IconBack = icon(MsChevronLeft)
export const IconFolder = icon(MsFolder)
export const IconGrid = icon(MsGridOn)
export const IconLayers = icon(MsLayers)
export const IconToFront = icon(MsFlipToFront)
export const IconToBack = icon(MsFlipToBack)
export const IconDuplicate = icon(MsContentCopy)
export const IconRename = icon(MsEdit)
export const IconFit = icon(MsFitScreen)
export const IconUndo = icon(MsUndo)
export const IconRedo = icon(MsRedo)

// Sidebar panels
export const IconChat = icon(GiTalk)
export const IconCharacters = icon(GiVisoredHelm)
export const IconItems = icon(GiKnapsack)
export const IconNotes = icon(GiOpenBook)
export const IconMembers = icon(GiThreeFriends)

// Game actions
export const IconDice = icon(GiRollingDices)
export const IconCampaign = icon(GiCrossedSwords)

// Members
export const IconRemoveMember = icon(MsPersonRemove)
export const IconAllowBack = icon(MsPersonAdd)

// Interface
export const IconSettings = icon(GiCog)
export const IconHelp = icon(GiHelp)
export const IconLeave = icon(GiExitDoor)
export const IconDelete = icon(GiTrashCan)
export const IconAdd = icon(MsAdd)
export const IconSearch = icon(MsSearch)
export const IconClose = icon(MsClose)
export const IconExpand = icon(MsExpandMore)
export const IconLink = icon(MsLink)
export const IconDrag = icon(MsDragIndicator)
export const IconDock = icon(MsDockToRight)
export const IconSidebarHide = icon(MsPanelClose)
export const IconSidebarShow = icon(MsPanelOpen)
