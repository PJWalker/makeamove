import type { Campaign } from "../campaign/campaign";
import { canEdit, getCharacter, systemOf } from "../features/characters/api";
import type { CharacterView } from "../features/characters/types";
import { useExtension } from "./systemExtensions";
import type { ActionDef } from "../systems/types";
import { useY } from "../ui/useY";
import { RichTextView } from "./RichTextView";

/*
 * A move's text, formatted with buttons that change the character's numbers,
 * then any form the system's extension has for it.
 */

export function MoveBody({
  campaign,
  move,
  characterId,
}: {
  campaign: Campaign;
  move: ActionDef;
  /** Who is making it: their numbers for the buttons, their form. */
  characterId: string | null;
}) {
  const system = systemOf(campaign);
  const json = useY(campaign.characters, () =>
    JSON.stringify(getCharacter(campaign, characterId ?? undefined) ?? null),
  );
  const c = JSON.parse(json) as CharacterView | null;
  const Form = useExtension(system).moveForms?.[move.id];
  return (
    <>
      <RichTextView
        campaign={campaign}
        text={move.text}
        characterId={characterId}
        className="move-text move-window-text"
      />
      {Form && c?.kind === "pc" && (
        <Form key={c.id} sheet={{ campaign, c, system, editable: canEdit(campaign, c) }} />
      )}
    </>
  );
}
