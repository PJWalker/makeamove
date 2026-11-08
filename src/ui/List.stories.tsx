import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { EntityGraphicView } from "./EntityGraphic";
import { IconDelete, IconFolder } from "./icons";
import { List, ListExpand, ListGroup, ListRow, Tag } from "./List";

const meta = {
  component: List,
  args: { label: "Characters", children: null },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof List>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rows: Story = {
  render: (args) => (
    <List {...args}>
      <ListRow
        lead={<Avatar id="aria" name="Aria Stormwind" />}
        name="Aria Stormwind"
        tag="Wizard"
        onPick={fn()}
      />
      <ListRow
        lead={<Avatar id="tuck" name="Brother Tuck" />}
        name="Brother Tuck"
        tag="Cleric"
        selected
        onPick={fn()}
      />
      <ListRow lead={<Avatar id="grim" name="Grim" />} name="Grim" tag="NPC" onPick={fn()}>
        <Button variant="icon" label="Delete Grim">
          <IconDelete size={18} />
        </Button>
      </ListRow>
    </List>
  ),
};

export const Inventory: Story = {
  args: { label: "Inventory" },
  render: (args) => (
    <List {...args}>
      <ListRow
        lead={<EntityGraphicView graphic={{ kind: "icon", name: "sword" }} />}
        name="Sword"
        tag="+1"
        meta="1 wt"
        onPick={fn()}
      />
      <ListRow
        lead={<EntityGraphicView graphic={{ kind: "icon", name: "rations" }} />}
        name="Rations"
        meta="5 uses"
        onPick={fn()}
      />
      <ListRow
        lead={<EntityGraphicView graphic={{ kind: "icon", name: "chainmail" }} />}
        name="Chainmail"
        tag="2 armour"
        meta="2 wt"
        dim
        onPick={fn()}
      />
    </List>
  ),
};

function Groups() {
  const [open, setOpen] = useState({ party: true, villains: false });
  const [expanded, setExpanded] = useState(false);
  return (
    <List label="Characters">
      <ListGroup
        label="Party"
        lead={<IconFolder size={22} />}
        count={2}
        open={open.party}
        onToggle={() => setOpen({ ...open, party: !open.party })}
      >
        <ListRow name="Aria Stormwind" tag="Wizard" onPick={fn()} />
        <ListRow
          before={
            <ListExpand
              open={expanded}
              onToggle={() => setExpanded(!expanded)}
              label="Show Brother Tuck's moves"
            />
          }
          name="Brother Tuck"
          tag="Cleric"
          onPick={fn()}
        />
      </ListGroup>
      <ListGroup
        label="Villains"
        lead={<IconFolder size={22} />}
        count={1}
        open={open.villains}
        onToggle={() => setOpen({ ...open, villains: !open.villains })}
      >
        <ListRow name="The Lich Queen" tag="NPC" onPick={fn()} />
      </ListGroup>
    </List>
  );
}

export const GroupedRows: Story = { render: () => <Groups /> };

export const StandaloneTag: Story = {
  render: () => (
    <p>
      Armour <Tag>2</Tag>
    </p>
  ),
};
