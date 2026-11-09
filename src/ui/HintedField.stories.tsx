import type { Meta, StoryObj } from "@storybook/react-vite";
import { HintedField } from "./HintedField";

const meta = {
  component: HintedField,
  args: {
    label: "Campaign name",
    hint: "Players see this when they join.",
    children: (input) => <input {...input} defaultValue="The Sunken Keep" />,
  },
} satisfies Meta<typeof HintedField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHint: Story = {};
export const WithoutHint: Story = { args: { hint: undefined } };
export const Select: Story = {
  args: {
    label: "System",
    hint: "Sets the character sheet and dice.",
    children: (input) => (
      <select {...input} defaultValue="dw2">
        <option value="dw2">Dungeon World 2</option>
        <option value="dnd">D&amp;D 5.5e</option>
      </select>
    ),
  },
};
