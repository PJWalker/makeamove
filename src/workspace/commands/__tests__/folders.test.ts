import { describe, expect, it, vi } from "vite-plus/test";
import { moveFolderOffers } from "../folders";

vi.mock("../../../ui/icons", () => ({ IconDelete: () => null }));

const folders = [
  { id: "party", name: "Party" },
  { id: "archive", name: "Archive" },
];

describe("move folder offers", () => {
  it("offers each folder when the entry is not filed", () => {
    expect(moveFolderOffers("entry", undefined, folders)).toEqual([
      { params: { id: "entry", folder: "party" }, title: "Move to Party" },
      { params: { id: "entry", folder: "archive" }, title: "Move to Archive" },
    ]);
  });

  it("omits the current folder and offers returning to the top level", () => {
    expect(moveFolderOffers("entry", "party", folders)).toEqual([
      { params: { id: "entry", folder: "archive" }, title: "Move to Archive" },
      { params: { id: "entry" }, title: "Remove from Folder" },
    ]);
  });
});
