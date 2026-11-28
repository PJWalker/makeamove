import { lazy, Suspense, useState, useEffect, useLayoutEffect } from "react";
import { sceneOklchFromHex } from "../lib/colour";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { windowLayer } from "../ui/windows";
import { hasCombat } from "../features/combat/api";
import { playedCharacterId, systemOf } from "../features/characters/api";
import { canvasColour } from "../workspace/canvasState";
import { autohide } from "../workspace/autohide";
import ActionDialogs from "../workspace/ActionDialogs";
import { EntityWindowHost } from "../workspace/entityWindows";
import GraphicDialogs from "../workspace/GraphicDialogs";
import extensionOf from "../systems/extensions";
import { SystemExtensions } from "../workspace/systemExtensions";
import { useCommandKeys } from "../workspace/commands/keys";
import { useCampaign } from "../workspace/campaignContext";
import Toolbar from "./Toolbar";
import Palette from "./Palette";
import MovePrompt from "./MovePrompt";
import LinkPopups from "./LinkPopups";
import Hotbar from "./Hotbar";
import ChatPopups from "./ChatPopups";
import Sidebar from "./Sidebar";
import CampaignDialogHost from "./CampaignDialogHost";
import FloatingWindows from "./FloatingWindows";
import { TutorialGuide } from "./TutorialGuide";

// PixiJS is big; load it only once someone opens a table.
const SceneCanvas = lazy(() => import("./SceneCanvas"));

function Tabletop({ campaign }: { campaign: Campaign }) {
  const context = useCampaign();
  const scenes = useQuery(campaign.scenes, () => campaign.sceneViews());
  // A system without initiative has no turn tracker.
  const combat = useQuery(campaign.meta, () => hasCombat(campaign));
  // The Reference holds GM guidance, for systems that have it.
  const reference = useQuery(
    campaign.members,
    () => campaign.isGm() && !!systemOf(campaign).gmReference?.length,
  );
  // The GM shadow is the GM's alone.
  const gm = useQuery(campaign.members, () => campaign.isGm());
  // My Character is there once this device has claimed one.
  const playing = useQuery(campaign.members, () => !!playedCharacterId(campaign));
  useLayoutEffect(() => {
    context.panels.unavailablePanels.set([
      ...(playing ? [] : (["pc"] as const)),
      ...(combat ? [] : (["combat"] as const)),
      ...(reference ? [] : (["reference"] as const)),
      ...(gm ? [] : (["shadow"] as const)),
    ]);
    return () => {
      context.panels.unavailablePanels.set([]);
    };
  }, [context, playing, combat, reference, gm]);
  const activeId = useQuery(campaign.members, () => campaign.activeSceneId());
  const scene = scenes.find((s) => s.id === activeId) ?? scenes[0];

  const mapColour = useQuery(context.canvas.activeMapColour);
  const colour = scene ? canvasColour(scene, mapColour) : null;

  // Tint the whole UI from the scene's custom colour, else from the map, else from the canvas.
  const tint = scene?.canvasColour ?? mapColour ?? colour;
  useEffect(() => {
    if (tint) {
      const { l, c, h } = sceneOklchFromHex(tint);
      document.documentElement.style.setProperty("--scene-oklch", `oklch(${l} ${c} ${h})`);
    }
  }, [tint]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--scene-oklch");
    },
    [],
  );

  // Every command's shortcuts, built-in and the player's own.
  useCommandKeys(context);

  const hiding = useQuery(autohide);
  const dragging = useQuery(context.panels.windowDragging);
  const insets = useQuery(context.panels.dockInsets);
  const edges = useNearEdges(hiding);

  return (
    <SystemExtensions value={extensionOf}>
      <div
        className="table"
        data-autohide={hiding}
        // Which edges' chrome autohide is showing; a dragged window needs both sidebars to drop on.
        data-reveal={dragging ? "left right" : edges}
        // How much each side's docked chrome covers, for the bars that sit between them.
        style={{
          "--dock-l": `${insets.left.total}px`,
          "--dock-r": `${insets.right.total}px`,
          "--panel-l": `${insets.left.body}px`,
          "--panel-r": `${insets.right.body}px`,
        }}
        // Pulled-out panels and pop-ups render into this layer (ui/windows.ts).
        ref={(element) => {
          if (element && element.lastChild !== windowLayer) element.append(windowLayer);
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
        <TutorialGuide />
      </div>
    </SystemExtensions>
  );
}

/** How close to an edge of the window the pointer must come to show that edge's chrome. */
const EDGE_ZONE = 8;

/** The chrome each edge reveals, which then stays while the pointer is over it. */
const EDGE_CHROME = {
  left: '.sidebar[data-side="left"]',
  right: '.sidebar[data-side="right"]',
  top: ".toolbar",
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
      [...document.querySelectorAll(EDGE_CHROME[edge])].some((element) => {
        const r = element.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const { clientX: x, clientY: y } = e;
      const near: Record<Edge, boolean> = {
        left: x <= EDGE_ZONE,
        right: x >= innerWidth - EDGE_ZONE,
        top: y <= EDGE_ZONE,
        bottom: y >= innerHeight - EDGE_ZONE,
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
    globalThis.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      globalThis.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      setEdges("");
    };
  }, [on]);
  return edges;
}

export default Tabletop;
