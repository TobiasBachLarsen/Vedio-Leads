// ── Branchekoder til Datafordeler GraphQL ─────────────────────────────────────
// Koder er verificeret mod faktiske aktive CVR_Branche-registreringer (virkningTil=null).
// Gamle 5xx-7xx koder er fjernet — de har 0 aktive virksomheder og spilder pagineringssider.
const BRANCH_CODES = {
  // BYGGERI & ANLÆG
  '41': ['410000',                                      // opførelse af bygninger (aktiv)
         '421100','421200','422100','422200','429100','429900'],  // anlæg: veje, ledningsnet, mv.

  // SPEC. BYGGERI & INSTALLATION (el, vvs, tømrer, maler, murer)
  '43': ['431100','431200',                             // nedrivning + forberedende
         '432100','432200','432900',                    // el + vvs + andet installation
         '433200','433300','433410','433420',           // tømrer, gulv, maler, glarmester
         '434100',                                      // tagdækning
         '439100','439200','439900'],                   // murer + stilladsopstilling + andet spec.

  // BILBRANCHEN (forhandler, engros, udlejning)
  '45': ['478100',                                      // bilforhandlere
         '467100','467200',                             // engros biler + reservedele
         '771100','771200'],                            // udlejning biler + lastbiler

  // ENGROSHANDEL
  '46': ['461900',                                      // agenturhandel i.a.n.
         '462100',                                      // korn, frø, foder
         '463300','463420',                             // mejeriprodukter + drikkevarer
         '464210','464700',                             // beklædning + møbler
         '465000',                                      // IKT-udstyr
         '466100','466200','466300','466400',           // maskiner (landbrug, produktion, kontor, andet)
         '467100',                                      // maskiner engros
         '468300',                                      // byggematerialer
         '468400',                                      // jernvarer + VVS-artikler
         '469000'],                                     // ikke-spec. engros

  // DETAILHANDEL
  '47': ['471110','471120','471130','471140',           // dagligvarer
         '472000','473000',                             // specialiseret mad + brændstof
         '474000',                                      // IKT-udstyr
         '475220','475530',                             // byggematerialer + køkkenudstyr
         '476310',                                      // sports- og fritidsudstyr
         '477110','477800',                             // tøj + andre nye varer
         '478100'],                                     // motorkøretøjer

  // HOTEL & OVERNATNING
  '55': ['551000','552000','553000','554000','559000'],

  // RESTAURANT & CAFÉ
  '56': ['561110','561190','561200',                    // restauranter, cafeer, mobile madboder
         '562100','562200',                             // event catering + catering
         '563010','563020','564000'],                   // drikkevarer + formidling

  // IT & SOFTWARE
  '62': ['621000',                                      // computerprogrammering
         '622000',                                      // IT-konsulentbistand
         '629000'],                                     // andre IT-serviceaktiviteter

  // DATA & HOSTING
  '63': ['631000',                                      // databehandling og hosting
         '639100','639200'],                            // internetportaler + andre infoaktiviteter

  // FINANSIERING & FORSIKRING
  '64': ['641900',                                      // pengeinstitutter
         '642110','642120',                             // finansielle + ikke-finansielle holdingselskaber
         '649100','649230','649910','649990',           // finansiel leasing + kredit + investering + formidling
         '651000','651110','651120','651200','651300',  // forsikring
         '660100','660200','660300',                    // hjælpetjenester til finans + forsikring
         '661100','661200','661900',
         '662100','662200','662900','663000'],

  // EJENDOMME
  '68': ['681100','681200',                             // køb/salg + byggeprojekter
         '682020','682030','682040',                    // udlejning boliger + erhverv
         '683110','683210','683220'],                   // ejendomsmæglere + administration

  // JURA & REVISION
  '69': ['691000','692000'],                            // juridisk + bogføring/revision

  // LEDELSESRÅDGIVNING
  '70': ['701010','701020',                             // finansielle + ikke-finansielle hovedsæder
         '702000'],                                     // virksomhedsrådgivning

  // ARKITEKTER & INGENIØRER
  '71': ['711100',                                      // arkitekter
         '711210','711220','711230','711240','711290',  // rådgivende ingeniører
         '712020','712090'],                            // teknisk afprøvning + måling

  // REKLAME & MARKETING
  '73': ['731110','731190','731200',                    // reklamekampagner + andre reklamer + indrykning
         '732000',                                      // markedsanalyse
         '733000'],                                     // PR og kommunikation

  // RENGØRING & FACILITY
  '81': ['811000',                                      // kombinerede hjælpetjenester (facility management)
         '812100','812210','812220','812290','812300',  // rengøring
         '813000'],                                     // landskabspleje

  // SUNDHED & LÆGER
  '86': ['861000',                                      // hospitaler
         '862100','862200','862300',                    // almen læge + speciallæge + tandlæge
         '869300','869500','869600','869900'],          // psykolog + fysio + alternativ + andet
};

const SHELL_PATTERNS = new RegExp([
  // Skuffeselskaber: PSE NR. 42, ASX NR. 14.806 ApS, ApS KBUS 35 NR. 1174
  String.raw`\bNR\.\s*\d`,
  // Kode + tal + selskabsform: ASX 14944 ApS, VICH 2449 A/S (med eller uden mellemrum)
  String.raw`^[A-ZÆØÅ]{2,6}\s+\d[\d.]*\s+(ApS|A\/S|I\/S|K\/S|P\/S|SE)\b`,
  String.raw`^[A-ZÆØÅ]{2,6}\d+\s+(ApS|A\/S|I\/S|K\/S|P\/S|SE)\b`,
  // Enkelt bogstav + tal: W463 ApS, B12 A/S
  String.raw`^[A-ZÆØÅ]\d{2,}\s+(ApS|A\/S|I\/S|K\/S|P\/S|SE)\b`,
  // Rent tal + selskabsform: 1234 ApS, 42 A/S
  String.raw`^\d+\s+(ApS|A\/S|I\/S|K\/S|P\/S|SE)\b`,
  // Initialer m. punktum + tal: B.F. A 1023 ApS, K.B. 4712 ApS
  String.raw`^([A-ZÆØÅ]\.){1,4}\s*[A-ZÆØÅ]?\s*\d`,
  // Passive selskaber: "Aktieselskabet af ..." / "Anpartsselskabet af ..."
  String.raw`^(aktieselskabet|anpartsselskabet|interessentskabet|kommanditselskabet)\b`,
  // Holding-, invest- og kapitalselskaber
  String.raw`\bholding`,
  String.raw`\binvest`,
  String.raw`\bkapital`,
  String.raw`\bformue`,
].join('|'), 'i');

const PAGE_SIZE = 100; // antal virksomheder der hentes per søgeside

module.exports = { BRANCH_CODES, SHELL_PATTERNS, PAGE_SIZE };
