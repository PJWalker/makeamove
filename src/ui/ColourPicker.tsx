import { useEffect, useRef, useState } from "react";
import {
  Button,
  ColorArea,
  ColorField,
  ColorSwatch,
  ColorThumb,
  Dialog,
  DialogTrigger,
  Input,
  parseColor,
  Popover,
  Slider,
  SliderThumb,
  SliderTrack,
} from "react-aria-components";
import type { Color } from "react-aria-components";
import {
  clampOklch,
  gamutMappedOklch,
  GENERAL_COLOUR_LIMITS,
  hexToOklch,
  maxSrgbChroma,
  oklchToSrgbHex,
  oklchFromGamutPosition,
  oklchToGamutPosition,
  USER_COLOUR_LIMITS,
} from "../lib/colour";
import type { Oklch } from "../lib/colour";

type ColourRange = typeof GENERAL_COLOUR_LIMITS | typeof USER_COLOUR_LIMITS;

/** A picked colour as OKLCH, ignoring its opacity, kept within `range`. */
const oklchOf = (colour: Color, range: ColourRange) =>
  clampOklch(hexToOklch(colour.toString("hex").toLowerCase()), range);

/** A colour as the app stores it: #rrggbb, or #rrggbbaa with an opacity. */
const withOpacity = (hex: string, opacity: number, alpha: boolean) =>
  alpha
    ? `${hex}${Math.round(opacity * 255)
        .toString(16)
        .padStart(2, "0")}`
    : hex;

const hueStops = [0, 60, 120, 180, 240, 300, 360];

function hueSpectrum(colour: Oklch) {
  const lightness = Math.max(0.2, Math.min(0.9, colour.l));
  const chroma = Math.max(0.04, colour.c);
  const stops = hueStops.map((hue) => {
    const mapped = gamutMappedOklch({ l: lightness, c: chroma, h: hue });
    return `oklch(${(mapped.l * 100).toFixed(2)}% ${mapped.c.toFixed(4)} ${hue})`;
  });
  return `linear-gradient(90deg in oklch, ${stops.join(", ")})`;
}

function areaProxyColour(colour: Oklch, range: ColourRange, lastX: number): Color {
  const { x, y } = oklchToGamutPosition(colour, range);
  const horizontal = maxSrgbChroma(colour.l, colour.h, range.maxChroma) === 0 ? lastX : x;
  return parseColor(`hsb(0, ${horizontal * 100}%, ${y * 100}%)`);
}

function drawGamut(canvas: HTMLCanvasElement, hue: number, range: ColourRange) {
  const size = 192;
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return;
  const image = context.createImageData(size, size);
  const { minLightness, maxLightness, maxChroma } = range;

  for (let y = 0; y < size; y++) {
    const lightness = maxLightness - (y / (size - 1)) * (maxLightness - minLightness);
    const gamutChroma = maxSrgbChroma(lightness, hue, maxChroma);
    for (let x = 0; x < size; x++) {
      const chroma = (x / (size - 1)) * gamutChroma;
      const hex = oklchToSrgbHex({ l: lightness, c: chroma, h: hue });
      const rgb = Number.parseInt(hex.slice(1), 16);
      const offset = (y * size + x) * 4;
      image.data[offset] = (rgb >> 16) & 255;
      image.data[offset + 1] = (rgb >> 8) & 255;
      image.data[offset + 2] = rgb & 255;
      image.data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
}

function OklchGamutArea({
  colour,
  range,
  onChange,
}: {
  colour: Oklch;
  range: ColourRange;
  onChange: (colour: Oklch) => void;
}) {
  const hue = colour.h;
  const [lastX, setLastX] = useState(() => oklchToGamutPosition(colour, range).x);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      drawGamut(target, hue, range);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [hue, range]);

  return (
    <div className="colour-picker-gamut">
      <canvas ref={canvas} className="colour-picker-gamut-canvas" aria-hidden="true" />
      <ColorArea
        className="colour-picker-area"
        colorSpace="hsb"
        xChannel="saturation"
        yChannel="brightness"
        value={areaProxyColour(colour, range, lastX)}
        onChange={(next) => {
          const x = next.getChannelValue("saturation") / 100;
          setLastX(x);
          onChange(oklchFromGamutPosition(x, next.getChannelValue("brightness") / 100, hue, range));
        }}
        aria-label="Chroma and lightness"
        style={({ defaultStyle }) => ({ ...defaultStyle, background: "transparent" })}
      >
        <ColorThumb
          className="colour-picker-thumb"
          style={{ background: oklchToSrgbHex(gamutMappedOklch(colour, range)) }}
        />
      </ColorArea>
    </div>
  );
}

/** A colour swatch that opens an OKLCH area, hue slider and hex field. */
export function ColourPicker({
  label,
  value,
  onChange,
  alpha = false,
  disabled = false,
  constrainUserColour = false,
  onClose,
}: {
  label: string;
  /** #rrggbb, or #rrggbbaa with `alpha`. */
  value: string;
  onChange: (colour: string) => void;
  /** Whether the colour has an opacity to pick. */
  alpha?: boolean;
  disabled?: boolean;
  /** Uses the bounded OKLCH user-colour area. */
  constrainUserColour?: boolean;
  onClose?: () => void;
}) {
  const range = constrainUserColour ? USER_COLOUR_LIMITS : GENERAL_COLOUR_LIMITS;
  const { userColour, opacity, visibleHex, shownColour, emitColour, changeHex } = useColourPicker(
    value,
    alpha,
    range,
    onChange,
  );
  return (
    <DialogTrigger onOpenChange={(open) => !open && onClose?.()}>
      <Button
        className="colour-picker-trigger"
        aria-label={label}
        data-tip={label}
        isDisabled={disabled}
      >
        <ColorSwatch
          className="colour-picker-swatch"
          color={shownColour}
          style={{
            background: `linear-gradient(${shownColour}, ${shownColour}), var(--checkerboard)`,
          }}
        />
      </Button>
      <Popover placement="bottom start" offset={6} className="colour-picker-panel context-menu">
        <Dialog className="colour-picker-dialog" aria-label={label}>
          <OklchGamutArea colour={userColour} range={range} onChange={emitColour} />
          <Slider
            className="colour-picker-slider"
            aria-label="Hue"
            minValue={0}
            maxValue={360}
            step={1}
            value={userColour.h}
            onChange={(hue) => {
              emitColour({ ...userColour, h: hue });
            }}
          >
            <SliderTrack
              className="colour-picker-track"
              style={{ background: hueSpectrum(userColour) }}
            >
              <SliderThumb className="colour-picker-thumb" style={{ background: visibleHex }} />
            </SliderTrack>
          </Slider>
          {alpha && (
            <Slider
              className="colour-picker-slider colour-picker-alpha"
              aria-label="Opacity"
              minValue={0}
              maxValue={1}
              step={0.01}
              value={opacity}
              formatOptions={{ style: "percent" }}
              onChange={(next) => {
                emitColour(userColour, next);
              }}
            >
              <SliderTrack
                className="colour-picker-track"
                style={{ background: `linear-gradient(90deg, ${visibleHex}00, ${visibleHex})` }}
              >
                <SliderThumb className="colour-picker-thumb" style={{ background: shownColour }} />
              </SliderTrack>
            </Slider>
          )}
          <ColorField
            className="colour-picker-hex"
            aria-label="Hex"
            value={parseColor(shownColour).toFormat("hsb")}
            onChange={(typed) => typed && changeHex(typed)}
          >
            <Input />
          </ColorField>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

function useColourPicker(
  value: string,
  alpha: boolean,
  range: ColourRange,
  onChange: (colour: string) => void,
) {
  const incoming = parseColor(value);
  const [userColour, setUserColour] = useState(() => oklchOf(incoming, range));
  const [opacity, setOpacity] = useState(() => incoming.getChannelValue("alpha"));
  const [lastIncoming, setLastIncoming] = useState(value);
  const [lastEmitted, setLastEmitted] = useState(value);

  if (value !== lastIncoming) {
    setLastIncoming(value);
    if (value === lastEmitted) setLastEmitted("");
    else {
      setUserColour(oklchOf(incoming, range));
      setOpacity(incoming.getChannelValue("alpha"));
    }
  }

  const visibleHex = oklchToSrgbHex(gamutMappedOklch(userColour, range));
  const shownColour = withOpacity(visibleHex, opacity, alpha);

  const emitColour = (next: Oklch, nextOpacity = opacity) => {
    const limited = clampOklch(next, range);
    setUserColour(limited);
    setOpacity(nextOpacity);
    const output = withOpacity(
      oklchToSrgbHex(gamutMappedOklch(limited, range)),
      nextOpacity,
      alpha,
    );
    setLastEmitted(output);
    if (output !== value) onChange(output);
  };

  const changeHex = (typed: Color) => {
    emitColour(oklchOf(typed, range), typed.getChannelValue("alpha"));
  };
  return { userColour, opacity, visibleHex, shownColour, emitColour, changeHex };
}
