import { expect, test } from "@playwright/test";
import { createCampaign, drag, settled } from "./e2e-helpers";

test.use({ viewport: { width: 1280, height: 800 } });

test("rapid panel changes settle on the last selected panel", async ({ page }) => {
  await createCampaign(page, "Panel transitions");
  const notes = page.getByRole("tab", { name: "Notes" });
  const chat = page.getByRole("tab", { name: /^Chat/ });

  await settled(page);
  await page.addStyleTag({
    content: `
      ::view-transition-group(*),
      ::view-transition-old(*),
      ::view-transition-new(*) {
        animation-duration: 5s !important;
      }
    `,
  });
  await notes.click();
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .some(
        (animation) =>
          animation.effect instanceof KeyframeEffect &&
          animation.effect.pseudoElement?.startsWith("::view-transition"),
      ),
  );
  await chat.click({ timeout: 1000 });
  await notes.click({ timeout: 1000 });
  await chat.click({ timeout: 1000 });
  await notes.click({ timeout: 1000 });

  await expect(notes).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No pages yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New page" })).toBeVisible();
});

test("panel creation actions share the title bar when docked and floating", async ({ page }) => {
  await createCampaign(page, "Inline panel actions", "dnd-5.5e");
  for (const [title, actions] of [
    ["Characters", ["New", "New folder"]],
    ["Scenes", ["New scene", "New folder"]],
    ["Notes", ["New page", "New GM page", "New folder"]],
    ["Items", ["New gear", "New move"]],
    ["Combat", ["Roll for NPCs", "Start"]],
  ] as const) {
    const tab = page.getByRole("tab", { name: title, exact: true });
    if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    const header = page.locator(".sidebar-panel > .panel-header").filter({
      has: page.getByRole("heading", { name: title, exact: true }),
    });
    for (const action of actions) {
      await expect(header.getByRole("button", { name: action, exact: true })).toBeVisible();
    }
    if (actions.some((action) => action === "New folder")) {
      await header.getByRole("button", { name: "New folder", exact: true }).click();
      const folderName = header.getByRole("textbox", { name: "Folder name" });
      await expect(folderName).toBeFocused();
      await folderName.fill(`${title} folder`);
      await folderName.press("Enter");
      await expect(folderName).toHaveCount(0);
      await expect(header.getByRole("button", { name: "New folder", exact: true })).toBeVisible();
    }
  }

  const itemsTab = page.getByRole("tab", { name: "Items", exact: true });
  if ((await itemsTab.getAttribute("aria-selected")) !== "true") await itemsTab.click();
  await page.getByRole("button", { name: "New gear", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New gear", exact: true })).toBeVisible();
  await expect(
    page.locator(".panel-actions").getByRole("button", { name: "New gear" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Items", exact: true }).click();
  await page.getByRole("tab", { name: "Items", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Float in a window" }).click();
  const itemsWindow = page.getByRole("region", { name: "Items", exact: true });
  const header = itemsWindow.locator(".panel-header");
  const title = header.getByRole("heading", { name: "Items", exact: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const action of ["New gear", "New move"]) {
      const button = header.getByRole("button", { name: action, exact: true });
      await expect(button).toBeVisible();
      const titleBox = (await title.boundingBox())!;
      const buttonBox = (await button.boundingBox())!;
      expect(buttonBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
      expect(buttonBox.y).toBeLessThan(titleBox.y + titleBox.height);
      expect(buttonBox.y + buttonBox.height).toBeGreaterThan(titleBox.y);
    }
  }
  await header.getByRole("button", { name: "New move", exact: true }).click();
  await expect(itemsWindow.getByRole("heading", { name: "New move", exact: true })).toBeVisible();
  await expect(itemsWindow).toHaveAttribute("data-rolled", "false");
});

test("a panel can be floated and docked on the other sidebar", async ({ page }) => {
  await createCampaign(page, "Window movement");
  const notesTab = page.getByRole("tab", { name: "Notes" });
  await notesTab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Float in a window" }).click();
  const notesWindow = page.getByRole("region", { name: "Notes" });
  await expect(notesWindow).toBeVisible();
  await expect(notesTab).toHaveCount(0);

  const title = notesWindow.getByRole("heading", { name: "Notes" });
  const leftSidebar = page.getByRole("complementary", { name: "Left sidebar" });
  const leftTab = page.getByRole("tab", { name: "Scenes" });
  const leftTabBounds = await leftTab.boundingBox();
  expect(leftTabBounds).not.toBeNull();
  await drag(
    page,
    title,
    leftTabBounds!.x + leftTabBounds!.width / 2,
    leftTabBounds!.y + leftTabBounds!.height / 2,
  );

  await expect(notesWindow).toHaveCount(0);
  await expect(leftSidebar.getByRole("tab", { name: "Notes" })).toBeVisible();
});

test("a floating panel can be rolled up and restored", async ({ page }) => {
  await createCampaign(page, "Window animation");
  await page.getByRole("tab", { name: "Notes" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Float in a window" }).click();

  const notesWindow = page.getByRole("region", { name: "Notes" });
  const title = notesWindow.getByRole("heading", { name: "Notes" });
  const newPage = notesWindow.getByRole("button", { name: "New page" });
  await expect(newPage).toBeVisible();
  await title.dblclick();
  await expect(newPage).toBeHidden();
  await title.dblclick();
  await expect(newPage).toBeVisible();
});

test("a sidebar resizes from its tab strip's edge by pointer and keyboard", async ({ page }) => {
  await createCampaign(page, "Sidebar resizing");
  const sidebar = page.getByRole("complementary", { name: "Right sidebar" });
  const body = sidebar.getByRole("tabpanel");
  const handle = sidebar.getByRole("separator", { name: "Resize right sidebar" });
  const chatTab = sidebar.getByRole("tab", { name: /^Chat/ });
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(handle).toHaveAttribute("aria-valuenow", "340");
  const width = async () => (await body.boundingBox())!.width;
  expect(await width()).toBeCloseTo(340, 0);

  // Dragging the strip's outer edge widens the sidebar by the distance moved,
  // once the view transitions have settled (they take over hit-testing).
  await settled(page);
  const edge = (await handle.boundingBox())!;
  const x = edge.x + edge.width / 2;
  const y = edge.y + edge.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y, { steps: 6 });
  await expect(page.locator("html")).toHaveClass(/is-dragging/);
  await page.mouse.up();
  await expect(page.locator("html")).not.toHaveClass(/is-dragging/);
  await expect(handle).toHaveAttribute("aria-valuenow", "400");
  expect(await width()).toBeCloseTo(400, 0);

  // An interrupted drag ends cleanly.
  await page.mouse.move(x - 60, y);
  await page.mouse.down();
  await page.mouse.move(x - 70, y);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("html")).not.toHaveClass(/is-dragging/);
  await page.mouse.move(x - 200, y);
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "410");

  // The keyboard: arrows step, Shift steps further, Home shuts, Enter resets.
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "426");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "362");
  await page.keyboard.press("Home");
  await expect(sidebar).toHaveAttribute("data-open", "false");
  await expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");
  await page.keyboard.press("ArrowLeft");
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(handle).toHaveAttribute("aria-valuenow", "362");
  await page.keyboard.press("Enter");
  await expect(handle).toHaveAttribute("aria-valuenow", "340");

  // The width is kept across a reload.
  await page.keyboard.press("End");
  const max = await handle.getAttribute("aria-valuemax");
  await expect(handle).toHaveAttribute("aria-valuenow", max!);
  await page.reload();
  await expect(handle).toHaveAttribute("aria-valuenow", max!);

  // The tabs still select and collapse the sidebar on click.
  await chatTab.click();
  await expect(sidebar).toHaveAttribute("data-open", "false");
  await chatTab.click();
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(chatTab).toHaveAttribute("aria-selected", "true");

  // A shut sidebar can be dragged back open from the strip's edge.
  await chatTab.click();
  await expect(sidebar).toHaveAttribute("data-open", "false");
  await settled(page);
  const shut = (await handle.boundingBox())!;
  const shutX = shut.x + shut.width / 2;
  const shutY = shut.y + shut.height / 2;
  await page.mouse.move(shutX, shutY);
  await page.mouse.down();
  await page.mouse.move(shutX - 300, shutY, { steps: 8 });
  await page.mouse.up();
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(handle).toHaveAttribute("aria-valuenow", "300");
});
