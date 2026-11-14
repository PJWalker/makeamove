import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { CaveBackdrop } from "../CaveBackdrop";
import { paintRock, VIEW } from "../caveRock";

const count = (markup: string, className: string) =>
  markup.match(new RegExp(`class="(?:[^"]* )?${className}(?: [^"]*)?"`, "g"))?.length ?? 0;

describe("the lobby's cave backdrop", () => {
  const markup = renderToStaticMarkup(<CaveBackdrop />);

  it("is decoration, hidden from assistive technology", () => {
    expect(markup).toMatch(/^<div class="cave-backdrop" aria-hidden="true"/);
  });

  it("is drawn in SVG rather than on a canvas", () => {
    expect(markup).toContain("<svg");
    expect(markup).not.toContain("<canvas");
  });

  it("shows a party of four with two torches and the wizard's wisp", () => {
    expect(count(markup, "cave-adventurer")).toBe(4);
    expect(count(markup, "cave-flame")).toBe(2);
    expect(count(markup, "cave-wisp")).toBe(1);
  });

  it("draws the same picture every time", () => {
    expect(renderToStaticMarkup(<CaveBackdrop />)).toBe(markup);
  });
});

describe("the cave's painted rock", () => {
  const rock = paintRock();

  it("daubs the walls and the floor", () => {
    expect(rock.daubs.length).toBeGreaterThan(200);
  });

  it("leaves the top and centre dark for the interface", () => {
    const inInterface = ({ x, y }: { x: number; y: number }) =>
      x > 600 && x < VIEW.width - 600 && y > 100 && y < 540;
    expect(rock.daubs.flatMap((daub) => daub.points).filter(inInterface)).toEqual([]);
  });
});
