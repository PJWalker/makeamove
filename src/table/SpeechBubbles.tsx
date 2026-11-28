import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import type { Campaign } from "../campaign/campaign";
import { listCharacters } from "../features/characters/api";
import { describe } from "../features/chat/notify";
import { bubblePlaceOf } from "../features/chat/types";
import type { ChatMessage } from "../features/chat/types";
import { markRead } from "../features/chat/unread";
import { linkLabel } from "../features/notes/targets";
import { toScreen } from "../scene/camera";
import type SceneController from "../scene/controller";
import { pinInside } from "../scene/edgePin";
import { bounds } from "../scene/geometry";
import { growFrom, leave } from "../ui/morph";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "../workspace/campaignContext";
import { STAY_MS, usePageHidden } from "./popupStay";
import { speakerTokens } from "./speakers";
import type { PlayedBy } from "./speakers";

/*
 * Spatial chat: while the chat log is closed, a message pops up as a speech
 * bubble over its speaker's token (table/speakers.ts says whose), and fades
 * after a few seconds. Who sees a bubble, and whether it may sit at a token,
 * is audience.ts's proved `bubblePlace`: whispers and secret rolls only
 * reach who the log would show them to in full, and a bubble only sits at a
 * token this device is shown (scene/fog.ts's proved `tokenShows`), so it
 * never gives away a token hidden by fog or out of sight. Messages from
 * anyone without such a token pop up beside the Chat tab instead
 * (ChatPopups.tsx). Several from one token stack, the newest nearest it.
 * Clicking one opens the chat.
 */

/** Screen px between a token's top and its bubbles. */
const GAP = 10;
/** Screen px the bubbles keep from the edges of the scene's open space. */
const MARGIN = 8;

const sameTokens = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

/** Half of something: a box's centre is half its size in. */
const HALF = 0.5;
/** Between the owner and character ids in `usePlayedBy`'s key, which neither contains. */
const SEP = "\n";

const px = (n: number) => `${String(Math.round(n))}px`;

/** Each device's player characters, by device id. */
function usePlayedBy(campaign: Campaign): PlayedBy {
  // Read as a string, so it only changes when someone's characters do.
  const key = useQuery(campaign.characters, () =>
    listCharacters(campaign)
      .flatMap((c) => (c.kind === "pc" && c.owner ? [`${c.owner}${SEP}${c.id}`] : []))
      .join(SEP + SEP),
  );
  const played: PlayedBy = {};
  for (const pair of key ? key.split(SEP + SEP) : []) {
    const [owner = "", id = ""] = pair.split(SEP);
    played[owner] = [...(played[owner] ?? []), id];
  }
  return played;
}

function SpeechBubbles({
  campaign,
  controller,
}: {
  campaign: Campaign;
  controller: SceneController;
}) {
  const context = useCampaign();
  const messages = useQuery(campaign.chat.messages);
  const popups = useQuery(context.chat.chatPopups);
  const chatOpen = useQuery(context.chat.chatInView);
  const me = useQuery(campaign.device).id;
  const isGm = useQuery(campaign.members, () => campaign.isGm());
  const playedBy = usePlayedBy(campaign);
  const atTokens = useQuery(context.chat.bubbleTokens);
  const pending = popups
    .map((id) => messages.find((m) => m.id === id))
    .filter((m): m is ChatMessage => m !== undefined);

  // Which popups speak from a token showing here, checked every frame while
  // any are up, since tokens move in and out of sight.
  const check = useEffectEvent(() => {
    const elements = controller.allElements();
    const next: Record<string, string> = {};
    for (const m of pending) {
      const token = speakerTokens(m, elements, playedBy).find((t) =>
        controller.renderer.tokenShown(t),
      );
      const place = bubblePlaceOf(m, { me, isGm, chatOpen, tokenShown: token !== undefined });
      if (place === "token" && token) next[m.id] = token.id;
    }
    if (!sameTokens(next, context.chat.bubbleTokens.value)) context.chat.bubbleTokens.set(next);
  });
  const any = pending.length > 0;
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      check();
      frame = requestAnimationFrame(loop);
    };
    if (any) loop();
    else context.chat.bubbleTokens.set({});
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [any, context]);
  useEffect(
    () => () => {
      context.chat.bubbleTokens.set({});
    },
    [context],
  );

  // Grouped by token, in the order they arrived.
  const byToken = new Map<string, ChatMessage[]>();
  for (const m of pending) {
    const tokenId = atTokens[m.id];
    if (tokenId) byToken.set(tokenId, [...(byToken.get(tokenId) ?? []), m]);
  }
  return [...byToken].map(([tokenId, said]) => (
    <BubbleStack
      key={tokenId}
      campaign={campaign}
      controller={controller}
      tokenId={tokenId}
      said={said}
    />
  ));
}

SpeechBubbles.displayName = "SpeechBubbles";
export default SpeechBubbles;

/** The box a token takes on screen, in client px. */
function tokenRect(controller: SceneController, tokenId: string): DOMRect | null {
  const token = controller.allElements().find((element) => element.id === tokenId);
  if (!token) return null;
  const b = bounds([controller.renderer.previews.get(tokenId) ?? token]);
  if (!b) return null;
  const host = controller.host.getBoundingClientRect();
  const cam = controller.renderer.camera;
  const a = toScreen(cam, { x: b.x, y: b.y });
  const z = toScreen(cam, { x: b.x + b.w, y: b.y + b.h });
  return new DOMRect(host.left + a.x, host.top + a.y, z.x - a.x, z.y - a.y);
}

/** One token's bubbles, over it, following it as it and the camera move. */
function BubbleStack({
  campaign,
  controller,
  tokenId,
  said,
}: {
  campaign: Campaign;
  controller: SceneController;
  tokenId: string;
  said: ChatMessage[];
}) {
  const stackRef = useRef<HTMLOutputElement>(null);
  const [held, setHeld] = useState(false);
  const hidden = usePageHidden();

  // Over the token, kept inside the scene's open space.
  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      const element = stackRef.current;
      const token = tokenRect(controller, tokenId);
      if (element && token) {
        const host = controller.host.getBoundingClientRect();
        const inset = controller.renderer.insets();
        const { offsetWidth: w, offsetHeight: h } = element;
        const box = { x: token.x + (token.width - w) * HALF, y: token.y - GAP - h, w, h };
        const room = {
          x: host.left + inset.left + MARGIN,
          y: host.top + inset.top + MARGIN,
          w: Math.max(0, host.width - inset.left - inset.right - MARGIN - MARGIN),
          h: Math.max(0, host.height - inset.top - MARGIN - MARGIN),
        };
        const by = pinInside(box, room);
        element.style.translate = `${px(box.x + by.x)} ${px(box.y + by.y)}`;
        // The tail points at the token only while the bubble is still over it.
        element.dataset["tail"] = String(by.y === 0);
        element.style.setProperty("--tail-x", px(w * HALF - by.x));
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [controller, tokenId]);

  return (
    <output
      ref={stackRef}
      className="speech-bubbles"
      aria-live="polite"
      onPointerEnter={() => {
        setHeld(true);
      }}
      onPointerLeave={() => {
        setHeld(false);
      }}
      onPointerDown={() => {
        markRead(campaign);
      }}
    >
      {said.map((m) => (
        <Bubble
          key={m.id}
          campaign={campaign}
          controller={controller}
          tokenId={tokenId}
          m={m}
          held={held || hidden}
        />
      ))}
    </output>
  );
}

function Bubble({
  campaign,
  controller,
  tokenId,
  m,
  held,
}: {
  campaign: Campaign;
  controller: SceneController;
  tokenId: string;
  m: ChatMessage;
  held: boolean;
}) {
  const context = useCampaign();
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const text = describe(m, (kind, id) => linkLabel(campaign, kind, id));

  // Grows out of its token.
  useLayoutEffect(() => {
    const element = bubbleRef.current;
    const from = tokenRect(controller, tokenId);
    if (element && from) growFrom(element, from);
  }, [controller, tokenId]);

  const fade = useEffectEvent(() => {
    const element = bubbleRef.current;
    if (element)
      void leave(
        element,
        () => {
          context.chat.dismissPopup(m.id);
        },
        null,
      );
    else context.chat.dismissPopup(m.id);
  });
  useEffect(() => {
    if (held) return undefined;
    const timer = setTimeout(fade, STAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [held]);
  const whisper = m.kind === "text" && m.to !== undefined;

  if (!text) return null;
  return (
    <button
      ref={bubbleRef}
      type="button"
      className="speech-bubble"
      data-whisper={whisper}
      title="Open the chat"
      onClick={() => {
        context.panels.showPanel("chat");
      }}
    >
      {whisper && <span className="speech-bubble-whisper">Whisper </span>}
      {text.body}
    </button>
  );
}
