import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { art } from "../iconArt";

const IconLock = art("lock");

describe("a rendered icon", () => {
  const markup = renderToStaticMarkup(<IconLock size={20} className="extra" />).match(
    /<img [^>]*>/,
  )?.[0];

  it("is a decorative image at the requested size", () => {
    expect(markup).toBeDefined();
    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('width="20"');
    expect(markup).toContain('height="20"');
    expect(markup).toMatch(/class="icon-art extra"/);
  });

  it("offers its 32px render, and its 64px render for high-density screens", () => {
    expect(markup).toMatch(/src="[^"]*lock-32\.png"/);
    expect(markup).toMatch(/srcSet="[^"]*lock-64\.png 2x"/);
  });
});
