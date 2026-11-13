import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  blobs: new Map<string, Blob>(),
  values: new Map<string, unknown>(),
  picked: null as object | null,
}));
vi.mock("../../platform/blobs", () => ({
  getBlob: (hash: string) => Promise.resolve(mocks.blobs.get(hash) ?? null),
  putBlob: async (blob: Blob) => {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    mocks.blobs.set(hash, blob);
    return hash;
  },
}));
// The worker's tasks, run in-process.
vi.mock("../backupWorker", async () => {
  const { runBackupTask } = await import("../backupTasks");
  return { runInBackupWorker: runBackupTask };
});
// Folder handles are stored by structured clone, which a fake can't survive.
vi.mock("../../platform/keyval", () => ({
  readValue: (key: string) => Promise.resolve(mocks.values.get(key)),
  writeValue: (key: string, value: unknown) => Promise.resolve(void mocks.values.set(key, value)),
  deleteValue: (key: string) => Promise.resolve(void mocks.values.delete(key)),
}));
vi.mock("../../platform/files", async (original) => ({
  ...(await original<typeof import("../../platform/files")>()),
  pickFolder: () => Promise.resolve(mocks.picked),
}));

import { putBlob } from "../../platform/blobs";
import { device } from "../../platform/device";
import { SceneDoc } from "../../scene/sceneDoc";
import { decodeBackup } from "../backupFormat";
import { Campaign, createCampaign, deleteLocalCampaign } from "../campaign";
import { FolderBackup, folderSaveDelay, importFromFolder } from "../folderBackup";
import { summaryOf } from "../registry";

/** A folder in memory, shaped like the File System API's. */
class FakeFolder {
  readonly kind = "directory";
  files = new Map<string, Blob>();
  folders = new Map<string, FakeFolder>();
  constructor(readonly name: string) {}
  queryPermission() {
    return Promise.resolve("granted");
  }
  getFileHandle(name: string, { create = false } = {}) {
    if (!create && !this.files.has(name))
      return Promise.reject(new DOMException("", "NotFoundError"));
    return Promise.resolve({
      kind: "file",
      getFile: () => Promise.resolve(new File([this.files.get(name) ?? ""], name)),
      createWritable: () => {
        const parts: BlobPart[] = [];
        return Promise.resolve({
          write: (data: BlobPart) => Promise.resolve(void parts.push(data)),
          close: () => Promise.resolve(void this.files.set(name, new Blob(parts))),
        });
      },
    });
  }
  getDirectoryHandle(name: string, { create = false } = {}) {
    if (!this.folders.has(name)) {
      if (!create) return Promise.reject(new DOMException("", "NotFoundError"));
      this.folders.set(name, new FakeFolder(name));
    }
    return Promise.resolve(this.folders.get(name)!);
  }
  *[Symbol.asyncIterator]() {
    for (const name of this.files.keys()) yield [name, { kind: "file" }];
  }
}

/** Each campaign's folder backup, made on first use. */
const backups = new Map<Campaign, FolderBackup>();
const backupOf = (c: Campaign) => {
  let b = backups.get(c);
  if (!b) backups.set(c, (b = new FolderBackup(c)));
  return b;
};

/** The next time the folder is brought up to date. */
const saved = (backup: FolderBackup) =>
  new Promise<void>((resolve) => {
    const stop = backup.status.subscribe(() => {
      if (backup.status.value.state === "saved") {
        stop();
        resolve();
      }
    });
  });

const backupIn = async (folder: FakeFolder) =>
  decodeBackup(new Uint8Array(await folder.files.get("campaign.makeamove")!.arrayBuffer()));

async function setUp() {
  folderSaveDelay.ms = 10;
  device.value = { id: "gm", name: "Gwen" };
  const c = await Campaign.open(await createCampaign("Barrows", "Gwen"));
  const scene = await SceneDoc.open(c.sceneSubdoc(c.sceneViews()[0]!.id)!);
  const hash = await putBlob(new Blob(["map"], { type: "image/png" }));
  scene.add({
    type: "map",
    layer: "map",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rot: 0,
    image: { hash, mime: "image/png", width: 1, height: 1 },
  });
  return { c, scene, hash };
}

describe("backing up to a folder", () => {
  it("keeps the folder up to date while the campaign is open", async () => {
    const { c, scene, hash } = await setUp();
    const folder = new FakeFolder("Dropbox");
    mocks.picked = folder;
    const first = saved(backupOf(c));
    await backupOf(c).link();
    await first;
    expect(backupOf(c).status.value).toMatchObject({ state: "saved", folder: "Dropbox" });
    expect((await backupIn(folder)).name).toBe("Barrows");
    expect(folder.folders.get("images")!.files.has(hash)).toBe(true);

    // An edit to the open scene reaches the folder too.
    const next = saved(backupOf(c));
    scene.add({
      type: "text",
      layer: "over",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rot: 0,
      text: "Here",
      colour: "#fff",
      size: 1,
      bw: 1,
      bh: 1,
    });
    await next;
    const sceneDoc = (await backupIn(folder)).docs.find((d) => d.kind === "scene")!;
    expect(new TextDecoder().decode(sceneDoc.update)).toContain("Here");

    await backupOf(c).unlink();
    expect(backupOf(c).status.value).toEqual({ state: "off" });
    scene.destroy();
    backups.get(c)?.dispose();
    c.destroy();
  });

  it("resumes on the next visit, and restores from the folder on a new device", async () => {
    const { c, scene, hash } = await setUp();
    const folder = new FakeFolder("Dropbox");
    mocks.picked = folder;
    const first = saved(backupOf(c));
    await backupOf(c).link();
    await first;
    scene.destroy();
    backups.get(c)?.dispose();
    c.destroy();

    // Opening the campaign again picks the folder back up.
    const again = await Campaign.open(c.id);
    const resuming = new FolderBackup(again);
    const resumed = saved(resuming);
    await resumed;
    resuming.dispose();
    again.destroy();

    await deleteLocalCampaign(c.id);
    mocks.blobs.clear();
    device.value = { id: "new-laptop", name: "" };
    expect(await importFromFolder()).toBe(c.id);
    expect(summaryOf(c.id)?.role).toBe("gm");
    expect(mocks.blobs.has(hash)).toBe(true);
    const back = await Campaign.open(c.id);
    expect(back.isGm()).toBe(true);
    back.destroy();
  });

  it("won't link a folder that holds another campaign", async () => {
    const { c, scene } = await setUp();
    const folder = new FakeFolder("Shared");
    mocks.picked = folder;
    const first = saved(backupOf(c));
    await backupOf(c).link();
    await first;
    await backupOf(c).unlink();
    scene.destroy();

    const other = await Campaign.open(await createCampaign("Other", "Gwen"));
    await expect(backupOf(other).link()).rejects.toThrow("another campaign, Barrows");
    backups.get(other)?.dispose();
    other.destroy();
    backups.get(c)?.dispose();
    c.destroy();
  });
});
