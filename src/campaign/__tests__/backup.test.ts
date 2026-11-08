import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const blobs = vi.hoisted(() => new Map<string, Blob>());
vi.mock("../../platform/blobs", () => ({
  getBlob: (hash: string) => Promise.resolve(blobs.get(hash) ?? null),
  putBlob: async (blob: Blob) => {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    blobs.set(hash, blob);
    return hash;
  },
}));
// The worker's tasks, run in-process.
vi.mock("../backupWorker", async () => {
  const { runBackupTask } = await import("../backupTasks");
  return { runInBackupWorker: runBackupTask };
});

import { putBlob } from "../../platform/blobs";
import { device } from "../../platform/device";
import { SceneDoc } from "../../scene/sceneDoc";
import { createNote, listNotes, noteSubdoc } from "../../features/notes/api";
import { NoteDoc } from "../../features/notes/noteDoc";
import { backUpCampaign, importBackup } from "../backup";
import {
  backupFileName,
  BackupFileError,
  blobHashesIn,
  decodeBackup,
  encodeBackup,
} from "../backupFormat";
import { activeCampaign, Campaign, createCampaign, deleteLocalCampaign } from "../campaign";
import { campaigns, summaryOf } from "../registry";

const image = async (text: string) => {
  const hash = await putBlob(new Blob([text], { type: "image/png" }));
  return { hash, mime: "image/png", width: 10, height: 10 };
};

/** A GM's campaign with a token on its scene, a page, a GM-only page and a chat message. */
async function setUp() {
  device.value = { id: "gm", name: "Gwen" };
  const c = await Campaign.open(await createCampaign("Barrows", "Gwen"));
  const scene = await SceneDoc.open(c.sceneSubdoc(c.sceneViews()[0]!.id)!);
  const tokenImage = await image("goblin");
  scene.add({
    type: "token",
    layer: "token",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rot: 0,
    name: "Goblin",
    colour: "#000",
    image: tokenImage,
  });
  scene.destroy();
  const write = async (id: string, text: string) => {
    const page = await NoteDoc.open(noteSubdoc(c, id)!);
    const p = new Y.XmlElement("paragraph");
    p.insert(0, [new Y.XmlText(text)]);
    page.body.insert(0, [p]);
    page.destroy();
  };
  await write(createNote(c, { title: "Warren" }), "Goblins live here");
  await write(createNote(c, { title: "Secret", gmOnly: true }), "The king is a goblin");
  await c.chat.post({ kind: "system", text: "Hello", event: "join" }, { id: "gm", name: "Gwen" });
  return { c, tokenImage };
}

const pageText = async (c: Campaign, title: string) => {
  const note = listNotes(c).find((n) => n.title === title)!;
  const page = await NoteDoc.open(noteSubdoc(c, note.id)!);
  const text = page.body.toJSON();
  page.destroy();
  return text;
};

describe("campaign backups", () => {
  it("restores everything a GM had, on a device that has lost it", async () => {
    const { c, tokenImage } = await setUp();
    const id = c.id;
    const file = await backUpCampaign(id);
    c.destroy();
    await deleteLocalCampaign(id);
    blobs.clear();
    expect(summaryOf(id)).toBeUndefined();

    expect((await decodeBackup(file)).name).toBe("Barrows");
    await importBackup(file);
    expect(summaryOf(id)).toMatchObject({ name: "Barrows", role: "gm" });

    const back = await Campaign.open(id);
    const scene = await SceneDoc.open(back.sceneSubdoc(back.sceneViews()[0]!.id)!);
    expect(scene.views()).toMatchObject([{ name: "Goblin", image: tokenImage }]);
    scene.destroy();
    expect(await pageText(back, "Warren")).toContain("Goblins live here");
    expect(await pageText(back, "Secret")).toContain("The king is a goblin");
    expect(back.chat.messages.value.map((m) => m.kind === "system" && m.text)).toContain("Hello");
    expect(blobs.has(tokenImage.hash)).toBe(true);
    back.destroy();
  });

  it("makes a new device a GM when it restores a GM's backup", async () => {
    const { c } = await setUp();
    const file = await backUpCampaign(c.id);
    c.destroy();
    await deleteLocalCampaign(c.id);

    device.value = { id: "new-laptop", name: "" };
    const id = await importBackup(file);
    const back = await Campaign.open(id);
    expect(back.isGm()).toBe(true);
    expect(back.members.get("new-laptop")?.get("name")).toBe("Gwen");
    expect(back.vault.value).not.toBeNull();
    back.destroy();
  });

  it("merges into the open campaign, keeping what changed on both sides", async () => {
    const { c } = await setUp();
    activeCampaign.value = c;
    const backup = await decodeBackup(await backUpCampaign(c.id));
    // The backup gains a scene the open copy hasn't got, and the open copy one the backup hasn't.
    const elsewhere = new Y.Doc({ guid: c.id });
    const root = backup.docs.find((d) => d.kind === "campaign")!;
    Y.applyUpdate(elsewhere, root.update);
    const scene = new Y.Map<unknown>();
    scene.set("name", "From the backup");
    scene.set("order", "a5");
    elsewhere.getMap("scenes").set("restored", scene);
    root.update = Y.encodeStateAsUpdate(elsewhere);
    c.addScene("Later");

    await importBackup(await encodeBackup(backup));
    expect(c.sceneViews().map((s) => s.name)).toEqual([
      "The Opening Scene",
      "Later",
      "From the backup",
    ]);
    expect(campaigns.value.filter((s) => s.id === c.id)).toHaveLength(1);
    activeCampaign.value = null;
    c.destroy();
  });

  it("leaves the vault out of a player's backup", async () => {
    const { c } = await setUp();
    c.members.get("gm")!.set("role", "player");
    const backup = await decodeBackup(await backUpCampaign(c.id));
    expect(backup.docs.map((d) => d.kind)).not.toContain("vault");
    c.destroy();
  });

  it("refuses files that aren't backups, or that write into another campaign", async () => {
    await expect(decodeBackup(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(BackupFileError);
    const { c } = await setUp();
    const backup = await decodeBackup(await backUpCampaign(c.id));
    backup.docs[0] = { ...backup.docs[0]!, guid: "someone-else" };
    await expect(decodeBackup(await encodeBackup(backup))).rejects.toThrow("damaged");
    c.destroy();
  });

  it("finds images wherever a document mentions them", () => {
    const doc = new Y.Doc();
    const hash = "a".repeat(64);
    doc.getMap("graphics").set("x", { kind: "image", image: { hash, mime: "image/png" } });
    const p = new Y.XmlElement("image");
    p.setAttribute("hash", "b".repeat(64));
    doc.getXmlFragment("body").insert(0, [p]);
    doc.getMap("other").set("y", "not a hash");
    expect(blobHashesIn(doc)).toEqual(new Set([hash, "b".repeat(64)]));
  });

  it("names files for the campaign and the day", () => {
    expect(backupFileName("The Lost Barrows!", new Date(2026, 10, 9))).toBe(
      "the-lost-barrows-2026-11-09.makeamove",
    );
  });
});
