import { expect, test, type Page } from "@playwright/test";

async function createCampaign(page: Page, name = "The Lost Barrows") {
  await page.goto("/");
  await page.getByPlaceholder("The Lost Barrows").fill(name);
  await page.getByPlaceholder("Robin").first().fill("Tester");
  await page.getByLabel("System").selectOption("dungeon-world");
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.locator(".table")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("a campaign can be created, left, and reopened", async ({ page }) => {
  await createCampaign(page);
  await expect(page.locator(".canvas")).toHaveAttribute(
    "aria-label",
    "Scene: The Opening Scene",
  );

  await page.getByRole("button", { name: "Campaign menu" }).click();
  await page.getByRole("menuitem", { name: "Back to campaigns" }).click();
  const campaign = page.getByRole("button", { name: /^The Lost Barrows/ });
  await expect(campaign).toBeVisible();
  await campaign.click();
  await expect(page.locator(".table")).toBeVisible();
});

test("a GM can create an NPC", async ({ page }) => {
  await createCampaign(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("radio", { name: "NPC" }).click();
  await page.locator("form.sheet-new").getByLabel("Name").fill("Mira Ashford");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(
    page
      .locator('.sidebar[data-side="left"] .panes-title')
      .getByText("Mira Ashford", {
        exact: true,
      }),
  ).toBeVisible();
});

test("a player can send a chat message", async ({ page }) => {
  await createCampaign(page);
  const message = page.getByRole("textbox", { name: "Message" });
  await message.fill("The guards retreat.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText("The guards retreat.", { exact: true }),
  ).toBeVisible();
  await expect(message).toBeEmpty();
});

test("a GM can add and rename a scene, and toggle its sidebar", async ({
  page,
}) => {
  await createCampaign(page);
  const scenesTab = page.getByRole("tab", { name: "Scenes" });
  const sidebar = page.locator('.sidebar[data-side="left"]');
  await scenesTab.click();

  const sceneNames = page
    .getByRole("list", { name: "Scenes" })
    .getByLabel("Scene name");
  await expect(sceneNames).toHaveCount(1);
  await scenesTab.click();
  await expect(sidebar).toHaveAttribute("data-open", "false");
  await scenesTab.click();
  await expect(sceneNames).toHaveCount(1);

  await page.getByRole("button", { name: "New scene" }).click();
  await expect(sceneNames).toHaveCount(2);
  await sceneNames.nth(1).fill("The Ashen Keep");
  await expect(sceneNames.nth(1)).toHaveValue("The Ashen Keep");
});

test("filterable graphics float above windows and support keyboard dismissal", async ({
  page,
}) => {
  await createCampaign(page, "Graphic picker test");
  await page.getByRole("tab", { name: "Scenes" }).click();

  const sceneGraphicAction = page.getByRole("button", {
    name: "Change scene graphic…",
  });
  await expect(sceneGraphicAction).toBeVisible();
  await sceneGraphicAction.click();

  const editor = page.getByRole("dialog", {
    name: "Graphic for The Opening Scene",
  });
  await expect(editor).toBeVisible();
  const trigger = editor.getByRole("button", { name: "Search icons…" });

  await editor.evaluate((element) => {
    Object.assign(element.style, {
      left: "800px",
      top: "570px",
      width: "380px",
    });
  });
  await expect.poll(async () => (await editor.boundingBox())?.y).toBe(570);
  const editorBoundsBefore = await editor.boundingBox();
  await trigger.click();

  const menu = page.getByRole("dialog", { name: "Built-in icons" });
  await expect(menu).toBeVisible();
  const placement = await menu.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const parent = element.parentElement;
    return {
      bounds: {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
      },
      side: element.dataset.side,
      parent: parent?.tagName,
      inEditor: !!element.closest("dialog"),
    };
  });
  const editorBoundsAfter = await editor.boundingBox();
  expect(placement.parent).toBe("BODY");
  expect(placement.inEditor).toBe(false);
  expect(placement.side).toBe("above");
  expect(placement.bounds.left).toBeGreaterThanOrEqual(0);
  expect(placement.bounds.top).toBeGreaterThanOrEqual(0);
  expect(placement.bounds.right).toBeLessThanOrEqual(1280);
  expect(placement.bounds.bottom).toBeLessThanOrEqual(800);
  expect(editorBoundsAfter).toEqual(editorBoundsBefore);

  const search = menu.getByRole("searchbox", { name: "Search built-in icons" });
  await search.fill("bow");
  const options = menu.getByRole("option");
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveAccessibleName("bow");
  await expect(options.nth(1)).toHaveAccessibleName("crossbow");
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(0)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(20, 20);
  await expect(menu).toHaveCount(0);
});
