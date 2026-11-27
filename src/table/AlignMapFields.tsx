import type { Cells } from "../scene/alignMap";
import type { Alignment, SceneController } from "../scene/controller";
import { Button } from "../ui/Button";
import { Counter } from "../workspace/sheetParts";

/**
 * Lining a map up with the grid: first a box to draw over some of the map's
 * cells, then how many it covers each way, which lines the map up again as
 * they change.
 */
export default function AlignMapFields({
  controller,
  alignment,
}: {
  controller: SceneController;
  alignment: Alignment;
}) {
  const { drawn } = alignment;
  const unit = controller.renderer.grid.type === "hex" ? "Hexes" : "Squares";
  const counter = (key: keyof Cells, label: string) =>
    drawn && (
      <Counter
        key={key}
        label={label}
        value={drawn.cells[key]}
        disabled={false}
        onChange={(by) => {
          controller.setAlignCells({ ...drawn.cells, [key]: Math.max(1, drawn.cells[key] + by) });
        }}
      />
    );
  return (
    <>
      {drawn ? (
        <>
          {counter("across", `${unit} Across`)}
          {counter("down", `${unit} Down`)}
        </>
      ) : (
        <span className="selection-bar-hint">
          Drag a box over some of the map&rsquo;s {unit.toLowerCase()}, corner to corner
        </span>
      )}
      <Button
        variant="primary"
        onClick={() => {
          controller.stopAligning();
        }}
      >
        Finish Aligning
      </Button>
    </>
  );
}

AlignMapFields.displayName = "AlignMapFields";
