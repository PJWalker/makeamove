import { lazy, Suspense, useState } from "react";
import { useEffect, useLayoutEffect } from "react";
import { sceneHueFromHex } from "../lib/colour";
import type { Campaign } from "../campaign/campaign";
import { useY } from "../ui/useY";
import { FloatingWindows } from "./FloatingWindows";
import { windowLayer } from "../ui/windows";
import { CampaignDialogHost } from "./CampaignDialogHost";
import { Sidebar } from "./Sidebar";
import { dockInsets, unavailablePanels, windowDragging } from "../workspace/panelLayout";
import { hasCombat } from "../features/combat/api";
import { systemOf } from "../features/characters/api";
import { activeMapColour, autohide, canvasColour, setAutohide } from "../workspace/canvasState";
import { ActionDialogs } from "../workspace/ActionDialogs";
import { ChatPopups } from "./ChatPopups";
import { Hotbar } from "./Hotbar";
import { LinkPopups } from "./LinkPopups";
import { EntityWindowHost } from "../workspace/entityWindows";
import { MovePrompt } from "./MovePrompt";
import { GraphicDialogs } from "../workspace/GraphicDialogs";
import { Palette } from "./Palette";
import { Toolbar } from "./Toolbar";
import { useValue } from "../ui/useValue";

// PixiJS is big; load it only once someone opens a table.
const SceneCanvas = lazy(() => import("./SceneCanvas"));

export function Tabletop({ campaign }: { campaign: Campaign }) {
  const scenes = useY(campaign.scenes, () => campaign.sceneViews());
  // A system without initiative has no turn tracker.
  const combat = useY(campaign.meta, () => hasCombat(campaign));
  // The Reference holds GM guidance, for systems that have it.
  const reference = useY(
    campaign.members,
    () => campaign.isGm() && !!systemOf(campaign).gmReference?.length,
  );
  useLayoutEffect(() => {
    unavailablePanels.value = [
      ...(combat ? [] : (["combat"] as const)),
      ...(reference ? [] : (["reference"] as const)),
    ];
    return () => {
      unavailablePanels.value = [];
    };
  }, [combat, reference]);
  const activeId = useY(campaign.members, () => campaign.activeSceneId());
  const scene = scenes.find((s) => s.id === activeId) ?? scenes[0];

  const mapColour = useValue(activeMapColour);
  const colour = scene ? canvasColour(scene, mapColour) : null;

  // Tint the whole UI from the scene's custom colour, else from the map, else from the canvas.
  const tint = scene?.canvasColour ?? mapColour ?? colour;
  useEffect(() => {
    if (tint)
      document.documentElement.style.setProperty("--scene-hue", String(sceneHueFromHex(tint)));
  }, [tint]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--scene-hue");
    },
    [],
  );

  // Ctrl/Cmd + \ toggles autohide, like hiding the interface in most canvas tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "\\" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAutohide(!autohide.value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hiding = useValue(autohide);
  const dragging = useValue(windowDragging);
  const insets = useValue(dockInsets);
  const edges = useNearEdges(hiding);

  return (
    <div
      className="table"
      data-autohide={hiding}
      // Which edges' chrome autohide is showing; a dragged window needs both sidebars to drop on.
      data-reveal={dragging ? "left right" : edges}
      // How much each side's docked chrome covers, for the bars that sit between them.
      style={{
        "--dock-l": `${insets.left.total}px`,
        "--dock-r": `${insets.right.total}px`,
      }}
      // Pulled-out panels and pop-ups render into this layer (ui/windows.ts).
      ref={(el) => {
        if (el && el.lastChild !== windowLayer) el.appendChild(windowLayer);
      }}
    >
      <div
        className="canvas"
        style={{ "--scene-colour": colour }}
        aria-label={scene ? `Scene: ${scene.name}` : "No scene"}
      >
        <Suspense fallback={null}>
          <SceneCanvas campaign={campaign} sceneId={scene?.id ?? null} />
        </Suspense>
      </div>

      <CampaignDialogHost campaign={campaign} />
      <Toolbar isGm={campaign.isGm()} />
      <Sidebar side="left" campaign={campaign} />
      <Sidebar side="right" campaign={campaign} />
      <FloatingWindows campaign={campaign} />
      <EntityWindowHost campaign={campaign} />
      <Hotbar campaign={campaign} />
      <Palette campaign={campaign} />
      <MovePrompt campaign={campaign} />
      <GraphicDialogs campaign={campaign} />
      <LinkPopups campaign={campaign} />
      <ActionDialogs campaign={campaign} />
      <ChatPopups campaign={campaign} />
    </div>
  );
}

/** How close to an edge of the window the pointer must come to show that edge's chrome. */
const EDGE_ZONE = 24;

/** The chrome each edge reveals, which then stays while the pointer is over it. */
const EDGE_CHROME = {
  left: '.sidebar[data-side="left"]',
  right: '.sidebar[data-side="right"]',
  top: ".toolbar, .pen-options",
  bottom: ".hotbar",
} as const;
type Edge = keyof typeof EDGE_CHROME;

/**
 * The edges whose chrome autohide is showing, as a space-separated list, while
 * `on`. Tracked here rather than with :hover, which a view transition (as when
 * switching sidebar tabs) drops for its duration.
 */
function useNearEdges(on: boolean) {
  const [edges, setEdges] = useState("");
  useEffect(() => {
    if (!on) return;
    let shown = new Set<Edge>();
    const over = (edge: Edge, x: number, y: number) =>
      [...document.querySelectorAll(EDGE_CHROME[edge])].some((el) => {
        const r = el.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const { clientX: x, clientY: y } = e;
      const near: Record<Edge, boolean> = {
        left: x < EDGE_ZONE,
        right: x > innerWidth - EDGE_ZONE,
        top: y < EDGE_ZONE,
        bottom: y > innerHeight - EDGE_ZONE,
      };
      shown = new Set(
        (Object.keys(EDGE_CHROME) as Edge[]).filter(
          (edge) => near[edge] || (shown.has(edge) && over(edge, x, y)),
        ),
      );
      setEdges([...shown].join(" "));
    };
    // Leaving the window over an edge shouldn't leave its chrome showing.
    const onLeave = () => {
      shown = new Set();
      setEdges("");
    };
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      setEdges("");
    };
  }, [on, edges]);
  return edges;
}
