import { canEdit, getCharacter } from "../features/characters/api";
import { Button } from "../ui/Button";
import type { CharacterView } from "../features/characters/types";
import { DEFAULT_TEMPLATE, NAMINGS } from "../features/characters/templates";
import type { Campaign } from "../campaign/campaign";
import { Segmented } from "../ui/Segmented";
import { resetCopy, setTemplate } from "../workspace/commands/characters";
import { useCampaign } from "../workspace/campaignContext";

/**
 * Whether a character's tokens share its one record (an individual) or each
 * keep their own HP and conditions (a template), and how a template names
 * its tokens.
 */
export function TemplateSettings({ campaign, c }: { campaign: Campaign; c: CharacterView }) {
  const ctx = useCampaign();
  const editable = canEdit(campaign, c);
  const t = c.template;
  return (
    <section className="form-section sheet-section" aria-label="On the map">
      <h3 className="sheet-heading">On the map</h3>
      <Segmented
        label="Tokens"
        value={t ? "template" : "individual"}
        options={[
          {
            id: "individual",
            label: "Individual",
            title: "Every token is this one character: they share HP and conditions",
          },
          {
            id: "template",
            label: "Template",
            title: "Each token is its own copy, with its own HP and conditions",
          },
        ]}
        disabled={!editable}
        onChange={(v) =>
          ctx.execute(setTemplate, {
            id: c.id,
            settings: v === "template" ? (t ?? DEFAULT_TEMPLATE) : null,
          })
        }
      />
      {t && (
        <>
          <div className="field">
            Name each token
            <Segmented
              label="Token names"
              value={t.naming}
              options={NAMINGS}
              disabled={!editable}
              onChange={(naming) =>
                ctx.execute(setTemplate, { id: c.id, settings: { ...t, naming } })
              }
            />
          </div>
          {t.naming === "list" && (
            <label className="field">
              Names, one per line
              <textarea
                rows={4}
                value={t.names.join("\n")}
                disabled={!editable}
                placeholder={"Snag\nGrub\nNix"}
                onChange={(e) =>
                  ctx.execute(setTemplate, {
                    id: c.id,
                    settings: {
                      ...t,
                      names: e.currentTarget.value
                        .split("\n")
                        .map((n) => n.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
          )}
          <p className="muted">
            Changes to a token stay on that copy; new tokens inherit this template.
          </p>
        </>
      )}
    </section>
  );
}

/** Above a copy's sheet: what it's a copy of, and a way back to it. */
export function CopyBanner({ campaign, c }: { campaign: Campaign; c: CharacterView }) {
  const ctx = useCampaign();
  const template = getCharacter(campaign, c.base);
  return (
    <div className="sheet-banner">
      <span>
        Derived From <strong>{template?.name ?? "a deleted template"}</strong>.
      </span>
      {template && canEdit(campaign, c) && (
        <Button variant="ghost" onClick={() => ctx.execute(resetCopy, { id: c.id })}>
          Reset
        </Button>
      )}
    </div>
  );
}
