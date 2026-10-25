import { elementAt, watchHoldRelease } from "../ui/holdRelease";
import { setMorphOrigin } from "../ui/morph";
import { openPopup } from "../ui/popup";
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { goToCampaign } from "../router";
import type { Campaign, SceneView } from "../store/campaign";
import { useY } from "../store/useY";
import { Button } from "../ui/Button";
import {
  IconAdd,
  IconDelete,
  IconExpand,
  IconGrid,
  IconHelp,
  IconLeave,
  IconMembers,
  IconSettings,
} from "../ui/icons";
import { canvasColour, sceneSettingsOpen, seenMapColours } from "./canvasState";
import { HelpDialog, PlayerDialog, SettingsDialog } from "./CampaignDialogs";

/**
 * The scene bar in the top-left corner. Clicking the scene name grows the bar
 * itself to show the scene list and campaign actions.
 */
export function SceneBar({
  campaign,
  scenes,
  activeId,
  activeColour,
}: {
  campaign: Campaign;
  scenes: SceneView[];
  activeId: string | null;
  /** The active scene's canvas colour as shown, which may come from its map. */
  activeColour: string | null;
}) {
  const active = scenes.find((s) => s.id === activeId);
  const isGm = campaign.isGm();
  const campaignName = useY(campaign.meta, () => campaign.name);
  const expanded = useSignal(false);
  const barRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const playerRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);

  function setExpanded(next: boolean) {
    expanded.value = next;
  }

  // Collapse on Escape or a press anywhere outside the bar.
  useEffect(() => {
    if (!expanded.value) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setExpanded(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setExpanded(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded.value]);

  /** Open a dialog from a menu item, growing it out of that item. */
  function openDialog(dialog: HTMLDialogElement | null, e: MouseEvent) {
    setMorphOrigin(e.currentTarget as Element);
    expanded.value = false;
    openPopup(dialog);
  }

  /** Map colours are only known for scenes opened this session. */
  const swatch = (s: SceneView) =>
    (s.id === activeId && activeColour) ||
    canvasColour(s, seenMapColours.value[s.id] ?? null);

  /*
   * Press, drag and release, as in a macOS menu: pressing the scene name
   * opens the menu at once; releasing over a scene switches to it, releasing
   * over a button presses it, and releasing anywhere else closes the menu.
   * A quick click just opens the menu, as before. Scene deletes are never
   * chosen this way: they have no confirmation.
   */
  const openedByPress = useRef(false);

  function onSwitchPointerDown(e: PointerEvent) {
    openedByPress.current = false;
    if (e.button !== 0 || e.pointerType === "touch" || expanded.value) return;
    // Until the click that ends this press arrives, it has been handled.
    openedByPress.current = true;
    setExpanded(true);
    watchHoldRelease(e.clientX, e.clientY, 0, (up) => {
      const target = elementAt(up);
      const body = barRef.current?.querySelector(".scene-bar-body");
      if (!target || !body?.contains(target)) return setExpanded(false);
      if (target.closest("[data-no-release]")) return;
      const button = target.closest<HTMLButtonElement>("button:not(:disabled)");
      const row = target.closest<HTMLElement>(".scene-item");
      if (button) {
        button.click();
      } else if (row?.dataset.sceneId) {
        campaign.setActiveScene(row.dataset.sceneId);
      }
      setExpanded(false);
    });
  }

  function addScene() {
    const id = campaign.addScene(`Scene ${scenes.length + 1}`);
    campaign.setActiveScene(id);
  }

  return (
    <div
      ref={barRef}
      class="scene-bar panel bevel chrome dock-top dock-left"
      data-expanded={expanded.value}
    >
      <div class="scene-bar-head">
        <span class="eyebrow">{campaignName}</span>
        <button
          ref={toggleRef}
          type="button"
          class="scene-switch"
          aria-expanded={expanded.value}
          aria-controls="scene-menu"
          onPointerDown={onSwitchPointerDown}
          onClick={() => {
            // A press that opened the menu has already done the click's job.
            if (openedByPress.current) {
              openedByPress.current = false;
              return;
            }
            setExpanded(!expanded.value);
          }}
        >
          <h1 class="scene-title">{active?.name ?? "No scenes"}</h1>
          <IconExpand size={22} class="scene-switch-chevron" />
        </button>
      </div>

      {/* Always rendered so it can animate closed; inert while closed. */}
      <div class="scene-bar-drawer">
        <div id="scene-menu" class="scene-bar-body" inert={!expanded.value}>
          <div class="scene-bar-scenes">
            <div class="eyebrow">Scenes</div>
            <ul class="scene-list">
              {scenes.map((s) => (
                <li
                  key={s.id}
                  class="scene-item"
                  data-active={s.id === activeId}
                  data-scene-id={s.id}
                >
                  {isGm ? (
                    <input
                      class="scene-name-input"
                      value={s.name}
                      aria-label="Scene name"
                      onFocus={() => campaign.setActiveScene(s.id)}
                      onChange={(e) =>
                        campaign.updateScene(s.id, {
                          name: e.currentTarget.value || "Untitled scene",
                        })
                      }
                    />
                  ) : (
                    <button
                      type="button"
                      class="scene-name-button"
                      onClick={() => campaign.setActiveScene(s.id)}
                    >
                      {s.name}
                    </button>
                  )}
                  {isGm && s.id !== activeId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => campaign.setActiveScene(s.id)}
                    >
                      View
                    </Button>
                  )}
                  {isGm && scenes.length > 1 && (
                    <Button
                      variant="icon"
                      label={`Delete ${s.name}`}
                      data-no-release
                      onClick={() => campaign.removeScene(s.id)}
                    >
                      <IconDelete size={16} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {isGm && (
              <Button variant="secondary" size="sm" onClick={addScene}>
                <IconAdd size={16} /> New scene
              </Button>
            )}
          </div>

          <div class="menu-section" role="group" aria-label={campaignName}>
            {isGm && active && (
              <button
                type="button"
                class="menu-item bevel"
                onClick={(e) => {
                  setMorphOrigin(e.currentTarget);
                  expanded.value = false;
                  sceneSettingsOpen.value = true;
                }}
              >
                <IconGrid size={16} /> Scene settings
              </button>
            )}
            <button
              type="button"
              class="menu-item bevel"
              onClick={(e) => openDialog(playerRef.current, e)}
            >
              <IconMembers size={16} /> Player settings
            </button>
            {isGm && (
              <button
                type="button"
                class="menu-item bevel"
                onClick={(e) => openDialog(settingsRef.current, e)}
              >
                <IconSettings size={16} /> Campaign settings
              </button>
            )}
            <button
              type="button"
              class="menu-item bevel"
              onClick={(e) => openDialog(helpRef.current, e)}
            >
              <IconHelp size={16} /> Help and shortcuts
            </button>
            <button
              type="button"
              class="menu-item bevel"
              onClick={() => goToCampaign(null)}
            >
              <IconLeave size={16} /> Back to campaigns
            </button>
          </div>
        </div>
      </div>

      <PlayerDialog campaign={campaign} dialogRef={playerRef} />
      <SettingsDialog campaign={campaign} dialogRef={settingsRef} />
      <HelpDialog dialogRef={helpRef} />
    </div>
  );
}
