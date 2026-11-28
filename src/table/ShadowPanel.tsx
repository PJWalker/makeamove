import type { Campaign } from "../campaign/campaign";
import { dismissIdea, forgetAll, forgetFact, setThreadResolved } from "../features/shadow/memory";
import type { ThreadView } from "../features/shadow/memory";
import type { Shadow, ShadowStatus } from "../features/shadow/shadow";
import type { VoiceStatus } from "../features/shadow/voice";
import type { ShadowStore } from "../features/shadow/schema";
import Button from "../ui/Button";
import { IconClose, IconMicrophone, IconShadow } from "../ui/icons";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "../workspace/campaignContext";

/*
 * The GM shadow (features/shadow): what it suggests and remembers, and its
 * switches. Only the GM's device has one; the panel isn't offered to players.
 */

// eslint-disable-next-line import/prefer-default-export -- named, like the rest of the other panels
export function ShadowPanel({ campaign }: { campaign: Campaign }) {
  const { shadow } = useCampaign();
  const memory = useQuery(campaign.vault)?.shadow;
  if (!shadow || !memory) return <p className="empty">Only the GM has a shadow.</p>;
  return <ShadowBody shadow={shadow} memory={memory} />;
}

/** How many of the GM's latest phrases to show. */
const HEARD_SHOWN = 30;

function ShadowBody({ shadow, memory }: { shadow: Shadow; memory: ShadowStore }) {
  const status = useQuery(shadow.status);
  const view = useQuery(shadow.view);
  const forgotten = view.threads.filter((t) => t.forgotten);
  const threads = view.threads.filter((t) => !t.forgotten);
  return (
    <div className="panel-scroll shadow-panel">
      <ShadowControls shadow={shadow} status={status} />
      {status.kind === "error" && <p className="shadow-error">{status.message}</p>}
      <section aria-label="Ideas">
        <h3>Complications</h3>
        {view.ideas.length > 0 ? (
          <ul className="shadow-list">
            {view.ideas.map((idea) => (
              <li key={idea.id} className="shadow-item">
                <span>{idea.text}</span>
                <Button
                  variant="icon"
                  icon={IconClose}
                  label="Dismiss"
                  onClick={() => {
                    dismissIdea(memory, idea.id);
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Nothing yet.</p>
        )}
      </section>
      {forgotten.length > 0 && (
        <section aria-label="Forgotten threads" className="shadow-forgotten">
          <h3>Forgotten threads</h3>
          <ThreadList threads={forgotten} memory={memory} />
        </section>
      )}
      <section aria-label="Plot threads">
        <h3>Plot threads</h3>
        {threads.length > 0 ? (
          <ThreadList threads={threads} memory={memory} />
        ) : (
          <p className="empty">None yet.</p>
        )}
      </section>
      <section aria-label="People, places and things">
        <h3>People, places and things</h3>
        {view.facts.length > 0 ? (
          <dl className="shadow-facts">
            {view.facts.map((f) => (
              <div key={f.id} className="shadow-item">
                <div>
                  <dt>{f.name}</dt>
                  <dd>{f.facts.join("; ")}</dd>
                </div>
                <Button
                  variant="icon"
                  icon={IconClose}
                  label={`Forget ${f.name}`}
                  onClick={() => {
                    forgetFact(memory, f.id);
                  }}
                />
              </div>
            ))}
          </dl>
        ) : (
          <p className="empty">None yet.</p>
        )}
      </section>
      {view.summary && (
        <section aria-label="The story so far">
          <h3>The story so far</h3>
          <p className="shadow-summary">{view.summary}</p>
        </section>
      )}
      {view.heard.length > 0 && (
        <details className="shadow-heard">
          <summary>What it heard you say ({view.heard.length})</summary>
          <ol>
            {view.heard.slice(-HEARD_SHOWN).map((l) => (
              <li key={l.at}>{l.text.replace(/^GM \(aloud\): /, "")}</li>
            ))}
          </ol>
        </details>
      )}
      <Button
        variant="danger"
        className="shadow-forget"
        onClick={() => {
          forgetAll(memory);
        }}
      >
        Forget Everything
      </Button>
    </div>
  );
}

function ThreadList({ threads, memory }: { threads: ThreadView[]; memory: ShadowStore }) {
  return (
    <ul className="shadow-list">
      {threads.map((t) => (
        <li key={t.id} className="shadow-item" data-resolved={t.resolved || undefined}>
          <span>{t.title}</span>
          <Button
            variant="ghost"
            onClick={() => {
              setThreadResolved(memory, t.id, !t.resolved);
            }}
          >
            {t.resolved ? "Reopen" : "Resolved"}
          </Button>
        </li>
      ))}
    </ul>
  );
}

const STATUS_TEXT: Record<ShadowStatus["kind"], string> = {
  checking: "Looking for Chrome's on-device model…",
  unavailable:
    "This browser can't run an on-device model. The shadow needs desktop Chrome with built-in AI.",
  downloadable: "The shadow runs on Chrome's on-device model, which needs a one-time download.",
  downloading: "Downloading the on-device model…",
  ready: "Ready.",
  thinking: "Thinking…",
  error: "Something went wrong.",
};

function ShadowControls({ shadow, status }: { shadow: Shadow; status: ShadowStatus }) {
  const watching = useQuery(shadow.watching);
  return (
    <div className="shadow-bar">
      <p className="shadow-status" aria-live="polite">
        {watching && status.kind === "ready" ? "Watching the table." : STATUS_TEXT[status.kind]}
        {status.kind === "downloading" && (
          <progress value={status.progress} max={1} aria-label="Model download" />
        )}
      </p>
      <div className="shadow-controls">
        <WatchButtons shadow={shadow} status={status} watching={watching} />
        <ListenButton shadow={shadow} />
      </div>
      <ListeningNote shadow={shadow} />
    </div>
  );
}

function watchLabel(watching: boolean, status: ShadowStatus) {
  if (watching) return "Stop Watching";
  return status.kind === "downloadable" ? "Download and Watch" : "Watch";
}

function WatchButtons({
  shadow,
  status,
  watching,
}: {
  shadow: Shadow;
  status: ShadowStatus;
  watching: boolean;
}) {
  if (status.kind === "unavailable" || status.kind === "checking") return null;
  return (
    <>
      <Button
        variant={watching ? "secondary" : "primary"}
        icon={IconShadow}
        pressed={watching}
        disabled={status.kind === "downloading"}
        onClick={() => {
          if (watching) shadow.pause();
          else void shadow.begin();
        }}
      >
        {watchLabel(watching, status)}
      </Button>
      {watching && status.kind === "ready" && (
        <Button
          variant="ghost"
          onClick={() => {
            void shadow.think();
          }}
        >
          Look Now
        </Button>
      )}
    </>
  );
}

const LISTEN_LABEL: Record<VoiceStatus["kind"], string> = {
  off: "Listen to Me",
  error: "Listen to Me",
  unavailable: "Listen to Me",
  installing: "Setting Up…",
  listening: "Stop Listening",
};

function ListenButton({ shadow }: { shadow: Shadow }) {
  const voice = useQuery(shadow.voice.status);
  if (voice.kind === "unavailable") return null;
  const on = voice.kind === "listening" || voice.kind === "installing";
  return (
    <Button
      variant={voice.kind === "listening" ? "danger" : "secondary"}
      icon={IconMicrophone}
      pressed={voice.kind === "listening"}
      onClick={() => {
        if (on) shadow.voice.stop();
        else void shadow.voice.start();
      }}
    >
      {LISTEN_LABEL[voice.kind]}
    </Button>
  );
}

/** Says plainly while the microphone is on, and why it went off if it failed. */
function ListeningNote({ shadow }: { shadow: Shadow }) {
  const voice = useQuery(shadow.voice.status);
  if (voice.kind === "error") return <p className="shadow-error">{voice.message}</p>;
  if (voice.kind !== "listening") return null;
  return (
    <output className="shadow-listening">
      <span className="shadow-listening-dot" aria-hidden="true" /> Listening to your microphone, on
      this device only
    </output>
  );
}
