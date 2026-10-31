import { signal } from "@preact/signals";
import { Dialog } from "./CampaignDialogs";
import type { Campaign } from "../store/campaign";
import { useY } from "../store/useY";
import { GraphicPicker } from "../ui/GraphicPicker";
import { getEntityGraphic, setEntityGraphic } from "./entityGraphics";
import { usePopupDialog } from "./usePopupDialog";
import { getNote } from "../notes/api";

type Request = {
  n: number;
  campaign: Campaign;
  kind: string;
  id: string;
  title: string;
  defaultIcon?: string;
} | null;

const request = signal<Request>(null);
let nextRequest = 0;

export function editEntityGraphic(
  campaign: Campaign,
  kind: string,
  id: string,
  title: string,
  defaultIcon?: string,
) {
  if (kind === "note" && getNote(campaign, id)?.gmOnly) return;
  request.value = { n: ++nextRequest, campaign, kind, id, title, defaultIcon };
}

export function GraphicDialogs({ campaign }: { campaign: Campaign }) {
  const current = request.value;
  if (!current || current.campaign !== campaign) return null;
  return <GraphicDialog key={current.n} request={current} />;
}

function GraphicDialog({ request: edit }: { request: NonNullable<Request> }) {
  const ref = usePopupDialog();
  const graphic = useY(edit.campaign.entityGraphics, () =>
    getEntityGraphic(edit.campaign, edit.kind, edit.id, edit.defaultIcon),
  );
  const close = () => {
    if (request.value?.n === edit.n) request.value = null;
  };
  return (
    <Dialog dialogRef={ref} title={`Graphic for ${edit.title}`} onClose={close}>
      <GraphicPicker
        graphic={graphic}
        onChange={(next) =>
          setEntityGraphic(edit.campaign, edit.kind, edit.id, next)
        }
        onReset={() => setEntityGraphic(edit.campaign, edit.kind, edit.id)}
      />
    </Dialog>
  );
}
