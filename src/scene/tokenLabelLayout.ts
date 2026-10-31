export interface LabelBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TokenLabelPlan {
  id: string;
  bars: LabelBox | null;
  wideBars: LabelBox | null;
  name: LabelBox | null;
  small: boolean;
}

export function resolveTokenLabelLayout(
  plans: TokenLabelPlan[],
  hover: string | null,
) {
  const overlaps = (a: LabelBox, b: LabelBox) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const shown = plans.filter((plan) => !plan.small);
  const wide = new Set(
    shown
      .filter(
        (plan) =>
          plan.wideBars &&
          !shown.some(
            (other) =>
              other !== plan &&
              other.wideBars &&
              overlaps(plan.wideBars!, other.wideBars),
          ),
      )
      .map((plan) => plan.id),
  );
  const bars = new Map(
    plans.map((plan) => [
      plan.id,
      wide.has(plan.id) ? plan.wideBars : plan.bars,
    ]),
  );
  const showBars = new Set<string>();
  const showName = new Set<string>();

  for (const plan of shown) {
    const box = bars.get(plan.id);
    if (
      box &&
      !shown.some(
        (other) =>
          other !== plan &&
          bars.get(other.id) &&
          overlaps(box, bars.get(other.id)!),
      )
    )
      showBars.add(plan.id);
  }
  for (const plan of shown) {
    if (!plan.name) continue;
    const clash = shown.some(
      (other) =>
        other !== plan &&
        ((other.name && overlaps(plan.name!, other.name)) ||
          (bars.get(other.id) &&
            showBars.has(other.id) &&
            overlaps(plan.name!, bars.get(other.id)!))),
    );
    if (!clash) showName.add(plan.id);
  }
  if (hover) {
    showBars.add(hover);
    showName.add(hover);
  }
  return { bars, showBars, showName };
}
