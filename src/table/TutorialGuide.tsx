import { useEffect } from "react";
import { goalMet, rebase } from "../tutorial/goals";
import type { World } from "../tutorial/goals";
import { STEPS } from "../tutorial/steps";
import type { Anchor, Step } from "../tutorial/steps";
import type { TutorialProgress } from "../tutorial/progress";
import { watchWorld } from "../tutorial/watch";
import { Button } from "../ui/Button";
import { IconClose } from "../ui/icons";
import { withTransition } from "../ui/transition";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "../workspace/campaignContext";
import type { CampaignContext } from "../workspace/campaignContext";
import { TOOLS } from "../workspace/tools";

/** Where in the page each kind of anchor is. */
function anchorSelector(anchor: Anchor): string {
  if ("tool" in anchor) return `.toolbar [data-tool="${anchor.tool}"]`;
  if ("panel" in anchor) return `.rail-tab[data-panel="${anchor.panel}"]`;
  return `[data-tutorial="${anchor.ui}"]`;
}

/** How often to look again for what a step points at, as panels open and close. */
const HIGHLIGHT_MS = 400;

/** Mark the first of a step's anchors that's showing, so it glows until the step is done. */
function useHighlight(anchors: Step["anchors"]) {
  useEffect(() => {
    let marked: Element | null = null;
    const mark = () => {
      const found =
        (anchors ?? []).map((a) => document.querySelector(anchorSelector(a))).find(Boolean) ?? null;
      if (found === marked) return;
      marked?.removeAttribute("data-tutorial-target");
      found?.setAttribute("data-tutorial-target", "");
      marked = found;
    };
    mark();
    const timer = setInterval(mark, HIGHLIGHT_MS);
    return () => {
      clearInterval(timer);
      marked?.removeAttribute("data-tutorial-target");
    };
  }, [anchors]);
}

/** Go to step `to`, or end the tutorial past the last one. */
function goTo(context: CampaignContext, progress: TutorialProgress, to: number) {
  const next = STEPS[to];
  void withTransition(() => {
    context.tutorial.set(next ? { ...progress, step: next.id } : null);
  });
}

/** The tutorial's guide, in a tutorial campaign: the step to try, which moves on once it's done. */
export function TutorialGuide() {
  const context = useCampaign();
  const progress = useQuery(context.tutorial);
  return progress ? <Guide context={context} progress={progress} /> : null;
}

function Guide({ context, progress }: { context: CampaignContext; progress: TutorialProgress }) {
  const index = Math.max(
    0,
    STEPS.findIndex((s) => s.id === progress.step),
  );
  const step = STEPS[index]!;
  const last = index === STEPS.length - 1;
  const tool = step.anchors?.flatMap((a) => ("tool" in a ? [a.tool] : []))[0];
  const shortcut = TOOLS.find((t) => t.id === tool);

  useEffect(() => {
    let before: World | null = null;
    let done = false;
    return watchWorld(context, progress, (now) => {
      before = before ? rebase(before, now) : now;
      if (done || !goalMet(step.goal, before, now)) return;
      done = true;
      goTo(context, progress, index + 1);
    });
  }, [context, progress, step, index]);
  useHighlight(step.anchors);

  return (
    <aside className="tutorial-guide panel window" aria-label="Tutorial" aria-live="polite">
      <header className="tutorial-guide-head">
        <span className="eyebrow">
          {step.section} · {index + 1} of {STEPS.length}
        </span>
        <Button
          variant="icon"
          label="End Tutorial"
          onClick={() => {
            goTo(context, progress, STEPS.length);
          }}
        >
          <IconClose />
        </Button>
      </header>
      <div className="tutorial-guide-step" key={step.id}>
        <h2 className="tutorial-guide-title">{step.title}</h2>
        <p className="tutorial-guide-text">{step.text}</p>
        {shortcut && (
          <p className="tutorial-guide-shortcut">
            {shortcut.label} <kbd>{shortcut.key}</kbd>
          </p>
        )}
      </div>
      <div className="tutorial-guide-actions">
        <progress max={STEPS.length} value={index} aria-label="Tutorial progress" />
        {step.goal.kind === "read" ? (
          <Button
            variant="primary"
            onClick={() => {
              goTo(context, progress, index + 1);
            }}
          >
            {last ? "Finish" : "Next"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => {
              goTo(context, progress, index + 1);
            }}
          >
            Skip
          </Button>
        )}
      </div>
    </aside>
  );
}
