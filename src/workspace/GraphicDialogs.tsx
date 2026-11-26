import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import GraphicPicker from "../ui/GraphicPicker";
import Dialog from "./Dialog";
import { getEntityGraphic } from "./entityGraphics";
import usePopupDialog from "./usePopupDialog";
import { useCampaign } from "./campaignContext";
import type { TableState } from "./tableState";
import { chooseGraphic } from "./commands/campaign";

type Request = NonNullable<TableState["graphicEdit"]["value"]>;

function GraphicDialogs({ campaign }: { campaign: Campaign }) {
  const context = useCampaign();
  const current = useQuery(context.table.graphicEdit);
  if (!current) return null;
  return <GraphicDialog key={current.n} campaign={campaign} request={current} />;
}

function GraphicDialog({ campaign, request: edit }: { campaign: Campaign; request: Request }) {
  const context = useCampaign();
  const reference = usePopupDialog();
  const graphic = useQuery(campaign.entityGraphics, () =>
    getEntityGraphic(campaign, edit.kind, edit.id, edit.defaultIcon),
  );
  const close = () => {
    if (context.table.graphicEdit.value?.n === edit.n) context.table.graphicEdit.set(null);
  };
  return (
    <Dialog dialogRef={reference} title={`Graphic for ${edit.title}`} onClose={close}>
      <GraphicPicker
        graphic={graphic}
        onChange={(next) =>
          context.execute(chooseGraphic, { kind: edit.kind, id: edit.id, graphic: next })
        }
        onReset={() => context.execute(chooseGraphic, { kind: edit.kind, id: edit.id })}
      />
    </Dialog>
  );
}

export default GraphicDialogs;
