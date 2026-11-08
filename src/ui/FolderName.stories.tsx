import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FolderName } from "./FolderName";

const meta = {
  component: FolderName,
  args: { onDone: fn() },
} satisfies Meta<typeof FolderName>;

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {};
export const Renaming: Story = { args: { initial: "Villains" } };
