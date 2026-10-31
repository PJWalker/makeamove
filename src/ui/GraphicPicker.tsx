import { useEffect, useRef, useState } from "preact/hooks";
import { importImage } from "../scene/images";
import type { EntityGraphic } from "../graphics";
import { Button } from "./Button";
import { EntityGraphicView } from "./EntityGraphic";
import { ENTRY_ICONS } from "./entryIcons";
import { FilterableMenu, type FilterableMenuOption } from "./FilterableMenu";
import { IconImage } from "./icons";

const iconNames = (
  Object.keys(ENTRY_ICONS) as (keyof typeof ENTRY_ICONS)[]
).filter(
  (name, index, all) =>
    all.findIndex((other) => ENTRY_ICONS[other] === ENTRY_ICONS[name]) ===
    index,
);

const iconOptions: FilterableMenuOption[] = iconNames.map((name) => {
  const Icon = ENTRY_ICONS[name];
  return {
    id: name,
    label: name.replaceAll("-", " "),
    content: (
      <>
        <Icon size={22} />
        <span>{name.replaceAll("-", " ")}</span>
      </>
    ),
  };
});

export function GraphicPicker({
  graphic,
  onChange,
  onReset,
  label = "Graphic",
}: {
  graphic?: EntityGraphic;
  onChange: (graphic: EntityGraphic) => void;
  onReset?: () => void;
  label?: string;
}) {
  const file = useRef<HTMLInputElement>(null);
  const importVersion = useRef(0);
  const [error, setError] = useState(false);
  useEffect(
    () => () => {
      importVersion.current++;
    },
    [],
  );
  return (
    <div class="field graphic-picker">
      {label}
      <div class="graphic-picker-row">
        <EntityGraphicView
          graphic={graphic}
          size={32}
          class="graphic-picker-preview"
        />
        <Button size="sm" onClick={() => file.current?.click()}>
          <IconImage size={22} /> Choose image…
        </Button>
        <FilterableMenu
          label="Built-in icons"
          buttonLabel="Search icons…"
          searchLabel="Search built-in icons"
          placeholder="Filter icons"
          options={iconOptions}
          selected={graphic?.kind === "icon" ? graphic.name : undefined}
          onSelect={(name) => {
            importVersion.current++;
            setError(false);
            onChange({ kind: "icon", name });
          }}
        />
        {onReset && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              importVersion.current++;
              setError(false);
              onReset();
            }}
          >
            Use default
          </Button>
        )}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const image = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (image) {
            const version = ++importVersion.current;
            void importImage(image)
              .then((blob) => {
                if (version !== importVersion.current) return;
                setError(false);
                onChange({ kind: "image", image: blob });
              })
              .catch(() => {
                if (version === importVersion.current) setError(true);
              });
          }
        }}
      />
      {error && (
        <span class="graphic-picker-error" role="alert">
          Could not import that image.
        </span>
      )}
    </div>
  );
}
