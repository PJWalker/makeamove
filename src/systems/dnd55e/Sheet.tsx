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
  toggleCondition,
} from '../../characters/api'
import { actionsFor, derive, type CharacterView } from '../../characters/store'
import { postRoll } from '../../chat/send'
import type { Campaign } from '../../store/campaign'
import { device } from '../../store/device'
import { CharacterText } from '../../table/CharacterText'
import { Inventory } from '../../table/Inventory'
import { Counter, MoveList, signedStr, TokenChip } from '../../table/sheetParts'
import { Button } from '../../ui/Button'
import type { ActionDef, Derived, GameSystem } from '../types'
import { SKILLS } from './data'
import { useSignal } from '@preact/signals'
import { LevelUpDialog } from '../../table/CreationParts'
import { FEATS } from './origins'

/*
 * D&D 5.5e's character sheets, from the shared parts in table/sheetParts.tsx.
 * Every number that rolls is a button that makes its action, so advantage,
 * targets and the card work the same from the sheet, the hotbar and the palette.
 */

type Props = { campaign: Campaign; system: GameSystem; c: CharacterView }

const num = (v: unknown) => Number(v ?? 0)
const RANK = ['Not proficient', 'Proficient', 'Expertise']

function Name({ campaign, c, editable, detail }: { campaign: Campaign; c: CharacterView; editable: boolean; detail: string }) {
  return (
    <header class="sheet-head">
      <TokenChip campaign={campaign} c={c} editable={editable} />
      <div class="sheet-title">
        <input
          class="input bevel sheet-name"
          aria-label="Name"
          value={c.name}
          disabled={!editable}
          onChange={(e) => e.currentTarget.value.trim() && setField(campaign, c.id, 'name', e.currentTarget.value.trim())}
        />
        <span class="muted">{detail}</span>
      </div>
    </header>
  )
}

/** Ability scores, each with its check and saving throw. */
function Abilities({ campaign, system, c, d, editable, use }: Props & { d: Derived; editable: boolean; use: (id: string) => void }) {
  return (
    <ul class="sheet-stats dnd-abilities">
      {system.stats.map((s) => {
        const prof = d.values[`save:${s.id}`] > 0
        return (
          <li key={s.id}>
            <span class="stat-abbr" title={s.name}>
              {s.abbr}
            </span>
            <button type="button" class="stat-mod bevel" aria-label={`${s.name} check`} onClick={() => use(`check-${s.id}`)}>
              {signedStr(d.mods[s.id])}
            </button>
            <input
              class="input bevel stat-score"
              type="number"
              min={1}
              max={30}
              aria-label={`${s.name} score`}
              title={d.values[s.id] !== c.scores[s.id] ? `Effective ${d.values[s.id]}` : undefined}
              value={c.scores[s.id]}
              disabled={!editable}
              onChange={(e) => {
                const n = Number(e.currentTarget.value)
                if (n >= 1 && n <= 30) setScore(campaign, c.id, s.id, n)
              }}
            />
            <button type="button" class="dnd-save bevel" data-prof={prof} aria-label={`${s.name} save`} onClick={() => use(`save-${s.id}`)}>
              Save {signedStr(d.mods[s.id] + d.values[`save:${s.id}`])}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Conditions({ campaign, system, c, editable }: Props & { editable: boolean }) {
  return (
    <div class="dnd-conditions">
      {system.conditions.map((k) => (
        <label key={k.id} class="stat-deb" title={k.text}>
          <input type="checkbox" checked={c.conditions.includes(k.id)} disabled={!editable} onChange={() => toggleCondition(campaign, c.id, k.id)} />
          {k.name}
        </label>
      ))}
    </div>
  )
}

/** A player character's sheet. */
export function DndSheet({ campaign, system, c }: Props) {
  const d = derive(c, system)
  const v = d.values
  const cls = system.classes.find((k) => k.id === c.classId) ?? system.classes[0]
  const editable = canEdit(campaign, c)
  const actions = actionsFor(c, system, d)
  const use = (id: string) => {
    const a = system.actions.find((x) => x.id === id)
    if (a) startMove(campaign, c.id, a)
  }
  const hp = c.resources.hp ?? 0
  const xp = num(c.data.xp)
  const pools = system.resources.filter((r) => r.id !== 'hp' && r.id !== 'hitDice' && (v[r.max] ?? 0) > 0)
  const conMod = d.mods.con

  const levelling = useSignal(false)
  const spendHitDie = () => {
    bumpResource(campaign, c.id, 'hitDice', -1)
    postRoll(campaign, `1d${v.hitDie}${conMod ? `${conMod < 0 ? '-' : '+'}${Math.abs(conMod)}[CON]` : ''}`, 'public', 'Hit Die')
  }
  const longRest = () => {
    campaign.doc.transact(() => {
      rest(campaign, c.id, 'long-rest')
      setData(campaign, c.id, 'tempHp', 0)
      setData(campaign, c.id, 'deathSuccesses', 0)
      setData(campaign, c.id, 'deathFailures', 0)
      if (v.exhaustion) setData(campaign, c.id, 'exhaustion', v.exhaustion - 1)
    })
  }

  return (
    <div
      class="sheet"
      data-item-drop={editable ? c.id : undefined}
      data-move-drop={editable ? c.id : undefined}
    >
      <Name
        campaign={campaign}
        c={c}
        editable={editable}
        detail={`${cls.name} ${c.level}`}
      />

      <div class="dnd-fields">
        {(system.creation?.choices ?? [])
          .filter((ch) => ch.at === "create" || ch.at <= c.level)
          .map((ch) => {
            const options = ch.options.filter(
              (o) => !o.classId || o.classId === c.classId,
            );
            const value = String(c.data[ch.field] ?? "");
            return (
              <label key={ch.id} class="field">
                {ch.label}
                <select
                  class="input bevel"
                  value={value}
                  disabled={!editable}
                  onChange={(e) =>
                    setData(campaign, c.id, ch.field, e.currentTarget.value)
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
              </label>
            );
          })}
      </div>
      {!!c.data.feats && (
        <p class="dnd-feats">
          <span class="eyebrow">Feats</span>{" "}
          {String(c.data.feats)
            .split(",")
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

      <section class="sheet-section" aria-label="Vitals">
        <div class="sheet-vitals">
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
            onChange={(by) =>
              bumpResource(campaign, c.id, "hitDice", by, v.hitDiceMax)
            }
          />
          <Counter
            label="Level"
            value={c.level}
            disabled={!editable}
            onChange={(by) =>
              setField(
                campaign,
                c.id,
                "level",
                Math.min(20, Math.max(1, c.level + by)),
              )
            }
          />
          <label class="counter">
            <span class="eyebrow">
              XP{c.level < 20 && <span class="muted"> / {v.xpNext}</span>}
            </span>
            <input
              class="input bevel"
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
        <div class="sheet-row">
          <label class="stat-deb">
            <input
              type="checkbox"
              checked={!!c.data.inspiration}
              disabled={!editable}
              onChange={() =>
                setData(campaign, c.id, "inspiration", !c.data.inspiration)
              }
            />
            Heroic Inspiration
          </label>
        </div>
      </section>

      {editable && c.level < 20 && xp >= v.xpNext && (
        <div class="sheet-levelup">
          <Button size="sm" onClick={() => (levelling.value = true)}>
            Level up
          </Button>
        </div>
      )}
      {levelling.value && (
        <LevelUpDialog
          campaign={campaign}
          characterId={c.id}
          onClose={() => (levelling.value = false)}
        />
      )}

      {hp === 0 && (
        <section class="sheet-section" aria-label="Death saving throws">
          <h3 class="sheet-heading">Death saves</h3>
          <div class="sheet-vitals">
            <Counter
              label="Successes"
              value={num(c.data.deathSuccesses)}
              max={3}
              disabled={!editable}
              onChange={(by) =>
                bumpData(campaign, c.id, "deathSuccesses", by, 3)
              }
            />
            <Counter
              label="Failures"
              value={num(c.data.deathFailures)}
              max={3}
              disabled={!editable}
              onChange={(by) =>
                bumpData(campaign, c.id, "deathFailures", by, 3)
              }
            />
          </div>
          <div class="sheet-row">
            <Button
              size="sm"
              disabled={!editable}
              onClick={() => use("death-save")}
            >
              Death save
            </Button>
          </div>
        </section>
      )}

      <dl class="sheet-derived" aria-label="Combat">
        <div
          title={
            [
              ...(d.resolved.why.armorBase ?? []),
              ...(d.resolved.why.acBonus ?? []),
            ].join("\n") || undefined
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
              class="dnd-roll"
              disabled={!editable}
              onClick={() => use("initiative")}
            >
              {signedStr(v.initiative)}
            </button>
          </dd>
        </div>
        <div title={d.resolved.why.speed?.join("\n")}>
          <dt>Speed</dt>
          <dd>{v.speed} ft</dd>
        </div>
        <div>
          <dt>Proficiency</dt>
          <dd>{signedStr(v.prof)}</dd>
        </div>
        <div>
          <dt>Passive Perception</dt>
          <dd>{v.passivePerception}</dd>
        </div>
        {v.spellDc > 0 && (
          <>
            <div>
              <dt>Spell save DC</dt>
              <dd>{v.spellDc}</dd>
            </div>
            <div>
              <dt>Spell attack</dt>
              <dd>{signedStr(v.spellAttack)}</dd>
            </div>
          </>
        )}
      </dl>

      <section class="sheet-section" aria-label="Abilities">
        <h3 class="sheet-heading">Abilities</h3>
        <Abilities
          campaign={campaign}
          system={system}
          c={c}
          d={d}
          editable={editable}
          use={use}
        />
      </section>

      <section class="sheet-section" aria-label="Skills">
        <h3 class="sheet-heading">Skills</h3>
        <ul class="dnd-skills">
          {SKILLS.map((s) => {
            const rank = num(c.data[`skill:${s.id}`]);
            const abbr = system.stats.find((x) => x.id === s.ability)?.abbr;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  class="dnd-prof"
                  data-rank={rank}
                  aria-label={`${s.name}: ${RANK[rank]}`}
                  title={RANK[rank]}
                  disabled={!editable}
                  onClick={() =>
                    setData(campaign, c.id, `skill:${s.id}`, (rank + 1) % 3)
                  }
                />
                <button
                  type="button"
                  class="dnd-skill"
                  onClick={() => use(`skill-${s.id}`)}
                >
                  <span>{s.name}</span>
                  <span class="muted">{abbr}</span>
                  <span class="dnd-bonus">
                    {signedStr(d.mods[s.ability] + v[`skill:${s.id}`])}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {pools.length > 0 && (
        <section class="sheet-section" aria-label="Resources">
          <h3 class="sheet-heading">Resources</h3>
          <div class="sheet-vitals">
            {pools.map((r) => (
              <Counter
                key={r.id}
                label={
                  r.id === "pact" ? `Pact slots (level ${v.pactLevel})` : r.name
                }
                value={Math.min(c.resources[r.id] ?? 0, v[r.max])}
                max={v[r.max]}
                disabled={!editable}
                onChange={(by) =>
                  bumpResource(campaign, c.id, r.id, by, v[r.max])
                }
              />
            ))}
          </div>
        </section>
      )}

      <section class="sheet-section" aria-label="Rest">
        <div class="sheet-row">
          <Button
            size="sm"
            disabled={!editable || !(c.resources.hitDice ?? 0)}
            onClick={spendHitDie}
          >
            Spend Hit Die
          </Button>
          <Button
            size="sm"
            disabled={!editable}
            onClick={() => rest(campaign, c.id, "short-rest")}
          >
            Short rest
          </Button>
          <Button size="sm" disabled={!editable} onClick={longRest}>
            Long rest
          </Button>
        </div>
      </section>

      <section class="sheet-section" aria-label="Conditions">
        <h3 class="sheet-heading">Conditions</h3>
        <div class="sheet-vitals">
          <Counter
            label="Exhaustion"
            value={v.exhaustion}
            max={6}
            disabled={!editable}
            onChange={(by) => bumpData(campaign, c.id, "exhaustion", by, 6)}
          />
        </div>
        <Conditions
          campaign={campaign}
          system={system}
          c={c}
          editable={editable}
        />
      </section>

      <section
        class="sheet-section"
        aria-label="Actions"
        data-move-drop={editable ? c.id : undefined}
      >
        <h3 class="sheet-heading">Actions</h3>
        <MoveList
          campaign={campaign}
          system={system}
          moves={actions}
          ownerId={c.id}
          onMake={(m: ActionDef) => startMove(campaign, c.id, m)}
          learned={c.learned}
          onForget={
            editable
              ? (m) => setLearned(campaign, c.id, m.id, false)
              : undefined
          }
        />
      </section>

      <Inventory campaign={campaign} c={c} d={d} editable={editable} />

      <section class="sheet-section" aria-label="Features and notes">
        <h3 class="sheet-heading">Features &amp; notes</h3>
        <CharacterText
          campaign={campaign}
          c={c}
          field="features"
          label="Features and traits"
          editable={editable}
        />
        <CharacterText
          campaign={campaign}
          c={c}
          field="notes"
          label="Notes"
          editable={editable}
        />
      </section>
      <p class="muted sheet-owner">
        {c.owner === device.value.id
          ? "Yours"
          : editable
            ? "Editing as GM"
            : "View only"}
      </p>
    </div>
  );
}

/** An NPC or monster: a stat block's numbers and text. */
export function DndNpcSheet({ campaign, system, c }: Props) {
  const d = derive(c, system)
  const editable = canEdit(campaign, c)
  const maxHp = num(c.data.maxHp)
  const use = (id: string) => {
    const a = system.actions.find((x) => x.id === id)
    if (a) startMove(campaign, c.id, a)
  }
  const field = (id: string) => system.npcFields.find((f) => f.id === id)!
  const text = (f: { id: string; label: string; type: string }) =>
    f.type === 'longtext' ? (
      <CharacterText key={f.id} campaign={campaign} c={c} field={`field:${f.id}`} label={f.label} editable={editable} />
    ) : (
      <label key={f.id} class="field">
        {f.label}
        <input
          class="input bevel"
          type={f.type === 'number' ? 'number' : 'text'}
          value={c.fields[f.id]}
          disabled={!editable}
          onChange={(e) => setNpcField(campaign, c.id, f.id, f.type === 'number' ? Number(e.currentTarget.value) || 0 : e.currentTarget.value)}
        />
      </label>
    )
  return (
    <div
      class="sheet"
      data-item-drop={editable ? c.id : undefined}
      data-move-drop={editable ? c.id : undefined}
    >
      <Name campaign={campaign} c={c} editable={editable} detail="NPC" />
      <div class="sheet-vitals">
        <Counter
          label="HP"
          value={c.resources.hp ?? 0}
          max={maxHp}
          disabled={!editable}
          onChange={(by) => bumpResource(campaign, c.id, "hp", by, maxHp)}
        />
        <label class="counter">
          <span class="eyebrow">Max HP</span>
          <input
            class="input bevel stat-score"
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
      <div class="dnd-fields">
        {text(field("ac"))}
        {text(field("speed"))}
        {text(field("cr"))}
      </div>
      <dl class="sheet-derived" aria-label="Combat">
        <div>
          <dt>Initiative</dt>
          <dd>
            <button
              type="button"
              class="dnd-roll"
              disabled={!editable}
              onClick={() => use("initiative")}
            >
              {signedStr(d.values.initiative)}
            </button>
          </dd>
        </div>
      </dl>
      <Abilities
        campaign={campaign}
        system={system}
        c={c}
        d={d}
        editable={editable}
        use={use}
      />
      {text(field("senses"))}
      {text(field("languages"))}
      {text(field("traits"))}
      {text(field("actions"))}
      <section class="sheet-section" aria-label="Conditions">
        <h3 class="sheet-heading">Conditions</h3>
        <Conditions
          campaign={campaign}
          system={system}
          c={c}
          editable={editable}
        />
      </section>
      <Inventory campaign={campaign} c={c} editable={editable} />
      <CharacterText
        campaign={campaign}
        c={c}
        field="notes"
        label="Notes"
        editable={editable}
      />
    </div>
  );
}
