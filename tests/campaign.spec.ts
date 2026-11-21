import { expect, test } from "./browser-test";
import { createCampaign, settled } from "./e2e-helpers";

test("the wisp and its glow wander together after twenty seconds", async ({ page }) => {
  const travel = document.querySelector<HTMLElement>(".cave-wisp-travel");
  expect(travel).not.toBeNull();
  expect(travel!.querySelector(".cave-wisp")).not.toBeNull();
  expect(travel!.querySelector(".cave-wisp-glow")).not.toBeNull();
  const animation = travel!.getAnimations().find((item) => item instanceof CSSAnimation);
  expect(animation).toBeDefined();
  animation!.pause();
  animation!.currentTime = 19_000;
  const before = travel!.getBoundingClientRect();
  animation!.currentTime = 24_000;
  const after = travel!.getBoundingClientRect();
  expect(after.x).not.toBe(before.x);
  expect(after.y).not.toBe(before.y);

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(travel!.getAnimations()).toHaveLength(0);
});

test("the cave parallax follows the mouse without easing", async ({ page }) => {
  await page.mouse.move(1180, 700);
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>(".cave-scene")?.style.getPropertyValue("--cave-x") ===
      "-6.75px",
  );

  const layers = document.querySelectorAll(
    ".cave-background, .cave-effects, .cave-depth, .cave-light",
  );
  for (const layer of layers) expect(getComputedStyle(layer).transitionDuration).toBe("0s");
  const foreground = document.querySelector<HTMLElement>(".cave-effects")!;
  const transform = new DOMMatrix(getComputedStyle(foreground).transform);
  expect(transform.m41).toBeCloseTo(-6.75);
  expect(transform.m42).toBeCloseTo(-4.5);
});

test("the cave responds subtly to the mouse and respects reduced motion", async ({ page }) => {
  const offsets = () => {
    const background = document.querySelector<HTMLElement>(".cave-background");
    const foreground = document.querySelector<HTMLElement>(".cave-effects");
    if (!background || !foreground) return null;
    const position = (element: HTMLElement) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return { x: matrix.m41, y: matrix.m42 };
    };
    return { background: position(background), foreground: position(foreground) };
  };

  await page.mouse.move(1180, 700);
  await expect.poll(() => offsets()?.foreground.x ?? 0).not.toBe(0);
  await page.waitForFunction(() =>
    document
      .querySelector(".cave-effects")
      ?.getAnimations()
      .every((animation) => animation.playState === "finished"),
  );
  const moved = offsets();
  expect(moved).not.toBeNull();
  expect(Math.abs(moved!.background.x)).toBeGreaterThan(0);
  expect(Math.abs(moved!.foreground.x)).toBeGreaterThan(Math.abs(moved!.background.x));
  expect(Math.abs(moved!.foreground.x)).toBeLessThan(30);
  expect(Math.abs(moved!.foreground.y)).toBeGreaterThan(0);

  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent("mouseout", { relatedTarget: null })),
  );
  await expect.poll(() => offsets()?.foreground.x).toBe(0);
  await page.evaluate(() =>
    window.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", clientX: 100 })),
  );
  expect(offsets()?.foreground).toEqual({ x: 0, y: 0 });
  await page.mouse.move(1180, 700);
  await expect.poll(() => offsets()?.foreground.x ?? 0).not.toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => offsets()?.foreground.x).toBe(0);
  await page.mouse.move(100, 100);
  expect(offsets()?.foreground).toEqual({ x: 0, y: 0 });
  expect(offsets()?.background).toEqual({ x: 0, y: 0 });
});

test("the cave grain stays still and the party moves at different depths", async ({ page }) => {
  const positions = () => {
    const grain = document.querySelector(".cave-grain")!.getBoundingClientRect();
    const party = [...document.querySelectorAll(".cave-adventurer")].map((figure) =>
      figure.getBoundingClientRect(),
    );
    return { grain: grain.x, party: party.map((figure) => figure.x) };
  };

  const start = positions();
  await page.mouse.move(1180, 700);
  await expect.poll(() => positions().party[0]).not.toBe(start.party[0]);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) =>
        animation instanceof CSSTransition ? animation.playState === "finished" : true,
      ),
  );
  const end = positions();
  const distance = end.party.map((position, index) => Math.abs(position - start.party[index]));
  expect(end.grain).toBeCloseTo(start.grain, 1);
  expect(distance[0]).toBeGreaterThan(0);
  expect(distance[1]).toBeGreaterThan(distance[0]);
  expect(distance[2]).toBeGreaterThan(distance[1]);
  expect(distance[3]).toBeGreaterThan(distance[0]);
});

test("the cave arches move at progressively deeper parallax depths", async ({ page }) => {
  const arches = [...document.querySelectorAll<SVGGraphicsElement>(".cave-arch")];
  expect(arches).toHaveLength(9);
  const positions = () =>
    arches.map((arch) => {
      const matrix = arch.getScreenCTM()!;
      return { x: matrix.e, y: matrix.f };
    });
  const start = positions();
  await page.mouse.move(1180, 700);
  await expect.poll(() => positions()[0].x).not.toBe(start[0].x);
  const end = positions();
  for (const axis of ["x", "y"] as const) {
    const offsets = end.map((position, index) => position[axis] - start[index][axis]);
    expect(offsets[0]).toBeLessThan(0);
    expect(offsets.at(-1)).toBeGreaterThan(0);
    expect(offsets.at(-1)!).toBeLessThan(Math.abs(offsets[0]));
    for (let index = 1; index < offsets.length; index++) {
      expect(offsets[index]).toBeGreaterThan(offsets[index - 1]);
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(positions).toEqual(start);
});

test("a campaign can be created, left, and reopened", async ({ page }) => {
  await createCampaign(page);
  await expect(page.locator('[aria-label="Scene: The Opening Scene"]')).toBeVisible();
  await expect(page.locator('[aria-label="Scene: The Opening Scene"]')).toHaveAttribute(
    "aria-label",
    "Scene: The Opening Scene",
  );

  await page.getByRole("button", { name: "Campaign Menu" }).click();
  await page.getByRole("menuitem", { name: "Back to Campaigns" }).click();
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
  // Hold each transition's outgoing snapshot so the test can see it fading.
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

  for (const interaction of ["pointer", "keyboard", "reduced-motion"] as const) {
    await page.emulateMedia({
      reducedMotion: interaction === "reduced-motion" ? "reduce" : "no-preference",
    });
    await page.getByRole("button", { name: "Campaign Menu" }).click();
    const item = page.getByRole("menuitemcheckbox").first();
    if (interaction === "keyboard") await item.focus();
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
  await page.getByRole("button", { name: "Campaign Menu" }).click();
  await page.getByRole("menuitem", { name: "Back to Campaigns" }).click();
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
  await expect(page.getByRole("dialog", { name: "Delete Campaign?" })).toBeVisible();
});

test("campaign deletion is available from the right-click menu and confirms", async ({ page }) => {
  await createCampaign(page, "Delete menu test");
  await page.getByRole("button", { name: "Campaign Menu" }).click();
  await page.getByRole("menuitem", { name: "Back to Campaigns" }).click();

  const campaign = page.getByRole("button", { name: /^Delete menu test/ });
  await expect(campaign).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Delete menu test" })).toHaveCount(0);
  await campaign.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete…" }).click();

  const confirmation = page.getByRole("dialog", { name: "Delete Campaign?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toBeHidden();

  await campaign.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await page
    .getByRole("dialog", { name: "Delete Campaign?" })
    .getByRole("button", { name: "Delete from This Device" })
    .click();
  await expect(campaign).toHaveCount(0);
});

test("opening an invite link presents a join modal, not a lobby section", async ({ page }) => {
  await page.goto("/#join=abc.1234567890abcdef");
  await settled(page);

  const invitation = page.getByRole("dialog", { name: "Join a Campaign" });
  await expect(invitation).toBeVisible();
  await expect(invitation.getByLabel("Your name")).toBeFocused();
  await expect(page.locator(".lobby-join")).toHaveCount(0);
});

test("the campaign menu ticks only the panels the table has", async ({ page }) => {
  await createCampaign(page, "Panel ticks");
  await settled(page);
  const menu = page.getByRole("button", { name: "Campaign Menu" });
  const chat = page.getByRole("menuitemcheckbox", { name: "Chat" });

  await menu.click();
  await expect(chat).toHaveAttribute("aria-checked", "true");
  await chat.click();
  await expect(page.getByRole("tab", { name: /^Chat/ })).toHaveCount(0);

  await menu.click();
  await expect(chat).toHaveAttribute("aria-checked", "false");
  await chat.click();
  await expect(page.getByRole("tab", { name: /^Chat/ })).toHaveCount(1);

  await menu.click();
  await expect(chat).toHaveAttribute("aria-checked", "true");
});
