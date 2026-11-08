import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { List, ListRow } from "./List";
import { createPaneLayout, TwoPane, usePaneLevel, type PaneLayoutMode } from "./TwoPane";

const characters = ["Aria Stormwind", "Brother Tuck", "Grim"];

function Demo({ width, mode }: { width: number; mode: PaneLayoutMode }) {
  const [layout] = useState(() => {
    const made = createPaneLayout(`storybook-two-pane-${mode}`, { list: "list", detail: "sheet" });
    made.chosen.value = mode;
    return made;
  });
  const { level, go } = usePaneLevel(layout, "list");
  const [picked, setPicked] = useState(characters[0]!);
  return (
    <div
      className="panel"
      style={{ width, height: 360, display: "grid", gridTemplateRows: "auto 1fr" }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", padding: 4 }}>
        <layout.Toggle />
      </div>
      <TwoPane
        layout={layout}
        level={level}
        title={picked}
        backLabel="Back to characters"
        onBack={() => go("list")}
        resizeLabel="Resize the character list"
        list={
          <List label="Characters">
            {characters.map((name) => (
              <ListRow
                key={name}
                name={name}
                selected={name === picked}
                onPick={() => {
                  setPicked(name);
                  go("detail");
                }}
              />
            ))}
          </List>
        }
        detail={<p style={{ padding: 12 }}>{picked}&rsquo;s sheet.</p>}
      />
    </div>
  );
}

const meta = {
  title: "ui/TwoPane",
  component: Demo,
  args: { width: 640, mode: "split" },
  argTypes: {
    width: { control: { type: "range", min: 240, max: 900, step: 10 } },
    mode: { control: "inline-radio", options: ["split", "stack"] },
  },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SideBySide: Story = {};
export const OneAtATime: Story = { args: { mode: "stack" } };
/** Too narrow for two columns: one at a time, with the switch disabled. */
export const TooNarrow: Story = { args: { width: 320 } };
