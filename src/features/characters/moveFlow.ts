import { batch } from "../../lib/store";
import type { Campaign } from "../../campaign/campaign";
import { device } from "../../platform/device";
import type { ActionDef } from "../../systems/types";
import { postRoll, myName } from "../chat/send";
import type { MoveSuggestion, MoveTarget } from "../chat/types";
import { asksFirst, performMove, type MoveChoice } from "./moves";
import { getCharacter, listCharacters } from "./queries";
import { claimSessionMove, sessionMoveUsed } from "./sessionMoves";
import { bumpData, setField, setModifier } from "./sheet";
import { derive } from "./store";
import { systemOf } from "./system";

/*
 * Making a move at the table: asking for what it needs, rolling, and posting it.
 */

/**
 * Use a move: first ask for targets if it's aimed at someone, then for any
 * stat or number it needs, then roll.
 */
export function startMove(
  campaign: Campaign,
  characterId: string,
  move: ActionDef,
  targets?: MoveTarget[],
  initialChoice?: Pick<MoveChoice, "extra">,
) {
  if (sessionMoveUsed(campaign, characterId, move)) return;
  batch(() => {
    if (move.target && !targets) {
      campaign.moves.ask.value = null;
      campaign.moves.targets.value = { moveId: move.id, characterId };
      return;
    }
    campaign.moves.targets.value = null;
    if (asksFirst(systemOf(campaign), move))
      campaign.moves.ask.value = {
        moveId: move.id,
        characterId,
        ...(targets ? { targets } : {}),
        ...(initialChoice ? { choice: initialChoice } : {}),
      };
    else {
      campaign.moves.ask.value = null;
      void makeMove(campaign, characterId, move, {}, targets);
    }
  });
}

export function makeMove(
  campaign: Campaign,
  characterId: string,
  move: ActionDef,
  choice: MoveChoice = {},
  targets?: MoveTarget[],
) {
  const system = systemOf(campaign);
  const c = getCharacter(campaign, characterId);
  if (!c) return;
  if (!claimSessionMove(campaign, characterId, move)) return;
  const d = derive(c, system);
  const valueAt = (t: MoveTarget, key: string) => {
    const tc = getCharacter(campaign, t.characterId);
    return tc ? derive(tc, system).values[key] : undefined;
  };
  const { spent, ...result } = performMove(system, move, c, d, choice, undefined, {
    ...(targets ? { targets } : {}),
    valueAt,
  });
  // A roll uses up modifiers that last for one roll; text-only moves leave them.
  for (const id of spent) setModifier(campaign, c.id, id, 0);
  const aftermath = system.afterMove?.(move, result.result);
  if (aftermath?.partyBumps?.length)
    for (const character of listCharacters(campaign))
      if (character.kind === "pc")
        for (const { field, by } of aftermath.partyBumps)
          bumpData(campaign, character.id, field, by);
  // A concentration spell ends any other.
  if (move.concentration) setField(campaign, c.id, "concentration", move.id);
  return campaign.chat.post(
    {
      kind: "move",
      moveId: move.id,
      moveName: move.name,
      trigger: move.trigger,
      characterId: c.id,
      characterName: c.name,
      ...result,
      ...(result.targets?.length ? { targets: result.targets } : {}),
    },
    { id: device.value.id, name: myName(campaign) },
  );
}

/** Carry out a suggestion button from a move card. */
export function applySuggestion(campaign: Campaign, characterId: string, s: MoveSuggestion) {
  if (s.bump) bumpData(campaign, characterId, s.bump.field, s.bump.by);
  else if (s.roll) {
    const { formula, comment, damage, targets } = s.roll;
    void postRoll(
      campaign,
      formula,
      "public",
      comment,
      damage && targets?.length ? { type: damage, targets } : undefined,
    );
  }
}
