import { useState } from "react";
import {
  bumpData,
  bumpResource,
  canEdit,
  rest,
  setData,
  setField,
  setLearned,
  setNpcField,
  setScore,
  startMove,
} from "../../features/characters/api";
import { actionsFor, derive } from "../../features/characters/store";
import type { CharacterView } from "../../features/characters/types";
import { postRoll } from "../../features/chat/send";
import type { Campaign } from "../../campaign/campaign";
import { device } from "../../platform/device";
import { CharacterText } from "../../workspace/CharacterText";
import { commaListOf } from "../../lib/list";
import { Inventory } from "../../workspace/Inventory";
import { SheetSectionView } from "../../workspace/DeclarativeSheet";
import {
  ConditionToggles,
  Counter,
  MoveList,
  signedStr,
  TokenChip,
} from "../../workspace/sheetParts";
import { Button } from "../../ui/Button";
import type { ActionDef, Derived, GameSystem } from "../types";
import { SKILLS } from "./data";
import { AdvancementDialog } from "../../workspace/CreationParts";
import { FEATS } from "./origins";
import { useValue } from "../../ui/useValue";

/*
 * D&D 5.5e's character sheets, from the shared parts in workspace/sheetParts.tsx.
 * Every number that rolls is a button that makes its action, so advantage,
 * targets and the card work the same from the sheet, the hotbar and the palette.
 */

type Props = { campaign: Campaign; system: GameSystem; c: CharacterView };

const num = (v: unknown) => Number(v ?? 0);
const valueOf = (values: Record<string, number>, key: string) => values[key] ?? 0;
const RANK = ["Not proficient", "Proficient", "Expertise"];

function Name({
  campaign,
  c,
  editable,
  detail,
}: {
  campaign: Campaign;
  c: CharacterView;
  editable: boolean;
  detail: string;
}) {
  return (
    <header className="sheet-head">
      <TokenChip campaign={campaign} c={c} editable={editable} />
      <div className="sheet-title">
        <input
          className="sheet-name"
          aria-label="Name"
          value={c.name}
          disabled={!editable}
          onChange={(e) =>
            e.currentTarget.value.trim() &&
            setField(campaign, c.id, "name", e.currentTarget.value.trim())
          }
        />
        <span className="muted">{detail}</span>
      </div>
    </header>
  );
}

/** Ability scores, each with its check and saving throw. */
function Abilities({
  campaign,
  system,
  c,
  d,
  editable,
  use,
}: Props & { d: Derived; editable: boolean; use: (id: string) => void }) {
  return (
    <ul className="sheet-stats dnd-abilities">
      {system.stats.map((s) => {
        const saveBonus = valueOf(d.values, `save:${s.id}`);
        const score = valueOf(d.values, s.id);
        const modifier = valueOf(d.mods, s.id);
        const prof = saveBonus > 0;
        return (
          <li key={s.id}>
            <span className="stat-abbr" title={s.name}>
              {s.abbr}
            </span>
            <button
              type="button"
              className="stat-mod"
              aria-label={`${s.name} check`}
              onClick={() => use(`check-${s.id}`)}
            >
              {signedStr(modifier)}
            </button>
            <input
              className="stat-score"
              type="number"
              min={1}
              max={30}
              aria-label={`${s.name} score`}
              title={score !== c.scores[s.id] ? `Effective ${score}` : undefined}
              value={c.scores[s.id]}
              disabled={!editable}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                if (n >= 1 && n <= 30) setScore(campaign, c.id, s.id, n);
              }}
            />
            <button
              type="button"
              className="dnd-save"
              data-prof={prof}
              aria-label={`${s.name} save`}
              onClick={() => use(`save-${s.id}`)}
            >
              Save {signedStr(modifier + saveBonus)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A player character's sheet. */
export function DndSheet({ campaign, system, c }: Props) {
  const d = derive(c, system);
  const v = d.values;
  const level = Math.min(20, Math.max(1, num(c.data.level) || 1));
  const classChoice = system.creation?.choices.find((choice) => choice.field === "classId");
  const cls = classChoice?.options.find((option) => option.id === c.data.classId);
  const editable = canEdit(campaign, c);
  const me = useValue(device).id;
  const actions = actionsFor(c, system, d);
  const use = (id: string) => {
    const a = system.actions.find((x) => x.id === id);
    if (a) startMove(campaign, c.id, a);
  };
  const hp = c.resources.hp ?? 0;
  const xp = num(c.data.xp);
  const pools = system.resources.filter(
    (r) => r.id !== "hp" && r.id !== "hitDice" && (v[r.max] ?? 0) > 0,
  );
  const conMod = d.mods.con;

  const [levelling, setLevelling] = useState(false);
  const spendHitDie = () => {
    bumpResource(campaign, c.id, "hitDice", -1);
    void postRoll(
      campaign,
      `1d${v.hitDie}${conMod ? `${conMod < 0 ? "-" : "+"}${Math.abs(conMod)}[CON]` : ""}`,
      "public",
      "Hit Die",
    );
  };
  const longRest = () => {
    campaign.doc.transact(() => {
      rest(campaign, c.id, "long-rest");
      setData(campaign, c.id, "tempHp", 0);
      setData(campaign, c.id, "deathSuccesses", 0);
      setData(campaign, c.id, "deathFailures", 0);
      if (v.exhaustion) setData(campaign, c.id, "exhaustion", v.exhaustion - 1);
    });
  };

  return (
    <div
      className="sheet"
      data-item-drop={editable ? c.id : undefined}
      data-move-drop={editable ? c.id : undefined}
    >
      <Name
        campaign={campaign}
        c={c}
        editable={editable}
        detail={`${cls?.name ?? c.data.classId} ${level}`}
      />

      <section className="form-section sheet-section" aria-label="Character details">
        <h3 className="sheet-heading">Character details</h3>
        <div className="dnd-fields">
          {(system.creation?.choices ?? [])
            .filter((ch) => ch.at === "create" || (typeof ch.at === "number" && ch.at <= level))
            .map((ch) => {
              const options = ch.options.filter((o) =>
                Object.entries(o.requires ?? {}).every(([field, value]) => c.data[field] === value),
              );
              const value = String(c.data[ch.field] ?? "");
              return (
                <label key={ch.id} className="field">
                  {ch.label}
                  <select
                    value={value}
                    disabled={!editable}
                    onChange={(e) => setData(campaign, c.id, ch.field, e.currentTarget.value)}
                  >
                    <option value="">None</option>
                    {/* A value typed before species and backgrounds were data. */}
                    {value && !options.some((o) => o.id === value) && (
                      <option value={value}>{value}</option>
                    )}
                    {options.map((o) => (
                      <option key={o.id} value={o.id} title={o.text}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
        </div>
      </section>
      {!!c.data.feats && (
        <p className="dnd-feats">
          <span className="eyebrow">Feats</span>{" "}
          {commaListOf(c.data.feats)
            .map((id) => FEATS.find((f) => f.id === id))
            .filter((f) => !!f)
            .map((f, i) => (
              <span key={f.id} title={f.text}>
                {i > 0 && ", "}
                {f.name}
              </span>
            ))}
        </p>
      )}

      <section className="form-section sheet-section" aria-label="Vitals">
        <h3 className="sheet-heading">Vitals</h3>
        <div className="sheet-vitals">
          <Counter
            label="HP"
            value={hp}
            max={v.maxHp}
            disabled={!editable}
            onChange={(by) => bumpResource(campaign, c.id, "hp", by, v.maxHp)}
          />
          <Counter
            label="Temp HP"
            value={num(c.data.tempHp)}
            disabled={!editable}
            onChange={(by) => bumpData(campaign, c.id, "tempHp", by)}
          />
          <Counter
            label={`Hit Dice (d${v.hitDie})`}
            value={c.resources.hitDice ?? 0}
            max={v.hitDiceMax}
            disabled={!editable}
            onChange={(by) => bumpResource(campaign, c.id, "hitDice", by, v.hitDiceMax)}
          />
          <Counter
            label="Level"
            value={level}
            disabled={!editable}
            onChange={(by) =>
              setData(campaign, c.id, "level", Math.min(20, Math.max(1, level + by)))
            }
          />
          <label className="counter">
            <span className="eyebrow">
              XP{level < 20 && <span className="muted"> / {v.xpNext}</span>}
            </span>
            <input
              type="number"
              min={0}
              value={xp}
              disabled={!editable}
              onChange={(e) =>
                setData(
                  campaign,
                  c.id,
                  "xp",
                  Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)),
                )
              }
            />
          </label>
          <Counter
            label="GP"
            value={num(c.data.gp)}
            disabled={!editable}
            onChange={(by) => bumpData(campaign, c.id, "gp", by)}
          />
        </div>
        <div className="sheet-row">
          <label className="stat-deb">
            <input
              type="checkbox"
              checked={!!c.data.inspiration}
              disabled={!editable}
              onChange={() => setData(campaign, c.id, "inspiration", !c.data.inspiration)}
            />
            Heroic Inspiration
          </label>
        </div>
      </section>

      {editable && level < 20 && xp >= valueOf(v, "xpNext") && (
        <div className="sheet-advancement">
          <Button onClick={() => setLevelling(true)}>Level Up</Button>
        </div>
      )}
      {levelling && (
        <AdvancementDialog
          campaign={campaign}
          characterId={c.id}
          onClose={() => setLevelling(false)}
        />
      )}

      {hp === 0 && (
        <section className="form-section sheet-section" aria-label="Death saving throws">
          <h3 className="sheet-heading">Death saves</h3>
          <div className="sheet-vitals">
            <Counter
              label="Successes"
              value={num(c.data.deathSuccesses)}
              max={3}
              disabled={!editable}
              onChange={(by) => bumpData(campaign, c.id, "deathSuccesses", by, 3)}
            />
            <Counter
              label="Failures"
              value={num(c.data.deathFailures)}
              max={3}
              disabled={!editable}
              onChange={(by) => bumpData(campaign, c.id, "deathFailures", by, 3)}
            />
          </div>
          <div className="sheet-row">
            <Button disabled={!editable} onClick={() => use("death-save")}>
              Death Save
            </Button>
          </div>
        </section>
      )}

      <section className="form-section sheet-derived-group" aria-label="Combat">
        <h3 className="sheet-heading">Combat</h3>
        <dl className="sheet-derived">
          <div
            title={
              [...(d.resolved.why.armorBase ?? []), ...(d.resolved.why.acBonus ?? [])].join("\n") ||
              undefined
            }
          >
            <dt>AC</dt>
            <dd>{v.ac}</dd>
          </div>
          <div>
            <dt>Initiative</dt>
            <dd>
              <button
                type="button"
                className="dnd-roll"
                disabled={!editable}
                onClick={() => use("initiative")}
              >
                {signedStr(valueOf(v, "initiative"))}
              </button>
            </dd>
          </div>
          <div title={d.resolved.why.speed?.join("\n")}>
            <dt>Speed</dt>
            <dd>{v.speed} ft</dd>
          </div>
          <div>
            <dt>Proficiency</dt>
            <dd>{signedStr(valueOf(v, "prof"))}</dd>
          </div>
          <div>
            <dt>Passive Perception</dt>
            <dd>{v.passivePerception}</dd>
          </div>
          {valueOf(v, "spellDc") > 0 && (
            <>
              <div>
                <dt>Spell save DC</dt>
                <dd>{valueOf(v, "spellDc")}</dd>
              </div>
              <div>
                <dt>Spell attack</dt>
                <dd>{signedStr(valueOf(v, "spellAttack"))}</dd>
              </div>
            </>
          )}
        </dl>
      </section>

      <section className="form-section sheet-section" aria-label="Abilities">
        <h3 className="sheet-heading">Abilities</h3>
        <Abilities campaign={campaign} system={system} c={c} d={d} editable={editable} use={use} />
      </section>

      <section className="form-section sheet-section" aria-label="Skills">
        <h3 className="sheet-heading">Skills</h3>
        <ul className="dnd-skills">
          {SKILLS.map((s) => {
            const rank = num(c.data[`skill:${s.id}`]);
            const abbr = system.stats.find((x) => x.id === s.ability)?.abbr;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className="dnd-prof"
                  data-rank={rank}
                  aria-label={`${s.name}: ${RANK[rank]}`}
                  title={RANK[rank]}
                  disabled={!editable}
                  onClick={() => setData(campaign, c.id, `skill:${s.id}`, (rank + 1) % 3)}
                />
                <button type="button" className="dnd-skill" onClick={() => use(`skill-${s.id}`)}>
                  <span>{s.name}</span>
                  <span className="muted">{abbr}</span>
                  <span className="dnd-bonus">
                    {signedStr(valueOf(d.mods, s.ability) + valueOf(v, `skill:${s.id}`))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {pools.length > 0 && (
        <section className="form-section sheet-section" aria-label="Resources">
          <h3 className="sheet-heading">Resources</h3>
          <div className="sheet-vitals">
            {pools.map((r) => (
              <Counter
                key={r.id}
                label={r.id === "pact" ? `Pact slots (level ${valueOf(v, "pactLevel")})` : r.name}
                value={Math.min(c.resources[r.id] ?? 0, valueOf(v, r.max))}
                max={valueOf(v, r.max)}
                disabled={!editable}
                onChange={(by) => bumpResource(campaign, c.id, r.id, by, valueOf(v, r.max))}
              />
            ))}
          </div>
        </section>
      )}

      <section className="form-section sheet-section" aria-label="Rest">
        <h3 className="sheet-heading">Rest</h3>
        <div className="sheet-row">
          <Button disabled={!editable || !(c.resources.hitDice ?? 0)} onClick={spendHitDie}>
            Spend Hit Die
          </Button>
          <Button disabled={!editable} onClick={() => rest(campaign, c.id, "short-rest")}>
            Short Rest
          </Button>
          <Button disabled={!editable} onClick={longRest}>
            Long Rest
          </Button>
        </div>
      </section>

      <section className="form-section sheet-section" aria-label="Conditions">
        <h3 className="sheet-heading">Conditions</h3>
        <div className="sheet-vitals">
          <Counter
            label="Exhaustion"
            value={valueOf(v, "exhaustion")}
            max={6}
            disabled={!editable}
            onChange={(by) => bumpData(campaign, c.id, "exhaustion", by, 6)}
          />
        </div>
        <ConditionToggles campaign={campaign} system={system} c={c} editable={editable} />
      </section>

      <section
        className="form-section sheet-section"
        aria-label="Actions"
        data-move-drop={editable ? c.id : undefined}
      >
        <h3 className="sheet-heading">Actions</h3>
        <MoveList
          campaign={campaign}
          system={system}
          moves={actions}
          ownerId={c.id}
          onMake={(m: ActionDef) => startMove(campaign, c.id, m)}
          learned={c.learned}
          onForget={editable ? (m) => setLearned(campaign, c.id, m.id, false) : undefined}
        />
      </section>

      {["spellbook", "cantrips", "prepared"].map((loadout) => (
        <SheetSectionView
          key={loadout}
          campaign={campaign}
          system={system}
          c={c}
          d={d}
          editable={editable}
          section={{ kind: "loadout", loadout }}
        />
      ))}
      <Inventory campaign={campaign} c={c} d={d} editable={editable} />

      <section className="form-section sheet-section" aria-label="Features and notes">
        <h3 className="sheet-heading">Features &amp; notes</h3>
        <CharacterText
          campaign={campaign}
          c={c}
          field="features"
          label="Features and traits"
          editable={editable}
        />
        <CharacterText campaign={campaign} c={c} field="notes" label="Notes" editable={editable} />
      </section>
      <p className="muted sheet-owner">
        {c.owner === me ? "Yours" : editable ? "Editing as GM" : "View only"}
      </p>
    </div>
  );
}

/** An NPC or monster: a stat block's numbers and text. */
export function DndNpcSheet({ campaign, system, c }: Props) {
  const d = derive(c, system);
  const editable = canEdit(campaign, c);
  const maxHp = num(c.data.maxHp);
  const use = (id: string) => {
    const a = system.actions.find((x) => x.id === id);
    if (a) startMove(campaign, c.id, a);
  };
  const field = (id: string) => system.npcFields.find((f) => f.id === id)!;
  const text = (f: { id: string; label: string; type: string }) =>
    f.type === "longtext" ? (
      <CharacterText
        key={f.id}
        campaign={campaign}
        c={c}
        field={`field:${f.id}`}
        label={f.label}
        editable={editable}
      />
    ) : (
      <label key={f.id} className="field">
        {f.label}
        <input
          type={f.type === "number" ? "number" : "text"}
          value={c.fields[f.id]}
          disabled={!editable}
          onChange={(e) =>
            setNpcField(
              campaign,
              c.id,
              f.id,
              f.type === "number" ? Number(e.currentTarget.value) || 0 : e.currentTarget.value,
            )
          }
        />
      </label>
    );
  return (
    <div
      className="sheet"
      data-item-drop={editable ? c.id : undefined}
      data-move-drop={editable ? c.id : undefined}
    >
      <Name campaign={campaign} c={c} editable={editable} detail="NPC" />
      <section className="form-section sheet-section" aria-label="Vitals">
        <h3 className="sheet-heading">Vitals</h3>
        <div className="sheet-vitals">
          <Counter
            label="HP"
            value={c.resources.hp ?? 0}
            max={maxHp}
            disabled={!editable}
            onChange={(by) => bumpResource(campaign, c.id, "hp", by, maxHp)}
          />
          <label className="counter">
            <span className="eyebrow">Max HP</span>
            <input
              className="stat-score"
              type="number"
              min={1}
              value={maxHp}
              disabled={!editable}
              onChange={(e) => {
                const n = Math.floor(Number(e.currentTarget.value));
                if (n >= 1) setData(campaign, c.id, "maxHp", n);
              }}
            />
          </label>
          <Counter
            label="Temp HP"
            value={num(c.data.tempHp)}
            disabled={!editable}
            onChange={(by) => bumpData(campaign, c.id, "tempHp", by)}
          />
        </div>
      </section>
      <section className="form-section sheet-section" aria-label="Defenses">
        <h3 className="sheet-heading">Defenses</h3>
        <div className="dnd-fields">
          {text(field("ac"))}
          {text(field("speed"))}
          {text(field("cr"))}
        </div>
      </section>
      <section className="form-section sheet-derived-group" aria-label="Combat">
        <h3 className="sheet-heading">Combat</h3>
        <dl className="sheet-derived">
          <div>
            <dt>Initiative</dt>
            <dd>
              <button
                type="button"
                className="dnd-roll"
                disabled={!editable}
                onClick={() => use("initiative")}
              >
                {signedStr(valueOf(d.values, "initiative"))}
              </button>
            </dd>
          </div>
        </dl>
      </section>
      <section className="form-section sheet-section" aria-label="Abilities">
        <h3 className="sheet-heading">Abilities</h3>
        <Abilities campaign={campaign} system={system} c={c} d={d} editable={editable} use={use} />
      </section>
      <section className="form-section sheet-section" aria-label="Traits and actions">
        <h3 className="sheet-heading">Traits and actions</h3>
        {text(field("senses"))}
        {text(field("languages"))}
        {text(field("traits"))}
        {text(field("actions"))}
      </section>
      <section className="form-section sheet-section" aria-label="Conditions">
        <h3 className="sheet-heading">Conditions</h3>
        <ConditionToggles campaign={campaign} system={system} c={c} editable={editable} />
      </section>
      <Inventory campaign={campaign} c={c} editable={editable} />
      <CharacterText campaign={campaign} c={c} field="notes" label="Notes" editable={editable} />
    </div>
  );
}
