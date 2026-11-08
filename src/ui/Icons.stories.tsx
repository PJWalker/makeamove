import type { Meta, StoryObj } from "@storybook/react-vite";
import * as icons from "./icons";
import type { Icon } from "./icons";

const all = Object.entries(icons).filter(
  (entry): entry is [string, Icon] => entry[0].startsWith("Icon") && typeof entry[1] === "function",
);

function IconGallery({ size }: { size: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        gap: 12,
        width: "min(840px, 90vw)",
      }}
    >
      {all.map(([name, Glyph]) => (
        <div key={name} style={{ display: "grid", justifyItems: "center", gap: 4 }}>
          <Glyph size={size} />
          <small>{name.slice(4)}</small>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: "ui/Icons",
  component: IconGallery,
  args: { size: 28 },
  argTypes: { size: { control: { type: "range", min: 16, max: 64, step: 2 } } },
} satisfies Meta<typeof IconGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};
