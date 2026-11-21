import { useEffect, useLayoutEffect, useRef } from "react";
import { toScreen } from "../scene/camera";
import type { SceneController } from "../scene/controller";
import type { TextRequest } from "../scene/gestures/types";
import { mapTextOutline } from "../scene/render/elementViews";
import { cssColour, INK, textWeight } from "../scene/render/style";
import { fontFamily, type TextStyle } from "../scene/types";
import { useConstant } from "../ui/useConstant";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "../workspace/campaignContext";

const OUTLINE = cssColour(INK).hex;

/**
 * Text typed straight onto the map, where it goes: set as the map draws it,
 * following the camera, with the map's own copy hidden meanwhile. Enter
 * starts a new line; clicking away, Escape or ⌘Enter puts it down. Styling it, from the text style fields or with ⌘B and ⌘I,
 * keeps it in edit.
 */
export function TextEditor({
  controller,
  request,
  onDone,
}: {
  controller: SceneController;
  request: TextRequest;
  onDone: () => void;
}) {
  const { ref, el, look, scale, at, host, colour, finish, restyle } = useTextEditor(
    controller,
    request,
    onDone,
  );
  return (
    <div
      ref={ref}
      // A textarea can't size itself to its words in Safari, nor set its text as the map does.
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="textbox"
      aria-multiline
      tabIndex={0}
      className="scene-text-editor"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      aria-label="Text"
      spellCheck={false}
      style={{
        left: `${host.left + at.x}px`,
        top: `${host.top + at.y}px`,
        rotate: `${el?.rot ?? 0}rad`,
        fontFamily: fontFamily(look.font),
        fontWeight: textWeight(look.bold),
        fontStyle: look.italic ? "italic" : "normal",
        fontSize: `${look.size * scale}px`,
        color: colour.hex,
        opacity: colour.alpha,
        WebkitTextStroke: `${mapTextOutline(look.size) * scale}px ${OUTLINE}`,
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        const module_ = event.metaKey || event.ctrlKey;
        if (event.key === "Escape" || (module_ && event.key === "Enter")) {
          event.preventDefault();
          finish();
        } else if (module_ && event.key.toLowerCase() === "b") {
          event.preventDefault();
          restyle({ bold: !look.bold });
        } else if (module_ && event.key.toLowerCase() === "i") {
          event.preventDefault();
          restyle({ italic: !look.italic });
        }
      }}
      onBlur={(event) => {
        if (event.relatedTarget?.closest("[data-text-style]")) {
          const node = event.currentTarget;
          addEventListener("pointerup", () => requestAnimationFrame(() => node.focus()), {
            once: true,
          });
          return;
        }
        finish();
      }}
    />
  );
}

function useTextEditor(controller: SceneController, request: TextRequest, onDone: () => void) {
  const { tools } = useCampaign();
  const cam = useQuery(controller.camera);
  useQuery(controller.revision);
  useQuery(tools.textStyle);
  useQuery(tools.pen);
  const reference = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const { id } = request;
  const existing = id ? controller.element(id) : null;
  const element = existing?.type === "text" ? existing : null;
  const look = element ?? controller.newTextLook("");
  const scale = (element ? element.w / element.bw : 1) * cam.zoom;
  const at = toScreen(cam, element ?? request.at);
  const host = controller.host.getBoundingClientRect();
  const colour = cssColour(look.colour);
  // What it held when the editor opened, kept as edits arrive.
  const startText = useConstant(() => element?.text ?? "");
  const startStyle = useConstant(() => element && { font: element.font, bold: element.bold, italic: element.italic });

  // Its words to start with, the caret at their end, and the map's copy hidden.
  useLayoutEffect(() => {
    const node = reference.current!;
    node.textContent = startText;
    // Next frame, once the press that opened it has finished moving focus.
    const frame = requestAnimationFrame(() => {
      node.focus();
      getSelection()?.selectAllChildren(node);
      getSelection()?.collapseToEnd();
    });
    const show = id ? controller.hide(id) : null;
    return () => {
      cancelAnimationFrame(frame);
      show?.();
    };
  }, [controller, id, startText]);

  // Text being edited takes on the Text tool's style as it changes, starting from its own.
  useEffect(() => {
    if (!startStyle || !id) return;
    tools.setTextStyle(startStyle);
    return tools.textStyle.subscribe(() => {
      const now = controller.element(id);
      const next = tools.textStyle.value;
      if (now?.type !== "text") return;
      const changed = (Object.keys(next) as (keyof TextStyle)[]).filter((k) => next[k] !== now[k]);
      if (changed.length > 0)
        controller.setProps([id], Object.fromEntries(changed.map((k) => [k, next[k]])));
    });
  }, [tools, controller, id, startStyle]);

  /** Put it down, once. */
  const finish = () => {
    if (done.current) return;
    done.current = true;
    controller.putText(request.at, reference.current?.innerText ?? "", id);
    onDone();
  };

  /** Text is styled through the Text tool's style, which text being edited follows. */
  const restyle = (patch: Partial<TextStyle>) => tools.setTextStyle(patch);

  return { ref: reference, el: element, look, scale, at, host, colour, finish, restyle };
}
