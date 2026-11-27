import { listOf   } from "../../data/localDoc";
import type {LocalDoc as LocalDocument, LocalValue} from "../../data/localDoc";
import { isString } from "../../lib/guards";

const MAX = 12;

const readList = listOf(isString, "recent actions");
const read = (stored: unknown) => readList(stored).slice(0, MAX);

/** Recently run actions, newest first, remembered in the campaign's local document. */
export class RecentActions {
  readonly ids: LocalValue<string[]>;

  constructor(local: LocalDocument) {
    this.ids = local.value("recentActions", read);
  }

  note(id: string) {
    this.ids.value = [id, ...this.ids.value.filter((x) => x !== id)].slice(0, MAX);
  }
}
