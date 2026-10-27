import { canEdit, getCharacter, resetCopy, setTemplate } from '../characters/api'
import { Button } from '../ui/Button'
import type { CharacterView } from '../characters/store'
import { DEFAULT_TEMPLATE, NAMINGS } from '../characters/templates'
import type { Campaign } from '../store/campaign'
import { Segmented } from '../ui/Segmented'

/**
 * Whether a character's tokens share its one record (an individual) or each
 * keep their own HP and conditions (a template), and how a template names
 * its tokens.
 */
export function TemplateSettings({ campaign, c }: { campaign: Campaign; c: CharacterView }) {
  const editable = canEdit(campaign, c)
  const t = c.template
  return (
    <section class="sheet-section" aria-label="On the map">
      <h3 class="sheet-heading">On the map</h3>
      <Segmented
        label="Tokens"
        value={t ? 'template' : 'individual'}
        options={[
          { id: 'individual', label: 'Individual', title: 'Every token is this one character: they share HP and conditions' },
          { id: 'template', label: 'Template', title: 'Each token is its own copy, with its own HP and conditions' },
        ]}
        disabled={!editable}
        onChange={(v) => setTemplate(campaign, c.id, v === 'template' ? (t ?? DEFAULT_TEMPLATE) : null)}
      />
      {t && (
        <>
          <div class="field">
            Name each token
            <Segmented
              label="Token names"
              value={t.naming}
              options={NAMINGS}
              disabled={!editable}
              onChange={(naming) => setTemplate(campaign, c.id, { ...t, naming })}
            />
          </div>
          {t.naming === 'list' && (
            <label class="field">
              Names, one per line
              <textarea
                class="input bevel"
                rows={4}
                value={t.names.join('\n')}
                disabled={!editable}
                placeholder={'Snag\nGrub\nNix'}
                onChange={(e) => setTemplate(campaign, c.id, { ...t, names: e.currentTarget.value.split('\n').map((n) => n.trim()).filter(Boolean) })}
              />
            </label>
          )}
          <p class="muted">
            Each token placed from {c.name} is a copy with its own name. Change anything on a token’s sheet and it applies to that
            token alone; what you leave follows this template.
          </p>
        </>
      )}
    </section>
  )
}

/** Above a copy's sheet: what it's a copy of, and a way back to it. */
export function CopyBanner({ campaign, c }: { campaign: Campaign; c: CharacterView }) {
  const template = getCharacter(campaign, c.base)
  return (
    <div class="copy-banner">
      <span>
        Derived From <strong>{template?.name ?? 'a deleted template'}</strong>.
      </span>
      {template && canEdit(campaign, c) && (
        <Button size="sm" variant="ghost" onClick={() => resetCopy(campaign, c.id)}>
          Reset
        </Button>
      )}
    </div>
  )
}
