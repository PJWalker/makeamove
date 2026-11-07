import type { ComponentType } from "react";
import type { Campaign } from "../campaign/campaign";
import { canEdit, getCharacter, systemOf } from "../features/characters/api";
import type { CharacterView } from "../features/characters/types";
import { DW2_MOVE_FORMS, type MoveFormProps } from "../systems/dungeon-world-2/MoveForms";
import type { ActionDef } from "../systems/types";
import { useY } from "../ui/useY";
import { FormattedText } from "./FormattedText";

/*
 * A move's text, formatted with buttons that change the character's numbers,
 * then any form the system has for it (who to comfort, the journey's pace).
 * Built-in systems' move forms are registered here, as their sheets are in
 * sheets.tsx.
 */

const MOVE_FORMS: Record<string, Record<string, ComponentType<MoveFormProps>>> = {
  "dungeon-world-2": DW2_MOVE_FORMS,
};

export function MoveBody({
  campaign,
  move,
  characterId,
}: {
  campaign: Campaign;
  move: ActionDef;
  /** Who is making it: their numbers for the buttons, their form. */
  characterId: string | null | undefined;
}) {
  const system = systemOf(campaign);
  const json = useY(campaign.characters, () =>
    JSON.stringify(getCharacter(campaign, characterId ?? undefined) ?? null),
  );
  const c = JSON.parse(json) as CharacterView | null;
  const Form = MOVE_FORMS[system.id]?.[move.id];
  return (
    <>
      <FormattedText
        campaign={campaign}
        text={move.text}
        characterId={characterId ?? null}
        className="move-text move-window-text"
      />
      {Form && c?.kind === "pc" && (
        <Form key={c.id} sheet={{ campaign, c, system, editable: canEdit(campaign, c) }} />
      )}
    </>
  );
}
