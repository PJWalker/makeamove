import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { IconDice, IconHelp, IconSettings } from "./icons";
import { Tooltip } from "./Tooltip";

/** Storybook's preview already mounts the one Tooltip; these are things that have titles. */
const meta = {
  component: Tooltip,
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button variant="icon" label="Roll dice">
        <IconDice size={22} />
      </Button>
      <Button variant="icon" label="Settings">
        <IconSettings size={22} />
      </Button>
      <Button title="Opens to the right" data-tip-side="right">
        Side tip
      </Button>
      <span
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so its tooltip is reachable by keyboard
        tabIndex={0}
        data-tip="A long tooltip wraps across several lines rather than running off the edge of the window, so a move's full text can be read in place."
        data-tip-long
      >
        <IconHelp size={22} /> Long tip
      </span>
    </div>
  ),
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HoverOrFocus: Story = {};
