import { getCharacter, systemOf } from "../features/characters/api";
import { answerSave, applyDamage, canAnswer } from "../features/characters/resolution";
import { rollModesFor } from "../features/characters/moves";
import { appliedField, saveField, type SaveAnswer } from "../features/chat/messageState";
import { useMessageState } from "./ChatExtras";
import type { MoveMessage, MoveTarget, RollMessage } from "../features/chat/types";
import type { Campaign } from "../campaign/campaign";
import { useY } from "../ui/useY";
import { Button } from "../ui/Button";

/*
 * The parts of move and roll cards that resolve against targets: a roll per
 * target against its AC, roll requests that a target's owner answers, and
 * damage the GM applies. What changes after posting (answers, damage done)
 * comes from the campaign's message state.
 */

/** One row per target of a check against targets: the roll, what it had to reach, and hit or miss. */
export function TargetRolls({ campaign, m }: { campaign: Campaign; m: MoveMessage }) {
  const results = systemOf(campaign).results;
  return (
    <ul className="card-targets">
      {m.targets!.map((t) => {
        const label = results.find((r) => r.id === t.result)?.label;
        const verdict = t.hit === undefined ? null : t.hit ? "Hit" : "Miss";
        return (
          <li key={t.id} className="card-target" data-hit={t.hit}>
            <span className="card-target-name">
              {t.name}
              {t.distance && <span className="muted"> {t.distance}</span>}
              {t.long && <span className="muted"> long range</span>}
            </span>
            <span className="card-target-roll" title={t.roll?.formula}>
              {t.roll?.total}
              {t.against !== undefined && <span className="muted"> vs {t.against}</span>}
            </span>
            <span className="card-target-verdict">
              {[label, verdict].filter(Boolean).join(" · ")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** A roll request per target: a button for whoever may answer, then the answer against the DC. */
export function SaveRequests({ campaign, m }: { campaign: Campaign; m: MoveMessage }) {
  const save = m.save!;
  const state = useMessageState<SaveAnswer>(
    campaign,
    m.id,
    (m.targets ?? []).map((t) => saveField(t.id)),
  );
  const system = systemOf(campaign);
  const saveAction = system.actions.find((action) => action.id === save.action);
  const modes = saveAction ? rollModesFor(system, saveAction) : [];
  const gm = useY(campaign.members, () => campaign.isGm());
  return (
    <div className="card-save">
      <p className="card-save-head">
        {save.name} · Difficulty {save.difficulty}
      </p>
      <ul className="card-targets">
        {(m.targets ?? []).map((t) => {
          const answer: SaveAnswer | undefined = state[saveField(t.id)];
          return (
            <li key={t.id} className="card-target" data-hit={answer ? !answer.success : undefined}>
              <span className="card-target-name">{t.name}</span>
              {answer ? (
                <>
                  <span className="card-target-roll" title={answer.detail}>
                    {answer.total}
                  </span>
                  <span className="card-target-verdict">{answer.success ? "Saved" : "Failed"}</span>
                </>
              ) : gm || canAnswer(campaign, t) ? (
                <span className="card-target-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => answerSave(campaign, m.id, t, save, undefined, m.concentration)}
                  >
                    Roll
                  </Button>
                  {modes.map((mode) => (
                    <Button
                      key={mode.id}
                      size="sm"
                      variant="ghost"
                      onClick={() => answerSave(campaign, m.id, t, save, mode.id, m.concentration)}
                    >
                      {mode.label}
                    </Button>
                  ))}
                </span>
              ) : (
                <span className="muted">Waiting</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="card-save-outcomes">
        <strong>Success:</strong> {save.success} <strong>Failure:</strong> {save.failure}
      </p>
    </div>
  );
}

/** Damage or healing on a roll card: for the GM, buttons per target to apply it whole, halved or doubled. */
export function DamageTargets({ campaign, m }: { campaign: Campaign; m: RollMessage }) {
  const damage = m.damage!;
  const state = useMessageState<number>(
    campaign,
    m.id,
    damage.targets.map((t) => appliedField(t.id)),
  );
  const gm = useY(campaign.members, () => campaign.isGm());
  const healing = damage.type === "healing";
  const typeName =
    systemOf(campaign).damageTypes?.find((d) => d.id === damage.type)?.name ?? damage.type;
  const total = m.roll.total;
  const armor = systemOf(campaign).damageArmor;
  const apply = (t: MoveTarget, n: number, useArmor = false) =>
    applyDamage(campaign, m.id, t, n, healing, { armor: useArmor, type: damage.type });
  return (
    <div className="card-damage">
      <p className="card-save-head">{typeName}</p>
      <ul className="card-targets">
        {damage.targets.map((t) => {
          const applied: number | undefined = state[appliedField(t.id)];
          const targetCharacter = t.characterId ? getCharacter(campaign, t.characterId) : undefined;
          const shield = targetCharacter
            ? systemOf(campaign).damageBlockers?.(targetCharacter, damage.type)[0]
            : undefined;
          return (
            <li key={t.id} className="card-target">
              <span className="card-target-name">{t.name}</span>
              {applied !== undefined && (
                <span className="card-target-verdict">
                  {applied > 0 ? "+" : ""}
                  {applied} HP
                </span>
              )}
              {gm && t.characterId && applied === undefined && (
                <span className="card-target-actions">
                  {healing ? (
                    <Button size="sm" variant="ghost" onClick={() => apply(t, total)}>
                      Heal {total}
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Apply"
                        onClick={() => apply(t, total)}
                      >
                        {total}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Resistance: half"
                        onClick={() => apply(t, Math.floor(total / 2))}
                      >
                        ½
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Vulnerability: double"
                        onClick={() => apply(t, total * 2)}
                      >
                        ×2
                      </Button>
                      {armor &&
                        (getCharacter(campaign, t.characterId)?.resources[armor.resource] ?? 0) >
                          0 && (
                          <Button size="sm" variant="ghost" onClick={() => apply(t, total, true)}>
                            {armor.label}
                          </Button>
                        )}
                      {shield && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            applyDamage(campaign, m.id, t, total, false, {
                              type: damage.type,
                              shieldItemId: shield.id,
                            })
                          }
                        >
                          Block with {shield.name}
                        </Button>
                      )}
                    </>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
