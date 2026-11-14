import { useState } from "react";
import { SheetFrame, SheetSectionView, type SheetProps } from "../../workspace/DeclarativeSheet";
import { useSheet } from "../../workspace/sheetModel";
import { Counter } from "../../workspace/sheetParts";
import { Button } from "../../ui/Button";
import { IconRoll } from "../../ui/icons";
import { ATTRIBUTES, TRAUMAS } from "./index";
import { commaListOf } from "../../lib/list";
import { parseInputNumber } from "../../lib/number";
import { systemCampaignData } from "../../campaign/campaign";
import {
  bumpData,
  setData,
  setScore,
  startMove,
  toggleCondition,
} from "../../workspace/commands/characters";
import { useCampaign } from "../../workspace/campaignContext";
import { advanceAction } from "./commands";

function AttributeAdvance({
  sheet,
  attribute,
}: {
  sheet: ReturnType<typeof useSheet>;
  attribute: (typeof ATTRIBUTES)[number];
}) {
  const ctx = useCampaign();
  const [selected, setSelected] = useState(attribute.actions[0] ?? "");
  const { campaign, c, editable } = sheet;
  const cap = commaListOf(systemCampaignData(campaign).crewUpgrades).includes("mastery") ? 4 : 3;
  if (Number(c.data[`${attribute.id}Xp`] ?? 0) < 6 || !editable) return null;
  const eligible = attribute.actions.filter((id) => (c.scores[id] ?? 0) < cap);
  const chosen = eligible.includes(selected) ? selected : (eligible[0] ?? "");
  return (
    <div className="sheet-row">
      <select
        aria-label={`${attribute.name} advancement action`}
        value={chosen}
        onChange={(event) => setSelected(event.currentTarget.value)}
      >
        {eligible.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <Button
        disabled={!chosen}
        onClick={() =>
          ctx.execute(advanceAction, { characterId: c.id, attribute: attribute.id, action: chosen })
        }
      >
        Advance {attribute.name}
      </Button>
    </div>
  );
}

export function BladesSheet(props: SheetProps) {
  const ctx = useCampaign();
  const sheet = useSheet(props);
  const { system, c, d, editable } = sheet;
  const use = (id: string) => {
    const action = system.actions.find((entry) => entry.id === id);
    if (action) ctx.execute(startMove, { characterId: c.id, move: action.id });
  };
  const conditionIds = new Set(c.conditions);
  return (
    <SheetFrame {...sheet}>
      <SheetSectionView {...sheet} section={{ kind: "header" }} />
      <SheetSectionView {...sheet} section={{ kind: "choices", choices: ["playbook", "vice"] }} />
      <SheetSectionView
        {...sheet}
        section={{
          kind: "counters",
          items: [
            { label: "Stress", data: "stress", max: "maxStress" },
            { label: "Coin", data: "coin" },
            { label: "Stash", data: "stash" },
            { label: "Playbook XP", data: "playbookXp", max: "maxPlaybookXp" },
          ],
        }}
      />
      <SheetSectionView
        {...sheet}
        section={{
          kind: "advancement",
          xp: "playbookXp",
          needed: "maxPlaybookXp",
          field: "advancementCount",
          label: "Playbook advance available.",
          button: "Advance Playbook",
        }}
      />
      <section className="form-section sheet-section" aria-label="Trauma">
        <h3 className="sheet-heading">
          Trauma <span className="muted">{d.values.trauma}/4</span>
        </h3>
        <div className="blades-toggles">
          {TRAUMAS.map(([id, name]) => (
            <label key={id} className="stat-deb">
              <input
                type="checkbox"
                checked={conditionIds.has(id)}
                disabled={!editable}
                onChange={() => ctx.execute(toggleCondition, { id: c.id, condition: id })}
              />
              {name}
            </label>
          ))}
        </div>
      </section>
      {ATTRIBUTES.map(({ id, name, actions }) => (
        <section key={id} className="form-section sheet-section" aria-label={name}>
          <div className="blades-attribute-head">
            <h3 className="sheet-heading">{name}</h3>
            <Button
              variant="secondary"
              label={`Resist with ${name}`}
              aria-label={`Resist with ${name}`}
              onClick={() => use(`resist-${id}`)}
            >
              <IconRoll size={18} /> {d.values[id]}d
            </Button>
          </div>
          <div className="blades-actions">
            {actions.map((actionId) => {
              const stat = system.stats.find((entry) => entry.id === actionId);
              if (!stat) return null;
              return (
                <div key={actionId} className="blades-action">
                  <Button
                    variant="secondary"
                    label={`Roll ${stat.name}`}
                    aria-label={`Roll ${stat.name}`}
                    onClick={() => use(actionId)}
                  >
                    <IconRoll size={18} /> {stat.name}
                  </Button>
                  <input
                    className="stat-score"
                    type="number"
                    min={stat.min ?? 0}
                    max={stat.max ?? 4}
                    aria-label={`${stat.name} rating`}
                    value={c.scores[actionId] ?? 0}
                    disabled={!editable}
                    onChange={(event) => {
                      const value = parseInputNumber(event.currentTarget.value);
                      if (
                        value !== undefined &&
                        Number.isInteger(value) &&
                        value >= (stat.min ?? 0) &&
                        value <= (stat.max ?? 4)
                      )
                        ctx.execute(setScore, { id: c.id, stat: actionId, score: value });
                    }}
                  />
                </div>
              );
            })}
          </div>
          <Counter
            label={`${name} XP`}
            value={Number(c.data[`${id}Xp`] ?? 0)}
            max={d.values.maxAttributeXp}
            disabled={!editable}
            onChange={(by) => ctx.execute(bumpData, { id: c.id, key: `${id}Xp`, by })}
          />
          <AttributeAdvance sheet={sheet} attribute={{ id, name, actions }} />
        </section>
      ))}
      <SheetSectionView {...sheet} section={{ kind: "modifiers", label: "Bonus dice" }} />
      <section className="form-section sheet-section" aria-label="Harm & recovery">
        <h3 className="sheet-heading">Harm & recovery</h3>
        <div className="blades-toggles">
          {system.conditions.flatMap((condition) =>
            condition.id.startsWith("harm-")
              ? [
                  <label key={condition.id} className="stat-deb" title={condition.text}>
                    <input
                      type="checkbox"
                      checked={conditionIds.has(condition.id)}
                      disabled={!editable}
                      onChange={() =>
                        ctx.execute(toggleCondition, { id: c.id, condition: condition.id })
                      }
                    />
                    {condition.name}
                  </label>,
                ]
              : [],
          )}
        </div>
        <SheetSectionView
          {...sheet}
          section={{
            kind: "text",
            fields: [{ field: "harm", label: "Injuries" }],
          }}
        />
        <Counter
          label="Healing clock"
          value={Number(c.data.healing ?? 0)}
          max={d.values.maxHealing}
          disabled={!editable}
          onChange={(by) => ctx.execute(bumpData, { id: c.id, key: "healing", by })}
        />
        <div className="blades-toggles">
          {(
            [
              ["armorUsed", "Armor used"],
              ["heavyArmorUsed", "Heavy armor used"],
              ["specialArmorUsed", "Special armor used"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="stat-deb">
              <input
                type="checkbox"
                checked={Number(c.data[field] ?? 0) > 0}
                disabled={!editable}
                onChange={(event) =>
                  ctx.execute(setData, {
                    id: c.id,
                    key: field,
                    value: event.currentTarget.checked ? 1 : 0,
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </section>
      <section className="form-section sheet-section" aria-label="Load">
        <h3 className="sheet-heading">Load</h3>
        <label className="field">
          Load
          <select
            value={String(c.data.load ?? 5)}
            disabled={!editable}
            onChange={(event) =>
              ctx.execute(setData, {
                id: c.id,
                key: "load",
                value: Number(event.currentTarget.value),
              })
            }
          >
            <option value="3">Light (3)</option>
            <option value="5">Normal (5)</option>
            <option value="6">Heavy (6)</option>
          </select>
        </label>
        <SheetSectionView
          {...sheet}
          section={{
            kind: "derived",
            items: [{ label: "Carried load", value: "load", max: "maxLoad" }],
          }}
        />
      </section>
      <SheetSectionView {...sheet} section={{ kind: "inventory" }} />
      <SheetSectionView {...sheet} section={{ kind: "actions", label: "Abilities & downtime" }} />
      <SheetSectionView
        {...sheet}
        section={{
          kind: "text",
          label: "Identity",
          fields: [
            { field: "heritage", label: "Heritage" },
            { field: "background", label: "Background" },
            { field: "alias-and-look", label: "Alias & look" },
            { field: "friend-and-rival", label: "Friend & rival" },
            { field: "vice-purveyor", label: "Vice purveyor" },
            { field: "special-abilities", label: "Special abilities" },
            { field: "crew-and-projects", label: "Crew & projects" },
          ],
        }}
      />
    </SheetFrame>
  );
}

export function BladesNpcSheet(props: SheetProps) {
  const sheet = useSheet(props);
  return (
    <SheetFrame {...sheet}>
      <SheetSectionView {...sheet} section={{ kind: "header" }} />
      <SheetSectionView {...sheet} section={{ kind: "npcFields" }} />
      <SheetSectionView
        {...sheet}
        section={{ kind: "text", fields: [{ field: "notes", label: "Notes" }] }}
      />
    </SheetFrame>
  );
}
