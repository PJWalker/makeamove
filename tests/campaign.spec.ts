import { expect, test } from "./browser-test";
import { createCampaign, settled } from "./e2e-helpers";

test("a campaign can be created, left, and reopened", async ({ page }) => {
  await createCampaign(page);
  await expect(page.locator('[aria-label="Scene: The Opening Scene"]')).toBeVisible();
  await expect(page.locator('[aria-label="Scene: The Opening Scene"]')).toHaveAttribute(
    "aria-label",
    "Scene: The Opening Scene",
  );

  await page.getByRole("button", { name: "Campaign menu" }).click();
  await page.getByRole("menuitem", { name: "Back to campaigns" }).click();
  const campaign = page.getByRole("button", { name: /^The Lost Barrows/ }).last();
  await expect(campaign).toBeVisible();
  await expect(campaign).toContainText("No system");
  await campaign.click();
  await expect(page.locator('[aria-label="Scene: The Opening Scene"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[aria-label="Scene: The Opening Scene"]')).toBeVisible();
});

test("selected menu items fade after the menu closes", async ({ page }) => {
  await createCampaign(page, "Menu selection transition");
  await settled(page);

  for (const interaction of ["pointer", "keyboard", "reduced-motion"] as const) {
    await page.emulateMedia({
      reducedMotion: interaction === "reduced-motion" ? "reduce" : "no-preference",
    });
    await page.getByRole("button", { name: "Campaign menu" }).click();
    const item = page.getByRole("menuitemcheckbox").first();
    if (interaction === "keyboard") await item.focus();
    await page.evaluate(() => {
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = ((update: () => void) => {
        const transition = start(update);
        void transition.ready.then(() => {
          for (const animation of document.getAnimations()) {
            if (animation instanceof CSSAnimation && animation.animationName === "vt-exit")
              animation.pause();
          }
        });
        return transition;
      }) as typeof document.startViewTransition;
    });
    if (interaction === "keyboard") await item.press("Enter");
    else await item.click();

    await expect(page.getByRole("menu")).toHaveCount(0);
    const outgoing = () =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation instanceof CSSAnimation &&
                animation.animationName === "vt-exit" &&
                (animation.effect as KeyframeEffect).pseudoElement?.startsWith(
                  "::view-transition-old(menu-selection-",
                ),
            ).length,
      );
    if (interaction === "reduced-motion") expect(await outgoing()).toBe(0);
    else {
      await expect.poll(outgoing).toBe(1);
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) animation.finish();
      });
      await settled(page);
    }
  }
});

test("right-drag menus select and close on release", async ({ page }) => {
  await createCampaign(page, "Right-drag menu");
  await page.getByRole("button", { name: "Campaign menu" }).click();
  await page.getByRole("menuitem", { name: "Back to campaigns" }).click();
  const campaign = page.getByRole("button", { name: /^Right-drag menu/ });
  await expect(campaign).toBeVisible();
  await settled(page);
  await campaign.hover();
  await page.mouse.down({ button: "right" });
  const item = page.getByRole("menuitem", { name: "Delete…" });
  await expect(item).toBeVisible();
  await item.hover();
  await page.mouse.up({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Delete campaign?" })).toBeVisible();
});

test("campaign deletion is available from the right-click menu and confirms", async ({ page }) => {
  await createCampaign(page, "Delete menu test");
  await page.getByRole("button", { name: "Campaign menu" }).click();
  await page.getByRole("menuitem", { name: "Back to campaigns" }).click();

  const campaign = page.getByRole("button", { name: /^Delete menu test/ });
  await expect(campaign).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Delete menu test" })).toHaveCount(0);
  await campaign.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete…" }).click();

  const confirmation = page.getByRole("dialog", { name: "Delete campaign?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toBeHidden();

  await campaign.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await page
    .getByRole("dialog", { name: "Delete campaign?" })
    .getByRole("button", { name: "Delete from this device" })
    .click();
  await expect(campaign).toHaveCount(0);
});

test("opening an invite link presents a join modal, not a lobby section", async ({ page }) => {
  await page.goto("/#join=abc.1234567890abcdef");
  await settled(page);

  const invitation = page.getByRole("dialog", { name: "Join a campaign" });
  await expect(invitation).toBeVisible();
  await expect(invitation.getByLabel("Your name")).toBeFocused();
  await expect(page.locator(".lobby-join")).toHaveCount(0);
});
