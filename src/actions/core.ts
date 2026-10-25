import { postRoll } from '../chat/send'
import type { Campaign } from '../store/campaign'
import { activeTool } from '../scene/tools'
import { canvasCommands, chromeHidden, dialogRequest } from '../table/canvasState'
import { PANEL_ORDER, showPanel } from '../table/panelLayout'
import { PANELS } from '../table/panels'
import { TOOLS } from '../table/Toolbar'
import {
  IconAdd,
  IconDice,
  IconFit,
  IconHelp,
  IconMap,
  IconMembers,
  IconRedo,
  IconSettings,
  IconSidebarHide,
  IconUndo,
} from '../ui/icons'
import { MOD } from '../ui/keys'
import type { Action } from './types'

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd%', '2d6', '2d20kh1', '2d20kl1']

/** Tools, commands, settings, panels, scenes and dice: what every campaign has. */
export function coreActions(campaign: Campaign): Action[] {
  const isGm = campaign.isGm()
  const out: Action[] = []

  for (const t of TOOLS) {
    if (t.gmOnly && !isGm) continue
    out.push({
      id: `tool:${t.id}`,
      kind: 'tool',
      title: t.label,
      source: 'Core',
      hint: t.key,
      icon: t.Icon,
      available: t.arrives ? `Arrives in ${t.arrives}` : true,
      run: () => (activeTool.value = t.id),
    })
  }

  const canvas = canvasCommands.value
  const needCanvas = canvas ? true : ('Open a scene first' as const)
  out.push(
    {
      id: 'cmd:fit',
      kind: 'command',
      title: 'Fit to scene',
      aliases: ['zoom to fit', 'reset view'],
      source: 'Core',
      hint: '⇧1',
      icon: IconFit,
      available: needCanvas,
      run: () => canvas?.fit(),
    },
    {
      id: 'cmd:undo',
      kind: 'command',
      title: 'Undo',
      source: 'Core',
      hint: `${MOD}Z`,
      icon: IconUndo,
      available: needCanvas,
      run: () => canvas?.undo(),
    },
    {
      id: 'cmd:redo',
      kind: 'command',
      title: 'Redo',
      source: 'Core',
      hint: `⇧${MOD}Z`,
      icon: IconRedo,
      available: needCanvas,
      run: () => canvas?.redo(),
    },
    {
      id: 'cmd:chrome',
      kind: 'command',
      title: 'Hide or show the interface',
      aliases: ['toggle chrome', 'toggle ui'],
      source: 'Core',
      hint: `${MOD}\\`,
      icon: IconSidebarHide,
      available: true,
      run: () => (chromeHidden.value = !chromeHidden.value),
    },
  )

  if (isGm) {
    out.push({
      id: 'cmd:new-scene',
      kind: 'command',
      title: 'New scene',
      source: 'Core',
      icon: IconAdd,
      available: true,
      run: () => campaign.setActiveScene(campaign.addScene(`Scene ${campaign.sceneViews().length + 1}`)),
    })
  }

  out.push(
    { id: 'setting:player', kind: 'setting', title: 'Player settings', aliases: ['name', 'colour'], source: 'Core', icon: IconMembers, available: true, run: () => (dialogRequest.value = 'player') },
    { id: 'setting:help', kind: 'setting', title: 'Help and shortcuts', source: 'Core', icon: IconHelp, available: true, run: () => (dialogRequest.value = 'help') },
  )
  if (isGm) {
    out.push({
      id: 'setting:campaign',
      kind: 'setting',
      title: 'Campaign settings',
      aliases: ['invite link'],
      source: 'Core',
      icon: IconSettings,
      available: true,
      run: () => (dialogRequest.value = 'settings'),
    })
  }

  for (const id of PANEL_ORDER) {
    const { label, Icon } = PANELS[id]
    out.push({
      id: `panel:${id}`,
      kind: 'command',
      title: `Show ${label}`,
      aliases: [label],
      source: 'Core',
      icon: Icon,
      available: true,
      run: () => showPanel(id),
    })
  }

  const active = campaign.activeSceneId()
  for (const s of campaign.sceneViews()) {
    if (s.visibility !== 'everyone' && !isGm) continue
    out.push({
      id: `scene:${s.id}`,
      kind: 'entry',
      group: 'scene',
      title: s.name,
      detail: s.id === active ? 'Current scene' : 'Go to scene',
      source: 'Scenes',
      icon: IconMap,
      available: true,
      run: () => campaign.setActiveScene(s.id),
    })
  }

  for (const f of DICE) {
    out.push({
      id: `roll:${f}`,
      kind: 'command',
      title: `Roll ${f}`,
      aliases: [f, 'dice'],
      source: 'Core',
      icon: IconDice,
      available: true,
      run: () => postRoll(campaign, f, 'public'),
    })
  }

  return out
}
