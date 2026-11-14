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
  test(`quick dice enter once from the pointer and roll from their existing tray slot at ${width}px`, async ({
    page,
  }) => {
    await createCampaign(page);
    await page.setViewportSize({ width, height: 844 });
    const chat = page.getByRole("tab", { name: "Chat", exact: true });
    if ((await chat.getAttribute("aria-selected")) !== "true") await chat.click();
    await expect(page.getByRole("button", { name: "d6", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "d6", exact: true })).toBeInViewport();
    await settled(page);
    const button = await page.getByRole("button", { name: "d6", exact: true }).boundingBox();
    if (!button) throw new Error("Quick die button was not mounted.");
    const pointer = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
    const observed = page.evaluate(
      () =>
        new Promise<{
          flights: { x: number; y: number; slotX: number; slotY: number }[];
          maxVisible: number;
          sameCanvas: boolean;
          drawn: boolean;
          entryFinishedBeforePosting: boolean;
        }>((resolve) => {
          const flights: { x: number; y: number; slotX: number; slotY: number }[] = [];
          let maxVisible = 0;
          let original: Element | null = null;
          let sameCanvas = true;
          let drawn = true;
          let entryFinishedBeforePosting = true;
          const deadline = performance.now() + 20000;
          const observer = new MutationObserver((records) => {
            for (const record of records) {
              for (const node of record.addedNodes) {
                if (!(node instanceof HTMLCanvasElement) || !node.matches(".dice-flight")) continue;
                const flight = node.getBoundingClientRect();
                const slot = document.querySelector(".pending-die")?.getBoundingClientRect();
                if (!slot) continue;
                flights.push({
                  x: flight.left + flight.width / 2,
                  y: flight.top + flight.height / 2,
                  slotX: slot.left + slot.width / 2,
                  slotY: slot.top + slot.height / 2,
                });
              }
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
          const sample = () => {
            const canvas = document.querySelector(".pending-die canvas");
            if (canvas) {
              original ??= canvas;
              sameCanvas &&= original === canvas;
            }
            const visible = [
              ...document.querySelectorAll<HTMLCanvasElement>(
                ".pending-die canvas, .dice-flight, .chat-log .die canvas",
              ),
            ].filter(
              (die) => getComputedStyle(die).visibility === "visible" && die.checkVisibility(),
            );
            maxVisible = Math.max(maxVisible, visible.length);
            drawn &&= visible.every((die) => {
              const pixels = die.getContext("2d")!.getImageData(0, 0, die.width, die.height).data;
              return pixels.some((value, index) => index % 4 === 3 && value > 0);
            });
            const posted = document.querySelector(".chat-log .roll-card");
            const flying = document.querySelector(".dice-flight");
            if (posted && flying && flights.length === 1) entryFinishedBeforePosting = false;
            if ((original && !canvas && posted && !flying) || performance.now() > deadline) {
              observer.disconnect();
              resolve({ flights, maxVisible, sameCanvas, drawn, entryFinishedBeforePosting });
            } else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }),
    );
    await page.mouse.click(pointer.x, pointer.y);
    const result = await observed;
    expect(result.sameCanvas).toBe(true);
    expect(result.drawn).toBe(true);
    expect(result.entryFinishedBeforePosting).toBe(true);
    expect(result.maxVisible).toBe(1);
    expect(result.flights).toHaveLength(2);
    const [entry, release] = result.flights;
    expect(Math.hypot(entry!.x - pointer.x, entry!.y - pointer.y)).toBeLessThan(2);
    expect(Math.hypot(release!.x - release!.slotX, release!.y - release!.slotY)).toBeLessThan(2);
    await expect(page.locator(".pending-roll")).toHaveCount(0);
    await expect(page.locator(".chat-log .roll-card .die")).toHaveCount(1);
  }, 30000);
}

test("quick dice peek out before rolling into chat", async ({ page }) => {
  await createCampaign(page);
  await page.getByRole("button", { name: "d6", exact: true }).click();
  await expect(page.locator(".pending-die canvas")).toHaveCount(1);
  await expect(page.locator('.pending-die[data-phase="flying"]')).toHaveCount(1);
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
  await expect(page.locator('.pending-die[data-phase="flying"]')).toHaveCount(1);
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
  expect(await page.locator('.chat-log .roll-card .die[data-phase="flying"]').count()).toBe(0);
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
