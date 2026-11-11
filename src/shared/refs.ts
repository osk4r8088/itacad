/**
 * A reference to another entry of the site: a Basics topic, a protocol exchange (optionally a step),
 * or a tool or lesson by id. src/app/entries.ts resolves it; tests check that every reference resolves.
 */
export type EntryRef = { topic: string } | { protocol: string; step?: number } | { entry: string };
