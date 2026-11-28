import { expect, test } from "./browser-test";
import { createCampaign, openCharacters, settled } from "./e2e-helpers";

test("a player can send a chat message", async ({ page }) => {
  await createCampaign(page);
  const message = page.getByRole("textbox", { name: "Message" });
  await message.fill("The guards retreat.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("The guards retreat.", { exact: true })).toBeVisible();
  await expect(message).toBeEmpty();
});

for (const width of [1280, 390]) {
  test(`a quick die is one canvas, carried in from the pointer, rolled from its slot into chat at ${width}px`, async ({
    page,
  }) => {
    await createCampaign(page);
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(() => window.innerWidth === width);
    const chat = page.getByRole("tab", { name: "Chat", exact: true });
    if ((await chat.getAttribute("aria-selected")) !== "true") await chat.click();
    await expect(page.getByRole("button", { name: "d6", exact: true })).toBeInViewport();
    await settled(page);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await page.waitForFunction(() => {
      const done = [...document.querySelectorAll(".sidebar")].every((el) =>
        el.getAnimations().every((a) => a.playState === "finished"),
      );
      if (!done) return false;
      const el = [...document.querySelectorAll("button")].find((b) => b.textContent === "d6");
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.width > 0 && r.right <= window.innerWidth && (hit === el || el.contains(hit));
    });
    const button = await page.getByRole("button", { name: "d6", exact: true }).boundingBox();
    if (!button) throw new Error("Quick die button was not mounted.");
    const pointer = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
    type Point = { x: number; y: number };
    const observed = page.evaluate(
      () =>
        new Promise<{
          lifts: { at: Point; slot: Point }[];
          lowers: { at: Point; slot: Point }[];
          sameCanvas: boolean;
          gaps: number;
          doubles: number;
          restingSizes: number[];
          colourful: boolean;
        }>((resolve) => {
          const centre = (element: Element): Point => {
            const box = element.getBoundingClientRect();
            return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
          };
          /** Whether a canvas has anything drawn in it. */
          const drawn = (canvas: HTMLCanvasElement) =>
            canvas
              .getContext("2d")!
              .getImageData(0, 0, canvas.width, canvas.height)
              .data.some((value, index) => index % 4 === 3 && value > 0);
          /** Whether the opaque pixels are, on the whole, a colour rather than grey. */
          const coloured = (canvas: HTMLCanvasElement) => {
            const data = canvas
              .getContext("2d")!
              .getImageData(0, 0, canvas.width, canvas.height).data;
            let spread = 0;
            let count = 0;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i + 3]! < 250) continue;
              spread +=
                Math.max(data[i]!, data[i + 1]!, data[i + 2]!) -
                Math.min(data[i]!, data[i + 1]!, data[i + 2]!);
              count++;
            }
            return count > 0 && spread / count > 30;
          };
          const lifts: { at: Point; slot: Point }[] = [];
          const lowers: { at: Point; slot: Point }[] = [];
          const restingSizes: number[] = [];
          let original: HTMLCanvasElement | null = null;
          let sameCanvas = true;
          /** Where a lifted canvas is carried to, from the transform the die sets on it. */
          const carriedTo = (transform: string): Point | undefined => {
            const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(transform);
            return match ? { x: Number(match[1]) + 32, y: Number(match[2]) + 32 } : undefined;
          };
          // Read in step with the die: as it moves its canvas, not a frame later.
          let watched: HTMLCanvasElement | null = null;
          let last: Point | undefined;
          const moves = new MutationObserver(() => {
            const at = carriedTo(watched!.style.transform);
            const slot = centre(watched!.parentElement!);
            if (at && !last) lifts.push({ at, slot });
            if (!at && last) lowers.push({ at: last, slot });
            last = at;
          });
          let started = false;
          let gaps = 0;
          let doubles = 0;
          let colourful = false;
          const deadline = performance.now() + 20000;
          const sample = () => {
            const canvas = document.querySelector<HTMLCanvasElement>(".pending-die canvas");
            if (canvas) {
              original ??= canvas;
              sameCanvas &&= original === canvas;
              if (!watched) {
                watched = canvas;
                moves.observe(canvas, { attributes: true, attributeFilter: ["style"] });
              }
              const lifted = canvas.matches(":popover-open");
              if (!lifted && drawn(canvas)) restingSizes.push(canvas.getBoundingClientRect().width);
              if (lifted && drawn(canvas)) colourful ||= coloured(canvas);
            }
            const visible = [...document.querySelectorAll<HTMLCanvasElement>(".die-canvas")].filter(
              (die) => die.checkVisibility({ visibilityProperty: true }) && drawn(die),
            );
            started ||= visible.length > 0;
            if (started && visible.length === 0) gaps++;
            if (visible.length > 1) doubles++;
            const posted = document.querySelector(
              ".chat-log .roll-card:not([data-quick-roll-active])",
            );
            if ((original && !canvas && posted) || performance.now() > deadline) {
              moves.disconnect();
              resolve({ lifts, lowers, sameCanvas, gaps, doubles, restingSizes, colourful });
            } else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }),
    );
    await page.mouse.click(pointer.x, pointer.y);
    const result = await observed;
    const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 2;
    expect(result.sameCanvas).toBe(true);
    // Carried in from the pointer, then rolled from where it lay in its slot.
    expect(result.lifts).toHaveLength(2);
    expect(near(result.lifts[0]!.at, pointer)).toBe(true);
    expect(near(result.lifts[1]!.at, result.lifts[1]!.slot)).toBe(true);
    // Each time, it comes down in its slot, wherever the slot has moved to.
    expect(result.lowers).toHaveLength(2);
    for (const { at, slot } of result.lowers) expect(near(at, slot)).toBe(true);
    // Drawn in the roller's colour as it moves, and the size of its slot at rest.
    expect(result.colourful).toBe(true);
    expect(result.restingSizes.length).toBeGreaterThan(0);
    expect(result.restingSizes.every((size) => Math.abs(size - 64) < 0.5)).toBe(true);
    // Never missing, nor shown twice, from the moment it appears.
    expect(result.gaps).toBe(0);
    expect(result.doubles).toBe(0);
    await expect(page.locator(".pending-roll")).toHaveCount(0);
    await expect(page.locator(".chat-log .roll-card .die")).toHaveCount(1);
  }, 30000);
}

test("quick dice peek out before rolling into chat", async ({ page }) => {
  await createCampaign(page);
  await page.getByRole("button", { name: "d6", exact: true }).click();
  await expect(page.locator(".pending-die canvas")).toHaveCount(1);
  await expect(page.locator('.pending-die[data-phase="moving"]')).toHaveCount(1);
  await page.evaluate(() => {
    const canvas = document.querySelector(".pending-die canvas");
    if (!canvas) throw new Error("Pending die canvas was not mounted.");
    (window as Window & { pendingDieCanvas?: Element }).pendingDieCanvas = canvas;
  });
  await page.evaluate(() =>
    (() => {
      const card = document.querySelector<HTMLElement>(".pending-roll");
      if (!card) throw new Error("Pending roll card was not mounted.");
      card.dataset.testIdentity = "stable";
      card.dataset.testStartTop = String(card.getBoundingClientRect().top);
    })(),
  );
  await page.evaluate(() => {
    const d8 = [...document.querySelectorAll<HTMLButtonElement>(".dice-pick")].find(
      (button) => button.textContent?.trim() === "d8",
    );
    d8?.click();
  });
  await page.evaluate(() => {
    const d8 = [...document.querySelectorAll<HTMLButtonElement>(".dice-pick")].find(
      (button) => button.textContent?.trim() === "d8",
    );
    d8?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
    );
  });

  expect(await page.locator(".pending-roll").count()).toBe(1);
  expect(await page.locator('.pending-roll[data-test-identity="stable"]').count()).toBe(1);
  expect(await page.locator(".pending-roll .pending-die").count()).toBe(1);
  expect(await page.locator(".dice-pool-progress").count()).toBe(1);
  expect(await page.locator(".pending-roll-now").count()).toBe(0);
  await expect(page.locator(".pending-roll .roll-formula")).toHaveText("1d6");
  await expect(page.getByRole("button", { name: "Public", exact: true })).toBeVisible();
  await expect(page.locator('.pending-die[data-phase="moving"]')).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { pendingDieCanvas?: Element }).pendingDieCanvas ===
        document.querySelector(".pending-die canvas"),
    ),
  ).toBe(true);
  await expect(page.locator(".chat-log .roll-card[data-quick-roll]")).toHaveCount(1);
  await expect(page.locator('.pending-roll[data-in-feed="true"]')).toHaveCount(1);
  const offsets = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".pending-roll");
    const message = document.querySelector<HTMLElement>(".chat-log .roll-card[data-quick-roll]");
    if (!card || !message) return null;
    const cardRect = card.getBoundingClientRect();
    const messageRect = message.getBoundingClientRect();
    return {
      x: cardRect.left - messageRect.left,
      y: cardRect.top - messageRect.top,
      startTop: Number(card.dataset.testStartTop),
      currentTop: cardRect.top,
    };
  });
  expect(offsets).not.toBeNull();
  if (!offsets) throw new Error("Quick-roll card disappeared before handoff.");
  expect(Math.abs(offsets.x)).toBeLessThan(2);
  expect(Math.abs(offsets.y)).toBeLessThan(2);
  expect(offsets.startTop).toBeGreaterThan(offsets.currentTop);
  await expect(page.locator(".chat-log .roll-card")).toHaveCount(1);
  await expect(page.locator(".chat-log .roll-card")).toContainText("1d6");
  expect(await page.locator('.chat-log .roll-card .die[data-phase="moving"]').count()).toBe(0);
  await expect(page.locator(".pending-roll")).toHaveCount(0);
  await page.getByRole("button", { name: "d8", exact: true }).click();
  await expect(page.locator(".chat-log .roll-card")).toHaveCount(2);
  await expect(page.locator('.pending-roll[data-in-feed="true"]')).toHaveCount(1);
  const appended = await page.evaluate(() => {
    const pending = document.querySelector(".pending-roll")!.getBoundingClientRect();
    const cards = [...document.querySelectorAll(".chat-log .roll-card")];
    const first = cards[0]!.getBoundingClientRect();
    const last = cards.at(-1)!.getBoundingClientRect();
    return {
      offset: Math.hypot(pending.left - last.left, pending.top - last.top),
      firstTop: first.top,
      lastTop: last.top,
    };
  });
  expect(appended.offset).toBeLessThan(2);
  expect(appended.lastTop).toBeGreaterThan(appended.firstTop);
  await expect(page.locator(".pending-roll")).toHaveCount(0);
  await expect(page.locator(".chat-log .roll-card").last()).toContainText("1d8");
}, 30000);

test("using a move asks for its stat and posts the result to chat", async ({ page }) => {
  await createCampaign(page, "Move flow", "dungeon-world");
  await openCharacters(page);
  await page.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await page.getByRole("button", { name: /^Class:/ }).click();
  await page
    .getByRole("dialog", { name: "Class" })
    .getByRole("option", { name: "The Fighter" })
    .click();
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await page.getByRole("radio", { name: "Basic" }).click();
  await page.getByRole("button", { name: "Roll: Defy Danger" }).click();
  const prompt = page.getByRole("dialog", { name: "Defy Danger (Ayla)" });
  await prompt
    .getByRole("radiogroup", { name: "Stat to roll" })
    .getByRole("radio", { name: "STR" })
    .click();
  await prompt.getByRole("button", { name: "Roll", exact: true }).click();

  await expect(page.getByRole("log").getByText(/Defy Danger.*Ayla/)).toBeVisible();
});

test("dice still settling stay on a roll card that's picked up, and land in it when it's put back", async ({
  page,
}) => {
  await createCampaign(page);
  await page.getByRole("textbox", { name: "Message" }).fill("/roll 3d6");
  await page.keyboard.press("Enter");
  const card = page.locator(".chat-log .roll-card").last();
  await expect(card).toBeVisible();
  // While the dice still roll, the card is picked up by its heading and held off to one side,
  // short of a throw, then put back. (Dispatched in the page: the harness's mouse loses pointer capture.)
  const held = await card.evaluate(async (element) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 900));
    const head = element.querySelector(".roll-head")!.getBoundingClientRect();
    const grip = { x: head.left + head.width / 2, y: head.top + head.height / 2 };
    const pointer = (type: string, x: number, y: number) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    pointer("pointerdown", grip.x, grip.y);
    for (let step = 1; step <= 4; step++) {
      pointer("pointermove", grip.x - 15 * step, grip.y - 10 * step);
      await frame();
    }
    const carrier = document.querySelector(".throw-carrier")!.getBoundingClientRect();
    let moving = 0;
    let offCopy = 0;
    const until = performance.now() + 500;
    while (performance.now() < until) {
      await frame();
      for (const canvas of document.querySelectorAll(".die-canvas:popover-open")) {
        const box = canvas.getBoundingClientRect();
        const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
        moving++;
        if (x < carrier.left || x > carrier.right || y < carrier.top || y > carrier.bottom)
          offCopy++;
      }
    }
    pointer("pointermove", grip.x, grip.y);
    pointer("pointerup", grip.x, grip.y);
    return { moving, offCopy };
  });
  expect(held.moving).toBeGreaterThan(0);
  expect(held.offCopy).toBe(0);
  await expect(card.locator('.die[data-phase="landed"]')).toHaveCount(3);
  const offsets = await card.evaluate((element) =>
    [...element.querySelectorAll(".die")].map((die) => {
      const slot = die.getBoundingClientRect();
      const canvas = die.querySelector("canvas")!.getBoundingClientRect();
      return Math.hypot(slot.left - canvas.left, slot.top - canvas.top);
    }),
  );
  expect(offsets.every((offset) => offset < 1)).toBe(true);
}, 30000);
