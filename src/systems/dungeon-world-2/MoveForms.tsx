import type { ComponentType } from "react";
import { getCharacter, listCharacters } from "../../features/characters/api";
import {
  dungeonWorld2DowntimeEpoch,
  trainedDuringDungeonWorld2Downtime,
  type ComfortBenefit,
  type JourneyPace,
} from "./campaign";
import { sessionMoveUsed } from "../../features/characters/sessionMoves";
import { relationshipsOf } from "../../features/characters/relationships";
import type { CharacterView } from "../../features/characters/types";
import { Button } from "../../ui/Button";
import { useQuery } from "../../ui/useQuery";
import { derive } from "../../features/characters/store";
import type { MoveFormProps } from "../extensionTypes";
import { DW2_SERVICES, type ServiceRank } from "./wealth";
import { useState } from "react";
import {
  beginDowntime,
  carouse,
  comfort,
  endSession,
  makeCamp,
  prepareJourney,
  resupply,
  shop,
  train,
} from "./commands";
import { useCampaign } from "../../workspace/campaignContext";
import { can } from "../../workspace/commands/views";

/*
 * What some Dungeon World 2 moves ask for and do, shown with the move's text
 * wherever it's opened for a character: who is comforted and how, the
 * journey's leader and pace, Downtime's activities, the session's questions,
 * what each PC clears at camp.
 */

const SESSION_QUESTIONS = [
  "Did anyone add Depth to their Relationship(s)?",
  "Did we defeat a dangerous threat, visit a new location, and/or find a memorable treasure?",
  "Did we learn something new and important about the world or NPCs?",
] as const;
const COMFORT_QUESTIONS = [
  "Did you explore, change, or reaffirm a Relationship or Bond?",
  "Did they open up to you in return?",
  "Did either of you reveal something new about your Struggle?",
] as const;

/*
 * Campaign state lives in Yjs, which changes in place, so these forms read it
 * through useQuery: a read made directly in render would be memoized by React
 * Compiler and go stale.
 */

/** Whether the sheet's character has already used move `moveId` this session. */
function useUsedThisSession(sheet: MoveFormProps["sheet"], moveId: string) {
  const move = sheet.system.actions.find((action) => action.id === moveId);
  const sessionMessages = useQuery(sheet.campaign.chat.messages);
  return useQuery(sheet.campaign.systemData, () =>
    move ? sessionMoveUsed(sheet.campaign, sheet.c.id, move, sessionMessages) : false,
  );
}

function EndSession({ sheet }: MoveFormProps) {
  const ctx = useCampaign();
  const [answers, setAnswers] = useState<boolean[]>([false, false, false]);
  const used = useUsedThisSession(sheet, "end-the-session");
  return (
    <section className="move-form-section" aria-label="End the Session">
      {SESSION_QUESTIONS.map((question, index) => (
        <label className="check-option" key={question}>
          <input
            type="checkbox"
            checked={answers[index] ?? false}
            disabled={!sheet.editable || used}
            onChange={(event) => {
              const next = [...answers];
              next[index] = event.currentTarget.checked;
              setAnswers(next);
            }}
          />
          {question}
        </label>
      ))}
      <Button
        variant="secondary"
        disabled={!sheet.editable || used}
        onClick={() =>
          void ctx.execute(endSession, {
            characterId: sheet.c.id,
            answers: [answers[0] ?? false, answers[1] ?? false, answers[2] ?? false],
          })
        }
      >
        {used ? "Session ended" : "Award group XP"}
      </Button>
    </section>
  );
}

function ComfortOrSupport({ sheet }: MoveFormProps) {
  const ctx = useCampaign();
  const [comfortedId, setComfortedId] = useState("");
  const [answers, setAnswers] = useState<boolean[]>([false, false, false]);
  const [benefitKinds, setBenefitKinds] = useState<Record<number, string>>({});
  const [conditionPicks, setConditionPicks] = useState<Record<number, string>>({});
  const used = useUsedThisSession(sheet, "comfort-or-support");
  const partyJson = useQuery(sheet.campaign.characters, () =>
    JSON.stringify(listCharacters(sheet.campaign).filter((character) => character.kind === "pc")),
  );
  const party = JSON.parse(partyJson) as CharacterView[];
  const comforted = party.find((character) => character.id === comfortedId);
  const receiverDepth = useQuery(sheet.campaign.characters, () =>
    comforted
      ? (relationshipsOf(sheet.campaign.characters, comforted.id).find(
          (relationship) => relationship.to === sheet.c.id,
        )?.depth ?? 0)
      : 0,
  );
  const canGainDepth = receiverDepth < 3;
  const receiverLocked = new Set(comforted?.lockedConditions ?? []);
  const supporterLocked = new Set(sheet.c.lockedConditions ?? []);
  const receiverConditions =
    comforted?.conditions.filter((condition) => !receiverLocked.has(condition)) ?? [];
  const supporterConditions = sheet.c.conditions.filter(
    (condition) => !supporterLocked.has(condition),
  );
  const benefits: ComfortBenefit[] = [];
  let ready = !!comforted && comforted.id !== sheet.c.id;
  answers.forEach((yes, index) => {
    if (!yes) return;
    const kind = benefitKinds[index] ?? "clear-comforted";
    if (kind === "gain-depth") {
      if (canGainDepth) benefits.push({ kind });
      else ready = false;
    } else {
      const options = kind === "clear-comforted" ? receiverConditions : supporterConditions;
      const condition =
        conditionPicks[index] && options.includes(conditionPicks[index])
          ? conditionPicks[index]
          : options[0];
      if (!condition) ready = false;
      else benefits.push({ kind: kind as "clear-comforted" | "clear-supporter", condition });
    }
  });
  return (
    <section className="move-form-section" aria-label="Comfort or Support">
      <label className="field">
        Comforted PC
        <select
          value={comfortedId}
          disabled={!sheet.editable || used}
          onChange={(event) => setComfortedId(event.currentTarget.value)}
          onInput={(event) => setComfortedId(event.currentTarget.value)}
        >
          <option value="">Choose a PC</option>
          {party
            .filter((character) => character.id !== sheet.c.id)
            .map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
        </select>
      </label>
      {COMFORT_QUESTIONS.map((question, index) => (
        <div key={question}>
          <label className="check-option">
            <input
              type="checkbox"
              checked={answers[index] ?? false}
              disabled={!sheet.editable || used || !comforted}
              onChange={(event) => {
                const next = [...answers];
                next[index] = event.currentTarget.checked;
                setAnswers(next);
              }}
            />
            {question}
          </label>
          {answers[index] && (
            <div className="move-form">
              <label className="field">
                Benefit
                <select
                  value={benefitKinds[index] ?? "clear-comforted"}
                  disabled={!sheet.editable || used}
                  onChange={(event) =>
                    setBenefitKinds({
                      ...benefitKinds,
                      [index]: event.currentTarget.value,
                    })
                  }
                >
                  {receiverConditions.length > 0 && (
                    <option value="clear-comforted">Comforted clears a Condition</option>
                  )}
                  {canGainDepth && <option value="gain-depth">Comforted gains 1 Depth</option>}
                  {supporterConditions.length > 0 && (
                    <option value="clear-supporter">Supporter clears a Condition</option>
                  )}
                </select>
              </label>
              {(benefitKinds[index] ?? "clear-comforted") !== "gain-depth" && (
                <label className="field">
                  Condition
                  <select
                    value={
                      conditionPicks[index] ??
                      ((benefitKinds[index] ?? "clear-comforted") === "clear-comforted"
                        ? receiverConditions[0]
                        : supporterConditions[0]) ??
                      ""
                    }
                    disabled={!sheet.editable || used}
                    onChange={(event) =>
                      setConditionPicks({
                        ...conditionPicks,
                        [index]: event.currentTarget.value,
                      })
                    }
                  >
                    {((benefitKinds[index] ?? "clear-comforted") === "clear-comforted"
                      ? receiverConditions
                      : supporterConditions
                    ).map((condition) => (
                      <option key={condition} value={condition}>
                        {condition}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
      ))}
      <Button
        variant="secondary"
        disabled={!sheet.editable || used || !ready}
        onClick={() =>
          comforted &&
          void ctx.execute(comfort, { characterId: sheet.c.id, comforted: comforted.id, benefits })
        }
      >
        {used ? "Used this session" : "Resolve Comfort or Support"}
      </Button>
    </section>
  );
}

function PerilousJourney({ sheet }: MoveFormProps) {
  const ctx = useCampaign();
  const [pace, setPace] = useState<JourneyPace>("regular");
  const [chosenLeaderId, setChosenLeaderId] = useState<string | null>(null);
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const partyJson = useQuery(sheet.campaign.characters, () =>
    JSON.stringify(listCharacters(sheet.campaign).filter((character) => character.kind === "pc")),
  );
  const party = JSON.parse(partyJson) as CharacterView[];
  const leaderId = chosenLeaderId ?? sheet.c.id;
  const leader = party.find((character) => character.id === leaderId);
  const affected = pace === "quick" ? party : pace === "regular" && leader ? [leader] : [];
  const conditionPicks = Object.fromEntries(
    affected.map((character) => {
      const available = sheet.system.conditions.filter(
        (condition) => !character.conditions.includes(condition.id),
      );
      const selected = conditions[character.id];
      return [
        character.id,
        selected && available.some((condition) => condition.id === selected)
          ? selected
          : (available[0]?.id ?? ""),
      ];
    }),
  );
  const ready = affected.every((character) => !!conditionPicks[character.id]);
  return (
    <section className="move-form-section" aria-label="Undertake a Perilous Journey">
      <label className="field">
        Leader
        <select value={leaderId} onChange={(event) => setChosenLeaderId(event.currentTarget.value)}>
          {party.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Pace
        <select
          value={pace}
          onChange={(event) => setPace(event.currentTarget.value as JourneyPace)}
        >
          <option value="quick">Quickly, risking it all (-1; everyone marks a Condition)</option>
          <option value="regular">Regular pace (+1; leader marks a Condition)</option>
          <option value="slow">Slow and careful (+2)</option>
        </select>
      </label>
      {affected.map((character) => {
        const available = sheet.system.conditions.filter(
          (condition) => !character.conditions.includes(condition.id),
        );
        return (
          <label className="field" key={character.id}>
            {character.name} marks
            <select
              value={conditionPicks[character.id]}
              disabled={!sheet.editable}
              onChange={(event) =>
                setConditions({
                  ...conditions,
                  [character.id]: event.currentTarget.value,
                })
              }
            >
              {available.map((condition) => (
                <option key={condition.id} value={condition.id}>
                  {condition.name}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      <Button
        variant="secondary"
        disabled={!sheet.editable || !ready || !leader}
        onClick={() =>
          leader &&
          ctx.execute(prepareJourney, { characterId: leader.id, pace, conditions: conditionPicks })
        }
      >
        Prepare Journey
      </Button>
    </section>
  );
}

function Downtime({ sheet }: MoveFormProps) {
  const ctx = useCampaign();
  const [benefit, setBenefit] = useState<"clear-locked" | "gain-depth">(
    sheet.c.lockedConditions?.length ? "clear-locked" : "gain-depth",
  );
  const [condition, setCondition] = useState(sheet.c.lockedConditions?.[0] ?? "");
  const [partyId, setPartyId] = useState("");
  const [serviceId, setServiceId] = useState(DW2_SERVICES[0]!.id);
  const [serviceRank, setServiceRank] = useState<ServiceRank>(2);
  const epoch = useQuery(sheet.campaign.systemData, () =>
    dungeonWorld2DowntimeEpoch(sheet.campaign),
  );
  const trained = useQuery(sheet.campaign.systemData, () =>
    trainedDuringDungeonWorld2Downtime(sheet.campaign, sheet.c.id),
  );
  const partyJson = useQuery(sheet.campaign.characters, () =>
    JSON.stringify(listCharacters(sheet.campaign).filter((character) => character.kind === "pc")),
  );
  const boxes = useQuery(sheet.campaign.characters, () =>
    Number(getCharacter(sheet.campaign, sheet.c.id)?.data.treasureBoxes ?? 0),
  );
  const party = JSON.parse(partyJson) as CharacterView[];
  const others = party.filter((character) => character.id !== sheet.c.id);
  const selectedPartyId = partyId || others[0]?.id;
  const canClearLocked = (sheet.c.lockedConditions?.length ?? 0) > 0;
  const canGainDepth = useQuery(
    sheet.campaign.characters,
    () =>
      !!selectedPartyId &&
      (relationshipsOf(sheet.campaign.characters, sheet.c.id).find(
        (entry) => entry.to === selectedPartyId,
      )?.depth ?? 0) < 3,
  );
  return (
    <section className="move-form-section" aria-label="Enjoy Downtime">
      {can(ctx, beginDowntime, undefined) && (
        <Button variant="secondary" onClick={() => ctx.execute(beginDowntime, undefined)}>
          Begin Downtime
        </Button>
      )}
      <label className="field">
        Carouse
        <select
          value={benefit}
          onChange={(event) =>
            setBenefit(event.currentTarget.value as "clear-locked" | "gain-depth")
          }
        >
          <option value="clear-locked" disabled={!canClearLocked}>
            Spend 1 Treasure to clear a locked Condition
          </option>
          <option value="gain-depth" disabled={!canGainDepth}>
            Spend 1 Treasure to gain 1 Depth
          </option>
        </select>
      </label>
      {benefit === "clear-locked" && canClearLocked && (
        <label className="field">
          Locked Condition
          <select value={condition} onChange={(event) => setCondition(event.currentTarget.value)}>
            {sheet.c.lockedConditions?.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      )}
      {benefit === "gain-depth" && canGainDepth && (
        <label className="field">
          PC
          <select
            value={partyId || others[0]?.id || ""}
            onChange={(event) => setPartyId(event.currentTarget.value)}
          >
            {others.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Button
        variant="secondary"
        disabled={
          !sheet.editable ||
          epoch === 0 ||
          boxes < 1 ||
          (benefit === "clear-locked" ? !canClearLocked : !canGainDepth)
        }
        onClick={() =>
          ctx.execute(carouse, {
            characterId: sheet.c.id,
            benefit,
            target: partyId || others[0]?.id,
            condition,
          })
        }
      >
        Carouse
      </Button>
      <Button
        variant="secondary"
        disabled={!sheet.editable || epoch === 0 || boxes < 1}
        onClick={() => ctx.execute(resupply, { characterId: sheet.c.id })}
      >
        Resupply (1 Treasure)
      </Button>
      <label className="field">
        Shop service
        <select value={serviceId} onChange={(event) => setServiceId(event.currentTarget.value)}>
          {DW2_SERVICES.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Service tier
        <select
          value={serviceRank}
          onChange={(event) => setServiceRank(Number(event.currentTarget.value) as ServiceRank)}
        >
          <option value={2}>Modest (2)</option>
          <option value={3}>Comfortable (3)</option>
          <option value={4}>Rich (4)</option>
        </select>
      </label>
      <Button
        variant="secondary"
        disabled={!sheet.editable || epoch === 0 || boxes < 1}
        onClick={() =>
          void ctx.execute(shop, { characterId: sheet.c.id, service: serviceId, rank: serviceRank })
        }
      >
        Shop (1 Treasure)
      </Button>
      <Button
        variant="secondary"
        disabled={!sheet.editable || boxes < 1 || epoch === 0 || trained}
        onClick={() => ctx.execute(train, { characterId: sheet.c.id })}
      >
        {trained ? "Trained this Downtime" : "Train (1 Treasure for 1 XP)"}
      </Button>
    </section>
  );
}

function MakeCamp({ sheet }: MoveFormProps) {
  const ctx = useCampaign();
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [repairs, setRepairs] = useState<Record<string, string>>({});
  const used = useUsedThisSession(sheet, "make-camp");
  const partyJson = useQuery(sheet.campaign.characters, () =>
    JSON.stringify(listCharacters(sheet.campaign).filter((character) => character.kind === "pc")),
  );
  const party = JSON.parse(partyJson) as CharacterView[];
  const choices = Object.fromEntries(
    party.map((character) => {
      const marked = character.conditions.filter(
        (condition) => !character.lockedConditions?.includes(condition),
      );
      const selected = selections[character.id];
      return [character.id, selected && marked.includes(selected) ? selected : (marked[0] ?? "")];
    }),
  );
  const repairOptions = party.map((character) => {
    const hasSnapTheBlade = sheet.system
      .actionsFor(character, derive(character, sheet.system))
      .some((action) => action.name === "Snap the Blade");
    return [
      character,
      hasSnapTheBlade
        ? character.inventory.filter((item) => item.broken && !item.tags.includes("magic"))
        : [],
    ] as const;
  });
  const repairChoices = Object.fromEntries(
    repairOptions.map(([character, options]) => {
      const selected = repairs[character.id];
      return [
        character.id,
        selected && options.some((item) => item.id === selected)
          ? selected
          : (options[0]?.id ?? ""),
      ];
    }),
  );
  return (
    <section className="move-form-section" aria-label="Make Camp">
      {party.map((character) => {
        const options = character.conditions.filter(
          (condition) => !character.lockedConditions?.includes(condition),
        );
        return options.length > 0 ? (
          <label className="field" key={character.id}>
            {character.name} clears
            <select
              value={choices[character.id]}
              disabled={!sheet.editable || used}
              onChange={(event) =>
                setSelections({
                  ...selections,
                  [character.id]: event.currentTarget.value,
                })
              }
            >
              {options.map((condition) => (
                <option key={condition} value={condition}>
                  {condition}
                </option>
              ))}
            </select>
          </label>
        ) : null;
      })}
      {repairOptions.map(([character, options]) =>
        options.length > 0 ? (
          <label className="field" key={`repair:${character.id}`}>
            {character.name} repairs
            <select
              value={repairChoices[character.id]}
              disabled={!sheet.editable || used}
              onChange={(event) =>
                setRepairs({ ...repairs, [character.id]: event.currentTarget.value })
              }
            >
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null,
      )}
      <Button
        variant="secondary"
        disabled={!sheet.editable || used}
        onClick={() =>
          void ctx.execute(makeCamp, {
            characterId: sheet.c.id,
            clear: choices,
            repair: repairChoices,
          })
        }
      >
        {used ? "Camp completed" : "Finish Making Camp"}
      </Button>
    </section>
  );
}

/** Each move's form, by move id. */
export const DW2_MOVE_FORMS: Record<string, ComponentType<MoveFormProps>> = {
  "comfort-or-support": ComfortOrSupport,
  "perilous-journey": PerilousJourney,
  "enjoy-downtime": Downtime,
  "end-the-session": EndSession,
  "make-camp": MakeCamp,
};
