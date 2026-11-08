import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { IconDelete, IconDuplicate, IconLock, IconRename, IconToBack, IconToFront } from "./icons";

type Props = ComponentProps<typeof ContextMenu>;

/** Right-click anywhere in the frame to open the menu where the pointer is. */
function Demo(props: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>({ x: props.x, y: props.y });
  return (
    <div
      role="application"
      aria-label="Right-click to open the menu"
      style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center" }}
      onContextMenu={(e) => {
        e.preventDefault();
        setAt({ x: e.clientX, y: e.clientY });
      }}
    >
      Right-click to open the menu
      {at && (
        <ContextMenu
          {...props}
          x={at.x}
          y={at.y}
          onClose={() => {
            setAt(null);
            props.onClose();
          }}
        />
      )}
    </div>
  );
}

const items: MenuItem[] = [
  { label: "Rename…", Icon: IconRename, onSelect: fn() },
  { label: "Duplicate", Icon: IconDuplicate, shortcut: "⌘D", onSelect: fn() },
  "divider",
  { label: "Bring to Front", Icon: IconToFront, onSelect: fn() },
  { label: "Send to Back", Icon: IconToBack, disabled: true, onSelect: fn() },
  "divider",
  { label: "Delete", Icon: IconDelete, shortcut: "⌫", danger: true, onSelect: fn() },
];

const meta = {
  component: ContextMenu,
  parameters: { layout: "fullscreen" },
  args: { x: 80, y: 60, items, onClose: fn(), label: "Token actions" },
  render: (args) => <Demo {...args} />,
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Toggles: Story = {
  args: {
    items: [
      { label: "Locked", Icon: IconLock, checked: true, onSelect: fn() },
      { label: "Show Name", checked: false, onSelect: fn() },
      { label: "Show Health Bar", checked: true, onSelect: fn() },
    ],
  },
};

export const WithColour: Story = {
  args: {
    items: [
      { label: "Rename…", Icon: IconRename, onSelect: fn() },
      "divider",
      { label: "Colour", colour: "#c8a24a", onPreview: fn(), onPick: fn() },
    ],
  },
};
