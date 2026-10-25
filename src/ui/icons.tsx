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
import GiQuillInk from '~icons/game-icons/quill-ink'
import GiRollingDices from '~icons/game-icons/rolling-dices'
import GiTalk from '~icons/game-icons/talk'
import GiThreeFriends from '~icons/game-icons/three-friends'
import GiTrashCan from '~icons/game-icons/trash-can'
import GiVisoredHelm from '~icons/game-icons/visored-helm'

// Material Symbols Rounded (filled)
import MsAdd from '~icons/material-symbols/add-rounded'
import MsCategory from '~icons/material-symbols/category-rounded'
import MsClose from '~icons/material-symbols/close-rounded'
import MsDockToRight from '~icons/material-symbols/dock-to-right-rounded'
import MsDragIndicator from '~icons/material-symbols/drag-indicator-rounded'
import MsExpandMore from '~icons/material-symbols/expand-more-rounded'
import MsLink from '~icons/material-symbols/link-rounded'
import MsPanelClose from '~icons/material-symbols/right-panel-close-rounded'
import MsPanelOpen from '~icons/material-symbols/right-panel-open-rounded'
import MsTitle from '~icons/material-symbols/title-rounded'

export type IconProps = Omit<JSX.SVGAttributes<SVGSVGElement>, 'size'> & { size?: number }
export type Icon = ComponentType<IconProps>

function icon(Svg: ComponentType<JSX.SVGAttributes<SVGSVGElement>>): Icon {
  return ({ size = 18, ...rest }) => <Svg width={size} height={size} aria-hidden="true" {...rest} />
}

// Canvas tools
export const IconSelect = icon(GiArrowCursor)
export const IconPan = icon(GiHand)
export const IconDraw = icon(GiQuillInk)
export const IconShapes = icon(MsCategory)
export const IconText = icon(MsTitle)
export const IconMeasure = icon(GiMeasureTape)
export const IconPing = icon(GiBullseye)
export const IconFog = icon(GiFog)

// Sidebar panels
export const IconChat = icon(GiTalk)
export const IconCharacters = icon(GiVisoredHelm)
export const IconItems = icon(GiKnapsack)
export const IconNotes = icon(GiOpenBook)
export const IconMembers = icon(GiThreeFriends)

// Game actions
export const IconDice = icon(GiRollingDices)
export const IconCampaign = icon(GiCrossedSwords)

// Interface
export const IconSettings = icon(GiCog)
export const IconHelp = icon(GiHelp)
export const IconLeave = icon(GiExitDoor)
export const IconDelete = icon(GiTrashCan)
export const IconAdd = icon(MsAdd)
export const IconClose = icon(MsClose)
export const IconExpand = icon(MsExpandMore)
export const IconLink = icon(MsLink)
export const IconDrag = icon(MsDragIndicator)
export const IconDock = icon(MsDockToRight)
export const IconSidebarHide = icon(MsPanelClose)
export const IconSidebarShow = icon(MsPanelOpen)
