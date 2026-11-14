import { useRef, useState } from "react";
import { plainText } from "../data/richText";
import { ColourPicker } from "../ui/ColourPicker";
import { MoveBody } from "./MoveBody";
import { useQuery } from "../ui/useQuery";
import type { EntityGraphic } from "../media/images";
import type { CharacterView } from "../features/characters/types";
import { colourOf } from "../scene/presence";
import { TOKEN_STYLES } from "../scene/types";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import type { ActionDef, ConditionDef, GameSystem } from "../systems/types";
import { conditionColour } from "../features/combat/pipColours";
import { Button } from "../ui/Button";
import { EntityGraphicView } from "../ui/EntityGraphic";
import { GraphicPicker } from "../ui/GraphicPicker";
import { entryIcon } from "../ui/entryIcons";
import { IconAdd, IconImage, IconRemove, IconRename } from "../ui/icons";
import { List, Tag } from "../ui/List";
import { menuTrigger } from "../ui/menuTrigger";
import { usePopupDialog } from "./usePopupDialog";
import { Segmented, SegmentedOrSelect } from "../ui/Segmented";
import { Dialog } from "./Dialog";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { EntryRow, EntryWindow } from "./EntryWindow";
import { useEntryWindows } from "./entryWindowState";
import { linkProxy } from "./linkProxy";
import { makeVerb, rollTag } from "./actionPresentation";
import { dragToken } from "./tokenDrag";
import { getEntityGraphic } from "./entityGraphics";
import { actionMenuItems } from "./actionMenu";
import { dragEntity } from "./entityDrag";
import { entity } from "./dragEntities";
import { sessionUseSnapshot } from "../features/characters/sessionMoves";
import { useCampaign } from "./campaignContext";
import { chooseGraphic } from "./commands/campaign";
import { setField, toggleCondition } from "./commands/characters";

/*
 * Pieces every system's sheet can use: counters, the action list, and the
 * character's token. A system's sheet (systems/<id>/Sheet.tsx) puts them
 * together with its own fields.
 */

export function Counter({
  label,
  value,
  max,
  onChange,
  disabled,
  status,
}: {
  label: string;
  value: number;
  max?: number | undefined;
  onChange: (by: number) => void;
  disabled: boolean;
  /** A state it's in, shown beside the label and in the counter's colour: "Bloodied". */
  status?: { name: string; colour: string; title: string } | undefined;
}) {
  return (
    <fieldset
      className="counter"
      data-label={label}
      data-fill={max !== undefined}
      data-status={!!status}
      style={{
        ...(max !== undefined && {
          "--fill": `${Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100}%`,
        }),
        ...(status && { "--condition-colour": status.colour }),
      }}
    >
      <legend className="counter-label">
        <span className="eyebrow">{label}</span>
        {status && (
          <span className="counter-status" title={status.title}>
            <span className="condition-dot" aria-hidden="true" />
            {status.name}
          </span>
        )}
      </legend>
      <div className="counter-row">
        <Button
          variant="secondary"
          className="counter-btn"
          label={`Decrease ${label}`}
          disabled={disabled}
          onClick={() => onChange(-1)}
        >
          <IconRemove size={22} />
        </Button>
        <span className="counter-value">
          <CounterInput label={label} value={value} disabled={disabled} onChange={onChange} />
          {max !== undefined && <span className="muted">/{max}</span>}
        </span>
        <Button
          variant="secondary"
          className="counter-btn"
          label={`Increase ${label}`}
          disabled={disabled}
          onClick={() => onChange(1)}
        >
          <IconAdd size={22} />
        </Button>
      </div>
    </fieldset>
  );
}

/**
 * The counter's number, typed over directly. It reads as plain text until
 * hovered or focused; Enter or leaving the field commits, Escape reverts.
 * The change goes out as a step from the current value, so callers keep
 * their own clamping.
 */
function CounterInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (by: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    if (draft === null || cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    const next = Number(draft.trim().replace("−", "-"));
    setDraft(null);
    if (draft.trim() !== "" && Number.isFinite(next) && Math.trunc(next) !== value) {
      onChange(Math.trunc(next) - value);
    }
  };
  return (
    <input
      className="counter-input"
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={draft ?? String(value)}
      disabled={disabled}
      size={Math.max(1, (draft ?? String(value)).length)}
      onFocus={(e) => {
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          setDraft(null);
          onChange(e.key === "ArrowUp" ? 1 : -1);
        }
      }}
    />
  );
}

/**
 * Moves as a filterable list: one row each, with the move's rules in a
 * tooltip beside the row. Clicking a move turns its tooltip into a window
 * that stays open, to read and make the move from.
 */
export function MoveList({
  campaign,
  system,
  moves,
  ownerId,
  onMake,
  learned = [],
  onForget,
}: {
  campaign: Campaign;
  system: GameSystem;
  moves: ActionDef[];
  ownerId: string;
  onMake: (m: ActionDef) => void;
  /** Moves the character learned beyond their system's, which they can forget. */
  learned?: string[];
  onForget?: ((m: ActionDef) => void) | undefined;
}) {
  const ctx = useCampaign();
  // The system's groupings that this character has any of, in the system's order; the first is shown to start.
  const categories = system.actionCategories.filter((k) => moves.some((m) => m.category === k.id));
  const [filter, setFilter] = useState<string>(categories[0]?.id ?? "all");
  const windows = useEntryWindows();
  const sessionMessages = useQuery(campaign.chat.messages);
  // Read through useQuery, which re-reads on every change: the session's uses live in Yjs.
  const usedIds = new Set(
    JSON.parse(
      useQuery(campaign.systemData, () =>
        sessionUseSnapshot(campaign, ownerId, moves, sessionMessages),
      ),
    ) as string[],
  );
  const learnedIds = new Set(learned);
  const shown = filter === "all" ? moves : moves.filter((m) => m.category === filter);

  return (
    <div className="moves">
      {categories.length > 1 && (
        <SegmentedOrSelect
          label="Move type"
          value={filter}
          options={[{ id: "all", label: "All" }, ...categories]}
          onChange={(k) => setFilter(k)}
        />
      )}
      <List>
        {shown.map((m) => {
          const used = usedIds.has(m.id);
          return (
            <EntryRow
              key={m.id}
              name={m.name}
              Icon={entryIcon("move", m.category === "class" ? "class-move" : undefined)}
              tag={rollTag(system, m)}
              tip={plainText(m.text)}
              onOpen={(row) => windows.show(`move:${ownerId}:${m.id}`, row)}
              onPointerDown={(ev) => dragEntity(ctx.canvas, ev, entity(ctx, "move", m.id, m.name))}
              menuItems={[
                {
                  label: used ? "Already Used This Session" : makeVerb(m).label,
                  disabled: used,
                  onSelect: () => onMake(m),
                },
                ...actionMenuItems(ctx, [{ id: `move:${m.id}`, title: m.name }]),
              ]}
            >
              <MakeButton m={m} onMake={onMake} disabled={used} />
            </EntryRow>
          );
        })}
      </List>
      {windows.keys.map((key) => {
        const prefix = `move:${ownerId}:`;
        const m = key.startsWith(prefix)
          ? moves.find((k) => k.id === key.slice(prefix.length))
          : undefined;
        if (!m) return null;
        const tag = rollTag(system, m);
        const used = usedIds.has(m.id);
        return (
          <EntryWindow
            key={key}
            entryKey={key}
            title={m.name}
            text={plainText(m.text)}
            body={<MoveBody campaign={campaign} move={m} characterId={ownerId} />}
            onClose={() => windows.close(key)}
            proxy={linkProxy(
              ctx,
              "move",
              m.id,
              m.name,
              m.category === "class" ? "class-move" : undefined,
            )}
            menuItems={[
              {
                label: used ? "Already Used This Session" : makeVerb(m).label,
                disabled: used,
                onSelect: () => onMake(m),
              },
              ...(onForget && learnedIds.has(m.id)
                ? [
                    {
                      label: "Forget",
                      onSelect: () => {
                        windows.close(key);
                        onForget(m);
                      },
                    },
                  ]
                : []),
              ...actionMenuItems(ctx, [{ id: `move:${m.id}`, title: m.name }]),
            ]}
          >
            {tag && <Tag>{tag}</Tag>}
            {onForget && learnedIds.has(m.id) && (
              <Button
                variant="ghost"
                onClick={() => {
                  windows.close(key);
                  onForget(m);
                }}
              >
                Forget
              </Button>
            )}
            <MakeButton m={m} onMake={onMake} big disabled={used} />
          </EntryWindow>
        );
      })}
    </div>
  );
}

/** The character's stand-in token: drag it onto the map, click it to change its image. */
export function TokenChip({
  campaign,
  c,
  editable,
}: {
  campaign: Campaign;
  c: CharacterView;
  editable: boolean;
}) {
  const ctx = useCampaign();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState(false);
  const graphic = useQuery(campaign.entityGraphics, () =>
    getEntityGraphic(campaign, "character", c.id),
  );
  const pick = () => setSettings(true);
  const trigger = menuTrigger((x, y) => setMenu({ x, y }));
  const items: MenuItem[] = editable
    ? [
        { label: "Change Graphic…", Icon: IconImage, onSelect: pick },
        "divider" as const,
        {
          label: "Token Settings…",
          Icon: IconRename,
          onSelect: () => setSettings(true),
        },
      ]
    : [];
  return (
    <div className="sheet-graphic">
      <button
        type="button"
        className="token-chip"
        title={
          editable
            ? "Click to change the graphic; drag onto the map to place a token"
            : "Drag onto the map to place a token"
        }
        data-style={graphic.kind === "image" ? (c.tokenStyle ?? "disc") : "disc"}
        style={{ "--token-colour": c.tokenColour ?? "" }}
        {...trigger}
        onPointerDown={(e) => {
          trigger.onPointerDown(e);
          dragToken(ctx.canvas, e, {
            characterId: c.id,
            name: c.name,
            graphic,
            entityRef: { kind: "character", id: c.id },
            ...(c.tokenStyle ? { style: c.tokenStyle } : {}),
            ...(c.tokenColour ? { colour: c.tokenColour } : {}),
          });
        }}
        onClick={() => editable && pick()}
      >
        <EntityGraphicView graphic={graphic} size={58} />
      </button>
      {menu && items.length > 0 && (
        <ContextMenu {...menu} items={items} onClose={() => setMenu(null)} />
      )}
      {settings && (
        <TokenSettings
          campaign={campaign}
          c={c}
          graphic={graphic}
          onClose={() => setSettings(false)}
        />
      )}
    </div>
  );
}

function TokenSettings({
  c,
  graphic,
  onClose,
}: {
  campaign: Campaign;
  c: CharacterView;
  graphic: EntityGraphic;
  onClose: () => void;
}) {
  const ctx = useCampaign();
  const ref = usePopupDialog();
  const style = c.tokenStyle ?? "disc";
  const plain = style === "plain" && graphic.kind === "image";
  const me = useQuery(device);
  const colour = c.tokenColour ?? colourOf(me);
  return (
    <Dialog dialogRef={ref} title="Token settings" onClose={onClose}>
      <GraphicPicker
        graphic={graphic}
        onChange={(next) =>
          ctx.execute(chooseGraphic, { kind: "character", id: c.id, graphic: next })
        }
        onReset={() => ctx.execute(chooseGraphic, { kind: "character", id: c.id })}
      />
      <div className="field">
        Style
        <Segmented
          label="Token style"
          value={style}
          options={TOKEN_STYLES}
          onChange={(v) => ctx.execute(setField, { id: c.id, key: "tokenStyle", value: v })}
        />
      </div>
      <div className="field colour-field" data-disabled={plain}>
        Background and border
        <span className="colour-row">
          <ColourPicker
            label="Background and border"
            alpha
            value={colour}
            disabled={plain}
            onChange={(next) =>
              ctx.execute(setField, { id: c.id, key: "tokenColour", value: next })
            }
          />
          <span className="colour-hex">{colour}</span>
        </span>
      </div>
      <p className="muted">Applies wherever this character appears.</p>
    </Dialog>
  );
}

/** The button that uses an action: an icon in a list row, or labelled in its window. */
function MakeButton({
  m,
  onMake,
  big,
  disabled = false,
}: {
  m: ActionDef;
  onMake: (m: ActionDef) => void;
  big?: boolean;
  disabled?: boolean;
}) {
  const { label, Icon } = makeVerb(m);
  if (big) {
    return (
      <Button variant="primary" disabled={disabled} onClick={() => onMake(m)}>
        <Icon size={22} /> {label}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      className="move-make"
      data-tip-side="right"
      label={`${label}: ${m.name}`}
      aria-label={`${label}: ${m.name}`}
      disabled={disabled}
      title={disabled ? "Already used this session" : undefined}
      onClick={() => onMake(m)}
    >
      <Icon size={22} />
    </Button>
  );
}

/** Conditions to put on and take off, each a chip in the colour of its pip on the token. */
export function ConditionToggles({
  system,
  c,
  conditions = system.conditions,
  editable,
}: {
  campaign: Campaign;
  system: GameSystem;
  c: CharacterView;
  conditions?: ConditionDef[];
  editable: boolean;
}) {
  const ctx = useCampaign();
  const conditionIds = new Set(c.conditions);
  return (
    <ul className="condition-toggles">
      {conditions.map((condition) => (
        <li key={condition.id}>
          <Button
            className="condition-toggle"
            pressed={conditionIds.has(condition.id)}
            disabled={!editable}
            title={condition.text}
            style={{ "--condition-colour": conditionColour(system, condition.id) }}
            onClick={() => ctx.execute(toggleCondition, { id: c.id, condition: condition.id })}
          >
            <span className="condition-dot" aria-hidden="true" />
            {condition.name}
          </Button>
        </li>
      ))}
    </ul>
  );
}
