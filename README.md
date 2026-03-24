# Vedio Leads Tobias 🔍
CVR-baseret lead- og ringelistesystem bygget med Node.js + Express.

## Hurtig start (5 min)

### Krav
- Node.js 18+ (download på https://nodejs.org)

### Installation
```bash
# Installer afhængigheder
npm install

# Kopiér og tilpas konfiguration
cp .env.example .env

# Start serveren
npm start
```

Åbn **http://localhost:3000** i din browser.

---

## Datakilde: cvrapi.dk (standard — virker med det samme)

Ingen konto nødvendig. Kalder `https://cvrapi.dk/api` som wrapper mod Virks CVR-register.
Data er realtidsopdateret (dagligt sync fra Erhvervsstyrelsen).

**Begrænsning:** Søgning sker på fritekst, filtrering sker client-side på de returnerede resultater.

---

## Datakilde: Datafordeler (anbefalet til produktion)

For fuld Elasticsearch-søgning med avancerede filtre direkte på CVR-data:

1. Opret gratis bruger på https://datafordeler.dk
2. Aktiver datasættet **"CVR — Det Centrale Virksomhedsregister"**
3. Udfyld i `.env`:
```
DATAFORDELER_USER=dinbruger
DATAFORDELER_PASS=dinkodeord
CVR_PROVIDER=datafordeler
```

Med Datafordeler får du:
- Direkte filtrering på branche, postnummer, ansatte m.m. (hurtigere og mere præcis)
- Adgang til ejere, tegningsregler, produktionsenheder
- Komplet historik per virksomhed

---

## Funktioner

### Søg
- Fritekst på navn, CVR, branche, by
- Avancerede filtre: branche (DB07), selskabsform, postnummer, by, ansatte (interval), stiftelsesår, har telefon, har email

### Ringeliste-tilstand
- Kompakt visning optimeret til telefonkampagner
- Ringestatus per virksomhed: Ikke ringet / Ringet / Interesseret / Ikke interesseret / Ring tilbage
- Notefelter direkte i tabellen
- Klikbare telefonnumre (åbner opkalds-app)

### Leads & lister
- Gem virksomheder som leads
- Organiser i navngivne lister (f.eks. "Nordjylland IT Q2")
- Bulk-tilføj valgte til liste
- Slet lister (leads flyttes til "Alle leads")

### Eksport
- CSV-eksport (semikolonsepareret, UTF-8 BOM for Excel)
- Eksportér alle leads, aktiv liste, eller kun valgte

### Sortering
- Klik kolonneoverskrifter for at sortere
- Navn, CVR, branche, by, ansatte, stiftet

---

## Filstruktur
```
Vedio Leads Tobias/
├── server.js
├── package.json
├── routes/            # API-ruter
├── lib/               # Backend-hjælpere
├── public/            # Frontend (HTML, CSS, JS)
├── .env               # Din konfiguration (lokal, ikke i git)
├── .env.example
├── users.json         # Brugere (lokal, ikke i git)
└── data_*.json        # Leads pr. bruger (lokal, ikke i git)
```

---

## API-endpoints (intern brug)

| Metode | Sti | Beskrivelse |
|--------|-----|-------------|
| GET | `/api/search?q=...&branche=62&city=Aalborg` | Søg virksomheder |
| GET | `/api/company/:cvr` | Enkelt CVR-opslag |
| GET | `/api/leads` | Hent alle leads + lister |
| POST | `/api/leads` | Tilføj lead `{ company, listId }` |
| DELETE | `/api/leads/:cvr` | Fjern lead |
| PATCH | `/api/leads/:cvr` | Opdatér felt (callStatus, note, listId) |
| POST | `/api/lists` | Opret liste `{ name }` |
| DELETE | `/api/lists/:id` | Slet liste |
| GET | `/api/status` | Health check |

### Søgeparametre
```
q            Søgetekst (påkrævet)
branche      DB07-kode prefix, f.eks. "62" for IT
form         Selskabsform: ApS, A/S, I/S, ...
city         Bynavn (delsøgning)
zip          Postnummer prefix
empMin       Minimum ansatte
empMax       Maximum ansatte
foundedFrom  Stiftet fra år
foundedTo    Stiftet til år
hasPhone     true = kun virksomheder med telefon
hasEmail     true = kun virksomheder med email
status       active / inactive
```
