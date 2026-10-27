import { describe as suite, expect, it, vi } from 'vitest'

vi.mock('../../table/panelLayout', () => ({ panelVisible: () => true }))
vi.mock('../../store/campaign', () => ({ activeCampaign: { value: null } }))

const { delivery, describe } = await import('../notify')

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

suite('how a message is delivered', () => {
  const o = { chatShowing: false, pageHidden: false, mine: false, canNotify: true }
  it('pops up in a visible page, focused or not, without a notification', () => {
    expect(delivery(o)).toEqual({ popup: true, notify: false })
  })
  it('pops up and notifies when the page is hidden', () => {
    expect(delivery({ ...o, pageHidden: true })).toEqual({ popup: true, notify: true })
  })
  it('never notifies for my own messages, or without permission', () => {
    expect(delivery({ ...o, pageHidden: true, mine: true })).toEqual({ popup: true, notify: false })
    expect(delivery({ ...o, pageHidden: true, canNotify: false }).notify).toBe(false)
  })
  it('skips the popup while the Chat panel shows, but notifies if the page is hidden', () => {
    expect(delivery({ ...o, chatShowing: true })).toEqual({ popup: false, notify: false })
    expect(delivery({ ...o, chatShowing: true, pageHidden: true })).toEqual({ popup: false, notify: true })
  })
})
