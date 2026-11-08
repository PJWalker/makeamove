import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { OptionPicker, type PickerOption } from "./OptionPicker";

type Props = ComponentProps<typeof OptionPicker>;

function Stateful(props: Props) {
  const [value, setValue] = useState(props.value);
  return (
    <OptionPicker
      {...props}
      value={value}
      onChange={(id) => {
        setValue(id);
        props.onChange(id);
      }}
    />
  );
}

const backgrounds: PickerOption[] = [
  { id: "noble", name: "Noble", text: "Born to wealth; when you call on your house, roll +CHA." },
  {
    id: "outlander",
    name: "Outlander",
    text: "Raised far from cities; you always know the way home.",
  },
  { id: "acolyte", name: "Acolyte", text: "Trained in a temple; you can read holy script." },
];

const meta = {
  component: OptionPicker,
  args: { label: "Background", options: backgrounds, value: "noble", onChange: fn() },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof OptionPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { value: "", emptyLabel: "None" } };
export const Grouped: Story = {
  args: {
    label: "Advance",
    value: "path-blade",
    options: [
      {
        id: "path-blade",
        group: "Gain a Path",
        name: "Blade",
        text: "Your weapon becomes an extension of you.",
      },
      { id: "path-shadow", group: "Gain a Path", name: "Shadow", text: "You move unseen." },
      { id: "stat", name: "Raise a Stat", text: "Add 1 to a stat of your choice." },
    ],
  },
};
export const Disabled: Story = { args: { disabled: true } };
/** A value no longer among the options shows as it is. */
export const StaleValue: Story = { args: { value: "Hermit" } };
