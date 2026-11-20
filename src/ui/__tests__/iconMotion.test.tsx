import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { IconLock } from "../icons";
import "../iconMotion";

function mount(html: string) {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const icon = renderToStaticMarkup(<IconLock />);

describe("icon motion", () => {
  afterEach(() => document.body.replaceChildren());

  it("names each icon, so its animation can find it", () => {
    expect(icon).toContain('data-icon="lock"');
  });

  it("plays the icon's animation when its button is clicked", () => {
    const host = mount(`<button type="button">${icon} Lock</button>`);
    host.querySelector("button")!.click();
    expect(host.querySelector("svg")!.hasAttribute("data-playing")).toBe(true);
  });

  it("plays when the click lands on the icon itself", () => {
    const host = mount(`<button type="button">${icon}</button>`);
    host.querySelector("svg")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(host.querySelector("svg")!.hasAttribute("data-playing")).toBe(true);
  });

  it("stays still on a disabled button, or where the icon is only decoration", () => {
    const host = mount(`<button type="button" disabled>${icon}</button><p>${icon}</p>`);
    host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    host.querySelector("p")!.click();
    for (const svg of host.querySelectorAll("svg"))
      expect(svg.hasAttribute("data-playing")).toBe(false);
  });
});
