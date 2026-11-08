import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { ENTRY_ICONS } from "./entryIcons";
import { FilterableMenu, type FilterableMenuOption } from "./FilterableMenu";
import { IconSearch } from "./icons";

type Props = ComponentProps<typeof FilterableMenu>;

function Stateful(props: Props) {
  const [selected, setSelected] = useState(props.selected);
  return (
    <FilterableMenu
      {...props}
      selected={selected}
      onSelect={(id) => {
        setSelected(id);
        props.onSelect(id);
      }}
    />
  );
}

const iconOptions: FilterableMenuOption[] = Object.entries(ENTRY_ICONS)
  .slice(0, 24)
  .map(([name, Icon]) => ({
    id: name,
    label: name.replaceAll("-", " "),
    content: (
      <>
        <Icon size={22} />
        <span>{name.replaceAll("-", " ")}</span>
      </>
    ),
  }));

const classOptions: FilterableMenuOption[] = [
  ["fighter", "Fighter", "Masters of weapons and armour."],
  ["wizard", "Wizard", "Scholars of arcane magic."],
  ["cleric", "Cleric", "Servants of the gods."],
  ["thief", "Thief", "Sneaks, scouts and cutpurses."],
  ["ranger", "Ranger", "Hunters and trackers of the wilds."],
].map(([id, label, text]) => ({
  id: id!,
  label: label!,
  keywords: text,
  content: (
    <>
      <strong>{label}</strong>
      <span>{text}</span>
    </>
  ),
}));

const meta = {
  component: FilterableMenu,
  args: {
    label: "Built-in icons",
    trigger: (
      <>
        <IconSearch size={22} /> Search icons…
      </>
    ),
    searchLabel: "Search built-in icons",
    placeholder: "Filter icons",
    options: iconOptions,
    onSelect: fn(),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof FilterableMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {};
export const GridWithSelection: Story = { args: { selected: "sword" } };
export const List: Story = {
  args: {
    label: "Class",
    layout: "list",
    trigger: "Choose a class",
    searchLabel: "Search classes",
    placeholder: "Filter",
    options: classOptions,
  },
};
export const Empty: Story = {
  args: { options: [], emptyMessage: "No icons yet" },
};
