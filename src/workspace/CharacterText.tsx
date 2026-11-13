import { useEffect, useRef } from "react";
import { copyText } from "../data/schema";
import type { CharacterView } from "../features/characters/types";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { mountRichText } from "./richText";
import { useCampaign } from "./campaignContext";

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
  const ctx = useCampaign();
  const hostRef = useRef<HTMLDivElement>(null);
  const textOf = (id: string | undefined) =>
    id ? campaign.characters.get(id)?.get("texts")?.get(field) : undefined;
  const own = useQuery(campaign.characters, () => textOf(c.id));
  const inherited = useQuery(campaign.characters, () => textOf(c.base));
  const shown = own ?? inherited;

  // A field nobody has written in yet gets its text when someone can write.
  useEffect(() => {
    if (shown || !editable) return;
    campaign.characters.get(c.id)?.ensure("texts").ensure(field);
  }, [shown, editable, c.id, field, campaign.characters]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !shown) return;
    const rich = mountRichText(host, {
      ctx,
      fragment: shown,
      placeholder,
      label,
      // The template's text is read until the copy makes its own.
      editable: editable && shown === own,
      shared: true,
    });
    return () => rich.destroy();
  }, [ctx, shown, editable, campaign, label, own, placeholder]);

  /** A copy's first press: its own text, starting from the template's. */
  const fork = () => {
    if (!editable || own || !inherited) return;
    const m = campaign.characters.get(c.id);
    m?.transact(() => copyText(m.ensure("texts").ensure(field), inherited));
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
  const vault = useQuery(campaign.vault);
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
  const ctx = useCampaign();
  const hostRef = useRef<HTMLDivElement>(null);
  const key = `${c.id}/${field}`;
  const own = useQuery(vault.characterText, () => vault.characterText.get(key));
  const inherited = useQuery(vault.characterText, () =>
    c.base ? vault.characterText.get(`${c.base}/${field}`) : undefined,
  );
  const shown = own ?? inherited;

  useEffect(() => {
    if (shown || !editable) return;
    vault.characterText.ensure(key);
  }, [shown, editable, key, vault]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !shown) return;
    const rich = mountRichText(host, {
      ctx,
      fragment: shown,
      placeholder,
      label,
      editable: editable && shown === own,
      shared: false,
    });
    return () => rich.destroy();
  }, [ctx, shown, editable, label, placeholder, campaign, own]);

  const fork = () => {
    if (!editable || own || !inherited) return;
    vault.characterText.transact(() => copyText(vault.characterText.ensure(key), inherited));
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
