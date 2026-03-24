const fetch = require("node-fetch");
const { cacheGet, cacheSet, eidCacheGet, eidCacheSet } = require("./cache");
const { BRANCH_CODES, SHELL_PATTERNS, PAGE_SIZE } = require("./branches");

// ── Datafordeler API-nøgle (query parameter) ──────────────────────────────────
function getDfGqlUrl() {
  const key = process.env.DATAFORDELER_KEY;
  if (!key) throw new Error("DATAFORDELER_KEY mangler i .env");
  return `https://graphql.datafordeler.dk/CVR/v1?apiKey=${encodeURIComponent(key)}`;
}

async function dfGqlFetch(gql) {
  const gqlUrl = getDfGqlUrl();
  const res = await fetch(gqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: gql }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new Error("Datafordeler: Ugyldig API-nøgle. Tjek DATAFORDELER_KEY i .env");
    throw new Error(`Datafordeler GraphQL svarede ${res.status}: ${body.substring(0, 200)}`);
  }
  const json = await res.json();
  if (json.errors?.length) throw new Error(`GraphQL fejl: ${json.errors[0]?.message}`);
  return json.data;
}

// Hent alle CVREnhedsIds for en branche via cursor-paginering.
// Kører én query per branchekode parallelt (undgår server-timeout ved store in:[]-lister).
async function fetchAllBrancheNodes(codes) {
  const PAGE = 500;
  const MAX_PAGES_PER_CODE = 40;
  const PARALLEL = 4;
  const today = new Date().toISOString().slice(0, 10);
  const byEid = {};

  for (let i = 0; i < codes.length; i += PARALLEL) {
    const batch = codes.slice(i, i + PARALLEL);
    await Promise.all(batch.map(async (code) => {
      let cursor = null;
      let hasNext = true;
      let page = 0;
      while (hasNext && page < MAX_PAGES_PER_CODE) {
        const afterClause = cursor ? `, after: "${cursor}"` : '';
        try {
          const data = await dfGqlFetch(`{
            CVR_Branche(first: ${PAGE}${afterClause}, where: { vaerdi: { eq: "${code}" } }) {
              edges { node { CVREnhedsId vaerdi vaerdiTekst registreringFra virkningTil } }
              pageInfo { hasNextPage endCursor }
            }
          }`);
          const edges = data?.CVR_Branche?.edges || [];
          edges.forEach(e => {
            const n = e.node;
            if (!byEid[n.CVREnhedsId]) byEid[n.CVREnhedsId] = [];
            byEid[n.CVREnhedsId].push(n);
          });
          hasNext = data?.CVR_Branche?.pageInfo?.hasNextPage || false;
          cursor = data?.CVR_Branche?.pageInfo?.endCursor || null;
          page++;
          if (edges.length === 0) break;
        } catch (err) {
          console.warn(`[branch] Kode ${code} side ${page} fejlede: ${err.message}`);
          break;
        }
      }
    }));
  }

  const result = [];
  for (const nodes of Object.values(byEid)) {
    const active = nodes.filter(n => !n.virkningTil || n.virkningTil >= today);
    if (active.length === 0) continue;
    active.sort((a, b) => (b.registreringFra || '').localeCompare(a.registreringFra || ''));
    result.push(active[0]);
  }
  return result;
}

async function searchByBranch(branche2, filters = {}, from = 0, q = '') {
  const codes = BRANCH_CODES[branche2];
  if (!codes || codes.length === 0) return { companies: [], total: 0 };

  // Trin 1: Hent (eller genbrug cached) fuld eid-liste — koster 1-20 GQL-kald men caches 30 min
  const eidCacheKey = `df-gql:eids:${branche2}`;
  let allNodes = eidCacheGet(eidCacheKey);
  if (!allNodes) {
    allNodes = await fetchAllBrancheNodes(codes);
    eidCacheSet(eidCacheKey, allNodes);
    console.log(`[branch:${branche2}] Hentet ${allNodes.length} unikke CVREnhedsIds`);
  }

  const total = allNodes.length;
  if (total === 0) return { companies: [], total: 0 };

  // Trin 2: Vælg eids — enten via navnesøgning eller normal paginering
  let eidIds;
  let searchTotal = total;

  if (q) {
    // Navnesøgning: hent alle navne for branchen (batches af 100, 10 parallelt), filtrer lokalt
    const nameMapCacheKey = `namemap:${branche2}`;
    let nameMap = eidCacheGet(nameMapCacheKey);
    if (!nameMap) {
      nameMap = {};
      const eids = allNodes.map(n => n.CVREnhedsId);
      const BATCH = 100, PARALLEL = 10;
      for (let i = 0; i < eids.length; i += BATCH * PARALLEL) {
        const promises = [];
        for (let j = i; j < Math.min(i + BATCH * PARALLEL, eids.length); j += BATCH) {
          const batch = eids.slice(j, j + BATCH);
          promises.push(dfGqlFetch(`{ CVR_Navn(first: 1000, where: { CVREnhedsId: { in: ${JSON.stringify(batch)} } }) { edges { node { CVREnhedsId vaerdi virkningTil } } } }`));
        }
        const results = await Promise.all(promises);
        for (const data of results) {
          (data?.CVR_Navn?.edges || []).forEach(e => {
            const n = e.node;
            if (!nameMap[n.CVREnhedsId] || (!n.virkningTil && nameMap[n.CVREnhedsId]?.virkningTil !== null)) {
              nameMap[n.CVREnhedsId] = { vaerdi: n.vaerdi, virkningTil: n.virkningTil };
            }
          });
        }
      }
      eidCacheSet(nameMapCacheKey, nameMap);
      console.log(`[branch:${branche2}] Bygget navnekort med ${Object.keys(nameMap).length} navne`);
    }
    const ql = q.toLowerCase();
    const matched = Object.entries(nameMap)
      .filter(([, n]) => !n.virkningTil && (n.vaerdi || '').toLowerCase().includes(ql))
      .map(([eid]) => eid);
    eidIds = matched.slice(0, PAGE_SIZE);
    searchTotal = matched.length;
    if (eidIds.length === 0) return { companies: [], total: 0 };
  } else {
    const slice = allNodes.slice(from, from + PAGE_SIZE);
    if (slice.length === 0) return { companies: [], total };
    eidIds = slice.map(n => n.CVREnhedsId);
  }

  // Cache per side (undgår genhentning af detaljer ved samme offset)
  const detailCacheKey = `df-gql:detail:${branche2}:${from}:${q}:${JSON.stringify(filters)}`;
  const detailCached = cacheGet(detailCacheKey);
  if (detailCached) return detailCached;
  const eidStr = JSON.stringify(eidIds);

  // Trin 3: Hent alle entiteter parallelt (batch, max 100 eids)
  const [dVirk, dNavn, dAdr, dTlf, dEmail, dForm, dBesk] = await Promise.all([
    dfGqlFetch(`{ CVR_Virksomhed(first: ${eidIds.length}, where: { id: { in: ${eidStr} } }) { edges { node { id CVRNummer status virksomhedStartdato virksomhedOphoersdato } } } }`),
    dfGqlFetch(`{ CVR_Navn(first: 1000, where: { CVREnhedsId: { in: ${eidStr} } }) { edges { node { CVREnhedsId vaerdi virkningTil } } } }`),
    dfGqlFetch(`{ CVR_Adressering(first: 1000, where: { CVREnhedsId: { in: ${eidStr} } }) { edges { node { CVREnhedsId CVRAdresse_vejnavn CVRAdresse_husnummerFra CVRAdresse_postnummer CVRAdresse_postdistrikt } } } }`),
    dfGqlFetch(`{ CVR_Telefonnummer(first: 1000, where: { CVREnhedsId: { in: ${eidStr} } }) { edges { node { CVREnhedsId vaerdi } } } }`),
    dfGqlFetch(`{ CVR_e_mailadresse(first: 1000, where: { CVREnhedsId: { in: ${eidStr} } }) { edges { node { CVREnhedsId vaerdi } } } }`),
    dfGqlFetch(`{ CVR_Virksomhedsform(first: 1000, where: { CVREnhedsId: { in: ${eidStr} } }) { edges { node { CVREnhedsId vaerdi vaerdiTekst } } } }`),
    dfGqlFetch(`{ CVR_Beskaeftigelse(first: 1000, where: { CVREnhedsId: { in: ${eidStr} } }) { edges { node { CVREnhedsId antal intervalFra intervalTil } } } }`),
  ]);

  // Byg lookup-maps (aktuel post foretrækkes — virkningTil=null, ellers første)
  const makeMap = (data) => {
    const m = {};
    (data?.edges || []).forEach(e => { if (!m[e.node.CVREnhedsId]) m[e.node.CVREnhedsId] = e.node; });
    return m;
  };
  // For navne: vælg specifikt den aktuelle (virkningTil=null) frem for historiske
  const navnMap = (() => {
    const m = {};
    (dNavn?.CVR_Navn?.edges || []).forEach(e => {
      const n = e.node;
      const eid = n.CVREnhedsId;
      if (!m[eid] || (!n.virkningTil && m[eid].virkningTil)) m[eid] = n;
    });
    return m;
  })();
  const adrMap   = makeMap(dAdr?.CVR_Adressering);
  const tlfMap   = makeMap(dTlf?.CVR_Telefonnummer);
  const emailMap = makeMap(dEmail?.CVR_e_mailadresse);
  const formMap  = makeMap(dForm?.CVR_Virksomhedsform);
  const beskMap  = makeMap(dBesk?.CVR_Beskaeftigelse);
  const brMap    = {};
  allNodes.filter(n => eidIds.includes(n.CVREnhedsId)).forEach(n => { brMap[n.CVREnhedsId] = n; });
  const virkMap  = {};
  (dVirk?.CVR_Virksomhed?.edges || []).forEach(e => { virkMap[e.node.id] = e.node; });


  const companies = eidIds.map(eid => {
    const virk = virkMap[eid];
    if (!virk) return null;
    const adr  = adrMap[eid]  || {};
    const besk = beskMap[eid] || {};
    const br   = brMap[eid]   || {};
    const form = formMap[eid] || {};
    const empStr = (besk.intervalFra != null && besk.intervalTil != null)
      ? `${besk.intervalFra}-${besk.intervalTil}`
      : (besk.antal ? String(besk.antal) : "");
    return {
      cvr:          String(virk.CVRNummer || ""),
      name:         navnMap[eid]?.vaerdi || `CVR ${virk.CVRNummer}`,
      address:      [adr.CVRAdresse_vejnavn, adr.CVRAdresse_husnummerFra].filter(Boolean).join(" "),
      zip:          String(adr.CVRAdresse_postnummer || ""),
      city:         adr.CVRAdresse_postdistrikt || "",
      phone:        tlfMap[eid]?.vaerdi || "",
      email:        emailMap[eid]?.vaerdi || "",
      web:          "",
      industry:     br.vaerdiTekst || "",
      industryCode: String(br.vaerdi || "").substring(0, 2),
      employees:    empStr,
      employeeCount: besk.antal || 0,
      status:       virk.virksomhedOphoersdato ? "inactive" : "active",
      founded:      virk.virksomhedStartdato?.substring(0, 4) || "",
      ageM:         virk.virksomhedStartdato ? Math.floor((Date.now() - new Date(virk.virksomhedStartdato).getTime()) / (1000*60*60*24*30.44)) : 0,
      form:         form.vaerdiTekst || form.vaerdi || "",
      adProtected:  false,
      owners:       [],
      revenue: 0, grossProfit: 0, equity: 0, result: 0,
      ig: "", fb: "", tt: "", li: "",
      tech: [],
    };
  }).filter(Boolean);

  // Filtrer skuffeselskaber + virksomheder uden telefon
  let filtered = companies.filter(c => !SHELL_PATTERNS.test(c.name) && c.phone);

  // Client-side postnummer-filtrering
  if (filters.zipFrom) filtered = filtered.filter(c => Number(c.zip) >= Number(filters.zipFrom));
  if (filters.zipTo)   filtered = filtered.filter(c => Number(c.zip) <= Number(filters.zipTo));

  const result = { companies: filtered, total: searchTotal };
  cacheSet(detailCacheKey, result);
  return result;
}

async function lookupDatafordeler(cvr) {
  const cacheKey = `df-gql:lookup:${cvr}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Trin 1: Hent CVREnhedsId fra CVR-nummer
  const step1 = await dfGqlFetch(`{
    CVR_Virksomhed(first: 1, where: { CVRNummer: { eq: ${Number(cvr)} } }) {
      edges { node { id CVRNummer status virksomhedStartdato virksomhedOphoersdato } }
    }
  }`);
  const virk = step1?.CVR_Virksomhed?.edges?.[0]?.node;
  if (!virk) throw new Error(`CVR ${cvr} ikke fundet i Datafordeler`);
  const eid = virk.id;

  // Trin 2: Hent relaterede entiteter parallelt
  const w = `CVREnhedsId: { eq: "${eid}" }`;
  const [dNavn, dAdr, dTlf, dEmail, dBranche, dForm, dBesk] = await Promise.all([
    dfGqlFetch(`{ CVR_Navn(first: 10, where: { ${w} }) { edges { node { vaerdi virkningTil } } } }`),
    dfGqlFetch(`{ CVR_Adressering(first: 1, where: { ${w} }) { edges { node { CVRAdresse_vejnavn CVRAdresse_husnummerFra CVRAdresse_postnummer CVRAdresse_postdistrikt } } } }`),
    dfGqlFetch(`{ CVR_Telefonnummer(first: 1, where: { ${w} }) { edges { node { vaerdi } } } }`),
    dfGqlFetch(`{ CVR_e_mailadresse(first: 1, where: { ${w} }) { edges { node { vaerdi } } } }`),
    dfGqlFetch(`{ CVR_Branche(first: 1, where: { ${w} }) { edges { node { vaerdi vaerdiTekst } } } }`),
    dfGqlFetch(`{ CVR_Virksomhedsform(first: 1, where: { ${w} }) { edges { node { vaerdi vaerdiTekst } } } }`),
    dfGqlFetch(`{ CVR_Beskaeftigelse(first: 1, where: { ${w} }) { edges { node { antal intervalFra intervalTil } } } }`),
  ]);

  const step2 = {
    navn:    dNavn?.CVR_Navn,
    adr:     dAdr?.CVR_Adressering,
    tlf:     dTlf?.CVR_Telefonnummer,
    email:   dEmail?.CVR_e_mailadresse,
    branche: dBranche?.CVR_Branche,
    form:    dForm?.CVR_Virksomhedsform,
    besk:    dBesk?.CVR_Beskaeftigelse,
  };

  const company = normalizeDatafordeler(virk, step2);
  cacheSet(cacheKey, company);
  return company;
}

function normalizeDatafordeler(virk, d) {
  if (!virk) return null;
  const adr   = d?.adr?.edges?.[0]?.node    || {};
  const br    = d?.branche?.edges?.[0]?.node || {};
  const form  = d?.form?.edges?.[0]?.node   || {};
  const besk  = d?.besk?.edges?.[0]?.node   || {};
  const empStr = (besk.intervalFra != null && besk.intervalTil != null)
    ? `${besk.intervalFra}-${besk.intervalTil}`
    : (besk.antal ? String(besk.antal) : "");
  return {
    cvr:         String(virk.CVRNummer || ""),
    name:        (d?.navn?.edges?.find(e => !e.node.virkningTil) || d?.navn?.edges?.[0])?.node?.vaerdi || "",
    address:     [adr.CVRAdresse_vejnavn, adr.CVRAdresse_husnummerFra].filter(Boolean).join(" "),
    zip:         String(adr.CVRAdresse_postnummer || ""),
    city:        adr.CVRAdresse_postdistrikt || "",
    phone:       d?.tlf?.edges?.[0]?.node?.vaerdi || "",
    email:       d?.email?.edges?.[0]?.node?.vaerdi || "",
    web:         "",
    industry:    br.vaerdiTekst || "",
    industryCode: String(br.vaerdi || "").substring(0, 2),
    employees:   empStr,
    employeeCount: besk.antal || 0,
    status:      virk.virksomhedOphoersdato ? "inactive" : "active",
    founded:     virk.virksomhedStartdato?.substring(0, 4) || "",
    ageM:        virk.virksomhedStartdato ? Math.floor((Date.now() - new Date(virk.virksomhedStartdato).getTime()) / (1000*60*60*24*30.44)) : 0,
    form:        form.vaerdiTekst || form.vaerdi || "",
    adProtected: false,
    owners:      [],
    revenue: 0, grossProfit: 0, equity: 0, result: 0,
    ig: "", fb: "", tt: "", li: "",
    tech: [],
  };
}

module.exports = { getDfGqlUrl, dfGqlFetch, fetchAllBrancheNodes, searchByBranch, lookupDatafordeler, normalizeDatafordeler };
