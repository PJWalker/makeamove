import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { IconDraw, IconLock } from "../icons";

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
    expect(markup).not.toMatch(/#[\da-f]{3,6}/i);
  });

  it("paints that colour once through its shapes, so where they overlap a translucent colour doesn't double up", () => {
    const id = (/<mask id="([^"]+)"/.exec(markup))?.[1];
    expect(id).toBeTruthy();
    expect(markup.match(/fill="currentColor"[^>]*mask="url\(#[^"]+\)"/g)).toHaveLength(1);
    expect(markup).toContain(`mask="url(#${id})"`);
  });

  it("gives each icon on the page its own mask", () => {
    const pair = renderToStaticMarkup(
      <>
        <IconLock />
        <IconLock />
      </>,
    );
    const ids = [...pair.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
  });

  it("gives each icon's gradients ids of their own, and fills from them", () => {
    const pair = renderToStaticMarkup(
      <>
        <IconDraw />
        <IconDraw />
      </>,
    );
    const ids = [...pair.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(pair).toContain(`fill="url(#${id})"`);
  });
});
