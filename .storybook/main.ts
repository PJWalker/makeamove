import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: "@storybook/react-vite",
  staticDirs: ["../public"],
  // The app's service worker would cache Storybook's own assets.
  viteFinal: (config) => ({
    ...config,
    plugins: (config.plugins ?? [])
      .flat()
      .filter(
        (plugin) => !(plugin && "name" in plugin && plugin.name.startsWith("vite-plugin-pwa")),
      ),
  }),
};

export default config;
