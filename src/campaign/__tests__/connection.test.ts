import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { MemoryRoom } from "../../sync/__tests__/memoryRoom";
import { CampaignConnection } from "../campaignConnection";
import { device } from "../device";

const mockTrysteroTransport = vi.hoisted(() => vi.fn());

vi.mock("../../sync/trystero", () => ({
  trysteroTransport: mockTrysteroTransport,
}));

describe("CampaignConnection", () => {
  let room: MemoryRoom;

  beforeEach(() => {
    room = new MemoryRoom();
    mockTrysteroTransport.mockImplementation(() => room.join(device.value.id));
  });

  it("syncs campaign data and presence, then clears remote state on disconnect", async () => {
    device.value = { id: "alice", name: "Alice" };
    const aliceDoc = new Y.Doc({ guid: "campaign" });
    const alice = new CampaignConnection("campaign", aliceDoc);
    expect(await alice.connect("room-key", () => false)).toBe(true);

    device.value = { id: "bob", name: "Bob" };
    const bobDoc = new Y.Doc({ guid: "campaign" });
    const bob = new CampaignConnection("campaign", bobDoc);
    expect(await bob.connect("room-key", () => false)).toBe(true);
    alice.sync!.awareness.setLocalStateField("user", {
      id: "alice",
      name: "Alice",
    });
    await room.settle();

    expect(alice.peerCount.value).toBe(1);
    expect(bob.peerCount.value).toBe(1);
    expect([...alice.online.value].sort()).toEqual(["alice", "bob"]);
    expect([...bob.online.value].sort()).toEqual(["alice", "bob"]);

    aliceDoc.getMap("meta").set("name", "The Lost Barrows");
    bob.presence.setScene("scene-1");
    bob.presence.setCursor({ x: 12, y: 34 });
    await room.settle();

    expect(bobDoc.getMap("meta").get("name")).toBe("The Lost Barrows");
    expect(alice.presence.marks("scene-1", "alice", "Alice")).toContainEqual(
      expect.objectContaining({
        id: "bob",
        self: false,
        cursor: { x: 12, y: 34 },
      }),
    );

    bob.disconnect();
    await room.settle();

    expect(alice.peerCount.value).toBe(0);
    expect(
      [...alice.sync!.awareness.getStates().values()].map(
        (state) => state.user?.id,
      ),
    ).not.toContain("bob");
    device.value = { id: "alice", name: "Alice" };
    expect([...alice.online.value]).toEqual(["alice"]);
    expect(alice.presence.marks("scene-1", "alice", "Alice")).toHaveLength(1);

    alice.disconnect();
    aliceDoc.destroy();
    bobDoc.destroy();
  });
});
