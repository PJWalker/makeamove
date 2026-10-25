import { describe, expect, it } from 'vitest'
import { roll } from '../../dice/notation'
import { visibilityOf, type ChatMessage, type RollVisibility } from '../types'

const base = { id: 'm', hlc: '0', author: 'pat', name: 'Pat' }
const rollBy = (visibility: RollVisibility): ChatMessage => ({ ...base, kind: 'roll', roll: roll('d6', () => 3), visibility })
const whisper: ChatMessage = { ...base, kind: 'text', text: 'psst', to: ['kim'], toNames: ['Kim'] }

describe('who sees what', () => {
  it('shows public rolls to everyone', () => {
    expect(visibilityOf(rollBy('public'), 'lee', false)).toBe('full')
  })
  it("shows secret rolls to the roller and the GM, masked for others (so a GM secret roll is the GM's alone)", () => {
    expect(visibilityOf(rollBy('private'), 'pat', false)).toBe('full')
    expect(visibilityOf(rollBy('private'), 'gm', true)).toBe('full')
    expect(visibilityOf(rollBy('private'), 'lee', false)).toBe('masked')
    const gmRoll = { ...rollBy('private'), author: 'gm' }
    expect(visibilityOf(gmRoll, 'pat', false)).toBe('masked')
  })
  it('hides whispers from everyone but the sender and recipients', () => {
    expect(visibilityOf(whisper, 'pat', false)).toBe('full')
    expect(visibilityOf(whisper, 'kim', false)).toBe('full')
    expect(visibilityOf(whisper, 'lee', false)).toBe('hidden')
    expect(visibilityOf(whisper, 'gm', true)).toBe('hidden')
  })
})
