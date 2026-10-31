/* Server-side storage. With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set, data lives in Supabase
   Postgres; otherwise an in-memory demo store is used (resets when the server restarts).
   Every write runs inside one lock, so two people pressing buttons at once can't overwrite each other. */
import { createClient } from "@supabase/supabase-js";
import { applyAction, applyPaymentEvent, ActionError } from "../actions.js";
import { buildData, DEFAULT_SCENARIO } from "../seed.js";
import { clone, reviveInfinity, toJSON } from "../format.js";
import { NEWEST_FIRST, SETTINGS_COLS, TABLES, fromRow, keyColumn, toRow } from "./tables.js";

const COLLECTIONS = Object.keys(TABLES);
const g = globalThis;

export const storageMode = () => (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memory");

function db() {
  if (!g.__stocknowDb) {
    g.__stocknowDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return g.__stocknowDb;
}

/* ---------- in-memory store ---------- */
const memory = {
  async load() {
    if (!g.__stocknowMemory) g.__stocknowMemory = buildData(DEFAULT_SCENARIO);
    return clone(g.__stocknowMemory);
  },
  async save(_prev, next) {
    g.__stocknowMemory = clone(next);
  },
};

/* ---------- Supabase store ---------- */
const plain = (row) => JSON.parse(toJSON(row)); // Infinity → marker inside jsonb columns

function rowOut(collection, obj) {
  const row = toRow(collection, obj);
  if (collection === "requests" && row.budget === Infinity) row.budget = null; // "no limit" plan
  return plain(row);
}
function rowIn(collection, row) {
  const obj = reviveInfinity(fromRow(collection, row));
  if (collection === "requests" && obj.budget === null) obj.budget = Infinity;
  ["seq", "qty", "before", "after", "stock", "min", "cost", "sell", "leadDays", "budget"].forEach((k) => {
    if (typeof obj[k] === "string") obj[k] = Number(obj[k]);
  });
  return obj;
}

async function check(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`Supabase ${what}: ${error.message}`);
  return data;
}

const supabase = {
  async load() {
    const client = db();
    const settingsRows = await check(client.from("settings").select("*").eq("id", 1), "read settings");
    if (!settingsRows.length) {
      const fresh = buildData(DEFAULT_SCENARIO);
      await this.save(null, fresh);
      return fresh;
    }
    const s = settingsRows[0];
    const d = { settings: Object.fromEntries(Object.entries(SETTINGS_COLS).map(([f, col]) => [f, s[col]])) };
    d.settings.monthlyBudget = Number(d.settings.monthlyBudget);
    const results = await Promise.all(COLLECTIONS.map((c) =>
      check(client.from(TABLES[c].table).select("*").order("seq", { ascending: !NEWEST_FIRST.has(c) }).limit(5000), `read ${TABLES[c].table}`)));
    COLLECTIONS.forEach((c, i) => { d[c] = results[i].map((row) => rowIn(c, row)); });
    return d;
  },

  /* Writes only what changed: upserts new/edited rows and deletes removed ones. */
  async save(prev, next) {
    const client = db();
    const settingsRow = { id: 1, ...Object.fromEntries(Object.entries(SETTINGS_COLS).map(([f, col]) => [col, next.settings[f]])) };
    if (!prev || toJSON(prev.settings) !== toJSON(next.settings)) await check(client.from("settings").upsert(plain(settingsRow)), "write settings");
    for (const c of COLLECTIONS) {
      const key = keyColumn(c), { table } = TABLES[c];
      const before = new Map((prev?.[c] || []).map((o) => [o.id, toJSON(o)]));
      const nextIds = new Set(next[c].map((o) => o.id));
      const changed = next[c].filter((o) => before.get(o.id) !== toJSON(o)).map((o) => rowOut(c, o));
      const removed = [...before.keys()].filter((id) => !nextIds.has(id));
      if (removed.length) await check(client.from(table).delete().in(key, removed), `delete ${table}`);
      for (let i = 0; i < changed.length; i += 500) await check(client.from(table).upsert(changed.slice(i, i + 500), { onConflict: key }), `write ${table}`);
    }
  },
};

const store = () => (storageMode() === "supabase" ? supabase : memory);

let lock = Promise.resolve();
function exclusive(fn) {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}

export async function loadData() {
  return store().load();
}

/* Loads, applies one action, saves the difference, and returns the new data. */
export function runAction(actorId, type, payload) {
  return exclusive(async () => {
    const s = store();
    const prev = await s.load();
    const next = clone(prev);
    let result;
    try {
      result = applyAction(next, actorId, type, payload);
    } catch (e) {
      if (e instanceof ActionError) return { ok: false, error: e.message, fields: e.fields, data: prev };
      throw e;
    }
    await s.save(prev, next);
    return { ok: true, result, data: next };
  });
}

/* Same as runAction, for an event sent by Orbyte Payment instead of a person. */
export function runPaymentEvent(event) {
  return exclusive(async () => {
    const s = store();
    const prev = await s.load();
    const next = clone(prev);
    let result;
    try {
      result = applyPaymentEvent(next, event);
    } catch (e) {
      if (e instanceof ActionError) return { ok: false, error: e.message };
      throw e;
    }
    await s.save(prev, next);
    return { ok: true, result };
  });
}
