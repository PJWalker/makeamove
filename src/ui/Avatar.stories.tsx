import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "./Avatar";

const meta = {
  component: Avatar,
  args: { id: "player-1", name: "Aria Stormwind" },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Online: Story = { args: { online: true } };
export const Away: Story = { args: { online: false } };
export const SingleName: Story = { args: { name: "Grim" } };

/** Each id gets its own hue. */
export const Party: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      {["Aria Stormwind", "Brother Tuck", "Grim", "Vesper Nightshade", "Oda"].map((name) => (
        <Avatar key={name} id={name} name={name} online />
      ))}
    </div>
  ),
};
