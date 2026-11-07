import { useEffect, useRef } from "react";
import * as Y from "yjs";
import type { CharacterView } from "../features/characters/types";
import type { Campaign } from "../campaign/campaign";
import { useY } from "../ui/useY";
import { mountRichText } from "./richText";

/** Where a character keeps one of its rich-text fields: `text:notes`, `text:bonds`, `text:field:moves`. */
export const textKey = (field: string) => `text:${field}`;

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
}: {
  campaign: Campaign;
  c: CharacterView;
  field: string;
  label: string;
  editable: boolean;
  placeholder?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const key = textKey(field);
  const own = useY(
    campaign.characters,
    () => campaign.characters.get(c.id)?.get(key) as Y.XmlFragment | undefined,
  );
  const inherited = useY(campaign.characters, () =>
    c.base ? (campaign.characters.get(c.base)?.get(key) as Y.XmlFragment | undefined) : undefined,
  );
  const shown = own ?? inherited;

  // A field nobody has written in yet gets its text when someone can write.
  useEffect(() => {
    if (shown || !editable) return;
    campaign.characters.get(c.id)?.set(key, new Y.XmlFragment());
  }, [shown, editable, c.id, key, campaign.characters]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !shown) return;
    const rich = mountRichText(host, {
      campaign,
      fragment: shown,
      placeholder,
      label,
      // The template's text is read until the copy makes its own.
      editable: editable && shown === own,
      shared: true,
    });
    return () => rich.destroy();
  }, [shown, editable, campaign, label, own, placeholder]);

  /** A copy's first press: its own text, starting from the template's. */
  const fork = () => {
    if (!editable || own || !inherited) return;
    const m = campaign.characters.get(c.id);
    if (!m) return;
    campaign.doc.transact(() => {
      const mine = new Y.XmlFragment();
      m.set(key, mine);
      mine.insert(
        0,
        inherited.toArray().map((n) => (n as Y.XmlElement | Y.XmlText).clone()),
      );
    });
  };

  return (
    <div className="field">
      {label}
      <div
        ref={hostRef}
        className="rich-field input"
        data-disabled={!editable || undefined}
        onPointerDown={fork}
      />
    </div>
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
}: {
  campaign: Campaign;
  c: CharacterView;
  field: string;
  label: string;
  editable: boolean;
  placeholder?: string;
}) {
  const vault = campaign.vault.value;
  return vault ? (
    <VaultCharacterText
      vault={vault}
      campaign={campaign}
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
  campaign,
  c,
  field,
  label,
  editable,
  placeholder,
}: {
  vault: NonNullable<Campaign["vault"]["value"]>;
  campaign: Campaign;
  c: CharacterView;
  field: string;
  label: string;
  editable: boolean;
  placeholder: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const key = `${c.id}/${field}`;
  const own = useY(vault.characterText, () => vault.characterText.get(key));
  const inherited = useY(vault.characterText, () =>
    c.base ? vault.characterText.get(`${c.base}/${field}`) : undefined,
  );
  const shown = own ?? inherited;

  useEffect(() => {
    if (shown || !editable) return;
    vault.characterText.set(key, new Y.XmlFragment());
  }, [shown, editable, key, vault]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !shown) return;
    const rich = mountRichText(host, {
      campaign,
      fragment: shown,
      placeholder,
      label,
      editable: editable && shown === own,
      shared: false,
    });
    return () => rich.destroy();
  }, [shown, editable, label, placeholder, campaign, own]);

  const fork = () => {
    if (!editable || own || !inherited) return;
    const mine = new Y.XmlFragment();
    vault.characterText.set(key, mine);
    mine.insert(
      0,
      inherited.toArray().map((node) => (node as Y.XmlElement | Y.XmlText).clone()),
    );
  };

  return (
    <div className="field">
      {label}
      <div
        ref={hostRef}
        className="rich-field input"
        data-disabled={!editable || undefined}
        onPointerDown={fork}
      />
    </div>
  );
}
