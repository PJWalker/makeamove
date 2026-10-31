import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Campaign, createCampaign } from '../campaign'
import { device } from '../device'

const as = (id: string, name: string) => (device.value = { id, name })

/** A campaign run by `gm`, with `pat` joined as a player. */
async function setUp() {
  as('gm', 'Gwen')
  const id = await createCampaign('The Lost Barrows', 'Gwen')
  const c = await Campaign.open(id)
  const pat = new Y.Map<any>()
  pat.set('name', 'Pat')
  pat.set('role', 'player')
  c.members.set('pat', pat)
  return c
}

describe('revoking a player', () => {
  it('moves them from the member list to the removed list', async () => {
    const c = await setUp()
    c.revokeMember('pat')
    expect(c.memberViews().map((m) => m.id)).toEqual(['gm'])
    expect(c.revokedViews()).toMatchObject([{ id: 'pat', name: 'Pat' }])
    c.destroy()
  })

  it('is GM-only, and the GM cannot remove themselves', async () => {
    const c = await setUp()
    c.revokeMember('gm')
    as('pat', 'Pat')
    c.revokeMember('gm')
    expect(c.memberViews()).toHaveLength(2)
    expect(c.revokedViews()).toEqual([])
    c.destroy()
  })

  it("keeps the removed player's device from adding itself back", async () => {
    const gm = await setUp()
    gm.revokeMember('pat')
    const id = gm.id
    gm.destroy()

    as('pat', 'Pat')
    const theirs = await Campaign.open(id)
    expect(theirs.memberViews().map((member) => member.id)).not.toContain(
      "pat",
    );
    expect(theirs.revokedViews()).toMatchObject([{ id: "pat", name: "Pat" }]);

    // Let back in: the device notices and rejoins the member list.
    as('gm', 'Gwen')
    theirs.allowBack('pat')
    as('pat', 'Pat')
    theirs.meta.set('touched', 1)
    expect(theirs.memberViews().map((member) => member.id)).toContain("pat");
    expect(theirs.revokedViews()).toEqual([]);
    theirs.destroy()
  })
})
