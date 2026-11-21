import { useEffect, useEffectEvent, useRef } from "react";
import type * as Y from "yjs";
import { copyText } from "../data/schema";
import type { CharacterView } from "../features/characters/types";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { mountRichText } from "./richText";
import { useCampaign } from "./campaignContext";

interface CharacterTextProperties {
  campaign: Campaign;
  c: CharacterView;
  field: string;
  label: string;
  editable: boolean;
  placeholder?: string;
}

/**
 * A long text field on a character sheet (notes, bonds, an NPC's moves),
 * as rich text with formatting and @ links, edited together. A template's
 * copy shows the template's text until it's edited here; the first press
 * gives the copy its own text, starting from the template's.
 */
export function CharacterText({
  campaign,
  c,
  field,
  label,
  editable,
  placeholder = "Type @ to link",
}: CharacterTextProperties) {
  const textOf = (id: string | undefined) =>
    id ? campaign.characters.get(id)?.get("texts")?.get(field) : undefined;
  const own = useQuery(campaign.characters, () => textOf(c.id));
  const inherited = useQuery(campaign.characters, () => textOf(c.base));
  const makeOwn = () => campaign.characters.get(c.id)?.ensure("texts").ensure(field);
  return (
    <TextField
      fieldKey={`${c.id}/${field}`}
      label={label}
      placeholder={placeholder}
      editable={editable}
      own={own}
      inherited={inherited}
      shared
      makeOwn={makeOwn}
      fork={(from) => {
        const m = campaign.characters.get(c.id);
        m?.transact(() => copyText(m.ensure("texts").ensure(field), from));
      }}
    />
  );
}

/** A GM-only character field kept in the campaign's private vault document. */
export function GMCharacterText({
  campaign,
  c,
  field,
  label,
  editable,
  placeholder = "Type @ to link",
}: CharacterTextProperties) {
  const vault = useQuery(campaign.vault);
  return vault ? (
    <VaultCharacterText
      vault={vault}
      c={c}
      field={field}
      label={label}
      editable={editable}
      placeholder={placeholder}
    />
  ) : null;
}

function VaultCharacterText({
  vault,
  c,
  field,
  label,
  editable,
  placeholder,
}: Omit<CharacterTextProperties, "campaign" | "placeholder"> & {
  vault: NonNullable<Campaign["vault"]["value"]>;
  placeholder: string;
}) {
  const texts = vault.characterText;
  const key = `${c.id}/${field}`;
  const own = useQuery(texts, () => texts.get(key));
  const inherited = useQuery(texts, () => (c.base ? texts.get(`${c.base}/${field}`) : undefined));
  return (
    <TextField
      fieldKey={key}
      label={label}
      placeholder={placeholder}
      editable={editable}
      own={own}
      inherited={inherited}
      shared={false}
      makeOwn={() => texts.ensure(key)}
      fork={(from) => texts.transact(() => copyText(texts.ensure(key), from))}
    />
  );
}

/**
 * The rich-text field itself: a character's own text, or else the text it
 * inherits from its template, read-only until `fork` gives it its own.
 */
function TextField({
  fieldKey,
  label,
  placeholder,
  editable,
  own,
  inherited,
  shared,
  makeOwn,
  fork,
}: {
  /** Which character's field this is; a new one may need its text made. */
  fieldKey: string;
  label: string;
  placeholder: string;
  editable: boolean;
  own: Y.XmlFragment | undefined;
  inherited: Y.XmlFragment | undefined;
  shared: boolean;
  /** Give the field its own (empty) text. */
  makeOwn: () => void;
  /** Give the field its own text, starting from `from`. */
  fork: (from: Y.XmlFragment) => void;
}) {
  const context = useCampaign();
  const hostReference = useRef<HTMLDivElement>(null);
  const shown = own ?? inherited;
  const makeOwnNow = useEffectEvent(makeOwn);

  // A field nobody has written in yet gets its text when someone can write.
  useEffect(() => {
    if (shown || !editable) return;
    makeOwnNow();
  }, [shown, editable, fieldKey]);

  useEffect(() => {
    const host = hostReference.current;
    if (!host || !shown) return;
    const rich = mountRichText(host, {
      ctx: context,
      fragment: shown,
      placeholder,
      label,
      // The template's text is read until the copy makes its own.
      editable: editable && shown === own,
      shared,
    });
    return () => rich.destroy();
  }, [context, shown, editable, label, own, placeholder, shared]);

  /** A copy's first press: its own text, starting from the template's. */
  const onPress = () => {
    if (editable && !own && inherited) fork(inherited);
  };

  return (
    <div className="field">
      {label}
      <div
        ref={hostReference}
        className="rich-field input"
        data-disabled={!editable || undefined}
        onPointerDown={onPress}
      />
    </div>
  );
}
