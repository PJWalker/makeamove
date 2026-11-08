import type { Meta, StoryObj } from "@storybook/react-vite";
import { BlobImage } from "./BlobImage";
import { IconImage } from "./icons";

const meta = {
  component: BlobImage,
  args: { fallback: <IconImage size={48} /> },
} satisfies Meta<typeof BlobImage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No image yet, or one missing from this device: the fallback shows. */
export const Missing: Story = {};
export const MissingFromDevice: Story = {
  args: { image: { hash: "0000000000000000", mime: "image/png", width: 64, height: 64 } },
};
