import type { Guard, Observable } from "../data/schema";
import type { DataValue } from "../data/types";
import type { CampaignRoot } from "./schema";

/*
 * What the campaign's game system keeps campaign-wide (`ext[systemId]`, see
 * systems/schema.ts): single values, and keyed collections of its own
 * records. Reads never create anything, so looking something up doesn't
 * change the document; the system's part is made on the first write.
 */

export interface SystemStore<T> {
  get(key: string): T | undefined;
  has(key: string): boolean;
  set(key: string, value: T): void;
  delete(key: string): void;
  values(): T[];
}

export class SystemData implements Observable {
  constructor(
    private readonly ext: CampaignRoot["ext"],
    private readonly systemId: () => string,
  ) {}

  /** Changes to any system's data, for useQuery. */
  get y() {
    return this.ext.y;
  }

  private read() {
    return this.ext.get(this.systemId());
  }

  private write() {
    return this.ext.ensure(this.systemId());
  }

  value(key: string): DataValue | undefined {
    return this.read()?.get("values")?.get(key);
  }

  setValue(key: string, value: DataValue) {
    this.write().ensure("values").set(key, value);
  }

  /** The records kept under `name`; anything stored there that isn't `is` reads as missing. */
  store<T>(name: string, is: Guard<T>): SystemStore<T> {
    const read = () => this.read()?.get("stores")?.get(name);
    const write = () => this.write().ensure("stores").ensure(name);
    const checked = (v: unknown) => (is(v) ? v : undefined);
    return {
      get: (key) => checked(read()?.get(key)),
      has: (key) => checked(read()?.get(key)) !== undefined,
      set: (key, value) => write().set(key, value),
      delete: (key) => read()?.delete(key),
      values: () => (read()?.values() ?? []).filter(is),
    };
  }
}

/** One key for a pair of ids, the same whichever comes first. */
export const pairKey = (first: string, second: string): string => [first, second].sort().join(":");
