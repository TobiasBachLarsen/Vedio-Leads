// ── In-memory cache ───────────────────────────────────────────────────────────
const _cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutter

// Separat eid-liste-cache (længere TTL — undgår genhentning af alle CVR_Branche-sider pr. load-more)
const _eidCache = new Map();
const EID_CACHE_TTL = 30 * 60 * 1000; // 30 minutter

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return hit.data;
}

function cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

function eidCacheGet(key) {
  const hit = _eidCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > EID_CACHE_TTL) { _eidCache.delete(key); return null; }
  return hit.data;
}

function eidCacheSet(key, data) {
  _eidCache.set(key, { data, ts: Date.now() });
}

module.exports = { _cache, _eidCache, CACHE_TTL, EID_CACHE_TTL, cacheGet, cacheSet, eidCacheGet, eidCacheSet };
