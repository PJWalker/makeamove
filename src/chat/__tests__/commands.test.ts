import { describe, expect, it } from 'vitest'
import {
  diceFormula,
  parseCommand,
  parseDuration,
  splitFormula,
  suggest,
} from "../commands";

const members = [
  { id: 'g', name: 'Gwen', role: 'gm' },
  { id: 'r', name: 'Robin', role: 'player' },
  { id: 'rh', name: 'Robin Hood', role: 'player' },
]

describe('commands', () => {
  it('sends plain text, and // escapes a slash', () => {
    expect(parseCommand(' hello ', members, false)).toEqual({ kind: 'text', text: 'hello' })
    expect(parseCommand('//shrug', members, false)).toEqual({ kind: 'text', text: '/shrug' })
  })
  it('rolls a bare formula without /r, but leaves ordinary text alone', () => {
    expect(parseCommand(' 2d6+1 ', members, false)).toEqual({ kind: 'roll', formula: '2d6+1', visibility: 'public' })
    expect(parseCommand('4d6kh3 + 1d8[STR]', members, false)).toMatchObject({ kind: 'roll', formula: '4d6kh3 + 1d8[STR]' })
    for (const text of ['3', '2 + 2', 'd20 time', 'dd', 'D&D tonight?', 'roll 2d6']) {
      expect(parseCommand(text, members, false)).toEqual({ kind: 'text', text })
    }
    expect(diceFormula('d%')).toBe('d%')
    expect(diceFormula('5')).toBeNull()
  })
  it('rolls with a comment, and picks visibility from the command', () => {
    expect(parseCommand('/r 2d6 + 1 hack and slash', members, false)).toEqual({
      kind: 'roll',
      formula: '2d6 + 1',
      comment: 'hack and slash',
      visibility: 'public',
    })
    expect(parseCommand('/sr d20', members, false)).toMatchObject({ visibility: 'private' })
    expect(parseCommand('/gm d20', members, false)).toMatchObject({ kind: 'error' })
  })
  it('keeps labels with spaces in the formula', () => {
    expect(splitFormula('1d4+1[Ring of Strength] for the door')).toEqual({
      formula: '1d4+1[Ring of Strength]',
      comment: 'for the door',
    })
  })
  it('explains bad rolls', () => {
    expect(parseCommand('/r', members, false)).toMatchObject({ kind: 'error' })
    expect(parseCommand('/r banana', members, false)).toMatchObject({ kind: 'error' })
  })
  it('whispers to the longest matching name, or to the GM', () => {
    expect(parseCommand('/w robin hood psst', members, false)).toMatchObject({ kind: 'whisper', to: [{ id: 'rh' }], text: 'psst' })
    expect(parseCommand('/w Robin psst', members, false)).toMatchObject({ to: [{ id: 'r' }] })
    expect(parseCommand('/w gm I steal it', members, false)).toMatchObject({ to: [{ id: 'g' }], text: 'I steal it' })
    expect(parseCommand('/w Nobody hi', members, false)).toMatchObject({ kind: 'error' })
    expect(parseCommand('/w Robin', members, false)).toMatchObject({ kind: 'error' })
  })
  it('keeps GM commands from players', () => {
    expect(parseCommand('/session start', members, true)).toEqual({ kind: 'session', action: 'start' })
    expect(parseCommand('/session start', members, false)).toMatchObject({ kind: 'error' })
    expect(suggest('/se', false)).toEqual([])
    expect(suggest('/se', true).map((c) => c.names[0])).toEqual(['session'])
  })
  it('does emotes and help', () => {
    expect(parseCommand('/me waves', members, false)).toEqual({ kind: 'emote', text: 'waves' })
    expect(parseCommand('/help', members, false)).toEqual({ kind: 'help' })
    expect(parseCommand('/nope', members, false)).toMatchObject({ kind: 'error' })
  })
})

describe("chat commands", () => {
  it("reads /pin, /timer, /count and /clock", () => {
    expect(parseCommand("/pin Meet at the inn", [], false)).toEqual({
      kind: "pin",
      text: "Meet at the inn",
    });
    expect(parseCommand('/timer 60s "World Ends"', [], false)).toEqual({
      kind: "timer",
      seconds: 60,
      label: "World Ends",
    });
    expect(parseCommand("/timer 1h30m Siege", [], false)).toEqual({
      kind: "timer",
      seconds: 5400,
      label: "Siege",
    });
    expect(parseCommand("/timer 2:30", [], false)).toEqual({
      kind: "timer",
      seconds: 150,
      label: "",
    });
    expect(parseCommand("/timer soon", [], false).kind).toBe("error");
    expect(parseCommand('/count 0/8 "The cops arrive"', [], false)).toEqual({
      kind: "counter",
      start: 0,
      max: 8,
      label: "The cops arrive",
    });
    expect(parseCommand("/count 3 Torches", [], false)).toEqual({
      kind: "counter",
      start: 3,
      label: "Torches",
    });
    expect(parseCommand("/count lots", [], false).kind).toBe("error");
    expect(parseCommand("/clock 8 The alarm sounds", [], false)).toEqual({
      kind: "counter",
      start: 0,
      max: 8,
      label: "The alarm sounds",
    });
    expect(parseCommand("/clock zero Alarm", [], false).kind).toBe("error");
  });

  it("reads durations", () => {
    expect([
      parseDuration("90"),
      parseDuration("5m"),
      parseDuration("1h"),
      parseDuration("1:00:05"),
      parseDuration("x"),
    ]).toEqual([90, 300, 3600, 3605, null]);
  });
});
