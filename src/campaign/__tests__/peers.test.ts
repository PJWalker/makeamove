import { afterEach, describe, expect, it } from "vite-plus/test";
import { newToken } from "../../scene/newElements";
import { SceneDoc } from "../../scene/sceneDoc";
import { PeerHarness, type Peer } from "./peerHarness";

let h: PeerHarness;
afterEach(() => h.destroy());

/** A GM's campaign with players joined. */
async function table(players: [string, string][] = [["pat", "Pat"]], seed?: number) {
  h = new PeerHarness(seed === undefined ? {} : { seed });
  const gm = await h.create("gm", "Gwen", "The Lost Barrows");
  const joined: Peer[] = [];
  for (const [id, name] of players) joined.push(await h.join(id, name));
  return { gm, players: joined };
}

const memberIds = (p: Peer) =>
  p
    .do((c) => c.memberViews())
    .map((m) => m.id)
    .sort();

/** Open a scene on a peer, as when its canvas is shown. */
async function openScene(peer: Peer, sceneId: string) {
  peer.enter();
  return SceneDoc.open(peer.campaign.sceneSubdoc(sceneId)!);
}

const token = (scene: SceneDoc, name: string, x: number) =>
  newToken(scene.grid(), { x, y: 0 }, { name, colour: "#c8553d", style: "disc" });

describe("peers sharing a campaign", () => {
  it("brings joiners up to date and lists them as members", async () => {
    const { gm, players } = await table([
      ["pat", "Pat"],
      ["sam", "Sam"],
    ]);
    const state = h.expectConverged();
    expect(state.meta).toMatchObject({ name: "The Lost Barrows" });
    for (const p of [gm, ...players]) expect(memberIds(p)).toEqual(["gm", "pat", "sam"]);
    expect([...gm.campaign.online.value].sort()).toEqual(["gm", "pat", "sam"]);
    expect(players[0]!.do((c) => c.isGm())).toBe(false);
  });

  it("keeps each peer's storage to itself", async () => {
    h = new PeerHarness();
    const gm = await h.create("gm", "Gwen", "The Lost Barrows");
    gm.disconnect();
    const pat = await h.join("pat", "Pat");
    expect(pat.campaign.ready.value).toBe(false);
    expect(pat.state().meta).toEqual({});
  });

  it("merges concurrent edits from every peer", async () => {
    const { gm, players } = await table([
      ["pat", "Pat"],
      ["sam", "Sam"],
    ]);
    const [pat, sam] = players as [Peer, Peer];
    const bog = gm.do((c) => c.addScene("The Bog"));
    gm.do((c) => c.rename("The Barrows Below"));
    pat.do((c) => c.setActiveScene(bog));
    sam.do((c) => c.ensureMember("Samwise"));
    await h.settle();

    const state = h.expectConverged();
    expect(state.meta).toMatchObject({ name: "The Barrows Below" });
    expect(sam.do((c) => c.sceneViews()).map((s) => s.name)).toContain("The Bog");
    expect(gm.do((c) => c.memberViews())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "pat", activeSceneId: bog }),
        expect.objectContaining({ id: "sam", name: "Samwise" }),
      ]),
    );
  });

  it("merges edits made offline once the peer reconnects", async () => {
    const { gm, players } = await table();
    const pat = players[0]!;
    pat.disconnect();
    gm.do((c) => c.addScene("The Keep"));
    pat.do((c) => c.ensureMember("Patricia"));
    await h.settle();
    expect(pat.do((c) => c.sceneViews()).map((s) => s.name)).not.toContain("The Keep");

    await pat.connect();
    await h.settle();
    h.expectConverged();
    expect(gm.do((c) => c.memberViews()).find((m) => m.id === "pat")?.name).toBe("Patricia");
  });

  it("keeps what a peer learned across a restart", async () => {
    const { gm, players } = await table();
    const pat = players[0]!;
    gm.do((c) => c.addScene("The Keep"));
    await h.settle();
    gm.disconnect();
    await pat.restart();
    await h.settle();
    expect(pat.do((c) => c.sceneViews()).map((s) => s.name)).toContain("The Keep");
  });

  it("syncs a scene's contents between the peers that have it open", async () => {
    const { gm, players } = await table([
      ["pat", "Pat"],
      ["sam", "Sam"],
    ]);
    const [pat, sam] = players as [Peer, Peer];
    const sceneId = gm.do((c) => c.activeSceneId())!;
    const gmScene = await openScene(gm, sceneId);
    const patScene = await openScene(pat, sceneId);
    await h.settle();

    gm.do(() => gmScene.add(token(gmScene, "Ogre", 0)));
    pat.do(() => patScene.add(token(patScene, "Pat's fighter", 140)));
    await h.settle();
    h.expectConverged();
    expect(patScene.views().map((e) => e.type === "token" && e.name)).toEqual(
      expect.arrayContaining(["Ogre", "Pat's fighter"]),
    );
    // Sam hasn't opened the scene, so holds none of it yet.
    expect(sam.openSubdocs().has(gmScene.doc.guid)).toBe(false);

    const samScene = await openScene(sam, sceneId);
    await h.settle();
    h.expectConverged();
    expect(samScene.views()).toHaveLength(2);
  });

  it.each([1, 2, 3, 4, 5])(
    "converges whatever order messages arrive in (seed %i)",
    async (seed) => {
      const { gm, players } = await table(
        [
          ["pat", "Pat"],
          ["sam", "Sam"],
          ["kit", "Kit"],
        ],
        seed,
      );
      const sceneId = gm.do((c) => c.activeSceneId())!;
      const scenes = await Promise.all(
        [gm, ...players].map(async (p) => [p, await openScene(p, sceneId)] as const),
      );
      await h.settle();

      for (const [i, [peer, scene]] of scenes.entries()) {
        peer.do(() => scene.add(token(scene, `${peer.id} token`, i * 70)));
        peer.do((c) => c.addScene(`${peer.id}'s scene`));
        // Let some messages through between edits, so they interleave.
        h.step();
      }
      const [first] = scenes[0]![1].views();
      for (const [peer, scene] of scenes) peer.do(() => scene.update([[first!.id, { x: 700 }]]));
      await h.settle();

      h.expectConverged();
      expect(scenes[0]![1].views()).toHaveLength(4);
      expect(gm.do((c) => c.sceneViews())).toHaveLength(5);
    },
  );
});
