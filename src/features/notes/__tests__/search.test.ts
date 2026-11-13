import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { Campaign, createCampaign } from "../../../campaign/campaign";
import { device } from "../../../platform/device";
import {
  createNote,
  deleteNote,
  getNote,
  noteSubdoc,
  noteTextIndex,
  openNotePage,
  searchNotes,
} from "../api";
import { NoteDoc, noteDbName } from "../noteDoc";

async function setUp() {
  device.value = { id: "gm", name: "Gwen" };
  return Campaign.open(await createCampaign("Barrows", "Gwen"));
}

const paragraph = (...content: (string | Y.XmlElement)[]) => {
  const p = new Y.XmlElement("paragraph");
  p.insert(
    0,
    content.map((c) => (typeof c === "string" ? new Y.XmlText(c) : c)),
  );
  return p;
};

/** Write paragraphs into a page, as the editor would, through `open`. */
function write(page: NoteDoc | null, ...paragraphs: Y.XmlElement[]) {
  page!.doc.transact(() => page!.body.push(paragraphs));
  page!.destroy();
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("note search", () => {
  it("finds titles and text, best first, with editor positions", async () => {
    const c = await setUp();
    const duke = createNote(c, { title: "The Duke" });
    const inn = createNote(c, { title: "Inn" });
    write(await openNotePage(c, inn), paragraph("Cold."), paragraph("The duke drinks here."));
    expect(await searchNotes(c, "duke")).toEqual([
      { note: getNote(c, duke), snippet: "The Duke" },
      // Paragraph 2 starts at 7; "duke" is 4 characters in.
      { note: getNote(c, inn), from: 12, to: 16, snippet: "Cold. The duke drinks here." },
    ]);
    c.destroy();
  });

  it("matches near misses", async () => {
    const c = await setUp();
    const inn = createNote(c, { title: "Inn" });
    write(await openNotePage(c, inn), paragraph("The duke drinks here."));
    // The whole word, though "z" didn't match.
    expect(await searchNotes(c, "drinkz")).toMatchObject([{ note: { id: inn }, from: 10, to: 16 }]);
    c.destroy();
  });

  it("matches a phrase as one span, ahead of its words found elsewhere", async () => {
    const c = await setUp();
    const inn = createNote(c, { title: "Inn" });
    write(await openNotePage(c, inn), paragraph("The council meets beneath the old bell tower."));
    expect(await searchNotes(c, "beneath the old bell tower")).toMatchObject([
      { from: 19, to: 45 },
      { from: 1, to: 4 },
    ]);
    c.destroy();
  });

  it("places matches in a link chip's label on the chip", async () => {
    const c = await setUp();
    const inn = createNote(c, { title: "Inn" });
    const chip = new Y.XmlElement("entityLink");
    chip.setAttribute("kind", "note");
    chip.setAttribute("id", "n1");
    chip.setAttribute("label", "Varrow");
    write(await openNotePage(c, inn), paragraph("Ask ", chip, " later"));
    expect(await searchNotes(c, "varrow")).toMatchObject([{ from: 5, to: 6 }]);
    c.destroy();
  });

  it("adds pages stored before the index, once", async () => {
    const c = await setUp();
    const inn = createNote(c, { title: "Inn" });
    // Written without the index, as by an older version.
    write(await NoteDoc.open(noteSubdoc(c, inn)!), paragraph("The duke drinks here."));
    expect(await searchNotes(c, "duke")).toHaveLength(1);
    expect((await noteTextIndex(c)).has(inn)).toBe(true);
    c.destroy();
  });

  it("keeps up with changes made while a page is open", async () => {
    const c = await setUp();
    const inn = createNote(c, { title: "Inn" });
    const page = await openNotePage(c, inn);
    expect(await searchNotes(c, "duke")).toEqual([]);
    // A peer's edit reaching the open page.
    const peer = new Y.Doc();
    peer.getXmlFragment("body").push([paragraph("The duke drinks here.")]);
    Y.applyUpdate(page!.doc, Y.encodeStateAsUpdate(peer));
    page!.destroy();
    expect(await searchNotes(c, "duke")).toHaveLength(1);
    c.destroy();
  });

  it("keeps its index on the device, without opening pages", async () => {
    const c = await setUp();
    const inn = createNote(c, { title: "Inn" });
    write(await openNotePage(c, inn), paragraph("The duke drinks here."));
    (await noteTextIndex(c)).flush();
    await settle();
    const id = c.id;
    const guid = noteSubdoc(c, inn)!.guid;
    c.destroy();
    // With the page's text gone, only the stored index can find it.
    indexedDB.deleteDatabase(noteDbName(guid));
    await settle();
    const reopened = await Campaign.open(id);
    expect(await searchNotes(reopened, "duke")).toMatchObject([{ from: 5, to: 9 }]);
    reopened.destroy();
  });

  it("forgets deleted pages", async () => {
    const c = await setUp();
    const inn = createNote(c, { title: "Inn" });
    write(await openNotePage(c, inn), paragraph("The duke drinks here."));
    deleteNote(c, inn);
    await settle();
    expect((await noteTextIndex(c)).has(inn)).toBe(false);
    expect(await searchNotes(c, "duke")).toEqual([]);
    c.destroy();
  });
});
