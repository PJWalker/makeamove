import { useState } from "react";
import { getCharacter, systemOf } from "../../features/characters/api";
import {
  boostFrom,
  choicesAt,
  dataFrom,
  raise,
  ruleStartingScores,
  scoreRuleProblems,
} from "../../features/characters/creation";
import type { DataValue } from "../../data/types";
import { commaListOf } from "../../lib/list";
import type { Campaign } from "../../campaign/campaign";
import type { ChoiceDef } from "../types";
import { Button } from "../../ui/Button";
import { OptionPicker } from "../../ui/OptionPicker";
import { closePopup } from "../../ui/popup";
import { usePopupDialog } from "../../workspace/usePopupDialog";
import { Dialog } from "../../workspace/Dialog";
import { ChoiceField, RuleScoreFields, type Picked } from "../../workspace/CreationParts";
import { emptyPick, scoreCapsOf } from "../../workspace/creationModel";
import { changeClass } from "./commands";
import { useCampaign } from "../../workspace/campaignContext";

/*
 * Dungeon World 2's Class Change: pick a new Class and its stat line, then
 * reassign each existing advancement under it.
 */

function appendChoiceData(
  current: Record<string, DataValue>,
  changes: Record<string, DataValue>,
  listFields: string[],
): Record<string, DataValue> {
  const next = { ...current };
  const listFieldSet = new Set(listFields);
  for (const [field, value] of Object.entries(changes)) {
    next[field] = listFieldSet.has(field) && next[field] ? `${next[field]},${value}` : value;
  }
  return next;
}

function ClassChangeDialog({
  campaign,
  characterId,
  onClose,
}: {
  campaign: Campaign;
  characterId: string;
  onClose: () => void;
}) {
  const ctx = useCampaign();
  const ref = usePopupDialog();
  const system = systemOf(campaign);
  const character = getCharacter(campaign, characterId)!;
  const creation = system.creation;
  const classChoice = creation?.choices.find((choice) => choice.id === "class");
  const [newClassId, setNewClassId] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [picks, setPicks] = useState<Record<string, Picked>>({});
  const scoreRule = creation?.classScoreRules?.[newClassId];
  const oldAdvancementCount = commaListOf(character.data.advancements).length;
  const stageData: Record<string, DataValue> = {
    ...character.data,
    classId: newClassId,
    advancements: "",
    ownedPaths: "",
    ownedPathMoves: "",
    multiclassPaths: "",
  };
  let stageScores = scores;
  const listFields = creation?.listFields ?? [];
  const stages: { id: string; choice: ChoiceDef; display: ChoiceDef }[] = [];

  for (let index = 0; index < oldAdvancementCount; index++) {
    const rank = index + 2;
    const choice = choicesAt(creation, rank, stageData, stageScores).find(
      (entry) => entry.at === "advance" || entry.at === rank,
    );
    if (!choice) continue;
    const id = `reassign-${rank}`;
    stages.push({ id, choice, display: { ...choice, id, label: `Advancement ${rank}` } });
    const pick = picks[id];
    const option = choice.options.find((entry) => entry.id === pick?.option);
    if (!pick || !option) continue;
    const changes = dataFrom([choice], { [choice.id]: option.id }, listFields, stageData);
    Object.assign(stageData, appendChoiceData(stageData, changes, listFields));
    if (option.boost)
      stageScores = raise(
        stageScores,
        boostFrom(option, pick.pattern, pick.order),
        scoreCapsOf(system),
      );
  }

  const ready =
    !!newClassId &&
    !!scoreRule &&
    scoreRuleProblems(scoreRule, system.stats, scores).length === 0 &&
    stages.length === oldAdvancementCount &&
    stages.every(
      ({ id, choice }) =>
        !!picks[id]?.option && choice.options.some((option) => option.id === picks[id]?.option),
    );
  const classOptions =
    classChoice?.options.filter((option) => option.id !== character.data.classId) ?? [];
  const apply = () => {
    if (!ready) return;
    if (
      ctx.execute(changeClass, {
        characterId,
        classId: newClassId,
        scores: stageScores,
        data: stageData,
      })
    )
      closePopup(ref.current, onClose);
  };

  return (
    <Dialog dialogRef={ref} title={`${character.name}: change Class`} onClose={onClose}>
      <form
        className="creation-form"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <p>
          Reassign existing advancements under the new Class. Level, XP, and Treasure remain
          unchanged.
        </p>
        <OptionPicker
          label="New Class"
          options={classOptions}
          value={newClassId}
          emptyLabel="Choose…"
          onChange={(id) => {
            setNewClassId(id);
            const rule = creation?.classScoreRules?.[id];
            setScores(rule ? ruleStartingScores(rule, system.stats) : {});
            setPicks({});
          }}
        />
        {scoreRule && (
          <div className="field creation-scores">
            <span>New Class stats</span>
            <RuleScoreFields
              system={system}
              rule={scoreRule}
              scores={scores}
              onScores={setScores}
            />
          </div>
        )}
        {stages.map(({ id, display }) => (
          <ChoiceField
            key={id}
            system={system}
            choice={display}
            value={picks[id] ?? emptyPick()}
            onChange={(pick) => setPicks({ ...picks, [id]: pick })}
          />
        ))}
        {!oldAdvancementCount && newClassId && (
          <p className="muted">This character has no advancements to reassign.</p>
        )}
        <div className="form-actions">
          <Button variant="ghost" onClick={() => closePopup(ref.current, onClose)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            Change Class
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** The Change Class button beside the sheet's advancement banner. */
export function ChangeClassAction({
  campaign,
  characterId,
}: {
  campaign: Campaign;
  characterId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Change Class…
      </Button>
      {open && (
        <ClassChangeDialog
          campaign={campaign}
          characterId={characterId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
