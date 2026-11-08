import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { PopupTabs } from "./PopupTabs";

type Props = ComponentProps<typeof PopupTabs<string>>;

function Stateful(props: Props) {
  const [value, setValue] = useState(props.value);
  return (
    <div className="panel" style={{ width: 300 }}>
      <PopupTabs
        {...props}
        value={value}
        onChange={(id) => {
          setValue(id);
          props.onChange(id);
        }}
      >
        <p style={{ padding: 12 }}>The {value} tab.</p>
      </PopupTabs>
    </div>
  );
}

const meta = {
  component: PopupTabs,
  args: {
    tabs: [
      { id: "stats", label: "Stats" },
      { id: "conditions", label: "Conditions" },
      { id: "look", label: "Look" },
    ],
    value: "stats",
    onChange: fn(),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** One tab: the panel shows without the tab row. */
export const HiddenTabs: Story = { args: { hideTabs: true } };
