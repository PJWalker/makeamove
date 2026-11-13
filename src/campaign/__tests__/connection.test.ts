import { beforeEach, describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { store } from "../../lib/store";
import type { Device } from "../../platform/device";
import { MemoryNetwork } from "../../sync/__tests__/memoryRoom";
import { CampaignConnection } from "../connection";

describe("CampaignConnection", () => {
  let network: MemoryNetwork;
  const connection = (doc: Y.Doc, self: Device) =>
    new CampaignConnection("campaign", doc, store(self), network.joinAs(self.id));
  const settle = () => network.room("campaign", "room-key").settle();

  beforeEach(() => {
    network = new MemoryNetwork();
  });

  it("syncs campaign data and presence, then clears remote state on disconnect", async () => {
    const aliceDoc = new Y.Doc({ guid: "campaign" });
    const alice = connection(aliceDoc, { id: "alice", name: "Alice" });
    expect(await alice.connect("room-key", () => false)).toBe(true);

    const bobDoc = new Y.Doc({ guid: "campaign" });
    const bob = connection(bobDoc, { id: "bob", name: "Bob" });
    expect(await bob.connect("room-key", () => false)).toBe(true);
    alice.sync!.awareness.setLocalStateField("user", {
      id: "alice",
      name: "Alice",
    });
    await settle();

    expect(alice.peerCount.value).toBe(1);
    expect(bob.peerCount.value).toBe(1);
    expect([...alice.online.value].sort()).toEqual(["alice", "bob"]);
    expect([...bob.online.value].sort()).toEqual(["alice", "bob"]);

    aliceDoc.getMap("meta").set("name", "The Lost Barrows");
    bob.presence.setScene("scene-1");
    bob.presence.setCursor({ x: 12, y: 34 });
    await settle();

    expect(bobDoc.getMap("meta").get("name")).toBe("The Lost Barrows");
    expect(alice.presence.marks("scene-1", "alice", "Alice")).toContainEqual(
      expect.objectContaining({
        id: "bob",
        self: false,
        cursor: { x: 12, y: 34 },
      }),
    );

    bob.disconnect();
    await settle();

    expect(alice.peerCount.value).toBe(0);
    expect(
      [...alice.sync!.awareness.getStates().values()].map(
        (state) => (state.user as { id?: string } | undefined)?.id,
      ),
    ).not.toContain("bob");
    expect([...alice.online.value]).toEqual(["alice"]);
    expect(alice.presence.marks("scene-1", "alice", "Alice")).toHaveLength(1);

    alice.disconnect();
    aliceDoc.destroy();
    bobDoc.destroy();
  });
});
