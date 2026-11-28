import { DETECT_MAX, DETECT_MIN } from "../scene/detectWalls";
import type { DetectSettings } from "../scene/detectWalls";
import type { WallDetection, WallDetector } from "../scene/wallDetection";
import { Button } from "../ui/Button";
import { Counter } from "../workspace/sheetParts";

/**
 * Finding the walls on a map: how dark a wall is and how much detail to
 * find, which find them again as they change, then adding what was found.
 */
export default function DetectWallsFields({
  detector,
  detection,
}: {
  detector: WallDetector;
  detection: WallDetection;
}) {
  const { settings, walls } = detection;
  const counter = (key: keyof DetectSettings, label: string) => (
    <Counter
      key={key}
      label={label}
      value={settings[key]}
      max={DETECT_MAX}
      disabled={!walls}
      onChange={(by) => {
        const value = Math.min(DETECT_MAX, Math.max(DETECT_MIN, settings[key] + by));
        void detector.tune({ [key]: value });
      }}
    />
  );
  const count = walls?.length ?? 0;
  return (
    <>
      {counter("darkness", "Darkness")}
      {counter("detail", "Detail")}
      {walls?.length === 0 && <span className="selection-bar-hint">No walls found</span>}
      <Button
        variant="primary"
        disabled={!count}
        onClick={() => {
          detector.commit();
        }}
      >
        {walls ? `Add ${String(count)} ${count === 1 ? "Wall" : "Walls"}` : "Finding Walls…"}
      </Button>
    </>
  );
}

DetectWallsFields.displayName = "DetectWallsFields";
