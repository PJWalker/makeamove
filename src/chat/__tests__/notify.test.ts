import { describe as suite, expect, it, vi } from 'vitest'

vi.mock('../../table/panelLayout', () => ({ panelVisible: () => true }))
vi.mock('../../store/campaign', () => ({ activeCampaign: { value: null } }))

const { describe } = await import('../notify')

const base = { id: '1', hlc: 'x', author: 'a', name: 'Ana' }

suite('notification text', () => {
  it('shows text, emotes and whispers', () => {
    expect(describe({ ...base, kind: 'text', text: 'hi' })).toEqual({ title: 'Ana', body: 'hi' })
    expect(describe({ ...base, kind: 'text', text: 'waves', emote: true })?.body).toBe('Ana waves')
    expect(describe({ ...base, kind: 'text', text: 'psst', to: ['b'] })?.title).toBe('Ana (whisper)')
  })
  it('shows roll totals and skips system messages', () => {
    const roll = { formula: '2d6+1', terms: [], total: 9 }
    expect(describe({ ...base, kind: 'roll', roll, visibility: 'public', comment: 'STR' })?.body).toBe('STR: 2d6+1 = 9')
    expect(describe({ ...base, kind: 'system', text: 'Ana joined' })).toBeNull()
  })
})
