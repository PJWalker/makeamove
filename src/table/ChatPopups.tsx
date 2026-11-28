import type * as React from "react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { arrow, autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { bubblePlaceOf } from "../features/chat/types";
import type { ChatMessage } from "../features/chat/types";
import { markRead } from "../features/chat/unread";
import type { Campaign } from "../campaign/campaign";
import { growFrom, leave } from "../ui/morph";
import { reducedMotion } from "../ui/transition";
import Button from "../ui/Button";
import { IconClose } from "../ui/icons";
import { useQuery } from "../ui/useQuery";
import { watch } from "../lib/store";
import { useCampaign } from "../workspace/campaignContext";
import onScreenRect from "./onScreenRect";
import { STAY_MS, usePageHidden } from "./popupStay";

const LoneMessage = lazy(() =>
  import("./ChatMessage").then((module) => ({ default: module.LoneMessage })),
);

/*
 * Chat that arrives while the Chat panel is closed or behind another tab, from
 * someone with no token showing on the scene (the GM, say; table/SpeechBubbles.tsx
 * has the rest), pops up beside the Chat tab, as if the tab were speaking (chat/notify.ts decides
 * when): the whole message, as the log shows it. Several in a row stack, the
 * newest in front and older ones receding behind it. Each grows out of the
 * tab and shrinks back into it. When the tab isn't on screen (the panel is
 * floating or closed, or autohide has slid the sidebar away), the stack sits
 * in the table's bottom-right corner instead.
 *
 * A popup leaves on its own after a few seconds; the stack waits while the
 * pointer is on it, and while the page is hidden, so popups that arrive in a
 * background tab are still there to read on coming back. Clicking the front one, anywhere but its buttons and
 * links, opens the chat; its × sends the whole stack away. Any of that counts
 * as reading the chat, which clears the Chat tab's unread badge.
 */

/** Between the tab and the bubble, room for the bubble's tail. */
const GAP = 16;
/** The closest the bubble comes to the window's top and bottom edges. */
const MARGIN = 8;

const chatTab = () => document.querySelector('.rail-tab[data-panel="chat"]');

/** The Chat tab's box, if it's on screen. */
const tabRect = () => onScreenRect(chatTab());

/** A popup squeezed into the Chat tab, or a little below itself when the tab isn't showing. */

function ChatPopups({ campaign }: { campaign: Campaign }) {
  const { shown, held, hidden, leavingAll, setHeld, setLeavingAll, ref, stack, place } =
    useChatPopupStack(campaign);
  if (shown.length === 0) return null;
  return (
    <output
      ref={ref}
      className="chat-popups"
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
      <div ref={stack} className="chat-popup-stack">
        {shown.map((message, index) => (
          <Popup
            key={message.id}
            campaign={campaign}
            m={message}
            depth={shown.length - 1 - index}
            held={held || hidden}
            leaving={leavingAll}
            stack={stack}
            place={place}
            onDismissAll={() => {
              setLeavingAll(true);
            }}
          />
        ))}
      </div>
      <span className="chat-popup-tail" aria-hidden="true" />
    </output>
  );
}

function useChatPopupStack(campaign: Campaign) {
  const context = useCampaign();
  // Tell chat/notify.ts whether new messages can be read where they land.
  useEffect(
    () =>
      watch([context.panels.layout], () => {
        context.chat.chatInView.set(context.panels.panelVisible("chat"));
      }),
    [context],
  );
  const messages = useQuery(campaign.chat.messages);
  const panelLayout = useQuery(context.panels.layout);
  const chatOpen = useQuery(context.chat.chatInView);
  const atTokens = useQuery(context.chat.bubbleTokens);
  const me = useQuery(campaign.device).id;
  const isGm = useQuery(campaign.members, () => campaign.isGm());
  // Looked up live, so a deleted message takes its popup with it.
  const shown = useQuery(context.chat.chatPopups)
    .map((id) => messages.find((m) => m.id === id))
    .filter(
      (m): m is ChatMessage =>
        !!m && bubblePlaceOf(m, { me, isGm, chatOpen, tokenShown: m.id in atTokens }) === "edge",
    );
  const [held, setHeld] = useState(false);
  const hidden = usePageHidden();
  const [leavingAll, setLeavingAll] = useState(false);
  const reference = useRef<HTMLOutputElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const any = shown.length > 0;

  // Beside the Chat tab, or in the corner without it.
  const placementRevision = useRef(0);
  const placementInFlight = useRef<Promise<void> | null>(null);
  const place = useCallback(() => {
    if (placementInFlight.current) return placementInFlight.current;
    const element = reference.current;
    const box = stack.current;
    if (!element || !box) return Promise.resolve();
    const revision = ++placementRevision.current;
    const tabElement = chatTab();
    const tab = tabRect();
    const corner = () => {
      if (revision !== placementRevision.current) return;
      element.dataset["anchor"] = "corner";
      element.style.removeProperty("left");
      element.style.removeProperty("top");
      element.style.removeProperty("right");
      element.style.removeProperty("bottom");
      element.style.removeProperty("--tail-y");
      const tail = element.querySelector<HTMLElement>(".chat-popup-tail");
      tail?.style.removeProperty("display");
      tail?.style.removeProperty("visibility");
    };
    if (!tab || !tabElement) {
      corner();
      return Promise.resolve();
    }

    const tail = element.querySelector<HTMLElement>(".chat-popup-tail");
    if (tail) {
      tail.style.display = "block";
      tail.style.visibility = "hidden";
    }
    const preferred = tab.left + tab.width / 2 > innerWidth / 2 ? "left" : "right";
    const positioning = computePosition(tabElement, element, {
      strategy: "fixed",
      placement: preferred,
      middleware: [
        offset(GAP),
        flip({
          fallbackPlacements: [preferred === "left" ? "right" : "left"],
          padding: MARGIN,
        }),
        shift({ padding: MARGIN }),
        ...(tail ? [arrow({ element: tail, padding: 16 })] : []),
      ],
    }).then((result) => {
      if (revision === placementRevision.current && element.isConnected) {
        if (tabRect()) {
          const placement = result.placement.split("-")[0];
          element.dataset["anchor"] = placement === "left" ? "right" : "left";
          tail?.style.removeProperty("display");
          tail?.style.removeProperty("visibility");
          element.style.left = `${Math.round(result.x)}px`;
          element.style.top = `${Math.round(result.y)}px`;
          element.style.removeProperty("right");
          element.style.removeProperty("bottom");
          const arrowOffset = result.middlewareData.arrow?.y;
          if (arrowOffset !== undefined)
            element.style.setProperty("--tail-y", `${arrowOffset + 12}px`);
        } else corner();
      }
    });
    placementInFlight.current = positioning;
    const settle = () => {
      if (placementInFlight.current === positioning) placementInFlight.current = null;
    };
    void positioning.then(settle, settle);
    return positioning;
  }, []);

  // Follow the tab as its sidebar moves, and rebind if the panel layout changes.
  useLayoutEffect(() => {
    if (!any) return;
    const tab = chatTab();
    const element = reference.current;
    if (!tab || !element) {
      void place();
      return;
    }
    return autoUpdate(tab, element, () => void place(), { animationFrame: true });
  }, [any, panelLayout, place]);

  // Once nothing shows, start afresh.
  const [wasAny, setWasAny] = useState(any);
  if (any !== wasAny) {
    setWasAny(any);
    if (!any) {
      setHeld(false);
      setLeavingAll(false);
    }
  }

  return { shown, held, hidden, leavingAll, setHeld, setLeavingAll, ref: reference, stack, place };
}

function Popup({
  campaign,
  m,
  depth,
  held,
  leaving,
  stack,
  place,
  onDismissAll,
}: {
  campaign: Campaign;
  m: ChatMessage;
  /** 0 for the one in front, counting back. */
  depth: number;
  held: boolean;
  /** The whole stack is going away. */
  leaving: boolean;
  /** Every popup shares the stack's box; the ones behind are only shifted by their depth. */
  stack: { current: HTMLDivElement | null };
  /** Puts the stack beside the tab; it must be there before a popup measures where to grow from. */
  place: () => Promise<void>;
  onDismissAll: () => void;
}) {
  const context = useCampaign();
  const reference = useRef<HTMLDivElement>(null);
  const gone = useRef(false);

  const leavePopup = useEffectEvent(() => {
    const element = reference.current;
    const box = stack.current?.getBoundingClientRect();
    if (gone.current) return;
    gone.current = true;
    if (!element || !box || reducedMotion.matches) {
      context.chat.dismissPopup(m.id);
      return;
    }
    void leave(
      element,
      () => {
        context.chat.dismissPopup(m.id);
      },
      null,
    );
  });

  useLayoutEffect(() => {
    // This runs before the stack's own layout effect places it, so place it now.
    let active = true;
    void place().then(() => {
      const element = reference.current;
      const box = stack.current?.getBoundingClientRect();
      if (active && element && box && !reducedMotion.matches) growFrom(element, box);
    });
    return () => {
      active = false;
    };
  }, [place, stack]);

  // Each waits its own time, all of them paused while the pointer is on the stack.
  useEffect(() => {
    if (held || leaving) return;
    const timer = setTimeout(leavePopup, STAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [held, leaving]);

  useEffect(() => {
    if (leaving) leavePopup();
  }, [leaving]);

  const open = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button, a")) return;
    context.panels.showPanel("chat");
  };

  const front = depth === 0;
  return (
    // Clicking the popup is a mouse shortcut; the chat panel is reachable by keyboard.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, react-doctor/no-static-element-interactions -- The mouse shortcut is optional; the Chat tab remains keyboard accessible.
    <div
      ref={reference}
      className="chat-popup panel"
      data-depth={depth}
      style={{ "--depth": depth }}
      inert={!front}
      title={front ? "Open the chat" : undefined}
      onClick={open}
    >
      <Suspense fallback={null}>
        <LoneMessage campaign={campaign} m={m} />
      </Suspense>
      <Button variant="icon" className="chat-popup-close" label="Dismiss" onClick={onDismissAll}>
        <IconClose />
      </Button>
    </div>
  );
}

export default ChatPopups;
