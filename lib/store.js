// Where data lives. In production this is Netlify Blobs (a simple key → JSON store that
// comes free with the site). Tests swap in an in-memory version with useMemoryStores().
import { getStore } from "@netlify/blobs";

let memory = null;

export function useMemoryStores() {
  memory = new Map();
}

function memoryStore(name) {
  if (!memory.has(name)) memory.set(name, new Map());
  const m = memory.get(name);
  return {
    async get(key, opts) { const v = m.get(key); return v === undefined ? null : (opts?.type === "json" ? structuredClone(v) : v); },
    async setJSON(key, value) { m.set(key, structuredClone(value)); },
    async delete(key) { m.delete(key); },
    async list() { return { blobs: [...m.keys()].map((key) => ({ key })) }; },
  };
}

export function store(name) {
  return memory ? memoryStore(name) : getStore(name);
}

// Read every JSON entry in a store (fine for a small shop: hundreds to a few thousand rows).
export async function readAll(name) {
  const s = store(name);
  const { blobs } = await s.list();
  const rows = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return rows.filter(Boolean);
}
