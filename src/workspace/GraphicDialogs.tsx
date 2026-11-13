import { Dialog } from "./Dialog";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { GraphicPicker } from "../ui/GraphicPicker";
import { getEntityGraphic } from "./entityGraphics";
import { usePopupDialog } from "./usePopupDialog";
import { useCampaign } from "./campaignContext";
import type { TableState } from "./tableState";
import { chooseGraphic } from "./commands/campaign";

type Request = NonNullable<TableState["graphicEdit"]["value"]>;

export function GraphicDialogs({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  const current = useQuery(ctx.table.graphicEdit);
  if (!current) return null;
  return <GraphicDialog key={current.n} campaign={campaign} request={current} />;
}

function GraphicDialog({ campaign, request: edit }: { campaign: Campaign; request: Request }) {
  const ctx = useCampaign();
  const ref = usePopupDialog();
  const graphic = useQuery(campaign.entityGraphics, () =>
    getEntityGraphic(campaign, edit.kind, edit.id, edit.defaultIcon),
  );
  const close = () => {
    if (ctx.table.graphicEdit.value?.n === edit.n) ctx.table.graphicEdit.set(null);
  };
  return (
    <Dialog dialogRef={ref} title={`Graphic for ${edit.title}`} onClose={close}>
      <GraphicPicker
        graphic={graphic}
        onChange={(next) =>
          ctx.execute(chooseGraphic, { kind: edit.kind, id: edit.id, graphic: next })
        }
        onReset={() => ctx.execute(chooseGraphic, { kind: edit.kind, id: edit.id })}
      />
    </Dialog>
  );
}
