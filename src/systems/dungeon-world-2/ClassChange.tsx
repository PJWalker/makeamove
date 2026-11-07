import { useState } from "react";
import { getCharacter, systemOf } from "../../features/characters/api";
import { boostFrom, choicesAt, dataFrom, raise } from "../../features/characters/creation";
import type { DataValue } from "../../core/types";
import { parseCommaList } from "../../lib/list";
import type { Campaign } from "../../campaign/campaign";
import type { ChoiceDef } from "../types";
import { Button } from "../../ui/Button";
import { OptionPicker } from "../../ui/OptionPicker";
import { closePopup } from "../../ui/popup";
import { usePopupDialog } from "../../table/usePopupDialog";
import { Dialog } from "../../table/CampaignDialogs";
import { ChoiceField, emptyPick, scoreCapsOf, type Picked } from "../../table/CreationParts";
import { applyClassChange } from "./campaign";

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
  for (const [field, value] of Object.entries(changes)) {
    next[field] = listFields.includes(field) && next[field] ? `${next[field]},${value}` : value;
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
  const ref = usePopupDialog();
  const system = systemOf(campaign);
  const character = getCharacter(campaign, characterId)!;
  const creation = system.creation;
  const classChoice = creation?.choices.find((choice) => choice.id === "class");
  const [newClassId, setNewClassId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [picks, setPicks] = useState<Record<string, Picked>>({});
  const assignmentOptions = creation?.classScoreAssignments?.[newClassId] ?? [];
  const assignment =
    assignmentOptions.find((option) => option.id === assignmentId) ?? assignmentOptions[0];
  const oldAdvancementCount = parseCommaList(String(character.data.advancements ?? "")).filter(
    Boolean,
  ).length;
  const stageData: Record<string, DataValue> = {
    ...character.data,
    classId: newClassId,
    advancements: "",
    ownedPaths: "",
    ownedPathMoves: "",
    multiclassPaths: "",
  };
  let stageScores = assignment?.scores ?? {};
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
    !!assignment &&
    stages.length === oldAdvancementCount &&
    stages.every(
      ({ id, choice }) =>
        !!picks[id]?.option &&
        choice.options.some((option) => option.id === picks[id]?.option),
    );
  const classOptions =
    classChoice?.options.filter((option) => option.id !== character.data.classId) ?? [];
  const apply = () => {
    if (!ready) return;
    if (applyClassChange(campaign, characterId, newClassId, stageScores, stageData))
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
            setAssignmentId(creation?.classScoreAssignments?.[id]?.[0]?.id ?? "");
            setPicks({});
          }}
        />
        {assignmentOptions.length > 0 && (
          <OptionPicker
            label="New class stat assignment"
            options={assignmentOptions}
            value={assignment?.id ?? ""}
            emptyLabel="Choose…"
            onChange={(id) => {
              setAssignmentId(id);
            }}
          />
        )}
        {assignment && (
          <div className="creation-score-grid">
            {system.stats.map((stat) => (
              <label key={stat.id} className="creation-score">
                <span className="stat-abbr">{stat.abbr}</span>
                <output>{assignment.scores[stat.id] ?? 0}</output>
              </label>
            ))}
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
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Change Class
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
