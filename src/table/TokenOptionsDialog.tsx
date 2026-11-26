import { useEffect, useRef } from "react";
import type SceneController from "../scene/controller";
import { TOKEN_STYLES  } from "../scene/types";
import type {TokenElement} from "../scene/types";
import { importImage  } from "../media/images";
import type {EntityGraphic} from "../media/images";
import type { Campaign } from "../campaign/campaign";
import { getCharacter, listCharacters, systemOf } from "../features/characters/api";
import { tokenName } from "../features/characters/templates";
import { openPopup } from "../ui/popup";
import { useQuery } from "../ui/useQuery";
import EntityGraphicView from "../ui/EntityGraphic";
import ColourPicker from "../ui/ColourPicker";
import Button from "../ui/Button";
import CommitInput from "../ui/CommitInput";
import PopupTabs from "../ui/PopupTabs";
import { Segmented } from "../ui/Segmented";
import Dialog from "../workspace/Dialog";
import { getEntityGraphic } from "../workspace/entityGraphics";
import { itemDefinitionForToken } from "../workspace/dragEntities";
import linkProxy from "../workspace/linkProxy";
import { useCampaign } from "../workspace/campaignContext";
import { copyCharacter } from "../workspace/commands/characters";
import CharacterSheet from "./sheets";

type Update = (patch: Parameters<SceneController["updateToken"]>[1], cells?: number) => void;
type TokenTab = "character" | "token";

/** A token's name field: it commits when it loses focus or on Enter. */
function NameField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  return (
    <label className="field">
      Name
      <CommitInput value={value} autoFocus onCommit={onCommit} />
    </label>
  );
}

/** Which character a token stands for. */
function CharacterField({
  value,
  characters,
  onChange,
}: {
  value: string;
  characters: { id: string; name: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="field">
      Character
      <select className="input" value={value} onChange={(e) => { onChange(e.currentTarget.value); }}>
        <option value="">None</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <span className="muted">The game system decides which of its stats show on the token.</span>
    </label>
  );
}

/** The image a token shows: its own, or else its character's, which can be overridden. */
function ImageField({
  token,
  graphic,
  inherited,
  onChange,
}: {
  token: TokenElement;
  graphic: EntityGraphic | undefined;
  inherited: boolean;
  onChange: (image: TokenElement["image"]) => void;
}) {
  const fileReference = useRef<HTMLInputElement>(null);
  const style = token.style ?? "disc";
  return (
    <div className="field">
      Image
      <span className="token-image-row">
        <span
          className="token-image-preview"
          data-style={graphic?.kind === "image" ? style : "disc"}
          style={{ "--token-colour": token.colour ?? "#000000" }}
        >
          <EntityGraphicView graphic={graphic} size={64} />
        </span>
        <Button onClick={() => fileReference.current?.click()}>
          {inherited ? "Override…" : (token.image ? "Change…" : "Choose…")}
        </Button>
        {token.image && (
          <Button variant="ghost" onClick={() => { onChange(undefined); }}>
            {inherited ? "Clear Override" : "Remove"}
          </Button>
        )}
      </span>
      {inherited && (
        <span className="muted">
          Uses the graphic from the character sheet unless overridden here.
        </span>
      )}
      <input
        ref={fileReference}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file)
            void importImage(file)
              .then(onChange)
              .catch(() => {});
        }}
      />
    </div>
  );
}

/** How a token is drawn: its size, name, style and colour. */
function LookFields({
  token,
  sizes,
  size,
  plainLook,
  update,
}: {
  token: TokenElement;
  sizes: { id: string; name: string; cells: number }[];
  size: string;
  plainLook: boolean;
  update: Update;
}) {
  const colour = token.colour ?? "#000000";
  return (
    <>
      <label className="field">
        Size
        <select
          className="input"
          value={size}
          onChange={(e) => { update({}, sizes.find((z) => z.id === e.currentTarget.value)?.cells); }}
        >
          {!size && <option value="">As drawn</option>}
          {sizes.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name} ({z.cells === 0.5 ? "½" : z.cells} {z.cells > 1 ? "cells" : "cell"})
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        Show
        <label className="check">
          <input
            type="checkbox"
            checked={!token.hideName}
            onChange={(e) => { update({ hideName: e.currentTarget.checked ? undefined : true }); }}
          />
          Name under the token
        </label>
      </div>
      <div className="field">
        Style
        <Segmented
          label="Token style"
          value={token.style ?? "disc"}
          options={TOKEN_STYLES}
          onChange={(style) => { update({ style }); }}
        />
      </div>
      <div className="field colour-field" data-disabled={plainLook}>
        Background and border
        <span className="colour-row">
          <ColourPicker
            label="Background and border"
            alpha
            value={colour}
            disabled={plainLook}
            onChange={(next) => { update({ colour: next }); }}
          />
          <span className="colour-hex">{colour}</span>
        </span>
      </div>
    </>
  );
}

/** What the dialog shows of a token, and how it changes it: the token, its character and item, and its look. */
function useTokenOptions(campaign: Campaign, controller: SceneController, id: string | null) {
  const context = useCampaign();
  const {scene} = controller;
  // The table stays usable while this is open, so the token may change or be deleted.
  const tokenMap = useQuery(scene.elements, () => (id ? scene.elements.get(id) : undefined));
  const element = useQuery(tokenMap, () => (id && tokenMap ? scene.get(id) : null));
  const token = element?.type === "token" ? element : null;
  const system = systemOf(campaign);
  const item = token ? itemDefinitionForToken(campaign, token) : undefined;
  const characters = useQuery(campaign.characters, () => listCharacters(campaign));
  const linked = useQuery(campaign.characters, () => getCharacter(campaign, token?.characterId));

  const update: Update = (patch, cells) => {
    if (id) controller.updateToken(id, patch, cells);
  };

  // A template's token shows the template it's a copy of.
  const characterId = linked?.base ?? token?.characterId ?? "";
  // What the token shows: its own image, else its character's graphic.
  const inherited = !item && !!characterId;
  const sheetGraphic = inherited ? getEntityGraphic(campaign, "character", characterId) : undefined;
  const graphic: EntityGraphic | undefined = token?.image
    ? { kind: "image", image: token.image }
    : (sheetGraphic ?? token?.graphic);
  const plainLook = (token?.style ?? "disc") === "plain" && graphic?.kind === "image";
  // The first size as wide as the token, or none if it's been resized by hand.
  const cells = token ? Math.max(token.w, token.h) / controller.renderer.grid.size : 0;
  const size = system.sizes.find((z) => Math.abs(z.cells - cells) < 0.01)?.id ?? "";

  /**
   * Link the token to `chosen`: a template makes it a new copy, unless it's
   * already a copy of that template. Linking an unnamed token names it after
   * the character.
   */
  const linkTo = (chosen: string) => {
    if (!token) return;
    if (!chosen) { update({ characterId: undefined }); return; }
    if (linked?.base === chosen) { update({ characterId: linked.id }); return; }
    const c = characters.find((k) => k.id === chosen);
    if (!c) return;
    const name = token.name.trim();
    if (!c.template) { update({ characterId: chosen, ...(name ? {} : { name: c.name }) }); return; }
    const copyName = name || tokenName(c, c.template, controller.tokenNames());
    const copy = context.execute(copyCharacter, { template: chosen, name: copyName });
    if (copy) update({ characterId: copy, name: copyName });
  };
  return {
    token,
    item,
    linked,
    characters,
    characterId,
    inherited,
    graphic,
    plainLook,
    size,
    sizes: system.sizes,
    update,
    linkTo,
    system,
  };
}

/** Name, style and colour of a token. Each change applies as soon as it's made. */
function TokenOptionsDialog({
  campaign,
  controller,
  id,
  tab,
  onTabChange,
  onClose,
}: {
  campaign: Campaign;
  controller: SceneController;
  id: string | null;
  tab: TokenTab;
  onTabChange: (tab: TokenTab) => void;
  onClose: () => void;
}) {
  const context = useCampaign();
  const reference = useRef<HTMLDialogElement>(null);
  const t = useTokenOptions(campaign, controller, id);
  const { token, item, linked, update } = t;

  useEffect(() => {
    if (id) openPopup(reference.current);
  }, [id]);
  useEffect(() => {
    if (id && !token) reference.current?.close();
  }, [id, token]);

  return (
    <Dialog
      dialogRef={reference}
      title={linked ? linked.name : (item?.name ?? token?.name ?? "Token Options")}
      onClose={onClose}
      {...(linked ? { proxy: linkProxy(context, "character", linked.id, linked.name) } : {})}
    >
      {linked && (
        <>
          <PopupTabs
            tabs={[
              { id: "character", label: "Character" },
              { id: "token", label: "Token" },
            ]}
            value={tab}
            onChange={onTabChange}
          />
          {tab === "character" && (
            <div className="popup-sheet sheet-panel">
              <CharacterSheet campaign={campaign} system={t.system} c={linked} />
            </div>
          )}
        </>
      )}
      {token && (
        <div hidden={!!linked && tab === "character"} className="dialog-form">
          <NameField key={token.id} value={token.name} onCommit={(name) => { update({ name }); }} />
          {!item && (
            <CharacterField
              value={t.characterId}
              characters={t.characters}
              onChange={(chosen) => { t.linkTo(chosen); }}
            />
          )}
          <ImageField
            token={token}
            graphic={t.graphic}
            inherited={t.inherited}
            onChange={(image) => { update({ image }); }}
          />
          <LookFields
            token={token}
            sizes={t.sizes}
            size={t.size}
            plainLook={t.plainLook}
            update={update}
          />
        </div>
      )}
    </Dialog>
  );
}

export default TokenOptionsDialog;
