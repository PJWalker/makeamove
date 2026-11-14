import { useState } from "react";
import { commaListOf } from "../../lib/list";
import { Button } from "../../ui/Button";
import { AdvancementDialog } from "../../workspace/CreationParts";
import { ConditionToggles, Counter } from "../../workspace/sheetParts";
import { signedStr } from "../../workspace/actionPresentation";
import { DerivedEntry, type SectionContext } from "../../workspace/sheetSections";
import { useCampaign } from "../../workspace/campaignContext";
import { roll } from "../../workspace/commands/chat";
import { bumpData, bumpResource, rest, setData } from "../../workspace/commands/characters";
import { SKILLS } from "./data";
import { levelOf, num, RANK, valueOf } from "./sheetHooks";
import { FEATS } from "./origins";

/* The sections of a D&D 5.5e character sheet that are the system's own. */

/** Every section knows how to use an action by id: a check, a save, an initiative roll. */
type Sections = SectionContext & { use: (id: string) => void };

/** A titled block of the sheet. */
function Block({
  label,
  heading = label,
  children,
}: {
  label: string;
  heading?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="form-section sheet-section" aria-label={label}>
      <h3 className="sheet-heading">{heading}</h3>
      {children}
    </section>
  );
}

/** The choices made at creation and since: species, background, class and the like. */
export function CharacterDetails({ system, c, editable }: SectionContext) {
  const ctx = useCampaign();
  const level = levelOf(c.data);
  return (
    <Block label="Character details" heading="Character details">
      <div className="dnd-fields">
        {(system.creation?.choices ?? []).flatMap((ch) => {
          if (!(ch.at === "create" || (typeof ch.at === "number" && ch.at <= level))) return [];
          const options = ch.options.filter((o) =>
            Object.entries(o.requires ?? {}).every(([field, value]) => c.data[field] === value),
          );
          const value = String(c.data[ch.field] ?? "");
          return [
            <label key={ch.id} className="field">
              {ch.label}
              <select
                value={value}
                disabled={!editable}
                onChange={(e) =>
                  ctx.execute(setData, { id: c.id, key: ch.field, value: e.currentTarget.value })
                }
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
            </label>,
          ];
        })}
      </div>
    </Block>
  );
}

export function FeatsLine({ c }: Pick<SectionContext, "c">) {
  const feats = commaListOf(c.data.feats).flatMap((id) => FEATS.find((f) => f.id === id) ?? []);
  if (!feats.length) return null;
  return (
    <p className="dnd-feats">
      <span className="eyebrow">Feats</span>{" "}
      {feats.map((f, i) => (
        <span key={f.id} title={f.text}>
          {i > 0 && ", "}
          {f.name}
        </span>
      ))}
    </p>
  );
}

/** Hit points, hit dice, level, experience and gold, and heroic inspiration. */
export function VitalsSection({ c, d, editable }: SectionContext) {
  const ctx = useCampaign();
  const v = d.values;
  const level = levelOf(c.data);
  const xp = num(c.data.xp);
  return (
    <Block label="Vitals">
      <div className="sheet-vitals">
        <Counter
          label="HP"
          value={c.resources.hp ?? 0}
          max={v.maxHp}
          disabled={!editable}
          onChange={(by) =>
            ctx.execute(bumpResource, { id: c.id, resource: "hp", by, max: v.maxHp })
          }
        />
        <Counter
          label="Temp HP"
          value={num(c.data.tempHp)}
          disabled={!editable}
          onChange={(by) => ctx.execute(bumpData, { id: c.id, key: "tempHp", by })}
        />
        <Counter
          label={`Hit Dice (d${v.hitDie})`}
          value={c.resources.hitDice ?? 0}
          max={v.hitDiceMax}
          disabled={!editable}
          onChange={(by) =>
            ctx.execute(bumpResource, { id: c.id, resource: "hitDice", by, max: v.hitDiceMax })
          }
        />
        <Counter
          label="Level"
          value={level}
          disabled={!editable}
          onChange={(by) =>
            ctx.execute(setData, {
              id: c.id,
              key: "level",
              value: Math.min(20, Math.max(1, level + by)),
            })
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
              ctx.execute(setData, {
                id: c.id,
                key: "xp",
                value: Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)),
              })
            }
          />
        </label>
        <Counter
          label="GP"
          value={num(c.data.gp)}
          disabled={!editable}
          onChange={(by) => ctx.execute(bumpData, { id: c.id, key: "gp", by })}
        />
      </div>
      <div className="sheet-row">
        <label className="stat-deb">
          <input
            type="checkbox"
            checked={!!c.data.inspiration}
            disabled={!editable}
            onChange={() =>
              ctx.execute(setData, { id: c.id, key: "inspiration", value: !c.data.inspiration })
            }
          />
          Heroic Inspiration
        </label>
      </div>
    </Block>
  );
}

/** Offered once enough experience is earned: Level Up opens the advancement. */
export function LevelUp({ campaign, c, d, editable }: SectionContext) {
  const [levelling, setLevelling] = useState(false);
  const ready = editable && levelOf(c.data) < 20 && num(c.data.xp) >= valueOf(d.values, "xpNext");
  return (
    <>
      {ready && (
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
    </>
  );
}

/** Successes and failures, while at 0 hit points. */
export function DeathSaves({ c, editable, use }: Sections) {
  const ctx = useCampaign();
  if ((c.resources.hp ?? 0) !== 0) return null;
  const counter = (label: string, key: "deathSuccesses" | "deathFailures") => (
    <Counter
      label={label}
      value={num(c.data[key])}
      max={3}
      disabled={!editable}
      onChange={(by) => ctx.execute(bumpData, { id: c.id, key, by, max: 3 })}
    />
  );
  return (
    <Block label="Death saving throws" heading="Death saves">
      <div className="sheet-vitals">
        {counter("Successes", "deathSuccesses")}
        {counter("Failures", "deathFailures")}
      </div>
      <div className="sheet-row">
        <Button disabled={!editable} onClick={() => use("death-save")}>
          Death Save
        </Button>
      </div>
    </Block>
  );
}

/** Armor class, initiative, speed and the numbers that follow from them. */
export function CombatStats({ d, editable, use }: Pick<Sections, "d" | "editable" | "use">) {
  const v = d.values;
  const why = d.resolved.why;
  return (
    <section className="form-section sheet-derived-group" aria-label="Combat">
      <h3 className="sheet-heading">Combat</h3>
      <dl className="sheet-derived">
        <DerivedEntry
          label="AC"
          title={[...(why.armorBase ?? []), ...(why.acBonus ?? [])].join("\n") || undefined}
        >
          {v.ac}
        </DerivedEntry>
        <DerivedEntry label="Initiative">
          <button
            type="button"
            className="dnd-roll"
            disabled={!editable}
            onClick={() => use("initiative")}
          >
            {signedStr(valueOf(v, "initiative"))}
          </button>
        </DerivedEntry>
        <DerivedEntry label="Speed" title={why.speed?.join("\n")}>
          {v.speed} ft
        </DerivedEntry>
        <DerivedEntry label="Proficiency">{signedStr(valueOf(v, "prof"))}</DerivedEntry>
        <DerivedEntry label="Passive Perception">{v.passivePerception}</DerivedEntry>
        {valueOf(v, "spellDc") > 0 && (
          <>
            <DerivedEntry label="Spell save DC">{valueOf(v, "spellDc")}</DerivedEntry>
            <DerivedEntry label="Spell attack">{signedStr(valueOf(v, "spellAttack"))}</DerivedEntry>
          </>
        )}
      </dl>
    </section>
  );
}

export function SkillsSection({ system, c, d, editable, use }: Sections) {
  const ctx = useCampaign();
  return (
    <Block label="Skills">
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
                onClick={() =>
                  ctx.execute(setData, { id: c.id, key: `skill:${s.id}`, value: (rank + 1) % 3 })
                }
              />
              <button type="button" className="dnd-skill" onClick={() => use(`skill-${s.id}`)}>
                <span>{s.name}</span>
                <span className="muted">{abbr}</span>
                <span className="dnd-bonus">
                  {signedStr(valueOf(d.mods, s.ability) + valueOf(d.values, `skill:${s.id}`))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

/** Spell slots and the like: every pool with a size, except hit points and hit dice. */
export function ResourcePools({ system, c, d, editable }: SectionContext) {
  const ctx = useCampaign();
  const v = d.values;
  const pools = system.resources.filter(
    (r) => r.id !== "hp" && r.id !== "hitDice" && (v[r.max] ?? 0) > 0,
  );
  if (!pools.length) return null;
  return (
    <Block label="Resources">
      <div className="sheet-vitals">
        {pools.map((r) => (
          <Counter
            key={r.id}
            label={r.id === "pact" ? `Pact slots (level ${valueOf(v, "pactLevel")})` : r.name}
            value={Math.min(c.resources[r.id] ?? 0, valueOf(v, r.max))}
            max={valueOf(v, r.max)}
            disabled={!editable}
            onChange={(by) =>
              ctx.execute(bumpResource, {
                id: c.id,
                resource: r.id,
                by,
                max: valueOf(v, r.max),
              })
            }
          />
        ))}
      </div>
    </Block>
  );
}

export function RestSection({ c, d, editable }: SectionContext) {
  const ctx = useCampaign();
  const v = d.values;
  const conMod = d.mods.con;
  const spendHitDie = () => {
    ctx.execute(bumpResource, { id: c.id, resource: "hitDice", by: -1 });
    void ctx.execute(roll, {
      formula: `1d${v.hitDie}${conMod ? `${conMod < 0 ? "-" : "+"}${Math.abs(conMod)}[CON]` : ""}`,
      visibility: "public",
      comment: "Hit Die",
    });
  };
  const longRest = () => {
    ctx.commands.batch(() => {
      ctx.execute(rest, { characterId: c.id, event: "long-rest" });
      ctx.execute(setData, { id: c.id, key: "tempHp", value: 0 });
      ctx.execute(setData, { id: c.id, key: "deathSuccesses", value: 0 });
      ctx.execute(setData, { id: c.id, key: "deathFailures", value: 0 });
      if (v.exhaustion)
        ctx.execute(setData, { id: c.id, key: "exhaustion", value: v.exhaustion - 1 });
    });
  };
  return (
    <Block label="Rest">
      <div className="sheet-row">
        <Button disabled={!editable || !(c.resources.hitDice ?? 0)} onClick={spendHitDie}>
          Spend Hit Die
        </Button>
        <Button
          disabled={!editable}
          onClick={() => ctx.execute(rest, { characterId: c.id, event: "short-rest" })}
        >
          Short Rest
        </Button>
        <Button disabled={!editable} onClick={longRest}>
          Long Rest
        </Button>
      </div>
    </Block>
  );
}

/** Exhaustion, and the conditions a character can be under. */
export function ConditionsSection({
  campaign,
  system,
  c,
  d,
  editable,
  withExhaustion,
}: SectionContext & { withExhaustion: boolean }) {
  const ctx = useCampaign();
  return (
    <Block label="Conditions">
      {withExhaustion && (
        <div className="sheet-vitals">
          <Counter
            label="Exhaustion"
            value={valueOf(d.values, "exhaustion")}
            max={6}
            disabled={!editable}
            onChange={(by) => ctx.execute(bumpData, { id: c.id, key: "exhaustion", by, max: 6 })}
          />
        </div>
      )}
      <ConditionToggles campaign={campaign} system={system} c={c} editable={editable} />
    </Block>
  );
}
