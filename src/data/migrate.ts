import type { LwwField, Rec, Shape } from "./schema";

/*
 * Schema versions. Each extension's data is stamped with the version it was
 * written as; when an extension's version moves on, its `migrate` hook brings
 * older data up to date, in place, the first time it's opened.
 *
 * Off until release: before then, stored data is reset by bumping DATA_EPOCH
 * instead (design.md#documents), so hooks need not be written.
 */
export const MIGRATIONS_ENABLED = false;

/** Brings data written as version `from` up to the current one. */
export type Migrate<R> = (data: R, from: number) => void;

type Versioned = Shape & { readonly schemaVersion: LwwField<number> };

/** Bring an extension's data up to `version`, if migrations are on and it's behind. */
export function upgrade<S extends Versioned>(
  data: Rec<S>,
  version: number,
  migrate: Migrate<Rec<S>> | undefined,
) {
  if (!MIGRATIONS_ENABLED) return;
  const from = (data.y.get("schemaVersion") as number | undefined) ?? 0;
  if (from >= version) return;
  data.transact(() => {
    migrate?.(data, from);
    data.y.set("schemaVersion", version);
  });
}
