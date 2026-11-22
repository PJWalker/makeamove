import { TEXT_FONTS   } from "../scene/types";
import type {TextFont, TextStyle} from "../scene/types";
import { Button } from "../ui/Button";
import { IconBold, IconItalic } from "../ui/icons";
import { Segmented } from "../ui/Segmented";
import "./TextStyleFields.css";

/** The font choices, each shown in its own font. */
const FONT_OPTIONS = TEXT_FONTS.map((f) => ({
  id: f.id,
  label: f.label,
  icon: <span style={{ fontFamily: f.family }}>Aa</span>,
}));

/**
 * The font, weight and slant of text on the map. Text being edited stays in
 * edit as these change (see TextEditor), so they style it as it's typed.
 * Where texts differ, no font is chosen and bold or italic shows off.
 */
export function TextStyleFields({
  value,
  onChange,
}: {
  value: Partial<TextStyle>;
  onChange: (patch: Partial<TextStyle>) => void;
}) {
  return (
    <div className="text-style-fields" data-text-style>
      <Segmented
        label="Font"
        value={value.font ?? ("" as TextFont)}
        options={FONT_OPTIONS}
        onChange={(font) => { onChange({ font }); }}
      />
      <Button
        variant="icon"
        icon={IconBold}
        label="Bold"
        pressed={!!value.bold}
        onClick={() => { onChange({ bold: !value.bold }); }}
      />
      <Button
        variant="icon"
        icon={IconItalic}
        label="Italic"
        pressed={!!value.italic}
        onClick={() => { onChange({ italic: !value.italic }); }}
      />
    </div>
  );
}
