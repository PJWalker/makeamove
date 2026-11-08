import type { Preview } from "@storybook/react-vite";
import "../src/styles/base.css";
import "../src/styles/tokens.css";
import "../src/styles/components.css";
import "../src/styles/transitions.css";
import { Tooltip } from "../src/ui/Tooltip";

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { matchers: { color: /(background|color)$/i } },
    a11y: { test: "error" },
  },
  // The app mounts one tooltip for everything that has a title.
  decorators: [
    (Story) => (
      <>
        <Story />
        <Tooltip />
      </>
    ),
  ],
};

export default preview;
