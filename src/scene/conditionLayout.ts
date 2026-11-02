import type { Rect } from "./camera";

export interface ConditionLayoutInput {
  x: number;
  y: number;
  tokenWidth: number;
  radius: number;
  labels: { w: number; h: number }[];
  viewport: Rect;
  obstacles: Rect[];
}

export const conditionContains = (box: Rect, x: number, y: number) =>
  x >= box.x - 4 &&
  x <= box.x + box.w + 4 &&
  y >= box.y - 4 &&
  y <= box.y + box.h + 4;

const overlaps = (first: Rect, second: Rect) =>
  first.x < second.x + second.w + 6 &&
  first.x + first.w + 6 > second.x &&
  first.y < second.y + second.h + 6 &&
  first.y + first.h + 6 > second.y;

export function conditionLayout(input: ConditionLayoutInput) {
  const { x, y, tokenWidth, radius, labels, viewport, obstacles } = input;
  const gap = 4;
  const diameter = radius * 2;
  const span = labels.length * (diameter + 2) - 2;
  const collapsed = labels.map((_, index) => ({
    x: x - span / 2 + index * (diameter + 2),
    y: y - radius,
    w: diameter,
    h: diameter,
  }));
  const rowWidth =
    labels.reduce((total, label) => total + label.w, 0) +
    gap * Math.max(0, labels.length - 1);
  const height = Math.max(0, ...labels.map((label) => label.h));
  const row: Rect = {
    x: x - rowWidth / 2,
    y: y - height / 2,
    w: rowWidth,
    h: height,
  };
  const inline =
    rowWidth + 16 <= tokenWidth &&
    row.x >= viewport.x &&
    row.x + row.w <= viewport.x + viewport.w &&
    row.y >= viewport.y &&
    row.y + row.h <= viewport.y + viewport.h &&
    !obstacles.some((obstacle) => overlaps(row, obstacle));
  let left = row.x;
  const horizontal = labels.map((label) => {
    const box = { x: left, y: row.y, w: label.w, h: height };
    left += label.w + gap;
    return box;
  });
  const width = Math.min(
    viewport.w,
    Math.max(0, ...labels.map((label) => label.w)),
  );
  const listHeight =
    labels.reduce((total, label) => total + label.h, 0) +
    gap * Math.max(0, labels.length - 1);
  const upward = y + radius - listHeight;
  let top =
    upward >= viewport.y
      ? upward
      : Math.max(
          viewport.y,
          Math.min(y - radius, viewport.y + viewport.h - listHeight),
        );
  const listLeft = Math.max(
    viewport.x,
    Math.min(x - width / 2, viewport.x + viewport.w - width),
  );
  const vertical = labels.map((label) => {
    const box = { x: listLeft, y: top, w: width, h: label.h };
    top += label.h + gap;
    return box;
  });
  return { collapsed, horizontal, vertical, inline };
}

export function hoverSpring(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return (
    1 -
    Math.exp(-7 * progress) *
      (Math.cos(10 * progress) + 0.7 * Math.sin(10 * progress))
  );
}
