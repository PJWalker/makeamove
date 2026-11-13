import { createContext, use } from "react";
import { LocalDoc } from "../data/localDoc";
import type { Campaign } from "../campaign/campaign";
import { FolderBackup } from "../campaign/folderBackup";
import { campaignUiDbName } from "../campaign/storage";
import { ChatNotifications } from "../features/chat/notify";
import { SceneTools } from "../scene/tools";
import { CanvasState } from "./canvasState";
import { RecentActions } from "./commands/recent";
import { EntityWindows } from "./entityWindowState";
import { LibraryView } from "./libraryView";
import { LinkNavigation } from "./linkNavigation";
import { LinkPopups } from "./linkState";
import { PanelLayout } from "./panelLayout";
import { TableState } from "./tableState";
import {
  CommandRegistry,
  type AnyCommand,
  type Command,
  type CommandHost,
} from "../kernel/commands";
import { UndoHistory } from "../kernel/undo";
import { undoStack, type UndoStack } from "../data/undo";

/**
 * An open campaign and everything the table keeps for it: the shared
 * document, this device's local one, and the state of the chrome around the
 * scene. React code reads it with `useCampaign()`; other code is handed it.
 * Nothing here outlives `dispose()`, so two campaigns can be open at once.
 */
export class CampaignContext implements CommandHost {
  readonly campaign: Campaign;
  /** This device's UI state for the campaign, never synced. */
  readonly local: LocalDoc;
  readonly panels: PanelLayout;
  readonly windows: EntityWindows;
  readonly canvas = new CanvasState();
  readonly library: LibraryView;
  readonly links: LinkNavigation;
  readonly linkPopups: LinkPopups;
  readonly chat: ChatNotifications;
  readonly tools: SceneTools;
  readonly recent: RecentActions;
  readonly table: TableState;
  /** Backing the campaign up to a folder on this device, once one is linked. */
  readonly backup: FolderBackup;
  /** Every command this campaign offers; `execute` is the one way to change campaign state. */
  readonly commands: CommandRegistry<CampaignContext>;
  /** This player's undo history, over the campaign and the open scene. */
  readonly history = new UndoHistory();
  readonly undoStack: UndoStack;
  /** Tags this player's own commands, so undo never reverts anyone else's. */
  readonly #origin = { commands: true };
  #disposeUndo: () => void;
  #disposed = false;

  private constructor(campaign: Campaign, local: LocalDoc) {
    this.campaign = campaign;
    this.local = local;
    this.panels = new PanelLayout(local);
    this.windows = new EntityWindows(local, this.panels);
    this.library = new LibraryView(this.panels);
    this.links = new LinkNavigation(campaign, this.panels, this.library);
    this.linkPopups = new LinkPopups(this.panels);
    this.chat = new ChatNotifications(campaign);
    this.tools = new SceneTools(local);
    this.recent = new RecentActions(local);
    this.table = new TableState(campaign);
    this.backup = new FolderBackup(campaign);
    // Typing into one field over a second or so is one step; `undoGroup` decides what else joins.
    this.undoStack = undoStack(campaign.doc, this.#origin, 1000);
    this.#disposeUndo = this.history.track(this.undoStack);
    this.commands = new CommandRegistry<CampaignContext>(this);
  }

  isGm() {
    return this.campaign.isGm();
  }

  transact<T>(fn: () => T, undoable: boolean): T {
    return this.campaign.transact(fn, undoable ? this.#origin : null);
  }

  /** Run a command; see CommandRegistry.execute. */
  execute<P, R>(command: Command<CampaignContext, P, R>, params: P): R | undefined {
    return this.commands.execute(command, params);
  }

  /**
   * Wrap an open campaign, loading this device's UI state for it, with the
   * commands the table offers. The context then owns the campaign.
   */
  static async open(
    campaign: Campaign,
    commands: (ctx: CampaignContext) => readonly AnyCommand<CampaignContext>[] = () => [],
  ): Promise<CampaignContext> {
    try {
      const ctx = new CampaignContext(campaign, await LocalDoc.open(campaignUiDbName(campaign.id)));
      ctx.commands.register(commands(ctx));
      return ctx;
    } catch (e) {
      campaign.destroy();
      throw e;
    }
  }

  /** Images this device lacks, fetched from the campaign's peers. */
  get blobs() {
    return this.campaign.connection.peerBlobs;
  }

  get disposed() {
    return this.#disposed;
  }

  /** Stop watching, close the documents and leave the room. */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.chat.dispose();
    this.backup.dispose();
    this.windows.dispose();
    this.#disposeUndo();
    this.undoStack.destroy();
    this.local.destroy();
    this.campaign.destroy();
  }
}

export const CampaignReactContext = createContext<CampaignContext | null>(null);

/** The open campaign's context, for components inside the table. */
export function useCampaign(): CampaignContext {
  const ctx = use(CampaignReactContext);
  if (!ctx) throw new Error("useCampaign needs a CampaignReactContext provider");
  return ctx;
}
