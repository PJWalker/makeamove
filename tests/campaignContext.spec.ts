import { expect, test } from "vite-plus/test";
import {
  createCampaign,
  deleteLocalCampaign,
  openCampaign,
  openCampaigns,
  type Campaign,
} from "../src/campaign/campaign";
import { campaignUiDbName } from "../src/campaign/storage";
import { store } from "../src/lib/store";
import type { Device } from "../src/platform/device";
import { MemoryNetwork } from "../src/sync/__tests__/memoryRoom";
import { CampaignContext } from "../src/workspace/campaignContext";

/*
 * Two campaigns open in one page, as a context each: nothing one does shows
 * in the other, and disposing one closes everything it opened while the
 * other carries on.
 */

const network = new MemoryNetwork();
const host = (id: string) => ({
  device: store<Device>({ id, name: id }),
  joinRoom: network.joinAs(id),
});

async function open(id: string, as: string) {
  return CampaignContext.open(await openCampaign(id, host(as)));
}

const isOpen = (c: Campaign) => openCampaigns.has(c);

test("two campaigns open side by side and close independently", async () => {
  const first = await createCampaign("The Lost Barrows", "Gwen");
  const second = await createCampaign("The Sunken Keep", "Gwen");
  const a = await open(first, "gm");
  const b = await open(second, "gm");
  expect(a.campaign.name).toBe("The Lost Barrows");
  expect(b.campaign.name).toBe("The Sunken Keep");
  await expect.poll(() => a.campaign.sync !== null && b.campaign.sync !== null).toBe(true);

  // Each campaign's table state is its own.
  a.tools.activeTool.value = "draw";
  a.tools.setPen({ colour: "#ff0000" });
  a.panels.setPanelClosed("members", true);
  a.recent.note("tool:draw");
  a.links.openNote("page");
  expect(b.tools.activeTool.value).toBe("select");
  expect(b.tools.pen.value.colour).not.toBe("#ff0000");
  expect(b.panels.isClosed("members")).toBe(false);
  expect(b.recent.ids.value).toEqual([]);
  expect(b.links.openNoteId.value).toBeNull();

  // Disposing one closes its documents and leaves its room; the other is untouched.
  a.dispose();
  expect(a.disposed).toBe(true);
  expect(isOpen(a.campaign)).toBe(false);
  expect(a.campaign.sync).toBeNull();
  expect(a.campaign.doc.isDestroyed).toBe(true);
  expect(a.local.doc.isDestroyed).toBe(true);
  expect(isOpen(b.campaign)).toBe(true);
  expect(b.campaign.sync).not.toBeNull();
  b.campaign.addScene("The Undercroft");
  expect(b.campaign.sceneViews().map((s) => s.name)).toContain("The Undercroft");
  // Disposing twice does nothing more.
  a.dispose();

  // What this device keeps for a campaign comes back when it reopens; the session's state doesn't.
  const again = await open(first, "gm");
  expect(again.tools.pen.value.colour).toBe("#ff0000");
  expect(again.panels.isClosed("members")).toBe(true);
  expect(again.recent.ids.value).toEqual(["tool:draw"]);
  expect(again.tools.activeTool.value).toBe("select");
  expect(again.links.openNoteId.value).toBeNull();

  again.dispose();
  b.dispose();
  expect(openCampaigns.size).toBe(0);
  await deleteLocalCampaign(first);
  await deleteLocalCampaign(second);
});

test("deleting a campaign forgets this device's UI state for it", async () => {
  const id = await createCampaign("The Lost Barrows", "Gwen");
  const a = await open(id, "gm");
  a.tools.setPen({ colour: "#00ff00" });
  a.dispose();
  const stored = async () =>
    (await indexedDB.databases()).some((d) => d.name === campaignUiDbName(id));
  expect(await stored()).toBe(true);
  await deleteLocalCampaign(id);
  await expect.poll(stored).toBe(false);
});
