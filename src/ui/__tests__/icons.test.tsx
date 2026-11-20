import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { IconLock } from "../icons";

describe("an interface icon", () => {
  const markup = renderToStaticMarkup(<IconLock size={20} className="extra" />);

  it("is a decorative SVG drawn on a 24-unit grid at the requested size", () => {
    expect(markup).toMatch(/^<svg /);
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('width="20"');
    expect(markup).toContain('height="20"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('class="extra"');
  });

  it("takes its single colour from the text around it", () => {
    expect(markup).toContain('fill="currentColor"');
    expect(markup).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
