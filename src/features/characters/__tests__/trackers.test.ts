import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { Campaign, createCampaign } from '../../../campaign/campaign'
import { device } from '../../../platform/device'
import { dungeonWorld2 } from '../../../systems/dungeon-world-2'
import { getCharacter, newCharacter, setData } from '../api'
import { findTracker, parseTrackerButton, plainText, pressTracker, trackerBlock, trackerToken } from '../trackers'

describe('inline resource buttons', () => {
  it('parses [[±N name]] with an optional label, and writes it back', () => {
    expect(parseTrackerButton('[[+1 XP]]')).toEqual({ by: 1, name: 'XP', label: '+1 XP' })
    const spend = parseTrackerButton('[[-2 Treasure|Spend 2 Treasure]]')!
    expect(spend).toEqual({ by: -2, name: 'Treasure', label: 'Spend 2 Treasure' })
    expect(trackerToken(spend)).toBe('[[-2 Treasure|Spend 2 Treasure]]')
    expect(parseTrackerButton('[[XP]]')).toBeNull()
  })

  it('shows buttons as their labels in plain text', () => {
    expect(plainText('**On a 6-,** [[+1 XP|mark 1 XP]] and *then*')).toBe('On a 6-, mark 1 XP and then')
  })

  it("finds a system's numbers by name or alias", () => {
    expect(findTracker(dungeonWorld2, 'treasure boxes')?.data).toBe('treasureBoxes')
    expect(findTracker(dungeonWorld2, 'hp')?.resource).toBe('hp')
    expect(findTracker(dungeonWorld2, 'gold')).toBeUndefined()
  })

  it('adds and spends within bounds', async () => {
    device.value = { id: 'gm', name: 'Gwen' }
    const campaign = await Campaign.open(await createCampaign('Buttons', 'Gwen', 'dungeon-world-2'))
    const id = newCharacter(campaign, 'Ayla', 'barbarian')
    setData(campaign, id, 'treasureBoxes', 1)
    setData(campaign, id, 'xp', 4)
    const spend = { by: -1, name: 'Treasure', label: 'Spend 1 Treasure' }
    expect(pressTracker(campaign, id, spend)).toBe(true)
    expect(getCharacter(campaign, id)?.data.treasureBoxes).toBe(0)
    expect(trackerBlock(campaign, id, spend)).toContain('only 0')
    expect(pressTracker(campaign, id, spend)).toBe(false)
    const xp = { by: 1, name: 'XP', label: '+1 XP' }
    expect(pressTracker(campaign, id, xp)).toBe(true)
    expect(trackerBlock(campaign, id, xp)).toContain('full')
    expect(trackerBlock(campaign, null, xp)).toBe('Choose a character first')
  })
})
