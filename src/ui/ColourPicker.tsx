import { useState } from "react";
import {
  Button,
  type Color,
  ColorArea,
  ColorField,
  ColorFieldContext,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorThumb,
  Dialog,
  DialogTrigger,
  Input,
  parseColor,
  Popover,
  SliderTrack,
} from "react-aria-components";

/** A colour as the app stores it: #rrggbb, or #rrggbbaa with an opacity. */
const format = (colour: Color, alpha: boolean) =>
  colour.toString(alpha ? "hexa" : "hex").toLowerCase();

/**
 * A colour swatch that opens a picker: a saturation and brightness area, a
 * hue slider, an opacity slider (with `alpha`), and a hex field. The swatch
 * shows the colour over a checkerboard, so its opacity shows too. Changes
 * apply as they're made; `onClose` hears when the picker is put away.
 */
export function ColourPicker({
  label,
  value,
  onChange,
  alpha = false,
  disabled = false,
  onClose,
}: {
  label: string;
  /** #rrggbb, or #rrggbbaa with `alpha`. */
  value: string;
  onChange: (colour: string) => void;
  /** Whether the colour has an opacity to pick. */
  alpha?: boolean;
  disabled?: boolean;
  onClose?: () => void;
}) {
  // Kept in HSB so the hue holds steady through greys and black, where the stored hex forgets it.
  const [colour, setColour] = useState(() => parseColor(value).toFormat("hsb"));
  const given = parseColor(value);
  if (format(colour, alpha) !== format(given, alpha)) setColour(given.toFormat("hsb"));
  const change = (next: Color) => {
    setColour(next);
    const hex = format(next, alpha);
    if (hex !== format(given, alpha)) onChange(hex);
  };
  return (
    <ColorPicker value={colour} onChange={change}>
      <DialogTrigger onOpenChange={(open) => !open && onClose?.()}>
        <Button
          className="colour-picker-trigger"
          aria-label={label}
          data-tip={label}
          isDisabled={disabled}
        >
          <ColorSwatch
            className="colour-picker-swatch"
            style={({ color }) => ({
              background: `linear-gradient(${color.toString("css")}, ${color.toString("css")}), var(--checkerboard)`,
            })}
          />
        </Button>
        <Popover placement="bottom start" offset={6} className="colour-picker-panel context-menu">
          <Dialog className="colour-picker-dialog" aria-label={label}>
            <ColorArea
              className="colour-picker-area"
              colorSpace="hsb"
              xChannel="saturation"
              yChannel="brightness"
            >
              <ColorThumb className="colour-picker-thumb" />
            </ColorArea>
            <ColorSlider className="colour-picker-slider" colorSpace="hsb" channel="hue">
              <SliderTrack className="colour-picker-track">
                <ColorThumb className="colour-picker-thumb" />
              </SliderTrack>
            </ColorSlider>
            {alpha && (
              <ColorSlider
                className="colour-picker-slider colour-picker-alpha"
                channel="alpha"
                aria-label="Opacity"
              >
                <SliderTrack className="colour-picker-track">
                  <ColorThumb className="colour-picker-thumb" />
                </SliderTrack>
              </ColorSlider>
            )}
            {/* Not wired to the picker, which would take a typed #rrggbb as fully opaque: it keeps the opacity. */}
            <ColorFieldContext.Provider value={null}>
              <ColorField
                className="colour-picker-hex"
                aria-label="Hex"
                value={colour}
                onChange={(typed) =>
                  typed &&
                  change(
                    typed
                      .toFormat("hsb")
                      .withChannelValue("alpha", colour.getChannelValue("alpha")),
                  )
                }
              >
                <Input />
              </ColorField>
            </ColorFieldContext.Provider>
          </Dialog>
        </Popover>
      </DialogTrigger>
    </ColorPicker>
  );
}
