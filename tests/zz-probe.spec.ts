import { layout } from "../src/table/panelLayout";
import { expect, test } from "./browser-test";
import {
  createCampaign,
  openCharacters,
  openSheetMove,
  chooseCreationOptions,
  addRelationshipAtDepthThree,
  drag,
} from "./e2e-helpers";

test("DW2 Library purchases spend a Treasure box for equal-Wealth gear", async ({ page }) => {
  await createCampaign(page, "Gear purchase", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Slick");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  const libraries = page.getByRole("tab", { name: "Libraries" });
  if ((await libraries.getAttribute("aria-selected")) !== "true") await libraries.click();
  const search = page.getByRole("searchbox", { name: "Search the Libraries" });
  await search.fill("Shortspear");
  await page.getByText("Shortspear", { exact: true }).click();
  await page.getByRole("button", { name: "Purchase", exact: true }).click();

  await expect(
    page
      .getByRole("region", { name: "Treasure & Wealth" })
      .getByRole("group", { name: "Treasure" })
      .getByRole("textbox"),
  ).toHaveValue("3");
  await expect(page.getByRole("region", { name: "Inventory" })).toContainText("Shortspear");
});

test("DW2 sheets reveal a Struggle dragged in from the Libraries", async ({ page }) => {
  await createCampaign(page, "Struggle drop", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Vex");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  const libraries = page.getByRole("tab", { name: "Libraries" });
  if ((await libraries.getAttribute("aria-selected")) !== "true") await libraries.click();
  await page.getByRole("searchbox", { name: "Search the Libraries" }).fill("Reformed");
  const moves = await page.getByRole("region", { name: "Moves" }).boundingBox();
  if (!moves) throw new Error("The sheet's moves are not shown.");
  {
    const x = moves.x + moves.width / 2, y = moves.y + 10;
    const at = document.elementFromPoint(x, y);
    const src = page.getByText("Reformed", { exact: true }).elements();
    console.log("PROBE drop target", at?.tagName, at?.className, "| sources", src.length, src.map((e) => `${e.tagName}.${e.className} ${JSON.stringify((e as HTMLElement).getBoundingClientRect())}`).join(" ; "));
    const scrollers = [...document.querySelectorAll(".sidebar[data-side=left] *")].filter((e) => e.scrollTop > 0).map((e) => `${e.className}:${e.scrollTop}`);
    console.log("PROBE moves", JSON.stringify(moves), "scrolled", scrollers.join(","), "regions", page.getByRole("region", { name: "Moves" }).elements().length);
    console.log("PROBE floating", JSON.stringify(layout.value.floating.map((w) => w.id)), "dialogs", [...document.querySelectorAll("dialog[open]")].map((d) => d.getAttribute("aria-label")).join(","));
  }
  await drag(
    page,
    page.getByText("Reformed", { exact: true }),
    moves.x + moves.width / 2,
    moves.y + 10,
  );

  await new Promise((r) => setTimeout(r, 1500));
  console.log("PROBE region", !!document.querySelector('[aria-label="Current Struggle"]'));
  const struggle = page.getByRole("region", { name: "Current Struggle" });
  await expect(struggle.getByRole("heading", { name: "Reformed" })).toBeVisible();
  await expect(struggle.getByRole("spinbutton", { name: "Guilt" })).toHaveValue("2");
});

