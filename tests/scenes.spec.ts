import { expect, test } from "./browser-test";
import { createCampaign } from "./e2e-helpers";

test("a GM can add and rename a scene, and toggle its sidebar", async ({ page }) => {
  await createCampaign(page);
  const scenesTab = page.getByRole("tab", { name: "Scenes" });
  if ((await scenesTab.getAttribute("aria-selected")) !== "true") await scenesTab.click();

  const sceneName = page.getByRole("textbox", { name: "Scene name" });
  await expect(sceneName).toHaveValue("The Opening Scene");
  await scenesTab.click();
  await expect(sceneName).not.toBeInViewport();
  await scenesTab.click();
  await expect(sceneName).toBeInViewport();

  await page.getByRole("button", { name: "Back to the scene list" }).click();
  const sceneRows = page.locator(".scene-item");
  await expect(sceneRows).toHaveCount(1);
  await page.getByRole("button", { name: "New scene" }).click();
  await expect(sceneRows).toHaveCount(2);
  await sceneName.fill("The Ashen Keep");
  await expect(sceneName).toHaveValue("The Ashen Keep");
  await page.reload();
  await expect(page.locator('[aria-label="Scene: The Ashen Keep"]')).toBeVisible();
});

test("scenes can be filed and pulled or deleted from their context menu", async ({ page }) => {
  await createCampaign(page, "Scene folders test");
  const scenesTab = page.getByRole("tab", { name: "Scenes" });
  if ((await scenesTab.getAttribute("aria-selected")) !== "true") await scenesTab.click();

  await expect(page.getByRole("button", { name: "Pull players here" })).toBeVisible();
  await page.getByRole("button", { name: "Back to the scene list" }).click();
  await page.getByRole("button", { name: "New scene" }).click();
  await page.getByRole("button", { name: "Back to the scene list" }).click();

  await page.getByRole("button", { name: "New folder" }).click();
  const folderName = page.getByRole("textbox", { name: "Folder name" });
  await folderName.fill("Journeys");
  await folderName.press("Enter");
  const folder = page.locator(".list-group").filter({ hasText: "Journeys" });
  await expect(folder).toBeVisible();

  const openingScene = page.getByRole("button", { name: "The Opening Scene" });
  await openingScene.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to Journeys" }).click();
  await expect(folder.locator(".scene-item")).toHaveCount(1);

  const secondScene = page.getByRole("button", { name: "Scene 2" });
  await secondScene.click({ button: "right" });
  const sceneMenu = page.getByRole("menu");
  await expect(sceneMenu.getByRole("menuitem", { name: "Pull players here" })).toBeVisible();
  const pullItem = sceneMenu.getByRole("menuitem", {
    name: "Pull players here",
  });
  const sceneChangeNotice = page.getByText("Scene changed to Scene 2", {
    exact: true,
  });
  await expect(sceneChangeNotice).toHaveCount(1);
  const noticesBeforePull = await sceneChangeNotice.count();
  await pullItem.evaluate((element) => {
    const click = () => element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    click();
    click();
  });
  await expect(secondScene).toHaveAttribute("aria-current", "true");
  await expect(sceneChangeNotice).toHaveCount(noticesBeforePull + 1);
  await secondScene.click({ button: "right" });
  await expect(sceneMenu.getByRole("menuitem", { name: "Delete scene" })).toBeVisible();
  await expect(sceneMenu).toHaveAttribute("data-closing", "false");
  await sceneMenu.getByRole("menuitem", { name: "Delete scene" }).click();
  await expect(page.locator(".scene-item")).toHaveCount(1);
});

test("filterable graphics float above windows and support keyboard dismissal", async ({ page }) => {
  await createCampaign(page, "Graphic picker test");
  const scenesTab = page.getByRole("tab", { name: "Scenes" });
  if ((await scenesTab.getAttribute("aria-selected")) !== "true") await scenesTab.click();

  const trigger = page.getByRole("button", { name: "Search icons…" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const menu = page.getByRole("dialog", { name: "Built-in icons" });
  await expect(menu).toBeVisible();

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
