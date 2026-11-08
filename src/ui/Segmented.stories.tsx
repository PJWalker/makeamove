import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { Segmented, SegmentedOrSelect } from "./Segmented";

type Props = ComponentProps<typeof Segmented<string>>;

function Stateful({ narrow, ...props }: Props & { narrow?: boolean }) {
  const [value, setValue] = useState(props.value);
  const Control = narrow === undefined ? Segmented : SegmentedOrSelect;
  return (
    <div style={{ width: narrow ? 160 : undefined }}>
      <Control
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          props.onChange(next);
        }}
      />
    </div>
  );
}

const meta = {
  component: Segmented,
  args: {
    label: "Visibility",
    value: "players",
    options: [
      { id: "gm", label: "GM only" },
      { id: "players", label: "Players" },
      { id: "everyone", label: "Everyone" },
    ],
    onChange: fn(),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const DisabledOption: Story = {
  args: {
    options: [
      { id: "gm", label: "GM only" },
      { id: "players", label: "Players" },
      {
        id: "everyone",
        label: "Everyone",
        disabled: true,
        title: "Only the GM can share with everyone",
      },
    ],
  },
};

/** Fits, so it shows as a segmented control. */
export const OrSelectWide: Story = { render: (args) => <Stateful {...args} narrow={false} /> };
/** Too narrow for the segments, so it becomes a select. */
export const OrSelectNarrow: Story = { render: (args) => <Stateful {...args} narrow /> };
