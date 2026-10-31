import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Campaign, createCampaign } from '../campaign'
import { device } from '../device'

const as = (id: string, name: string) => (device.value = { id, name })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
Campaign.sceneNoticeDelay = 30

async function setUp() {
  as('gm', 'Gwen')
  const c = await Campaign.open(await createCampaign('The Lost Barrows', 'Gwen'))
  const pat = new Y.Map<any>()
  pat.set('name', 'Pat')
  pat.set('role', 'player')
  c.members.set('pat', pat)
  const bog = c.addScene('The Bog')
  const keep = c.addScene('The Keep')
  return { c, bog, keep, first: c.sceneViews()[0].id }
}

const notices = (c: Campaign) =>
  c.chat.messages.value.filter((m) => m.kind === 'system' && m.event === 'scene-change').map((m) => m.kind === 'system' && m.text)

describe('scene change notices', () => {
  it('announces where the GM settles, once', async () => {
    const { c, bog } = await setUp()
    c.setActiveScene(bog)
    await sleep(80)
    expect(notices(c)).toEqual(['Scene changed to The Bog'])
    expect(c.chat.messages.value.at(-1)).toMatchObject({ sceneId: bog })
    c.destroy()
  })
  it('skips scenes the GM only passes through, and the one already announced', async () => {
    const { c, bog, keep, first } = await setUp()
    c.setActiveScene(bog)
    c.setActiveScene(keep)
    await sleep(80)
    c.setActiveScene(first)
    c.setActiveScene(keep)
    await sleep(80)
    expect(notices(c)).toEqual(['Scene changed to The Keep'])
    c.destroy()
  })
  it('does not announce the first scene of a new campaign, or players moving', async () => {
    const { c, bog } = await setUp()
    await sleep(80)
    expect(notices(c)).toEqual([])
    as('pat', 'Pat')
    c.setActiveScene(bog)
    await sleep(80)
    expect(notices(c)).toEqual([])
    c.destroy()
  })
  it("pulls players into a scene and announces immediately, even when it was already announced", async () => {
    const { c, bog, keep } = await setUp();
    c.setActiveScene(bog);
    await sleep(80);

    c.pullPlayersToScene(keep);
    await sleep(80);

    expect(c.members.get("gm")?.get("activeSceneId")).toBe(keep);
    expect(c.members.get("pat")?.get("activeSceneId")).toBe(keep);
    expect(c.meta.get("tableScene")).toBe(keep);
    expect(notices(c)).toEqual([
      "Scene changed to The Bog",
      "Scene changed to The Keep",
    ]);
    c.destroy();
  });
})
