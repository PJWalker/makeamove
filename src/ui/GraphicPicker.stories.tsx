import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import type { EntityGraphic } from "../media/images";
import { GraphicPicker } from "./GraphicPicker";

type Props = ComponentProps<typeof GraphicPicker>;

function Stateful(props: Props) {
  const [graphic, setGraphic] = useState<EntityGraphic | undefined>(props.graphic);
  return (
    <GraphicPicker
      {...props}
      graphic={graphic}
      onChange={(next) => {
        setGraphic(next);
        props.onChange(next);
      }}
      onReset={
        props.onReset &&
        (() => {
          setGraphic(undefined);
          props.onReset?.();
        })
      }
    />
  );
}

const meta = {
  component: GraphicPicker,
  args: { onChange: fn() },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof GraphicPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithIcon: Story = { args: { graphic: { kind: "icon", name: "shield" } } };
export const WithReset: Story = {
  args: { graphic: { kind: "icon", name: "potion" }, onReset: fn(), label: "Item graphic" },
};
