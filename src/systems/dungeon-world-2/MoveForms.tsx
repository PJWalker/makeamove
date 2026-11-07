import { useSignal } from "@preact/signals-react";
import type { ComponentType } from "react";
import type { Campaign } from "../../campaign/campaign";
import {
  beginDungeonWorld2Downtime,
  carouseDungeonWorld2,
  dungeonWorld2DowntimeEpoch,
  endDungeonWorld2Session,
  getCharacter,
  listCharacters,
  makeDungeonWorld2Camp,
  prepareDungeonWorld2Journey,
  resupplyDungeonWorld2,
  resolveComfortOrSupport,
  shopDungeonWorld2Service,
  trainDungeonWorld2,
  trainedDuringDungeonWorld2Downtime,
  type ComfortBenefit,
  type JourneyPace,
} from "../../features/characters/api";
import { sessionMoveUsed, sessionUseSnapshot } from "../../features/characters/sessionMoves";
import { relationshipsOf } from "../../features/characters/relationships";
import type { CharacterView } from "../../features/characters/types";
import { Button } from "../../ui/Button";
import { useY } from "../../ui/useY";
import { derive } from "../../features/characters/store";
import type { GameSystem } from "../types";
import { DW2_SERVICES, type ServiceRank } from "./wealth";

/*
 * What some Dungeon World 2 moves ask for and do, shown with the move's text
 * wherever it's opened for a character: who is comforted and how, the
 * journey's leader and pace, Downtime's activities, the session's questions,
 * what each PC clears at camp.
 */

export interface MoveFormProps {
  sheet: {
    campaign: Campaign;
    /** The character making the move. */
    c: CharacterView;
    system: GameSystem;
    editable: boolean;
  };
}

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

function EndSession({ sheet }: MoveFormProps) {
  const answers = useSignal<boolean[]>([false, false, false]);
  const move = sheet.system.actions.find((action) => action.id === "end-the-session");
  const sessionMessages = sheet.campaign.chat.messages.value;
  const usage = useY(sheet.campaign.systemData, () =>
    sessionUseSnapshot(sheet.campaign, sheet.c.id, move ? [move] : [], sessionMessages),
  );
  void usage;
  const used = move ? sessionMoveUsed(sheet.campaign, sheet.c.id, move, sessionMessages) : false;
  return (
    <section className="move-form-section" aria-label="End the Session">
      {SESSION_QUESTIONS.map((question, index) => (
        <label className="check-option" key={question}>
          <input
            type="checkbox"
            checked={answers.value[index] ?? false}
            disabled={!sheet.editable || used}
            onChange={(event) => {
              const next = [...answers.value];
              next[index] = event.currentTarget.checked;
              answers.value = next;
            }}
          />
          {question}
        </label>
      ))}
      <Button
        variant="secondary"
        disabled={!sheet.editable || used}
        onClick={() =>
          void endDungeonWorld2Session(sheet.campaign, sheet.c.id, [
            answers.value[0] ?? false,
            answers.value[1] ?? false,
            answers.value[2] ?? false,
          ])
        }
      >
        {used ? "Session ended" : "Award group XP"}
      </Button>
    </section>
  );
}

function ComfortOrSupport({ sheet }: MoveFormProps) {
  const comfortedId = useSignal("");
  const answers = useSignal<boolean[]>([false, false, false]);
  const benefitKinds = useSignal<Record<number, string>>({});
  const conditionPicks = useSignal<Record<number, string>>({});
  const move = sheet.system.actions.find((action) => action.id === "comfort-or-support");
  const sessionMessages = sheet.campaign.chat.messages.value;
  const usage = useY(sheet.campaign.systemData, () =>
    sessionUseSnapshot(sheet.campaign, sheet.c.id, move ? [move] : [], sessionMessages),
  );
  const partyJson = useY(sheet.campaign.characters, () =>
    JSON.stringify(listCharacters(sheet.campaign).filter((character) => character.kind === "pc")),
  );
  void usage;
  const party = JSON.parse(partyJson) as CharacterView[];
  const comforted = party.find((character) => character.id === comfortedId.value);
  const receiverDepth = comforted
    ? (relationshipsOf(sheet.campaign.characters, comforted.id).find(
        (relationship) => relationship.to === sheet.c.id,
      )?.depth ?? 0)
    : 0;
  const canGainDepth = receiverDepth < 3;
  const receiverConditions =
    comforted?.conditions.filter((condition) => !comforted.lockedConditions?.includes(condition)) ??
    [];
  const supporterConditions = sheet.c.conditions.filter(
    (condition) => !sheet.c.lockedConditions?.includes(condition),
  );
  const used = move ? sessionMoveUsed(sheet.campaign, sheet.c.id, move, sessionMessages) : false;
  const benefits: ComfortBenefit[] = [];
  let ready = !!comforted && comforted.id !== sheet.c.id;
  answers.value.forEach((yes, index) => {
    if (!yes) return;
    const kind = benefitKinds.value[index] ?? "clear-comforted";
    if (kind === "gain-depth") {
      if (canGainDepth) benefits.push({ kind });
      else ready = false;
    } else {
      const options = kind === "clear-comforted" ? receiverConditions : supporterConditions;
      const condition =
        conditionPicks.value[index] && options.includes(conditionPicks.value[index]!)
          ? conditionPicks.value[index]!
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
          value={comfortedId.value}
          disabled={!sheet.editable || used}
          onChange={(event) => (comfortedId.value = event.currentTarget.value)}
          onInput={(event) => (comfortedId.value = event.currentTarget.value)}
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
              checked={answers.value[index] ?? false}
              disabled={!sheet.editable || used || !comforted}
              onChange={(event) => {
                const next = [...answers.value];
                next[index] = event.currentTarget.checked;
                answers.value = next;
              }}
            />
            {question}
          </label>
          {answers.value[index] && (
            <div className="move-form">
              <label className="field">
                Benefit
                <select
                  value={benefitKinds.value[index] ?? "clear-comforted"}
                  disabled={!sheet.editable || used}
                  onChange={(event) =>
                    (benefitKinds.value = {
                      ...benefitKinds.value,
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
              {(benefitKinds.value[index] ?? "clear-comforted") !== "gain-depth" && (
                <label className="field">
                  Condition
                  <select
                    value={
                      conditionPicks.value[index] ??
                      ((benefitKinds.value[index] ?? "clear-comforted") === "clear-comforted"
                        ? receiverConditions[0]
                        : supporterConditions[0]) ??
                      ""
                    }
                    disabled={!sheet.editable || used}
                    onChange={(event) =>
                      (conditionPicks.value = {
                        ...conditionPicks.value,
                        [index]: event.currentTarget.value,
                      })
                    }
                  >
                    {((benefitKinds.value[index] ?? "clear-comforted") === "clear-comforted"
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
          void resolveComfortOrSupport(sheet.campaign, sheet.c.id, comforted.id, benefits)
        }
      >
        {used ? "Used this session" : "Resolve Comfort or Support"}
      </Button>
    </section>
  );
}

function PerilousJourney({ sheet }: MoveFormProps) {
  const pace = useSignal<JourneyPace>("regular");
  const leaderId = useSignal(sheet.c.id);
  const conditions = useSignal<Record<string, string>>({});
  const partyJson = useY(sheet.campaign.characters, () =>
    JSON.stringify(listCharacters(sheet.campaign).filter((character) => character.kind === "pc")),
  );
  const party = JSON.parse(partyJson) as CharacterView[];
  const leader = party.find((character) => character.id === leaderId.value);
  const affected =
    pace.value === "quick" ? party : pace.value === "regular" && leader ? [leader] : [];
  const conditionPicks = Object.fromEntries(
    affected.map((character) => {
      const available = sheet.system.conditions.filter(
        (condition) => !character.conditions.includes(condition.id),
      );
      const selected = conditions.value[character.id];
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
        <select
          value={leaderId.value}
          onChange={(event) => (leaderId.value = event.currentTarget.value)}
        >
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
          value={pace.value}
          onChange={(event) => (pace.value = event.currentTarget.value as JourneyPace)}
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
                (conditions.value = {
                  ...conditions.value,
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
          prepareDungeonWorld2Journey(sheet.campaign, leader.id, pace.value, conditionPicks)
        }
      >
        Prepare Journey
      </Button>
    </section>
  );
}

function Downtime({ sheet }: MoveFormProps) {
  const benefit = useSignal<"clear-locked" | "gain-depth">(
    sheet.c.lockedConditions?.length ? "clear-locked" : "gain-depth",
  );
  const condition = useSignal(sheet.c.lockedConditions?.[0] ?? "");
  const partyId = useSignal("");
  const serviceId = useSignal(DW2_SERVICES[0]!.id);
  const serviceRank = useSignal<ServiceRank>(2);
  const epochSnapshot = useY(sheet.campaign.systemData, () =>
    String(dungeonWorld2DowntimeEpoch(sheet.campaign)),
  );
  const partyJson = useY(sheet.campaign.characters, () =>
    JSON.stringify(listCharacters(sheet.campaign).filter((character) => character.kind === "pc")),
  );
  const characterSnapshot = useY(sheet.campaign.characters, () => {
    const character = getCharacter(sheet.campaign, sheet.c.id);
    return JSON.stringify({ treasure: character?.data.treasureBoxes });
  });
  void epochSnapshot;
  void characterSnapshot;
  const party = JSON.parse(partyJson) as CharacterView[];
  const others = party.filter((character) => character.id !== sheet.c.id);
  const selectedPartyId = partyId.value || others[0]?.id;
  const epoch = dungeonWorld2DowntimeEpoch(sheet.campaign);
  const boxes = Number(sheet.c.data.treasureBoxes ?? 0);
  const trained = trainedDuringDungeonWorld2Downtime(sheet.campaign, sheet.c.id);
  const canClearLocked = (sheet.c.lockedConditions?.length ?? 0) > 0;
  const canGainDepth =
    !!selectedPartyId &&
    (relationshipsOf(sheet.campaign.characters, sheet.c.id).find(
      (entry) => entry.to === selectedPartyId,
    )?.depth ?? 0) < 3;
  return (
    <section className="move-form-section" aria-label="Enjoy Downtime">
      {sheet.campaign.isGm() && (
        <Button variant="secondary" onClick={() => beginDungeonWorld2Downtime(sheet.campaign)}>
          Begin Downtime
        </Button>
      )}
      <label className="field">
        Carouse
        <select
          value={benefit.value}
          onChange={(event) =>
            (benefit.value = event.currentTarget.value as "clear-locked" | "gain-depth")
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
      {benefit.value === "clear-locked" && canClearLocked && (
        <label className="field">
          Locked Condition
          <select
            value={condition.value}
            onChange={(event) => (condition.value = event.currentTarget.value)}
          >
            {sheet.c.lockedConditions?.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      )}
      {benefit.value === "gain-depth" && canGainDepth && (
        <label className="field">
          PC
          <select
            value={partyId.value || others[0]?.id || ""}
            onChange={(event) => (partyId.value = event.currentTarget.value)}
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
          (benefit.value === "clear-locked" ? !canClearLocked : !canGainDepth)
        }
        onClick={() =>
          carouseDungeonWorld2(
            sheet.campaign,
            sheet.c.id,
            benefit.value,
            partyId.value || others[0]?.id,
            condition.value,
          )
        }
      >
        Carouse
      </Button>
      <Button
        variant="secondary"
        disabled={!sheet.editable || epoch === 0 || boxes < 1}
        onClick={() => resupplyDungeonWorld2(sheet.campaign, sheet.c.id)}
      >
        Resupply (1 Treasure)
      </Button>
      <label className="field">
        Shop service
        <select
          value={serviceId.value}
          onChange={(event) => (serviceId.value = event.currentTarget.value)}
        >
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
          value={serviceRank.value}
          onChange={(event) =>
            (serviceRank.value = Number(event.currentTarget.value) as ServiceRank)
          }
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
          void shopDungeonWorld2Service(
            sheet.campaign,
            sheet.c.id,
            serviceId.value,
            serviceRank.value,
          )
        }
      >
        Shop (1 Treasure)
      </Button>
      <Button
        variant="secondary"
        disabled={!sheet.editable || boxes < 1 || epoch === 0 || trained}
        onClick={() => trainDungeonWorld2(sheet.campaign, sheet.c.id)}
      >
        {trained ? "Trained this Downtime" : "Train (1 Treasure for 1 XP)"}
      </Button>
    </section>
  );
}

function MakeCamp({ sheet }: MoveFormProps) {
  const selections = useSignal<Record<string, string>>({});
  const repairs = useSignal<Record<string, string>>({});
  const move = sheet.system.actions.find((action) => action.id === "make-camp");
  const sessionMessages = sheet.campaign.chat.messages.value;
  const usage = useY(sheet.campaign.systemData, () =>
    sessionUseSnapshot(sheet.campaign, sheet.c.id, move ? [move] : [], sessionMessages),
  );
  const partyJson = useY(sheet.campaign.characters, () =>
    JSON.stringify(listCharacters(sheet.campaign).filter((character) => character.kind === "pc")),
  );
  void usage;
  const party = JSON.parse(partyJson) as CharacterView[];
  const used = move ? sessionMoveUsed(sheet.campaign, sheet.c.id, move, sessionMessages) : false;
  const choices = Object.fromEntries(
    party.map((character) => {
      const marked = character.conditions.filter(
        (condition) => !character.lockedConditions?.includes(condition),
      );
      const selected = selections.value[character.id];
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
      const selected = repairs.value[character.id];
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
                (selections.value = {
                  ...selections.value,
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
                (repairs.value = { ...repairs.value, [character.id]: event.currentTarget.value })
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
          void makeDungeonWorld2Camp(sheet.campaign, sheet.c.id, choices, repairChoices)
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
