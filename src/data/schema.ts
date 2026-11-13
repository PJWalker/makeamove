import * as Y from "yjs";

/*
 * The typed data layer (design.md#documents). Shared state is declared once,
 * as fields, and read and written through handles those fields make. Only
 * this folder touches Yjs types directly.
 *
 *   lww<T>()          a plain JSON value, replaced whole: the last writer wins
 *   counter()         a number that adds up concurrent changes
 *   text()            rich text (Y.XmlFragment), edited through Tiptap
 *   list<T>()         an ordered list of plain values (Y.Array)
 *   record(shape)     named fields in a Y.Map, each merged on its own
 *   variant(tag, base, cases)  a record whose fields depend on its tag
 *   collection(item)  id -> item in a Y.Map
 *   subdoc()          a Yjs subdocument, loaded on demand
 *
 * Reading validates (design.md: "validate once, on read"): a field holding
 * the wrong kind of value reads as missing, and a collection item its
 * `parse` rejects is left out. Each problem is logged once, naming the
 * item; the stored data is left as it is.
 */

// Fields

/** Whether a stored value is a T. */
export type Guard<T> = (value: unknown) => value is T;

const NO_VALUE: unique symbol = Symbol("no value");

/** A plain value. `Has` is true once it has a fallback, so it always reads as a T. */
export interface LwwField<T, Has extends boolean = false> {
  readonly kind: "lww";
  readonly is: Guard<T> | undefined;
  readonly fallback: T | typeof NO_VALUE;
  /** The value read when nothing (or something unusable) is stored. */
  or(fallback: T): LwwField<T, true>;
  /** Phantom: the value's type and whether it has a fallback. */
  readonly __type?: [T, Has];
}

export interface CounterField {
  readonly kind: "counter";
}

export interface TextField {
  readonly kind: "text";
}

export interface ListField<T> {
  readonly kind: "list";
  readonly __type?: T;
}

export interface RecordField<S extends Shape> {
  readonly kind: "record";
  readonly shape: S;
}

export interface VariantField<
  Tag extends string,
  B extends Shape,
  C extends Record<string, Shape>,
> {
  readonly kind: "variant";
  readonly tag: Tag;
  readonly base: B;
  readonly cases: C;
}

export interface CollectionField<I extends Field, T = Item<I>> {
  readonly kind: "collection";
  readonly item: I;
  /** See `collection`. A method, so a collection of any item is a Field. */
  parse?(item: Item<I>, id: string): T | Invalid;
  readonly label: string;
}

export interface SubdocField {
  readonly kind: "subdoc";
}

export type Field =
  | LwwField<unknown, boolean>
  | CounterField
  | TextField
  | ListField<unknown>
  | RecordField<Shape>
  | VariantField<string, Shape, Record<string, Shape>>
  | CollectionField<Field, unknown>
  | SubdocField;

export type Shape = { readonly [key: string]: Field };

/** Checks a collection item as it's read: its value, or why it can't be used. */
export type Parse<I extends Field, T> = (item: Item<I>, id: string) => T | Invalid;

/** Why a stored item can't be used. */
export class Invalid {
  constructor(readonly reason: string) {}
}

// Builders

const primitiveGuard = (fallback: unknown): Guard<never> | undefined => {
  const kind = typeof fallback;
  return kind === "string" || kind === "number" || kind === "boolean"
    ? (v): v is never => typeof v === kind
    : undefined;
};

function makeLww<T, Has extends boolean>(
  is: Guard<T> | undefined,
  fallback: T | typeof NO_VALUE,
): LwwField<T, Has> {
  return {
    kind: "lww",
    is,
    fallback,
    or: (value: T) => makeLww<T, true>(is ?? primitiveGuard(value), value),
  };
}

/** A plain JSON value, replaced whole. With `is`, anything else stored reads as missing. */
export const lww = <T>(is?: Guard<T>): LwwField<T> => makeLww<T, false>(is, NO_VALUE);

export const counter = (): CounterField => ({ kind: "counter" });
export const text = (): TextField => ({ kind: "text" });
export const list = <T>(): ListField<T> => ({ kind: "list" });
export const record = <S extends Shape>(shape: S): RecordField<S> => ({ kind: "record", shape });
export const subdoc = (): SubdocField => ({ kind: "subdoc" });

/** A record whose `tag` field picks which of `cases` its other fields come from, beside `base`. */
export const variant = <Tag extends string, B extends Shape, C extends Record<string, Shape>>(
  tag: Tag,
  base: B,
  cases: C,
): VariantField<Tag, B, C> => ({ kind: "variant", tag, base, cases });

/**
 * id -> item. `label` names an item in the console ("scene element"); with
 * `parse`, items it rejects are left out of every read.
 */
export function collection<I extends Field>(item: I, label?: string): CollectionField<I>;
export function collection<I extends Field, T>(
  item: I,
  label: string,
  parse: Parse<I, T>,
): CollectionField<I, T>;
export function collection<I extends Field, T>(
  item: I,
  label = "item",
  parse?: Parse<I, T>,
): CollectionField<I, T> {
  return { kind: "collection", item, label, ...(parse && { parse }) };
}

// Types derived from fields

/** What a present value of a field reads as. */
export type Item<F> = 0 extends 1 & F
  ? unknown
  : F extends LwwField<infer T, boolean>
    ? T
    : F extends CounterField
      ? number
      : F extends TextField
        ? Y.XmlFragment
        : F extends ListField<infer T>
          ? List<T>
          : F extends RecordField<infer S>
            ? Rec<S>
            : F extends VariantField<infer Tag, infer B, infer C>
              ? VariantRec<Tag, B, C>
              : F extends CollectionField<infer I, infer T>
                ? Coll<I, T>
                : F extends SubdocField
                  ? Y.Doc
                  : never;

/** What a field in a record reads as: missing values are undefined unless the field has a fallback. */
export type Got<F> = 0 extends 1 & F
  ? unknown
  : F extends LwwField<infer T, infer Has>
    ? Has extends true
      ? T
      : T | undefined
    : F extends CounterField
      ? number
      : Item<F> | undefined;

/** What a field is written from. */
export type Init<F> = 0 extends 1 & F
  ? unknown
  : F extends LwwField<infer T, boolean>
    ? T
    : F extends CounterField
      ? number
      : F extends ListField<infer T>
        ? readonly T[]
        : F extends RecordField<infer S>
          ? InitRec<S>
          : F extends VariantField<infer Tag, infer B, infer C>
            ? InitVariant<Tag, B, C>
            : F extends CollectionField<infer I, unknown>
              ? Readonly<Record<string, Init<I>>>
              : F extends SubdocField
                ? Y.Doc
                : never;

type InitKeys<S extends Shape> = { [K in keyof S]: S[K] extends TextField ? never : K }[keyof S];
export type InitRec<S extends Shape> = { [K in InitKeys<S>]?: Init<S[K]> };
type InitVariant<Tag extends string, B extends Shape, C extends Record<string, Shape>> = {
  [K in keyof C & string]: InitRec<B> & InitRec<C[K]> & { [T in Tag]: K };
}[keyof C & string];

/** The fields that hold a single value, set and read in place. */
type ValueKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends LwwField<unknown, boolean> | CounterField ? K : never;
}[keyof S];
/** The fields that hold a Yjs type of their own. */
type ContainerKeys<S extends Shape> = Exclude<keyof S, ValueKeys<S>>;
/** What a value field is set to. */
type ValueOf<F> = F extends LwwField<infer T, boolean> ? T : number;
/** Values for some of a record's value fields; `undefined` removes one. */
export type Patch<S extends Shape> = { [K in ValueKeys<S>]?: ValueOf<S[K]> | undefined };
type CounterKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends CounterField ? K : never;
}[keyof S];

/** A plain copy of a field's value: for backups, tests and views. */
export type Plain<F> = 0 extends 1 & F
  ? unknown
  : F extends LwwField<infer T, boolean>
    ? T
    : F extends CounterField
      ? number
      : F extends ListField<infer T>
        ? T[]
        : F extends RecordField<infer S>
          ? PlainRec<S>
          : F extends VariantField<infer Tag, infer B, infer C>
            ? PlainVariant<Tag, B, C>
            : F extends CollectionField<infer I, unknown>
              ? Record<string, Plain<I>>
              : never;

type PlainKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends TextField | SubdocField ? never : K;
}[keyof S];
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends LwwField<unknown, false> ? K : never;
}[keyof S];
type Flatten<T> = { [K in keyof T]: T[K] };
export type PlainRec<S extends Shape> = Flatten<
  { [K in Exclude<PlainKeys<S>, OptionalKeys<S>>]: Plain<S[K]> } & {
    [K in OptionalKeys<S>]?: Plain<S[K]>;
  }
>;
export type PlainVariant<Tag extends string, B extends Shape, C extends Record<string, Shape>> = {
  [K in keyof C & string]: Flatten<PlainRec<B> & PlainRec<C[K]> & { [T in Tag]: K }>;
}[keyof C & string];

// Logging what can't be read

const reported = new WeakMap<object, Set<string>>();

/** Log a problem with stored data once per place it's stored. */
function reportOnce(at: object, key: string, message: string, value: unknown) {
  let keys = reported.get(at);
  if (!keys) reported.set(at, (keys = new Set()));
  if (keys.has(key)) return;
  keys.add(key);
  console.warn(message, value);
}

// Reading and writing one slot of a Y.Map

type Slot = Y.Map<unknown>;

function readSlot(field: Field, map: Slot, key: string): unknown {
  const raw = map.get(key);
  switch (field.kind) {
    case "lww": {
      const fallback = field.fallback === NO_VALUE ? undefined : field.fallback;
      if (raw === undefined) return fallback;
      if (field.is && !field.is(raw)) {
        reportOnce(map, key, `Ignoring stored "${key}": not the expected kind of value`, raw);
        return fallback;
      }
      return raw;
    }
    case "counter":
      return raw instanceof Y.Map ? counterTotal(raw as Y.Map<number>) : 0;
    case "text":
      return raw instanceof Y.XmlFragment ? raw : undefined;
    case "subdoc":
      return raw instanceof Y.Doc ? raw : undefined;
    case "list":
      return raw instanceof Y.Array ? listOf(raw) : undefined;
    case "record":
      return raw instanceof Y.Map ? recOf(raw as Slot, field.shape) : undefined;
    case "variant":
      return raw instanceof Y.Map ? variantOf(raw as Slot, field) : undefined;
    case "collection":
      return raw instanceof Y.Map ? collOf(raw as Slot, field) : undefined;
  }
}

/** What to store for a field, made from a plain value. */
function toStored(field: Field, init: unknown): unknown {
  switch (field.kind) {
    case "lww":
      return init;
    case "counter": {
      const m = new Y.Map<number>();
      // Set once the map is in a document, when it has a client id.
      pendingCounts.set(m, init as number);
      return m;
    }
    case "text":
      return new Y.XmlFragment();
    case "subdoc":
      return init;
    case "list": {
      const a = new Y.Array<unknown>();
      a.push([...(init as readonly unknown[])]);
      return a;
    }
    case "record":
      return fill(new Y.Map(), field.shape, init as Record<string, unknown>);
    case "variant": {
      const values = init as Record<string, unknown>;
      const tag = values[field.tag] as string;
      const m = fill(new Y.Map(), field.base, values);
      m.set(field.tag, tag);
      return fill(m, field.cases[tag] ?? {}, values);
    }
    case "collection": {
      const m = new Y.Map<unknown>();
      for (const [id, v] of Object.entries(init as Record<string, unknown>))
        m.set(id, toStored(field.item, v));
      return m;
    }
  }
}

function fill(m: Slot, shape: Shape, values: Record<string, unknown>): Slot {
  for (const [k, f] of Object.entries(shape)) {
    const v = values[k];
    if (v !== undefined && f.kind !== "text") m.set(k, toStored(f, v));
  }
  return m;
}

/** A fresh, empty container for a field: an empty map, list or text. */
function emptyStored(field: Field): unknown {
  switch (field.kind) {
    case "text":
      return new Y.XmlFragment();
    case "list":
      return new Y.Array();
    case "counter":
    case "record":
    case "variant":
    case "collection":
      return new Y.Map();
    case "lww":
    case "subdoc":
      throw new Error(`A ${field.kind} field has no empty value`);
  }
}

function setSlot(field: Field, map: Slot, key: string, init: unknown) {
  if (field.kind === "counter" && map.get(key) instanceof Y.Map) {
    setCounter(map.get(key) as Y.Map<number>, init as number);
    return;
  }
  map.set(key, toStored(field, init));
  const stored = map.get(key);
  if (stored instanceof Y.Map) settleCounts(stored as Slot);
}

function plainOf(field: Field, value: unknown): unknown {
  if (value === undefined) return undefined;
  switch (field.kind) {
    case "lww":
    case "counter":
      return value;
    case "list":
      return (value as List<unknown>).toArray();
    case "record":
    case "collection":
      return (value as { read(): unknown }).read();
    case "variant":
      return (value as { readCase(): unknown }).readCase();
    case "text":
    case "subdoc":
      return undefined;
  }
}

// Counters: each client adds to its own entry, so concurrent changes add up.

/** Starting values of counters not yet in a document. */
const pendingCounts = new WeakMap<Y.Map<number>, number>();

function counterTotal(m: Y.Map<number>): number {
  let total = 0;
  for (const v of m.values()) if (typeof v === "number") total += v;
  return total;
}

function addToCounter(m: Y.Map<number>, by: number) {
  if (!by) return;
  const me = String(m.doc!.clientID);
  m.set(me, (m.get(me) ?? 0) + by);
}

/** Set a counter outright: this client's entry becomes the whole value. */
function setCounter(m: Y.Map<number>, value: number) {
  m.doc!.transact(() => {
    m.clear();
    m.set(String(m.doc!.clientID), value);
  });
}

/** Give counters made by `toStored` their starting values, now they're in a document. */
function settleCounts(m: Slot) {
  const start = pendingCounts.get(m as Y.Map<number>);
  if (start !== undefined) {
    pendingCounts.delete(m as Y.Map<number>);
    if (start) m.set(String(m.doc!.clientID), start);
    return;
  }
  for (const v of m.values()) if (v instanceof Y.Map) settleCounts(v as Slot);
}

// Handles

/** Anything with a Yjs type behind it, for useQuery to watch. */
export interface Observable {
  readonly y: Y.AbstractType<any>; // oxlint-disable-line @typescript-eslint/no-explicit-any
}

/** The handle for a Yjs type, made once so it can be compared and cached. */
const handles = new WeakMap<object, WeakMap<object, unknown>>();
function cached<H>(schema: object, y: object, make: () => H): H {
  let bySchema = handles.get(schema);
  if (!bySchema) handles.set(schema, (bySchema = new WeakMap()));
  let h = bySchema.get(y) as H | undefined;
  if (!h) bySchema.set(y, (h = make()));
  return h;
}

/** Named fields in a Y.Map. */
export class Rec<S extends Shape> implements Observable {
  constructor(
    readonly y: Y.Map<unknown>,
    readonly shape: S,
  ) {}

  get<K extends keyof S & string>(key: K): Got<S[K]> {
    return readSlot(this.shape[key]!, this.y, key) as Got<S[K]>;
  }

  /** Whether the field is stored here (a copy reads what it lacks from its template). */
  has(key: keyof S & string): boolean {
    return this.y.has(key);
  }

  /** The fields stored here. */
  keys(): (keyof S & string)[] {
    return [...this.y.keys()].filter((k) => k in this.shape);
  }

  set<K extends InitKeys<S> & string>(key: K, value: Init<S[K]>) {
    setSlot(this.shape[key]!, this.y, key, value);
  }

  delete(key: keyof S & string) {
    this.y.delete(key);
  }

  /** Set several value fields at once; `undefined` removes one. Unchanged values aren't rewritten. */
  patch(values: Patch<S>) {
    this.transact(() => {
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) this.y.delete(key);
        else if (this.y.get(key) !== value) setSlot(this.shape[key]!, this.y, key, value);
      }
    });
  }

  /** Add to a counter. */
  add(key: CounterKeys<S> & string, by: number) {
    const m = this.y.get(key);
    if (m instanceof Y.Map) addToCounter(m as Y.Map<number>, by);
    else setSlot(this.shape[key]!, this.y, key, by);
  }

  /** A container field, made empty if it isn't there yet. */
  ensure<K extends ContainerKeys<S> & string>(key: K): Item<S[K]> {
    const field = this.shape[key]!;
    const existing = readSlot(field, this.y, key);
    if (existing !== undefined) return existing as Item<S[K]>;
    this.y.set(key, emptyStored(field));
    return readSlot(field, this.y, key) as Item<S[K]>;
  }

  /** The field's subdocument, made with this guid if it has none. */
  subdoc(key: keyof S & string, guid: string): Y.Doc {
    const existing = this.y.get(key);
    if (existing instanceof Y.Doc) return existing;
    const created = new Y.Doc({ guid });
    this.y.set(key, created);
    return created;
  }

  /** Call `fn` on any change to it or anything inside it. Returns a function that stops it. */
  observe(fn: () => void): () => void {
    this.y.observeDeep(fn);
    return () => this.y.unobserveDeep(fn);
  }

  /** Every field as plain values, with fallbacks; text and subdocuments are left out. */
  read(): PlainRec<S> {
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(this.shape)) {
      const v = plainOf(field, readSlot(field, this.y, key));
      if (v !== undefined) out[key] = v;
    }
    return out as PlainRec<S>;
  }

  transact(fn: () => void) {
    if (this.y.doc) this.y.doc.transact(fn);
    else fn();
  }
}

/** A record whose fields depend on its tag: its base fields typed, the rest by its case. */
export class VariantRec<
  Tag extends string,
  B extends Shape,
  C extends Record<string, Shape>,
> extends Rec<B> {
  constructor(
    y: Y.Map<unknown>,
    readonly variant: VariantField<Tag, B, C>,
  ) {
    super(y, variant.base);
  }

  /** Its tag, if it's one this build knows. */
  get tag(): (keyof C & string) | undefined {
    const tag = this.y.get(this.variant.tag);
    return typeof tag === "string" && tag in this.variant.cases ? tag : undefined;
  }

  /** The fields of its case beside the base ones. */
  private fields(): Shape {
    const tag = this.tag;
    return tag === undefined ? this.shape : { ...this.shape, ...this.variant.cases[tag] };
  }

  /** Every field of its case as plain values, its tag included; undefined for an unknown tag. */
  readCase(): PlainVariant<Tag, B, C> | undefined {
    const tag = this.tag;
    if (tag === undefined) return undefined;
    const out: Record<string, unknown> = { [this.variant.tag]: tag };
    for (const [key, field] of Object.entries(this.fields())) {
      const v = plainOf(field, readSlot(field, this.y, key));
      if (v !== undefined) out[key] = v;
    }
    return out as PlainVariant<Tag, B, C>;
  }

  /** Set any of its base or case fields; `undefined` removes one, and others are ignored. */
  patchCase(values: Readonly<Record<string, unknown>>) {
    const shape = this.fields();
    this.transact(() => {
      for (const [key, value] of Object.entries(values)) {
        const field = shape[key];
        if (!field || key === this.variant.tag) continue;
        if (value === undefined) this.y.delete(key);
        else if (this.y.get(key) !== value) setSlot(field, this.y, key, value);
      }
    });
  }
}

/** id -> item in a Y.Map. */
export class Coll<I extends Field, T = Item<I>> implements Observable {
  constructor(
    readonly y: Y.Map<unknown>,
    readonly field: CollectionField<I, T>,
  ) {}

  /** The item, if it's stored and usable. */
  get(id: string): Item<I> | undefined {
    if (!this.y.has(id)) return undefined;
    const item = readSlot(this.field.item, this.y, id) as Item<I> | undefined;
    if (item === undefined) {
      reportOnce(
        this.y,
        id,
        `Skipping ${this.field.label} ${id}: stored in the wrong form`,
        this.y.get(id),
      );
      return undefined;
    }
    return item;
  }

  /** The item checked by the collection's `parse`, if it's usable. */
  view(id: string): T | undefined {
    const item = this.get(id);
    if (item === undefined) return undefined;
    if (!this.field.parse) return item as unknown as T;
    const parsed = this.field.parse(item, id);
    if (parsed instanceof Invalid) {
      reportOnce(
        this.y,
        id,
        `Skipping ${this.field.label} ${id}: ${parsed.reason}`,
        plainOf(this.field.item, item),
      );
      return undefined;
    }
    return parsed;
  }

  has(id: string): boolean {
    return this.y.has(id);
  }

  get size(): number {
    return this.y.size;
  }

  keys(): string[] {
    return [...this.y.keys()];
  }

  /** Every usable item, unparsed: for writing to and for reading single fields. */
  entries(): [string, Item<I>][] {
    const out: [string, Item<I>][] = [];
    for (const id of this.y.keys()) {
      const item = this.get(id);
      if (item !== undefined) out.push([id, item]);
    }
    return out;
  }

  values(): Item<I>[] {
    return this.entries().map(([, item]) => item);
  }

  /** Every item that parses, by id. */
  views(): [string, T][] {
    const out: [string, T][] = [];
    for (const id of this.y.keys()) {
      const item = this.view(id);
      if (item !== undefined) out.push([id, item]);
    }
    return out;
  }

  set(id: string, value: Init<I>) {
    setSlot(this.field.item, this.y, id, value);
  }

  /** Add to a counter item. */
  add(this: Coll<CounterField>, id: string, by: number) {
    const m = this.y.get(id);
    if (m instanceof Y.Map) addToCounter(m as Y.Map<number>, by);
    else setSlot(this.field.item, this.y, id, by);
  }

  /** A container item, made empty if it isn't there yet. */
  ensure(id: string): Item<I> {
    const existing = this.get(id);
    if (existing !== undefined) return existing;
    this.y.set(id, emptyStored(this.field.item));
    return this.get(id)!;
  }

  delete(id: string) {
    this.y.delete(id);
  }

  clear() {
    this.transact(() => this.y.clear());
  }

  /** Call `fn` on any change to it or anything inside it. Returns a function that stops it. */
  observe(fn: () => void): () => void {
    this.y.observeDeep(fn);
    return () => this.y.unobserveDeep(fn);
  }

  /** Every item as plain values. */
  read(): Record<string, Plain<I>> {
    const out: Record<string, Plain<I>> = {};
    for (const [id, item] of this.entries()) out[id] = plainOf(this.field.item, item) as Plain<I>;
    return out;
  }

  transact(fn: () => void) {
    if (this.y.doc) this.y.doc.transact(fn);
    else fn();
  }
}

/** An ordered list of plain values. */
export class List<T> implements Observable {
  constructor(readonly y: Y.Array<T>) {}

  get length(): number {
    return this.y.length;
  }

  at(index: number): T | undefined {
    return index < 0 || index >= this.y.length ? undefined : this.y.get(index);
  }

  toArray(): T[] {
    return this.y.toArray();
  }

  push(...items: T[]) {
    this.y.push(items);
  }

  insert(index: number, ...items: T[]) {
    this.y.insert(index, items);
  }

  delete(index: number, count = 1) {
    this.y.delete(index, count);
  }

  observe(fn: () => void): () => void {
    this.y.observe(fn);
    return () => this.y.unobserve(fn);
  }
}

const listOf = (y: Y.Array<unknown>) => cached(List, y, () => new List(y));
const recOf = <S extends Shape>(y: Slot, shape: S) => cached(shape, y, () => new Rec(y, shape));
const variantOf = (y: Slot, field: VariantField<string, Shape, Record<string, Shape>>) =>
  cached(field, y, () => new VariantRec(y, field));
const collOf = (y: Slot, field: CollectionField<Field, unknown>) =>
  cached(field, y, () => new Coll(y, field));

// Rich text

/** Fill an empty text with a copy of another's contents: a copy's own text, from its template's. */
export function copyText(into: Y.XmlFragment, from: Y.XmlFragment) {
  into.insert(
    0,
    from.toArray().map((n) => (n as Y.XmlElement | Y.XmlText).clone()),
  );
}

// Documents

/** The top-level fields of a document: each always exists. */
export type Root<S extends Shape> = { readonly [K in keyof S]: Item<S[K]> };

/** Typed handles for a document's top-level fields, each a shared type of its own. */
export function rootOf<S extends Shape>(doc: Y.Doc, shape: S): Root<S> {
  return cached(shape, doc, () => {
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(shape)) {
      switch (field.kind) {
        case "record":
          out[key] = recOf(doc.getMap(key), field.shape);
          break;
        case "collection":
          out[key] = collOf(doc.getMap(key), field);
          break;
        case "list":
          out[key] = listOf(doc.getArray(key));
          break;
        case "text":
          out[key] = doc.getXmlFragment(key);
          break;
        default:
          throw new Error(`A document can't hold a ${field.kind} at its top level`);
      }
    }
    return out as Root<S>;
  });
}
