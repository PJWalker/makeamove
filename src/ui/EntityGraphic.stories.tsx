import type { Meta, StoryObj } from "@storybook/react-vite";
import { EntityGraphicView } from "./EntityGraphic";
import { ENTRY_ICONS } from "./entryIcons";

const meta = {
  component: EntityGraphicView,
  args: { graphic: { kind: "icon", name: "sword" }, size: 32 },
  argTypes: {
    size: { control: { type: "range", min: 16, max: 96, step: 2 } },
  },
} satisfies Meta<typeof EntityGraphicView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Icon: Story = {};
export const Default: Story = { args: { graphic: undefined } };
export const UnknownIcon: Story = { args: { graphic: { kind: "icon", name: "no-such-icon" } } };

export const AllEntryIcons: Story = {
  render: ({ size }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
        gap: 12,
        width: "min(720px, 90vw)",
      }}
    >
      {Object.keys(ENTRY_ICONS).map((name) => (
        <div key={name} style={{ display: "grid", justifyItems: "center", gap: 4 }}>
          <EntityGraphicView graphic={{ kind: "icon", name }} size={size ?? 32} />
          <small>{name}</small>
        </div>
      ))}
    </div>
  ),
};
