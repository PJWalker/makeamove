import { useEffect, useRef, useState } from "react";
import { importImage } from "../media/images";
import type { EntityGraphic } from "../media/images";
import { Button } from "./Button";
import { EntityGraphicView } from "./EntityGraphic";
import { ENTRY_ICONS } from "./entryIcons";
import { FilterableMenu  } from "./FilterableMenu";
import type {FilterableMenuOption} from "./FilterableMenu";
import { IconImage, IconSearch } from "./icons";

const iconNames = (Object.keys(ENTRY_ICONS) as (keyof typeof ENTRY_ICONS)[]).filter(
  (name, index, all) =>
    all.findIndex((other) => ENTRY_ICONS[other] === ENTRY_ICONS[name]) === index,
);

const iconOptions: FilterableMenuOption[] = iconNames.map((name) => {
  const Icon = ENTRY_ICONS[name];
  const label = name.replaceAll("-", " ");
  return {
    id: name,
    label,
    content: (
      <>
        <Icon size={22} />
        <span>{label}</span>
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
  graphic?: EntityGraphic | undefined;
  onChange: (graphic: EntityGraphic) => void;
  onReset?: (() => void) | undefined;
  label?: string;
}) {
  const file = useRef<HTMLInputElement>(null);
  const importVersion = useRef(0);
  const [error, setError] = useState(false);
  /** Forget any image still being imported: what's chosen now wins. */
  const dropImport = () => {
    importVersion.current++;
    setError(false);
  };
  useEffect(
    () => () => {
      importVersion.current++;
    },
    [],
  );
  return (
    <div className="field graphic-picker">
      {label}
      <div className="graphic-picker-row">
        <EntityGraphicView graphic={graphic} size={32} className="graphic-picker-preview" />
        <Button onClick={() => file.current?.click()}>
          <IconImage size={22} /> Choose Image…
        </Button>
        <FilterableMenu
          label="Built-in icons"
          trigger={
            <>
              <IconSearch size={22} /> Search icons…
            </>
          }
          searchLabel="Search built-in icons"
          placeholder="Filter icons"
          options={iconOptions}
          selected={graphic?.kind === "icon" ? graphic.name : undefined}
          onSelect={(name) => {
            dropImport();
            onChange({ kind: "icon", name });
          }}
        />
        {onReset && (
          <Button
            variant="ghost"
            onClick={() => {
              dropImport();
              onReset();
            }}
          >
            Use Default
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
        <span className="graphic-picker-error" role="alert">
          Could not import that image.
        </span>
      )}
    </div>
  );
}
