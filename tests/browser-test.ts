import "@vitest/browser/matchers";
import {
  cdp,
  page as browserPage,
  userEvent,
  type Locator as BrowserLocator,
  type UserEventClickOptions,
} from "@vitest/browser/context";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect as vitestExpect, test as vitestTest } from "vitest";
import { App } from "../src/app/App";
import { pendingInvite, routeCampaignId } from "../src/navigation/router";
import { closeCampaign } from "../src/campaign/campaign";
import { recentActions } from "../src/workspace/commands/recent";
import { activeTool } from "../src/scene/tools";
import { autohide } from "../src/workspace/canvasState";
import { entityWindows } from "../src/workspace/entityWindows";
import { normalise } from "../src/workspace/layoutModel";
import { openLinks } from "../src/workspace/linkState";
import { layout } from "../src/workspace/panelLayout";
import { libraryView, openedLibraryEntries } from "../src/workspace/libraryView";
import "../src/styles/base.css";
import "../src/styles/tokens.css";
import "../src/styles/components.css";
import "../src/styles/transitions.css";

type RoleOptions = Parameters<BrowserLocator["getByRole"]>[1];
type FindOptions = { exact?: boolean };
type Bounds = { x: number; y: number; width: number; height: number };
type ElementFinder = () => Element[];

const modifiers = { Alt: 1, Control: 2, Meta: 4, Shift: 8 } as const;
let mouseX = 0;
let mouseY = 0;
const pressedButtons = new Set<"left" | "right" | "middle">();
/** The held buttons as the bitmask that pointer events report: left 1, right 2, middle 4. */
const BUTTON_BITS = { left: 1, right: 2, middle: 4 } as const;
const heldButtons = () => [...pressedButtons].reduce((bits, b) => bits | BUTTON_BITS[b], 0);
type TestAppContainer = HTMLDivElement & {
  __vitestAppRoot?: Root;
  __vitestAppReset?: () => void;
};
type BrowserTestWindow = Window & {
  __vitestAppContainer?: TestAppContainer;
};
const testWindow = window as BrowserTestWindow;

async function dispatchKey(key: string) {
  const keys = key.split("+");
  const keyName = keys.pop() ?? key;
  const modifier = keys.reduce(
    (value, name) => value | (modifiers[name as keyof typeof modifiers] ?? 0),
    0,
  );
  await cdp().send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: keyName,
    code: keyName,
    modifiers: modifier,
  });
  await cdp().send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: keyName,
    code: keyName,
    modifiers: modifier,
  });
}

/**
 * Where a point in the app's CSS pixels is in the page CDP dispatches input
 * to: Vitest runs the app in an iframe that it scales to fit its UI.
 */
function toInputPoint(x: number, y: number) {
  const frame = window.frameElement;
  if (!frame) return { x, y };
  const rect = frame.getBoundingClientRect();
  return {
    x: rect.left + (x * rect.width) / innerWidth,
    y: rect.top + (y * rect.height) / innerHeight,
  };
}

async function dispatchMouse(
  type: "mouseMoved" | "mousePressed" | "mouseReleased",
  options: { button?: string; buttons: number; clickCount?: number },
) {
  await cdp().send("Input.dispatchMouseEvent", {
    type,
    ...toInputPoint(mouseX, mouseY),
    ...options,
  });
}

const mouse = {
  async move(x: number, y: number, options?: { steps?: number }) {
    const steps = options?.steps ?? 1;
    const startX = mouseX;
    const startY = mouseY;
    for (let step = 1; step <= steps; step++) {
      mouseX = startX + ((x - startX) * step) / steps;
      mouseY = startY + ((y - startY) * step) / steps;
      await dispatchMouse("mouseMoved", { buttons: heldButtons() });
    }
  },
  async down(options?: { button?: "left" | "right" | "middle"; clickCount?: number }) {
    const button = options?.button ?? "left";
    pressedButtons.add(button);
    await dispatchMouse("mousePressed", {
      button,
      buttons: heldButtons(),
      clickCount: options?.clickCount ?? 1,
    });
  },
  async up(options?: { button?: "left" | "right" | "middle"; clickCount?: number }) {
    const button = options?.button ?? "left";
    pressedButtons.delete(button);
    await dispatchMouse("mouseReleased", {
      button,
      buttons: heldButtons(),
      clickCount: options?.clickCount ?? 1,
    });
  },
  async click(x: number, y: number) {
    await this.move(x, y);
    await this.down();
    await this.up();
  },
  async dblclick(x: number, y: number) {
    await this.click(x, y);
    await this.down({ clickCount: 2 });
    await this.up({ clickCount: 2 });
  },
};

export class Locator {
  constructor(private readonly find: ElementFinder) {}

  getByRole(role: string, options?: RoleOptions) {
    return new Locator(() =>
      this.find().flatMap((element) =>
        browserPage.elementLocator(element).getByRole(role, options).elements(),
      ),
    );
  }

  getByText(text: string | RegExp, options?: FindOptions) {
    return new Locator(() =>
      this.find().flatMap((element) =>
        browserPage.elementLocator(element).getByText(text, options).elements(),
      ),
    );
  }

  getByLabel(text: string | RegExp, options?: FindOptions) {
    return new Locator(() =>
      this.find().flatMap((element) =>
        browserPage.elementLocator(element).getByLabelText(text, options).elements(),
      ),
    );
  }

  getByPlaceholder(text: string | RegExp, options?: FindOptions) {
    return new Locator(() =>
      this.find().flatMap((element) =>
        browserPage.elementLocator(element).getByPlaceholder(text, options).elements(),
      ),
    );
  }

  locator(selector: string) {
    return new Locator(() =>
      this.find().flatMap((element) => [...element.querySelectorAll(selector)]),
    );
  }

  filter(options: { has?: Locator; hasText?: string | RegExp }) {
    return new Locator(() =>
      this.find().filter((element) => {
        const text = element.textContent ?? "";
        if (options.hasText instanceof RegExp && !options.hasText.test(text)) return false;
        if (typeof options.hasText === "string" && !text.includes(options.hasText)) return false;
        return (
          options.has === undefined || options.has.find().some((child) => element.contains(child))
        );
      }),
    );
  }

  first() {
    return new Locator(() => this.find().slice(0, 1));
  }

  last() {
    return new Locator(() => this.find().slice(-1));
  }

  nth(index: number) {
    return new Locator(() => this.find().slice(index, index + 1));
  }

  element() {
    const element = this.find()[0];
    if (!element) throw new Error("The locator did not match an element.");
    return element;
  }

  private async waitForElement() {
    await vitestExpect.poll(() => this.find().length).toBeGreaterThan(0);
    return this.element();
  }

  async click(options?: UserEventClickOptions) {
    const element = await this.waitForElement();
    const target =
      element instanceof HTMLInputElement &&
      (element.type === "radio" || element.type === "checkbox")
        ? (element.closest("label") ?? element)
        : element;
    await userEvent.click(target, options);
  }

  async dblclick() {
    await userEvent.dblClick(await this.waitForElement());
  }

  async fill(value: string) {
    await userEvent.fill(await this.waitForElement(), value);
  }

  async selectOption(value: string | { label?: string; index?: number } | string[]) {
    const select = (await this.waitForElement()) as HTMLSelectElement;
    const values = Array.isArray(value) ? value : [value];
    const selected = values.map((entry) => {
      if (typeof entry === "string") return entry;
      const option =
        entry.index === undefined
          ? [...select.options].find((item) => item.label === entry.label)
          : select.options[entry.index];
      if (!option) throw new Error("The requested select option was not found.");
      return option.value;
    });
    await userEvent.selectOptions(select, selected);
  }

  async check() {
    const input = (await this.waitForElement()) as HTMLInputElement;
    if (!input.checked) await userEvent.click(input.closest("label") ?? input);
  }

  async focus() {
    (await this.waitForElement()).focus();
  }

  async press(key: string) {
    (await this.waitForElement()).focus();
    await dispatchKey(key);
  }

  async hover() {
    await this.waitForElement();
    const bounds = await this.boundingBox();
    if (!bounds) throw new Error("Cannot hover an element without a bounding box.");
    await mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  }

  async count() {
    return this.find().length;
  }

  async getAttribute(name: string) {
    return this.find()[0]?.getAttribute(name) ?? null;
  }

  async boundingBox(): Promise<Bounds | null> {
    const element = this.find()[0];
    if (!element) return null;
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }

  async evaluate<Result>(callback: (element: Element) => Result) {
    return callback(this.element());
  }

  elements() {
    return this.find();
  }
}

export interface Page {
  locator(selector: string): Locator;
  getByRole(role: string, options?: RoleOptions): Locator;
  getByText(text: string | RegExp, options?: FindOptions): Locator;
  getByLabel(text: string | RegExp, options?: FindOptions): Locator;
  getByPlaceholder(text: string | RegExp, options?: FindOptions): Locator;
  goto(url: string): Promise<void>;
  reload(): Promise<void>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  emulateMedia(options: { reducedMotion?: "reduce" | "no-preference" }): Promise<void>;
  addStyleTag(options: { content: string }): Promise<void>;
  evaluate<Result>(callback: () => Result): Promise<Result>;
  waitForFunction(callback: () => unknown): Promise<void>;
  mouse: typeof mouse;
  keyboard: { press(key: string): Promise<void> };
}

async function mountApp(url = "/") {
  let appContainer = document.getElementById("vitest-app") as TestAppContainer | null;
  if (!appContainer) {
    appContainer = document.createElement("div");
    appContainer.id = "vitest-app";
    document.body.append(appContainer);
  }
  testWindow.__vitestAppContainer = appContainer;
  appContainer.__vitestAppReset?.();
  appContainer.__vitestAppRoot?.unmount();

  // Clear the route first: the hash change below sets it again, for a campaign or an invite.
  pendingInvite.value = null;
  routeCampaignId.value = null;
  const target = new URL(url, location.href);
  history.replaceState(null, "", `${location.pathname}${location.search}${target.hash || "#/"}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));

  const appRoot = createRoot(appContainer);
  appContainer.__vitestAppRoot = appRoot;
  appContainer.__vitestAppReset = () => {
    closeCampaign();
    pendingInvite.value = null;
    routeCampaignId.value = null;
  };
  appRoot.render(createElement(App));
  const isCampaign = /^#\/c\//.test(location.hash);
  await vitestExpect
    .poll(() => Boolean(document.querySelector(isCampaign ? ".table" : ".lobby")))
    .toBe(true);
}

const testPage: Page = {
  locator(selector) {
    return new Locator(() => [...document.querySelectorAll(selector)]);
  },
  getByRole(role, options) {
    return new Locator(() => browserPage.getByRole(role, options).elements());
  },
  getByText(text, options) {
    return new Locator(() => browserPage.getByText(text, options).elements());
  },
  getByLabel(text, options) {
    return new Locator(() => browserPage.getByLabelText(text, options).elements());
  },
  getByPlaceholder(text, options) {
    return new Locator(() => browserPage.getByPlaceholder(text, options).elements());
  },
  async goto(url) {
    await mountApp(url);
  },
  async reload() {
    await mountApp(location.href);
  },
  async setViewportSize({ width, height }) {
    await browserPage.viewport(width, height);
  },
  async emulateMedia({ reducedMotion = "no-preference" }) {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: reducedMotion }],
    });
  },
  async addStyleTag({ content }) {
    const style = document.createElement("style");
    style.dataset.testStyle = "";
    style.textContent = content;
    document.head.append(style);
  },
  async evaluate<Result>(callback: () => Result) {
    return callback();
  },
  async waitForFunction(callback) {
    await vitestExpect.poll(callback).toBeTruthy();
  },
  mouse,
  keyboard: { press: dispatchKey },
};

function locatorAssertion(locator: Locator, negated = false) {
  return new Proxy(
    {},
    {
      get(_target, property: string | symbol) {
        if (property === "not") return locatorAssertion(locator, !negated);
        if (typeof property !== "string") return undefined;
        if (property === "toHaveCount")
          return (count: number) => {
            const assertion = vitestExpect.poll(() => locator.count());
            return negated ? assertion.not.toBe(count) : assertion.toBe(count);
          };
        if (property === "toBeHidden")
          return () => {
            return vitestExpect.poll(() => locator.elements().some(isVisible)).toBe(negated);
          };
        if (property === "toBeInViewport")
          return () =>
            vitestExpect
              .poll(() => {
                const bounds = locator.elements()[0]?.getBoundingClientRect();
                return Boolean(
                  bounds &&
                  bounds.bottom > 0 &&
                  bounds.right > 0 &&
                  bounds.top < window.innerHeight &&
                  bounds.left < window.innerWidth,
                );
              })
              .toBe(!negated);
        if (property === "toBeEmpty")
          return () =>
            vitestExpect
              .poll(() => {
                const element = locator.elements()[0];
                return element && "value" in element
                  ? (element as HTMLInputElement).value === ""
                  : (element?.textContent ?? "") === "";
              })
              .toBe(!negated);
        if (property === "toHaveText")
          return (text: string | RegExp) =>
            vitestExpect
              .poll(() => textMatches(locator.elements()[0]?.textContent ?? "", text, true))
              .toBe(!negated);
        if (property === "toContainText")
          return (text: string | RegExp) =>
            vitestExpect
              .poll(() => textMatches(locator.elements()[0]?.textContent ?? "", text, false))
              .toBe(!negated);
        if (property === "toHaveValue")
          return (value: string | RegExp) =>
            vitestExpect
              .poll(() => {
                const element = locator.elements()[0] as HTMLInputElement | undefined;
                const actual = element?.value ?? "";
                return value instanceof RegExp ? value.test(actual) : actual === value;
              })
              .toBe(!negated);
        if (property === "toBeVisible")
          return () => vitestExpect.poll(() => locator.elements().some(isVisible)).toBe(!negated);
        if (property === "toBeFocused")
          return () =>
            vitestExpect
              .poll(() => document.activeElement === locator.elements()[0])
              .toBe(!negated);
        const matcher = property === "toContainText" ? "toHaveTextContent" : property;
        // Find the element afresh on every try: React may replace it while the assertion waits.
        return async (...args: unknown[]) => {
          let lastError: unknown = new Error("The locator did not match an element.");
          const passes = () => {
            const element = locator.elements()[0];
            if (!element) return false;
            const assertion = negated ? vitestExpect(element).not : vitestExpect(element);
            try {
              (assertion as unknown as Record<string, (...values: unknown[]) => void>)[matcher](
                ...args,
              );
              return true;
            } catch (error) {
              lastError = error;
              return false;
            }
          };
          try {
            await vitestExpect.poll(passes).toBe(true);
          } catch {
            throw lastError;
          }
        };
      },
    },
  );

  function isVisible(element: Element) {
    for (let current: Element | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (
        current.hasAttribute("hidden") ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      )
        return false;
    }
    return true;
  }

  function textMatches(actual: string, expected: string | RegExp, exact: boolean) {
    const text = actual.replace(/\s+/g, " ").trim();
    return expected instanceof RegExp
      ? expected.test(text)
      : exact
        ? text === expected
        : text.includes(expected);
  }
}

export const expect = Object.assign(
  (actual: unknown) =>
    actual instanceof Locator ? locatorAssertion(actual) : vitestExpect(actual),
  vitestExpect,
) as unknown as BrowserExpect;

type BrowserExpect = {
  (actual: Locator): BrowserLocatorAssertion;
  <T>(actual: T): ReturnType<typeof vitestExpect>;
  poll: typeof vitestExpect.poll;
};

interface BrowserLocatorAssertion {
  not: BrowserLocatorAssertion;
  toBeVisible(): Promise<unknown>;
  toBeHidden(): Promise<unknown>;
  toBeInViewport(): Promise<unknown>;
  toBeFocused(): Promise<unknown>;
  toBeDisabled(): Promise<unknown>;
  toBeEnabled(): Promise<unknown>;
  toBeEmpty(): Promise<unknown>;
  toHaveCount(count: number): Promise<unknown>;
  toContainText(text: string | RegExp): Promise<unknown>;
  toHaveText(text: string | RegExp): Promise<unknown>;
  toHaveValue(value: string | RegExp): Promise<unknown>;
  toHaveAttribute(name: string, value?: string | RegExp): Promise<unknown>;
  toHaveClass(...classNames: (string | RegExp)[]): Promise<unknown>;
  toHaveAccessibleName(name: string | RegExp): Promise<unknown>;
}

type BrowserTest = (name: string, callback: (fixtures: { page: Page }) => unknown) => void;

/**
 * Each test file shares one page, so per-device state that the app loaded from
 * localStorage when its modules ran would otherwise carry over from the test
 * before: the panel layout, open windows, autohide and so on. Put it back to
 * what a first visit gets.
 */
const startViewTransition = document.startViewTransition;

function resetDeviceState() {
  // A test may wrap this to hold a transition's animations; don't let that outlive it.
  document.startViewTransition = startViewTransition;
  // Styles a test added (such as slowed-down transitions) are its own.
  for (const style of document.querySelectorAll("style[data-test-style]")) style.remove();
  localStorage.clear();
  sessionStorage.clear();
  layout.value = normalise(null, false);
  entityWindows.value = {};
  openLinks.value = [];
  libraryView.value = { kind: "all", query: "" };
  openedLibraryEntries.value = new Set();
  autohide.value = false;
  activeTool.value = "select";
  recentActions.value = [];
}

export const test = ((name: string, callback: (fixtures: { page: Page }) => unknown) =>
  vitestTest(name, async () => {
    await browserPage.viewport(1280, 800);
    await testPage.emulateMedia({});
    resetDeviceState();
    await mountApp();
    await callback({ page: testPage });
  })) as BrowserTest;
