import { useRef } from "react";
import { toScreen } from "../scene/camera";
import type { SceneController } from "../scene/controller";
import type { PinRequest } from "../scene/gestures/types";
import type { PinElement } from "../scene/types";
import { isLink } from "../features/notes/links";
import type { LinkRef as LinkReference } from "../features/notes/links";
import { linkTarget, linkTargets } from "../features/notes/targets";
import { FilterableMenu, FilterableMenuPanel } from "../ui/FilterableMenu";
import type { FilterableMenuOption } from "../ui/FilterableMenu";
import { IconMapPin } from "../ui/icons";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "../workspace/campaignContext";
import { newGmPage, newPage } from "../workspace/commands/notes";

/** A pin's target picker: how it's labelled and searched. */
const PICKER = {
  label: "Pin To",
  layout: "list",
  searchLabel: "Find what to pin",
  placeholder: "Pages, characters, scenes…",
} as const;

/**
 * What a pin can lead to: a new page (opened to write), or any page,
 * character, scene, gear or move this device has. `choose` turns a picked
 * option into its link, making the page if it's a new one.
 */
function usePinTargets() {
  const context = useCampaign();
  const creators = [
    { id: "new:page", label: "New Page", command: newPage },
    { id: "new:gm-page", label: "New GM Page", command: newGmPage },
  ].filter((c) => context.commands.permits(c.command, {}) === true);
  const options: FilterableMenuOption[] = [
    ...creators.map((c) => ({ id: c.id, label: c.label, content: <strong>{c.label}</strong> })),
    ...linkTargets(context.campaign, "", undefined, Infinity).map((t) => ({
      id: `${t.kind}:${t.id}`,
      label: t.label || "Untitled",
      keywords: t.detail,
      content: (
        <>
          {t.label || "Untitled"}
          <span>{t.detail}</span>
        </>
      ),
    })),
  ];
  const choose = (id: string): LinkReference | null => {
    const creator = creators.find((c) => c.id === id);
    if (!creator) return isLink(id) ? id : null;
    const page = context.execute(creator.command, {});
    return page ? `note:${page}` : null;
  };
  return { options, choose };
}

/**
 * What a new pin should lead to, asked where it goes. Picking one puts the
 * pin down; dismissing it puts nothing down.
 */
export function PinPicker({
  controller,
  request,
  onDone,
}: {
  controller: SceneController;
  request: PinRequest;
  onDone: () => void;
}) {
  const { options, choose } = usePinTargets();
  const anchorRef = useRef<HTMLDivElement>(null);
  const host = controller.host.getBoundingClientRect();
  const at = toScreen(controller.renderer.camera, request.at);
  return (
    <>
      <div
        ref={anchorRef}
        className="pin-picker-anchor"
        style={{ left: host.left + at.x, top: host.top + at.y }}
      />
      <FilterableMenuPanel
        {...PICKER}
        triggerRef={anchorRef}
        isOpen
        onOpenChange={(open) => {
          if (!open) onDone();
        }}
        options={options}
        onSelect={(id) => {
          const link = choose(id);
          if (link) controller.addPin(request.at, link);
        }}
      />
    </>
  );
}

/** Change what the selected pins lead to, from the selection bar. */
export function PinTargetField({
  controller,
  pins,
}: {
  controller: SceneController;
  pins: readonly PinElement[];
}) {
  // Read afresh each render: the pages it watches below don't come in through its properties.
  "use no memo";
  const context = useCampaign();
  const { options, choose } = usePinTargets();
  const { link } = pins[0]!;
  const same = pins.every((p) => p.link === link);
  // Renamed as its page, shared or the GM's, changes.
  const labelOf = () =>
    same ? (linkTarget(context.campaign, link)?.label ?? "Missing") : "Several";
  const vault = useQuery(context.campaign.vault);
  useQuery(context.campaign.notes, labelOf);
  const label = useQuery(vault?.notes, labelOf);
  return (
    <FilterableMenu
      {...PICKER}
      trigger={
        <>
          <IconMapPin />
          {label}
        </>
      }
      triggerProps={{ "aria-label": `Pin To: ${label}` }}
      options={options}
      selected={same ? link : undefined}
      onSelect={(id) => {
        const next = choose(id);
        if (next) controller.scene.update(pins.map((p) => [p.id, { link: next }]));
      }}
    />
  );
}
