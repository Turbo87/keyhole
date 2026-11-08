// PROTOTYPE: shared in-memory dataset, derived queries and actions for every UX direction.
// Nothing persists. Reloading a page rebuilds the same dataset from fixed seeds.
(function () {
  const KH = (window.KH = window.KH || {});

  KH.NOW = '2026-07-28T17:42';
  KH.TODAY = '2026-07-28';
  KH.ENGINE = '0.9.4';

  // ---------- helpers ----------

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)];
  const between = (r, a, b) => a + (b - a) * r();

  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function dateRange(first, last) {
    const out = [];
    for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
    return out;
  }
  function secs(hms) {
    if (!hms) return null;
    const [h, m, s] = hms.split(':').map(Number);
    return h * 3600 + m * 60 + (s || 0);
  }
  function hms(total) {
    total = Math.round(total);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  }
  function haversine(a, b) {
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  let idCounter = 1000;
  const newId = (prefix) => prefix + ++idCounter;

  KH.util = { rng, hash, addDays, dateRange, secs, hms, haversine, newId };

  // ---------- built-in data ----------

  KH.EDITIONS = {
    'DAeC SWO 2026': {
      templates: {
        Club: { dm: 100, d1: 250, handicapScale: '100', handicapList: 'DAeC Indexliste 2026' },
        Standard: { dm: 100, d1: 250, handicapScale: '', handicapList: '' },
        '15 m': { dm: 100, d1: 250, handicapScale: '', handicapList: '' },
        '18 m': { dm: 100, d1: 250, handicapScale: '', handicapList: '' },
        Open: { dm: 100, d1: 250, handicapScale: '', handicapList: '' },
        'Double Seater': { dm: 100, d1: 250, handicapScale: '100', handicapList: 'DAeC Indexliste 2026' },
      },
      defaults: { earthModel: 'WGS84', finishToEdge: true, deliveryPeriod: 45, startLine: 20, tpZone: 'Keyhole', aatZone: 'Cylinder 20 km', finishZone: 'Cylinder 5 km', complaintHours: 14 },
    },
    'FAI Annex A 2025a': {
      templates: {
        Club: { dm: 100, d1: 250, handicapScale: '1.000', handicapList: 'IGC Club Class 2025' },
        Standard: { dm: 100, d1: 250, handicapScale: '', handicapList: '' },
        '15 m': { dm: 100, d1: 250, handicapScale: '', handicapList: '' },
        '18 m': { dm: 100, d1: 250, handicapScale: '', handicapList: '' },
        Open: { dm: 100, d1: 250, handicapScale: '', handicapList: '' },
      },
      defaults: { earthModel: 'FAI Sphere', finishToEdge: true, deliveryPeriod: 0, startLine: 10, tpZone: 'Cylinder 0.5 km', aatZone: 'Cylinder 20 km', finishZone: 'Cylinder 3 km', complaintHours: 14 },
    },
  };
  KH.HANDICAP_LISTS = {
    'DAeC Indexliste 2026': { 'LS4': 104, 'Std Cirrus': 100, 'ASW 19': 100, 'DG-100': 99, 'Pegase': 102, 'ASW 20': 108, 'Discus': 107, 'LS1-f': 98, 'DG-300': 104, 'Astir CS': 92 },
    'IGC Club Class 2025': { 'LS4': 1.04, 'Std Cirrus': 1.0, 'ASW 19': 1.0, 'DG-300': 1.04, 'Discus': 1.07 },
  };
  KH.DAY_STATUSES = ['unplanned', 'task published', 'preliminary', 'unofficial', 'final', 'cancelled'];
  KH.STALE_REASONS = ['task', 'start procedure', 'airspace', 'logger settings', 'logger link role', 'rule overrides', 'rule set edition', 'airfield', 'class day', 'engine version'];
  KH.ADMIN_FIELDS = ['name', 'organiser', 'location', 'country', 'website', 'dates'];

  // ---------- turnpoints and airspace ----------

  const TP_NAMES = [
    ['Hohenfels', 48.12, 7.83, 210], ['Freiburg', 47.99, 7.84, 278], ['Offenburg', 48.47, 7.94, 155], ['Lahr', 48.37, 7.83, 168],
    ['Kehl', 48.57, 7.81, 139], ['Titisee', 47.9, 8.15, 858], ['Feldberg', 47.87, 8.0, 1493], ['Donaueschingen', 47.95, 8.5, 678],
    ['Villingen', 48.06, 8.46, 704], ['Rottweil', 48.17, 8.63, 600], ['Hornberg', 48.21, 8.23, 380], ['Triberg', 48.13, 8.23, 684],
    ['Wolfach', 48.29, 8.22, 262], ['Haslach', 48.28, 8.09, 215], ['Elzach', 48.17, 8.07, 361], ['Waldkirch', 48.09, 7.96, 263],
    ['Kandel', 48.06, 8.01, 1241], ['Schauinsland', 47.91, 7.9, 1284], ['Belchen', 47.82, 7.83, 1414], ['Muellheim', 47.81, 7.63, 267],
    ['Kirchzarten', 47.96, 7.95, 392], ['Neustadt', 47.91, 8.21, 805], ['Loeffingen', 47.88, 8.34, 801], ['Bonndorf', 47.82, 8.34, 847],
    ['Blumberg', 47.84, 8.53, 703], ['Schramberg', 48.22, 8.38, 424], ['Oberndorf', 48.29, 8.57, 461], ['Sulz', 48.36, 8.63, 430],
    ['Freudenstadt', 48.46, 8.41, 728], ['Baiersbronn', 48.5, 8.37, 584], ['Hornisgrinde', 48.6, 8.2, 1164], ['Achern', 48.63, 8.07, 143],
    ['Buehl', 48.7, 8.13, 135], ['Ettenheim', 48.26, 7.81, 194],
  ];
  function turnpointFile(name, uploadedAt, count) {
    return {
      name,
      uploadedAt,
      turnpoints: TP_NAMES.slice(0, count).map(([n, lat, lon, elev], i) => ({ code: String(i + 1).padStart(3, '0'), name: n, lat, lon, elev })),
    };
  }
  const AIRSPACES = [
    ['CTR FREIBURG', 'CTR', 'GND', '3500 ft MSL'], ['TMZ FREIBURG', 'TMZ', 'GND', 'FL 100'], ['ED-R 207', 'R', 'GND', 'FL 100'],
    ['RMZ HOHENFELS', 'RMZ', 'GND', '2500 ft AGL'], ['TMA STUTTGART C', 'C', '5500 ft MSL', 'FL 100'], ['ED-D 6', 'D', 'GND', 'FL 65'],
    ['GLIDER SECTOR KANDEL', 'W', 'GND', 'FL 95'], ['CTR DONAUESCHINGEN', 'D', 'GND', '4500 ft MSL'], ['ED-R 132', 'R', '1000 ft AGL', 'FL 100'],
    ['TMZ BADEN-AIRPARK', 'TMZ', '1000 ft AGL', 'FL 100'], ['C STRASBOURG 1', 'C', '3000 ft MSL', 'FL 115'],
  ];
  function airspaceFile(name, uploadedAt) {
    return { name, uploadedAt, airspaces: AIRSPACES.map(([n, category, lower, upper]) => ({ name: n, category, lower, upper })) };
  }
  KH.DEMO_FILES = {
    turnpoints: () => turnpointFile('albtrauf-2027.cup', KH.NOW, 28),
    airspace: () => airspaceFile('albtrauf-2027.txt', KH.NOW),
  };

  // ---------- people ----------

  const FIRST = ['Lukas', 'Felix', 'Jonas', 'Leon', 'Paul', 'Max', 'Tim', 'Jan', 'Niklas', 'Moritz', 'Anna', 'Lea', 'Laura', 'Julia', 'Sophie', 'Hannah', 'Marie', 'Clara', 'Tobias', 'Florian', 'Stefan', 'Michael', 'Thomas', 'Andreas', 'Markus', 'Daniel', 'Sebastian', 'Christian', 'Martin', 'Matthias', 'Katrin', 'Simone', 'Bernd', 'Uwe', 'Rainer', 'Ralf', 'Holger', 'Jens', 'Sven', 'Dirk'];
  const LAST = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hofmann', 'Hartmann', 'Lange', 'Schmitt', 'Werner', 'Krause', 'Meier', 'Lehmann', 'Schmid', 'Schulze', 'Maier', 'Köhler', 'Herrmann', 'König', 'Walter', 'Mayer', 'Huber', 'Kaiser', 'Fuchs', 'Peters', 'Lang', 'Scholz', 'Möller', 'Weiß', 'Jung', 'Hahn', 'Vogel', 'Friedrich', 'Keller'];
  const CLUBS = ['LSV Oberrhein', 'FSV Hohenfels', 'SFG Breisgau', 'AFV Freiburg', 'LSG Ortenau', 'SFV Kandel', 'FSG Baar', 'LSV Schwarzwald', 'SG Rottweil', 'FC Achern', 'LSV Lahr', 'Akaflieg Karlsruhe'];
  const COUNTRIES = ['DE', 'DE', 'DE', 'DE', 'DE', 'DE', 'CH', 'FR', 'AT', 'NL'];

  // ---------- state ----------

  const S = (KH.state = {
    users: [], invitations: [], competitionInvitations: [], memberships: [],
    competitions: [], classes: [], classDays: [], taskCandidates: [], competitors: [], loggers: [], files: [], results: [],
    version: 0,
  });

  S.users = [
    { id: 'u1', name: 'Mara Keller', email: 'mara.keller@example.org', staff: true, inviterId: null, invitationLimit: null, blocked: null, deleted: false },
    { id: 'u9', name: 'Ole Hansen', email: 'ole.hansen@example.org', staff: true, inviterId: 'u1', invitationLimit: null, blocked: null, deleted: false },
    { id: 'u2', name: 'Jonas Weber', email: 'jonas.weber@example.org', staff: false, inviterId: 'u1', invitationLimit: 10, blocked: null, deleted: false },
    { id: 'u5', name: 'Sven Hoffmann', email: 'sven.hoffmann@example.org', staff: false, inviterId: 'u1', invitationLimit: 10, blocked: null, deleted: false },
    { id: 'u3', name: 'Lena Fischer', email: 'lena.fischer@example.org', staff: false, inviterId: 'u2', invitationLimit: 10, blocked: null, deleted: false },
    { id: 'u4', name: 'Peter Brandt', email: 'peter.brandt@example.org', staff: false, inviterId: 'u2', invitationLimit: 10, blocked: null, deleted: false },
    { id: 'u6', name: 'Anna Roth', email: 'anna.roth@example.org', staff: false, inviterId: 'u3', invitationLimit: 10, blocked: null, deleted: false },
    { id: 'u7', name: 'Kai Lorenz', email: 'kai.lorenz@example.org', staff: false, inviterId: 'u6', invitationLimit: 10, blocked: { by: 'u1', at: '2026-07-02T09:14', note: 'Created three spam competitions' }, deleted: false },
    { id: 'u8', name: '', email: '', staff: false, inviterId: 'u6', invitationLimit: 10, blocked: null, deleted: true },
  ];
  KH.PERSONAS = {
    staff: { userId: 'u1', label: 'Staff', who: 'Mara Keller, staff' },
    admin: { userId: 'u2', label: 'Competition admin', who: 'Jonas Weber, admin' },
    scorer: { userId: 'u3', label: 'Scorer', who: 'Lena Fischer, scorer' },
  };

  // ---------- competitions ----------

  const NEW = {
    id: 'k1', slug: 'albtrauf-2027', name: 'Albtrauf Spring Contest 2027', organiser: 'FSV Albtrauf e.V.', location: 'Albtrauf airfield', country: 'DE',
    timeZone: 'Europe/Berlin', dates: dateRange('2027-05-15', '2027-05-23'), website: '', airfield: null, standingNotes: '', flightLevels: [],
    uploadPassword: 'QK7M2P', openedAirspaceNames: [], lifecycle: 'live', blocked: null, createdAt: '2026-07-28T17:40', createdBy: 'u2',
    terms: { userId: 'u2', version: 'organiser-terms-2026-11', at: '2026-07-28T17:40', organiser: 'FSV Albtrauf e.V.' },
    turnpointFile: null, airspaceFile: null,
  };
  const RUN = {
    id: 'k2', slug: 'oberrhein-2026', name: 'Oberrhein Cup 2026', organiser: 'LSV Oberrhein e.V.', location: 'Hohenfels airfield', country: 'DE',
    timeZone: 'Europe/Berlin', dates: dateRange('2026-07-20', '2026-07-31'), website: 'https://lsv-oberrhein.example.org/cup',
    airfield: { lat: 48.1214, lon: 7.8309, elev: 210 },
    standingNotes: 'Start frequency 122.480. Emergency phone +49 7641 0000 00. Relight area: Hohenfels overhead below 800 m MSL.',
    flightLevels: ['FL 65', 'FL 95', 'FL 100'], uploadPassword: 'H7RX4C', openedAirspaceNames: ['RMZ HOHENFELS', 'TMZ FREIBURG', 'GLIDER SECTOR KANDEL'],
    lifecycle: 'live', blocked: null, createdAt: '2026-03-02T19:12', createdBy: 'u2',
    terms: { userId: 'u2', version: 'organiser-terms-2026-03', at: '2026-03-02T19:12', organiser: 'LSV Oberrhein e.V.' },
    turnpointFile: turnpointFile('oberrhein-2026-v2.cup', '2026-07-10T21:03', 34), airspaceFile: airspaceFile('oberrhein-2026-openair.txt', '2026-07-14T08:30'),
  };
  const ARCH = {
    id: 'k3', slug: 'oberrhein-2025', name: 'Oberrhein Cup 2025', organiser: 'LSV Oberrhein e.V.', location: 'Hohenfels airfield', country: 'DE',
    timeZone: 'Europe/Berlin', dates: dateRange('2025-07-22', '2025-08-02'), website: 'https://lsv-oberrhein.example.org/cup', airfield: { lat: 48.1214, lon: 7.8309, elev: 210 },
    standingNotes: '', flightLevels: [], uploadPassword: null, openedAirspaceNames: [], lifecycle: 'archived', archivedAt: '2025-08-21T10:05', blocked: null,
    createdAt: '2025-02-11T18:40', createdBy: 'u5', terms: { userId: 'u5', version: 'organiser-terms-2025-01', at: '2025-02-11T18:40', organiser: 'LSV Oberrhein e.V.' },
    turnpointFile: null, airspaceFile: null,
    archive: {
      classes: [
        { name: 'Club', days: 9, competitors: 22, lastStatus: 'final' },
        { name: 'Standard', days: 8, competitors: 19, lastStatus: 'final' },
      ],
    },
  };
  S.competitions = [NEW, RUN, ARCH];

  S.memberships = [
    { userId: 'u2', competitionId: 'k1', role: 'admin' },
    { userId: 'u2', competitionId: 'k2', role: 'admin' },
    { userId: 'u3', competitionId: 'k2', role: 'scorer' },
    { userId: 'u4', competitionId: 'k2', role: 'scorer' },
    { userId: 'u5', competitionId: 'k3', role: 'admin' },
    { userId: 'u2', competitionId: 'k3', role: 'admin' },
    { userId: 'u3', competitionId: 'k3', role: 'scorer' },
  ];
  S.invitations = [
    { id: 'i1', inviterId: 'u2', email: 'm.schulz@example.org', competitionId: 'k2', role: 'scorer', sentAt: '2026-07-26T20:11', expires: '2026-08-02T20:11' },
    { id: 'i2', inviterId: 'u3', email: 'f.meier@example.org', competitionId: null, role: null, sentAt: '2026-07-25T09:00', expires: '2026-08-01T09:00' },
    { id: 'i3', inviterId: 'u6', email: 'spam1@example.net', competitionId: null, role: null, sentAt: '2026-07-01T23:10', expires: '2026-07-08T23:10' },
  ];
  S.competitionInvitations = [
    { id: 'ci1', senderId: 'u2', inviteeId: 'u3', competitionId: 'k1', role: 'scorer', sentAt: '2026-07-28T17:41', expires: '2026-08-04T17:41' },
  ];

  // ---------- running competition: classes ----------

  const CLASS_DEFS = [
    { id: 'cl1', slug: 'club', name: 'Club', edition: 'DAeC SWO 2026', template: 'Club', colour: '#888888' },
    { id: 'cl2', slug: 'standard', name: 'Standard', edition: 'DAeC SWO 2026', template: 'Standard', colour: '#555555' },
    { id: 'cl3', slug: '18m', name: '18 m', edition: 'FAI Annex A 2025a', template: '18 m', colour: '#222222' },
  ];
  for (const def of CLASS_DEFS) {
    const t = KH.EDITIONS[def.edition].templates[def.template];
    S.classes.push({
      id: def.id, competitionId: 'k2', slug: def.slug, name: def.name, colour: def.colour, edition: def.edition,
      handicapList: t.handicapList, handicapScale: t.handicapScale, dm: t.dm, d1: t.d1,
      overrides: def.slug === 'standard' ? { maxAltitude: 'FL 95' } : def.slug === 'club' ? { maxAltitude: 'FL 95', towAltitude: 1200 } : { maxAltitude: 'FL 100', earthModel: 'WGS84' },
      deleted: false,
    });
  }

  const GLIDERS = {
    club: ['LS4', 'Std Cirrus', 'ASW 19', 'DG-100', 'Pegase', 'ASW 20', 'Discus', 'LS1-f', 'DG-300', 'Astir CS'],
    standard: ['LS8-a', 'Discus 2a', 'ASW 28', 'LAK-19', 'Discus 2c FES', 'LS8-st'],
    '18m': ['ASG 29E', 'Ventus 3T', 'JS3-18', 'LS10-st', 'Antares 18T', 'ASW 27-18E'],
  };
  const MOTOR = /E$|T$|-st|FES|Antares/;

  const r0 = rng(2026);
  const usedIds = new Set();
  function compId(r) {
    const alphabet = 'ABCDEFGHKLMNPRSTUVWXYZ0123456789';
    for (;;) {
      const len = r() < 0.35 ? 1 : 2;
      let id = '';
      for (let i = 0; i < len; i++) id += pick(r, alphabet.split(''));
      if (len === 1 && /\d/.test(id)) continue;
      if (!usedIds.has(id)) return usedIds.add(id), id;
    }
  }
  function serial(r) {
    const alphabet = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
    return [0, 1, 2].map(() => pick(r, alphabet.split(''))).join('');
  }

  let cn = 0;
  for (const cls of S.classes) {
    for (let i = 0; i < 25; i++) {
      const glider = pick(r0, GLIDERS[cls.slug]);
      const crewSize = cls.slug === 'club' && i === 7 ? 2 : 1;
      const crew = [];
      for (let k = 0; k < crewSize; k++) {
        crew.push({ first: pick(r0, FIRST), last: pick(r0, LAST), club: pick(r0, CLUBS), country: pick(r0, COUNTRIES), igcId: r0() < 0.7 ? String(Math.floor(between(r0, 1000, 9999))) : '' });
      }
      const id = 'p' + ++cn;
      S.competitors.push({
        id, competitionId: 'k2', classId: cls.id, cid: compId(r0), gliderType: glider,
        registration: 'D-' + (MOTOR.test(glider) ? 'K' : '') + String(Math.floor(between(r0, 1000, 9999))),
        displayName: crewSize > 1 ? 'Team ' + crew[0].club.split(' ').pop() : '',
        handicap: cls.handicapList ? KH.HANDICAP_LISTS[cls.handicapList][glider] || 100 : null,
        pureGlider: !MOTOR.test(glider), hc: cls.slug === 'standard' && i === 24, dsq: null, deleted: false, crew,
        skill: between(r0, 0.86, 1.0),
      });
      const primary = { id: 'l' + cn + 'a', competitionId: 'k2', manufacturer: pick(r0, ['LXV', 'LXV', 'LXV', 'NKL']), serial: serial(r0), enl: 500, mop: 500, cur: 20, minDuration: 30, links: [{ competitorId: id, from: '', role: 'primary' }] };
      S.loggers.push(primary);
      if (r0() < 0.35) {
        S.loggers.push({ id: 'l' + cn + 'b', competitionId: 'k2', manufacturer: 'FLA', serial: serial(r0), enl: 500, mop: 500, cur: 20, minDuration: 30, links: [{ competitorId: id, from: '', role: 'secondary' }] });
      }
    }
  }
  // A primary logger change: from Day 5 the competitor's FLARM is primary.
  {
    const comp = S.competitors.find((c) => c.classId === 'cl2' && S.loggers.some((l) => l.id === 'l' + c.id.slice(1) + 'b'));
    const a = S.loggers.find((l) => l.id === 'l' + comp.id.slice(1) + 'a');
    const b = S.loggers.find((l) => l.id === 'l' + comp.id.slice(1) + 'b');
    a.links.push({ competitorId: comp.id, from: '2026-07-25', role: 'secondary' });
    b.links.push({ competitorId: comp.id, from: '2026-07-25', role: 'primary' });
  }
  // A logger entered by a scorer before any file arrived, and one created by an unknown upload.
  S.loggers.push({ id: 'lx1', competitionId: 'k2', manufacturer: 'FLA', serial: '9K2', enl: 500, mop: 500, cur: 20, minDuration: 30, links: [] });
  S.loggers.push({ id: 'lx2', competitionId: 'k2', manufacturer: 'XCS', serial: '0AB', enl: 500, mop: 500, cur: 20, minDuration: 30, links: [] });

  // ---------- running competition: class days and tasks ----------

  const TPS = RUN.turnpointFile.turnpoints;
  const tpByName = (n) => TPS.find((t) => t.name === n);
  function zoneFor(role, edition, type) {
    const d = KH.EDITIONS[edition].defaults;
    if (role === 'start') return { kind: 'line', length: d.startLine };
    if (role === 'finish') return d.finishZone.includes('5') ? { kind: 'cylinder', preset: 'Cylinder', r1: 5, a1: 180, r2: 0, a2: 0, orientation: 'symmetric' } : { kind: 'cylinder', preset: 'Cylinder', r1: 3, a1: 180, r2: 0, a2: 0, orientation: 'symmetric' };
    if (type === 'aat') return { kind: 'sector', preset: 'Cylinder', r1: 20, a1: 180, r2: 0, a2: 0, orientation: 'symmetric' };
    if (d.tpZone === 'Keyhole') return { kind: 'sector', preset: 'Keyhole', r1: 10, a1: 45, r2: 0.5, a2: 180, orientation: 'symmetric' };
    return { kind: 'sector', preset: 'Cylinder', r1: 0.5, a1: 180, r2: 0, a2: 0, orientation: 'symmetric' };
  }
  function taskPoint(name, role, edition, type) {
    const t = tpByName(name);
    return { name: t.name, lat: t.lat, lon: t.lon, elev: t.elev, zone: zoneFor(role, edition, type) };
  }
  function makeCandidate(classDay, cls, letter, type, names, extra) {
    const c = {
      id: newId('t'), classDayId: classDay.id, letter, deleted: false, type,
      minTaskTime: type === 'aat' ? '03:00' : '', minFinishHeight: cls.edition.startsWith('DAeC') ? '' : 450, dayNotes: 'Grid 11:00. First launch 11:30. Runway 22.',
      points: names.map((n, i) => taskPoint(n, i === 0 ? 'start' : i === names.length - 1 ? 'finish' : 'tp', cls.edition, type)),
      ...extra,
    };
    S.taskCandidates.push(c);
    return c;
  }
  function newClassDay(cls, date, extra) {
    const cd = {
      id: newId('d'), classId: cls.id, date, practice: false, qnh: 1016, status: 'unplanned', complaintDeadline: '', reasons: [], resultsNote: '',
      taskCandidateId: null, overrides: {}, airspaceExceptions: [], notamAirspaces: [], published: null, publishedTask: null, inputVersion: 1,
      ...extra,
    };
    S.classDays.push(cd);
    return cd;
  }

  const ROUTES = [
    ['Hohenfels', 'Buehl', 'Blumberg', 'Freudenstadt', 'Muellheim', 'Hohenfels'],
    ['Hohenfels', 'Hornisgrinde', 'Donaueschingen', 'Baiersbronn', 'Belchen', 'Hohenfels'],
    ['Hohenfels', 'Achern', 'Rottweil', 'Titisee', 'Hohenfels'],
    ['Hohenfels', 'Sulz', 'Muellheim', 'Freudenstadt', 'Bonndorf', 'Hohenfels'],
    ['Hohenfels', 'Buehl', 'Villingen', 'Feldberg', 'Hohenfels'],
    ['Hohenfels', 'Oberndorf', 'Belchen', 'Hornisgrinde', 'Loeffingen', 'Hohenfels'],
    ['Hohenfels', 'Freudenstadt', 'Blumberg', 'Kandel', 'Hohenfels'],
    ['Hohenfels', 'Achern', 'Rottweil', 'Muellheim', 'Hohenfels'],
    ['Hohenfels', 'Sulz', 'Titisee', 'Hohenfels'],
  ];

  // Status plan per competition date: practice, day 1 to day 12.
  const PLAN = {
    '2026-07-20': { practice: true, status: 'final' },
    '2026-07-21': { status: 'final' },
    '2026-07-22': { status: 'final' },
    '2026-07-23': { status: 'cancelled', noTask: true },
    '2026-07-24': { status: 'final' },
    '2026-07-25': { status: 'final', std: 'unofficial' },
    '2026-07-26': { status: 'unofficial' },
    '2026-07-27': { status: 'preliminary' },
    '2026-07-28': { status: 'task published', today: true },
  };

  const r1 = rng(77);
  let routeIdx = 0;
  for (const date of RUN.dates) {
    const plan = PLAN[date];
    if (!plan) continue;
    const route = ROUTES[routeIdx++ % ROUTES.length];
    for (const cls of S.classes) {
      let status = plan.status;
      if (cls.slug === 'standard' && plan.std) status = plan.std;
      const cd = newClassDay(cls, date, { practice: !!plan.practice, status, qnh: Math.round(between(r1, 1009, 1022)) });
      if (plan.noTask) continue;
      const type = cls.slug === '18m' && !plan.practice && routeIdx % 2 === 0 ? 'aat' : 'racing';
      const names = cls.slug === 'club' && route.length > 4 ? route.slice(0, -2).concat(route.slice(-1)) : route;
      const a = makeCandidate(cd, cls, 'A', type, names);
      if (r1() < 0.5) makeCandidate(cd, cls, 'B', type, [route[0], route[1], route[route.length - 2], route[route.length - 1]]);
      cd.taskCandidateId = a.id;
      cd.overrides = { startOpen: '12:30', startClose: '', maxStartAlt: cls.edition.startsWith('DAeC') ? 1500 : '', maxStartGs: cls.edition.startsWith('DAeC') ? '' : 150 };
      if (cls.edition.startsWith('DAeC') && cls.slug === 'standard') Object.assign(cd.overrides, { pevStart: true, pevWait: 5, pevWindow: 5 });
    }
  }
  // Tomorrow: Club has two candidates prepared, still unplanned.
  {
    const club = S.classes[0];
    const cd = newClassDay(club, '2026-07-29', { qnh: 1018 });
    makeCandidate(cd, club, 'A', 'racing', ['Hohenfels', 'Freudenstadt', 'Villingen', 'Hohenfels']);
    makeCandidate(cd, club, 'B', 'racing', ['Hohenfels', 'Hornberg', 'Titisee', 'Hohenfels']);
    makeCandidate(cd, club, '', 'aat', ['Hohenfels', 'Wolfach', 'Neustadt', 'Hohenfels'], { minTaskTime: '02:30' });
  }
  // Day 8 of 18 m: the start opening time moved after launch, which marks its files stale.
  // Day 3: cancelled for weather before a task was published.

  // ---------- queries ----------

  const byId = (list, id) => list.find((x) => x.id === id);
  const Q = (KH.q = {});
  Q.user = (id) => byId(S.users, id);
  Q.competition = (id) => byId(S.competitions, id);
  Q.competitionBySlug = (slug) => S.competitions.find((c) => c.slug === slug);
  Q.classesOf = (compId, withDeleted) => S.classes.filter((c) => c.competitionId === compId && (withDeleted || !c.deleted));
  Q.class = (id) => byId(S.classes, id);
  Q.classBySlug = (compId, slug) => S.classes.find((c) => c.competitionId === compId && c.slug === slug);
  Q.classDay = (id) => byId(S.classDays, id);
  Q.classDayOn = (classId, date) => S.classDays.find((d) => d.classId === classId && d.date === date);
  Q.classDaysOf = (classId) => S.classDays.filter((d) => d.classId === classId).sort((a, b) => (a.date < b.date ? -1 : 1));
  Q.candidates = (classDayId, withDeleted) => S.taskCandidates.filter((t) => t.classDayId === classDayId && (withDeleted || !t.deleted));
  Q.candidate = (id) => byId(S.taskCandidates, id);
  Q.task = (cd) => (cd && cd.taskCandidateId ? Q.candidate(cd.taskCandidateId) : null);
  Q.competitor = (id) => byId(S.competitors, id);
  Q.competitorsOf = (compId, classId, withDeleted) =>
    S.competitors.filter((c) => c.competitionId === compId && (!classId || c.classId === classId) && (withDeleted || !c.deleted)).sort((a, b) => a.cid.localeCompare(b.cid));
  Q.competitorByCid = (classId, cid) => S.competitors.find((c) => c.classId === classId && c.cid === cid && !c.deleted);
  Q.loggersOf = (compId) => S.loggers.filter((l) => l.competitionId === compId);
  Q.logger = (id) => byId(S.loggers, id);
  Q.file = (id) => byId(S.files, id);
  Q.filesOf = (compId) => S.files.filter((f) => Q.logger(f.loggerId).competitionId === compId);
  Q.result = (id) => byId(S.results, id);
  Q.membersOf = (compId) => S.memberships.filter((m) => m.competitionId === compId);
  Q.membership = (userId, compId) => S.memberships.find((m) => m.userId === userId && m.competitionId === compId);
  Q.crewName = (c) => c.displayName || c.crew.map((p) => p.first + ' ' + p.last).join(' & ');
  Q.loggerLabel = (l) => l.manufacturer + ' ' + l.serial;
  Q.taskDistance = (cand) => {
    if (!cand || cand.points.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < cand.points.length; i++) d += haversine(cand.points[i - 1], cand.points[i]);
    return Math.round(d * 10) / 10;
  };
  Q.taskLine = (cand) => (cand ? cand.points.map((p) => p.name).join(' – ') : '');

  // Day numbers are derived from the competition dates, with practice days numbered separately.
  Q.dayLabel = (classId, date) => {
    const cls = Q.class(classId);
    const comp = Q.competition(cls.competitionId);
    let n = 0;
    let p = 0;
    for (const d of comp.dates) {
      const cd = Q.classDayOn(classId, d);
      if (cd && cd.practice) p++;
      else n++;
      if (d === date) return cd && cd.practice ? 'Practice day ' + p : 'Day ' + n;
    }
    return 'Not a competition date';
  };
  Q.dayStatus = (classId, date) => {
    const cd = Q.classDayOn(classId, date);
    return cd ? cd.status : 'unplanned';
  };

  // A logger link is valid from its date until the logger's next entry.
  Q.linkOn = (logger, date) => {
    let best = null;
    for (const link of logger.links) if ((link.from || '') <= date && (!best || (link.from || '') >= (best.from || ''))) best = link;
    return best;
  };
  Q.flightDate = (f) => f.dateOverride || f.flightDate;
  // Resolve a file to its result through the logger link valid on its flight date.
  Q.resolve = (f) => {
    const logger = Q.logger(f.loggerId);
    const date = Q.flightDate(f);
    const link = Q.linkOn(logger, date);
    if (!link) return { ok: false, reason: 'No logger link for ' + Q.loggerLabel(logger) + ' on ' + date };
    const competitor = Q.competitor(link.competitorId);
    const cd = Q.classDayOn(competitor.classId, date);
    if (!cd) return { ok: false, reason: 'No class day of ' + Q.class(competitor.classId).name + ' on ' + date, competitor };
    return { ok: true, competitor, classDay: cd, role: link.role, result: Q.resultFor(cd.id, competitor.id) };
  };
  Q.resultFor = (classDayId, competitorId) => {
    let r = S.results.find((x) => x.classDayId === classDayId && x.competitorId === competitorId);
    if (!r) {
      r = { id: newId('r'), classDayId, competitorId, status: 'unknown', scoredFileId: null, checkReasons: [], manual: null, handicapOverride: '', publicRemark: '', internalRemark: '', penalty: null };
      S.results.push(r);
    }
    return r;
  };
  Q.filesOfResult = (result) =>
    S.files.filter((f) => {
      if (f.deleted) return false;
      const res = Q.resolve(f);
      return res.ok && res.result === result;
    });
  Q.resultsOf = (cd) => Q.competitorsOf(Q.class(cd.classId).competitionId, cd.classId).map((c) => Q.resultFor(cd.id, c.id));
  Q.unresolvedFiles = (compId) => Q.filesOf(compId).filter((f) => !f.deleted && !Q.resolve(f).ok);
  Q.staleFilesOf = (cd) => S.files.filter((f) => !f.deleted && f.analysis.stale.length && (() => { const r = Q.resolve(f); return r.ok && r.classDay === cd; })());
  Q.reviewStatus = (result) => (result.checkReasons.length ? 'check' : 'OK');

  // ---------- fake flight analysis ----------

  function competitorOfFile(f) {
    const res = Q.resolve(f);
    return res.ok ? res.competitor : null;
  }

  // Deterministic analysis from the file's seed, its class day inputs and its overrides.
  function analyse(f) {
    const res = Q.resolve(f);
    const log = [];
    const entry = (level, time, text, extra) => log.push({ level, time, text, ...extra });
    const r = rng(f.seed);
    const takeoff = f.perf.takeoff;
    entry('info', '', 'File parsed: ' + f.perf.fixes + ' fixes, 1 s interval');
    if (f.gRecord === 'valid') entry('info', '', 'G record valid (validator vali-' + Q.logger(f.loggerId).manufacturer.toLowerCase() + ')');
    if (f.gRecord === 'invalid') entry('warning', '', 'G record not valid', { kind: 'g-record' });
    if (f.gRecord === 'none') entry('warning', '', 'G record not checked: no supported validator for ' + Q.logger(f.loggerId).manufacturer, { kind: 'g-record' });
    if (f.recordedDate !== f.flightDate) entry('warning', '', 'Recorded date ' + f.recordedDate + ' corrected to ' + f.flightDate + ' (GPS week number rollover)', { kind: 'date' });
    entry('info', takeoff, 'Take-off');
    if (f.perf.selfLaunch) entry('info', takeoff, 'Self-launch: engine run ' + takeoff + '–' + hms(secs(takeoff) + 420) + ', 310 m to 820 m MSL');
    else entry('info', hms(secs(takeoff) + 380), 'Release (aerotow) at 640 m MSL');
    if (f.perf.engineTest) entry('info', hms(secs(takeoff) + 900), 'Engine test: 45 s, 1040 m to 1010 m MSL, 3.1 km from take-off');

    const base = { ok: res.ok, resolved: res.ok, output: null, log, candidates: [] };
    if (!res.ok) {
      entry('warning', '', 'No task analysis: file is unresolved. ' + res.reason, { kind: 'unresolved' });
      return base;
    }
    const cd = res.classDay;
    const task = Q.task(cd);
    if (!task || cd.status === 'unplanned') {
      entry('info', '', 'Waiting for a published task on ' + Q.dayLabel(cd.classId, cd.date));
      return base;
    }
    if (res.role === 'secondary' && f.scoredHint) entry('warning', '', 'Scored file is from a secondary logger. Annex A 5.3g wants its use indicated in the daily results. Consider a public remark.', { kind: 'secondary' });

    const rr = rng(f.seed ^ hash(task.id + ':' + cd.inputVersion));
    const ov = f.overrides;
    const startOpen = secs((cd.overrides.startOpen || '12:30') + ':00');
    const maxAlt = Number(cd.overrides.maxStartAlt) || null;
    const maxGs = Number(cd.overrides.maxStartGs) || null;

    entry('debug', hms(startOpen - 600 - rr() * 900), 'Start line crossing before the start opens');
    entry('debug', hms(startOpen - 200 - rr() * 300), 'Start line crossing before the start opens');

    const nCand = 1 + Math.floor(rr() * 3.5);
    const cands = [];
    let t = startOpen + 300 + rr() * 1800;
    for (let i = 0; i < nCand; i++) {
      const alt = Math.round(1350 + rr() * 300);
      const gs = Math.round(130 + rr() * 45);
      const pev = cd.overrides.pevStart ? (rr() < 0.85 ? 'in window' : 'outside window') : '';
      const breaches = [];
      if (maxAlt && alt > maxAlt) breaches.push('above maximum start altitude (' + alt + ' m > ' + maxAlt + ' m)');
      if (maxGs && gs > maxGs) breaches.push('above maximum start ground speed (' + gs + ' km/h > ' + maxGs + ' km/h)');
      if (pev === 'outside window') breaches.push('outside the PEV start window');
      if (f.perf.restart && i === 0) breaches.push('within 20 min after an in-flight restart');
      cands.push({ time: hms(t), alt, gs, pev, breaches, valid: breaches.length === 0, score: rr() });
      t += 400 + rr() * 1500;
    }
    const valid = cands.filter((c) => c.valid);
    const autoPool = valid.length ? valid : cands;
    const auto = autoPool.reduce((a, b) => (b.score > a.score ? b : a));
    auto.auto = true;
    let inUse = auto;
    let freeStart = null;
    if (ov.start && ov.start.kind === 'candidate') inUse = cands.find((c) => c.time === ov.start.time) || auto;
    if (ov.start && ov.start.kind === 'free') freeStart = ov.start.time;
    inUse.inUse = !freeStart;
    for (const c of cands) {
      entry(c.valid ? 'info' : 'warning', c.time, 'Start candidate' + (c.auto ? ' (automatic choice)' : '') + (c.inUse ? ' (in use)' : '') + ': ' + c.alt + ' m MSL, ' + c.gs + ' km/h' + (c.pev ? ', PEV ' + c.pev : '') + (c.breaches.length ? ', ' + c.breaches.join(', ') : ''), { kind: 'start', candidate: c.time });
    }
    if (valid.length && inUse !== auto && !freeStart) entry('info', inUse.time, 'Another candidate avoids a start finding: ' + auto.time);
    if (!valid.length) entry('warning', '', 'No valid start. The automatic choice has a breach.', { kind: 'start' });
    if (inUse.breaches.length && !freeStart) entry('warning', inUse.time, 'The start in use has a breach: ' + inUse.breaches.join(', '), { kind: 'start' });
    if (freeStart) entry('info', freeStart, 'Start time set by override');

    const startT = secs(freeStart || inUse.time);
    const taskDist = Q.taskDistance(task);
    const comp = competitorOfFile(f);
    const skill = comp ? comp.skill : 0.9;
    const speed = (task.type === 'aat' ? 92 : 98) * skill * (0.93 + rr() * 0.12);
    const flyDist = task.type === 'aat' ? taskDist * (0.9 + rr() * 0.35) : taskDist;
    let finished = f.perf.finishRoll < 0.86 * skill + 0.05;
    const tpCount = task.points.length - 2;
    const reached = task.points.slice(1, -1).map(() => true);
    let missIdx = -1;
    if (!finished && f.perf.nearMiss) {
      missIdx = Math.floor(rr() * tpCount);
      reached[missIdx] = false;
    }
    const credited = (ov.tpCredits || []);
    for (const i of credited) if (i < reached.length) reached[i] = true;
    if (missIdx >= 0 && reached[missIdx]) finished = true;

    let flightEnd = ov.flightEnd || null;
    let distance;
    let finishT = null;
    task.points.slice(1, -1).forEach((p, i) => {
      const tt = hms(startT + ((i + 1) / (tpCount + 1)) * (flyDist / speed) * 3600);
      if (reached[i]) entry('info', tt, 'Turnpoint ' + (i + 1) + ' ' + p.name + ' reached' + (credited.includes(i) ? ' (credited by override)' : ''));
      else entry('warning', tt, 'Turnpoint ' + (i + 1) + ' ' + p.name + ' missed by 0.' + (2 + Math.floor(rr() * 3)) + ' km (closest fix ' + tt + ')', { kind: 'near-miss', tpIndex: i });
    });
    let durationS = (flyDist / speed) * 3600;
    if (task.type === 'aat') durationS = Math.max(durationS, secs(task.minTaskTime + ':00') + rr() * 900);
    const suggestions = [];
    if (f.perf.engineAfterStart) {
      const et = hms(startT + durationS * 0.62);
      suggestions.push({ kind: 'flight end', time: et, text: 'Engine run after the start' });
      entry('warning', et, 'Engine run after the start: ' + et + '–' + hms(secs(et) + 510) + ', 820 m to 1150 m MSL, 41 km from take-off', { kind: 'engine', suggestion: { kind: 'flight end', time: et } });
    }
    if (f.perf.airspace) {
      const at = hms(startT + durationS * f.perf.airspace);
      entry('warning', at, 'Entry into closed airspace ED-R 207: ' + at + '–' + hms(secs(at) + 95) + ', deepest 180 m', { kind: 'airspace', suggestion: { kind: 'flight end', time: at } });
      suggestions.push({ kind: 'flight end', time: at, text: 'Airspace entry ED-R 207' });
    }
    if (flightEnd) {
      finished = false;
      const frac = Math.min(0.97, Math.max(0.2, (secs(flightEnd) - startT) / durationS));
      distance = Math.round(flyDist * frac * 0.95 * 10) / 10;
      entry('info', flightEnd, 'Flight end set by override. Scored up to the best performance fix.');
    } else if (finished) {
      distance = Math.round(flyDist * 10) / 10;
      finishT = hms(startT + durationS);
      const fh = Math.round(260 + rr() * 300);
      if (ov.finishTime) finishT = ov.finishTime;
      entry('info', finishT, 'Finish at ' + fh + ' m MSL' + (ov.finishTime ? ' (time set by override)' : ''));
      if (task.minFinishHeight && fh < Number(task.minFinishHeight)) entry('warning', finishT, 'Finish below minimum height: ' + fh + ' m MSL < ' + task.minFinishHeight + ' m MSL', { kind: 'finish-height' });
    } else {
      distance = Math.round(flyDist * f.perf.outlandingFrac * 10) / 10;
    }
    const landing = hms(startT + durationS + 600 + rr() * 900);
    entry('info', landing, finished ? 'Landing at Hohenfels' : 'Landing (outlanding) ' + Math.round(distance) + ' km into the task');
    if (f.perf.gap) entry('warning', hms(startT + durationS * 0.4), 'Fix interval above the rule set limit: 47 s gap', { kind: 'gap' });

    log.sort((a, b) => (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0);
    const time = finishT ? secs(finishT) - startT : null;
    const timeForSpeed = task.type === 'aat' && time ? Math.max(time, secs(task.minTaskTime + ':00')) : time;
    base.candidates = cands;
    base.suggestions = suggestions;
    base.output = {
      start: freeStart || inUse.time, finished, finish: finishT, landing, distance,
      time: time ? hms(time) : null, speed: finished ? Math.round((distance / timeForSpeed) * 3600 * 10) / 10 : null,
      flightEnd,
    };
    return base;
  }
  KH.analyse = analyse;

  function outputKey(a) {
    if (!a || !a.output) return 'none';
    const o = a.output;
    const warnings = a.log.filter((e) => e.level === 'warning' || e.level === 'error').map((e) => e.text).join('|');
    return [o.start, o.finished, o.finish, o.distance, o.speed, warnings].join(';');
  }

  function runAnalysis(f, opts) {
    const before = outputKey(f.analysis);
    const a = analyse(f);
    f.analysis = { engine: KH.ENGINE, state: 'done', ranAt: (opts && opts.at) || KH.NOW, stale: [], ...a };
    const res = Q.resolve(f);
    if (res.ok && res.result.scoredFileId === f.id && before !== outputKey(f.analysis) && !(opts && opts.silent)) {
      addCheckReason(res.result, 'Scored file output changed', f);
      markUnpublished(res.classDay, 'Results');
    }
  }

  // ---------- files ----------

  function makeFile(logger, date, perf, extra) {
    const seed = hash(logger.id + date + (extra && extra.suffix ? extra.suffix : ''));
    const f = {
      id: newId('f'), loggerId: logger.id, sha: seed.toString(16).padStart(8, '0') + 'a3c1e9f0', uploadedAt: date + 'T' + (perf.uploadAt || '18:20'),
      uploadedBy: 'pilot', recordedDate: date, flightDate: date, dateOverride: '', suggestedClass: '', suggestedCid: '', gRecord: logger.manufacturer === 'XCS' ? 'none' : 'valid',
      private: false, deleted: false, internalRemark: '', overrides: {}, seed, perf, analysis: null, name: '',
      ...extra,
    };
    f.name = date.slice(2).replace(/-/g, '') + '_' + logger.manufacturer + '_' + logger.serial + '.igc';
    S.files.push(f);
    return f;
  }
  function perfFor(r, comp, date) {
    const motor = !comp.pureGlider;
    return {
      takeoff: hms(secs('11:25:00') + r() * 3600), fixes: Math.floor(between(r, 17000, 26000)), finishRoll: r(), outlandingFrac: between(r, 0.35, 0.92),
      nearMiss: r() < 0.25, selfLaunch: motor && r() < 0.5, engineTest: motor && r() < 0.3, engineAfterStart: motor && r() < 0.06,
      restart: r() < 0.02, airspace: r() < 0.035 ? between(r, 0.2, 0.8) : 0, gap: r() < 0.03, uploadAt: hms(secs('16:40:00') + r() * 9000).slice(0, 5),
    };
  }

  const r2 = rng(4242);
  for (const cd of S.classDays.filter((d) => d.status !== 'unplanned' && d.status !== 'cancelled')) {
    const cls = Q.class(cd.classId);
    const isToday = cd.date === KH.TODAY;
    const isYesterday = cd.date === '2026-07-27';
    for (const comp of Q.competitorsOf('k2', cls.id)) {
      const result = Q.resultFor(cd.id, comp.id);
      if (r2() < 0.04) {
        result.status = 'did not fly';
        continue;
      }
      const loggers = S.loggers.filter((l) => l.links.some((k) => k.competitorId === comp.id));
      const primary = loggers.find((l) => Q.linkOn(l, cd.date) && Q.linkOn(l, cd.date).role === 'primary');
      const perf = perfFor(r2, comp, cd.date);
      if (isToday && secs(perf.uploadAt + ':00') > secs('17:42:00') && r2() < 0.75) continue;
      if (isToday && r2() < 0.25) continue;
      const files = [];
      if (primary) files.push(makeFile(primary, cd.date, perf));
      for (const l of loggers) if (l !== primary && r2() < 0.55) files.push(makeFile(l, cd.date, { ...perf, uploadAt: hms(secs(perf.uploadAt + ':00') + 300).slice(0, 5) }));
      for (const f of files) runAnalysis(f, { at: cd.date + 'T' + f.perf.uploadAt, silent: true });
      if (!files.length) continue;
      // Manual result for one competitor whose logger failed on Day 2.
      if (cd.date === '2026-07-22' && comp === Q.competitorsOf('k2', cls.id)[3]) {
        result.status = 'manual result';
        result.manual = { startTime: '13:12:40', finished: false, finishTime: '', distance: 187.4, landing: 'Field near Villingen' };
        result.publicRemark = 'Logger failure, distance from landing certificate.';
        continue;
      }
      const scored = files[0];
      if (isToday) {
        result.checkReasons.push({ text: 'File arrived', file: scored.id, at: scored.uploadedAt });
        if (files[1]) result.checkReasons.push({ text: 'File arrived', file: files[1].id, at: files[1].uploadedAt });
        if (r2() < 0.45) {
          result.status = 'scored file';
          result.scoredFileId = scored.id;
          result.checkReasons.push({ text: 'Scored file output changed (first analysis)', file: scored.id, at: scored.uploadedAt });
          if (r2() < 0.55) result.checkReasons = [];
        }
      } else {
        result.status = 'scored file';
        result.scoredFileId = scored.id;
        if (isYesterday && r2() < 0.12) result.checkReasons.push({ text: 'File arrived', file: (files[1] || scored).id, at: '2026-07-28T09:12' });
      }
    }
  }

  // Overrides, penalties and remarks on earlier days.
  {
    const results = S.results.filter((r) => r.status === 'scored file');
    const r3 = rng(99);
    for (let i = 0; i < 6; i++) {
      const res = pick(r3, results);
      const f = Q.file(res.scoredFileId);
      if (!f.analysis.candidates.length) continue;
      const alt = f.analysis.candidates.find((c) => !c.auto);
      if (alt) {
        f.overrides.start = { kind: 'candidate', time: alt.time };
        runAnalysis(f, { silent: true });
      }
    }
    const pen = results.filter((r) => Q.file(r.scoredFileId).analysis.log.some((e) => e.kind === 'airspace'));
    for (const r of pen.slice(0, 3)) {
      const f = Q.file(r.scoredFileId);
      const sug = f.analysis.suggestions[0];
      if (sug && r3() < 0.6) {
        f.overrides.flightEnd = sug.time;
        runAnalysis(f, { silent: true });
      } else r.penalty = { points: 50, publicRemark: 'Airspace infringement ED-R 207, SWO penalty table 2.3', internalRemark: 'Pilot accepted at debriefing.' };
    }
    const warnRes = pick(r3, results.filter((r) => S.classDays.find((d) => d.id === r.classDayId).date === '2026-07-24'));
    warnRes.penalty = { points: 0, publicRemark: 'Official warning: unsafe thermalling reported by two pilots', internalRemark: '' };
    warnRes.internalRemark = 'Talked to the pilot at 19:30.';
  }

  // Unresolved and odd files.
  {
    const kx = S.competitors.find((c) => c.classId === 'cl1');
    makeFile(Q.logger('lx1'), '2026-07-28', perfFor(rng(5), kx, '2026-07-28'), { suggestedClass: 'Club', suggestedCid: kx.cid, uploadedAt: '2026-07-28T17:31' });
    const std = S.competitors.find((c) => c.classId === 'cl2' && c.cid.length === 2);
    makeFile(Q.logger('lx2'), '2026-07-12', perfFor(rng(6), std, '2026-07-12'), { suggestedClass: 'Standard', suggestedCid: std.cid, uploadedAt: '2026-07-12T20:05' });
    const someLogger = S.loggers.find((l) => l.links.length && Q.competitor(l.links[0].competitorId).classId === 'cl3');
    makeFile(someLogger, '2026-07-01', perfFor(rng(7), Q.competitor(someLogger.links[0].competitorId), '2026-07-01'), { suggestedClass: '18 m', suggestedCid: Q.competitor(someLogger.links[0].competitorId).cid, uploadedAt: '2026-07-28T17:05', recordedDate: '2026-07-01', suffix: 'clock', internalRemark: 'Logger lost its clock, pilot says it was flown today.' });
    const rollLogger = S.loggers.find((l) => l.links.length && Q.competitor(l.links[0].competitorId).classId === 'cl1' && l.id.endsWith('a') && l !== S.loggers[0]);
    const rollFile = makeFile(rollLogger, '2026-07-28', perfFor(rng(8), Q.competitor(rollLogger.links[0].competitorId), '2026-07-28'), { recordedDate: '2006-12-12', suffix: 'roll', uploadedAt: '2026-07-28T17:12' });
    const rollRes = Q.resolve(rollFile).result;
    rollRes.checkReasons.push({ text: 'File arrived', file: rollFile.id, at: rollFile.uploadedAt });
    for (const f of S.files.filter((x) => !x.analysis)) runAnalysis(f, { silent: true });
    // A deleted duplicate on Day 6.
    const d6 = S.files.find((f) => f.flightDate === '2026-07-26' && Q.logger(f.loggerId).manufacturer === 'FLA');
    if (d6) {
      const res = Q.resolve(d6);
      if (!res.ok || res.result.scoredFileId !== d6.id) d6.deleted = true;
    }
  }

  // Stale analyses: a moved start opening time on 18 m Day 8, a changed ENL threshold, a changed link role.
  {
    const cd18 = Q.classDayOn('cl3', '2026-07-28');
    cd18.inputVersion = 2;
    cd18.overrides.startOpen = '12:45';
    for (const f of S.files) {
      const res = Q.resolve(f);
      if (res.ok && res.classDay === cd18) f.analysis.stale.push({ reason: 'start procedure', at: '2026-07-28T12:21' });
    }
    const clubToday = Q.classDayOn('cl1', '2026-07-28');
    const clubFiles = S.files.filter((f) => { const r = Q.resolve(f); return r.ok && r.classDay === clubToday; });
    const lg = Q.logger(clubFiles[2].loggerId);
    lg.enl = 450;
    for (const f of S.files.filter((x) => x.loggerId === lg.id)) f.analysis.stale.push({ reason: 'logger settings', at: '2026-07-28T16:58' });
    const std7 = Q.classDayOn('cl2', '2026-07-27');
    const stdFiles = S.files.filter((f) => { const r = Q.resolve(f); return r.ok && r.classDay === std7; });
    stdFiles.slice(4, 6).forEach((f) => f.analysis.stale.push({ reason: 'logger link role', at: '2026-07-28T08:40' }));
  }

  // Published copies for every day that has been published.
  function scoreClassDay(cd) {
    const cls = Q.class(cd.classId);
    const task = Q.task(cd);
    const rows = [];
    for (const comp of Q.competitorsOf(cls.competitionId, cls.id)) {
      const r = Q.resultFor(cd.id, comp.id);
      const row = { result: r, competitor: comp, status: r.status, points: null, rank: null, distance: null, speed: null, start: null, finish: null, finished: false, placeholder: false };
      const handicap = Number(r.handicapOverride || comp.handicap) || null;
      if (r.status === 'scored file') {
        const f = Q.file(r.scoredFileId);
        const o = f && f.analysis.output;
        if (o) Object.assign(row, { distance: o.distance, speed: o.speed, start: o.start, finish: o.finish, finished: o.finished });
      } else if (r.status === 'manual result' && r.manual) {
        const m = r.manual;
        const t = m.finished && m.finishTime && m.startTime ? secs(m.finishTime) - secs(m.startTime) : null;
        const dist = m.finished ? Q.taskDistance(task) : Number(m.distance) || 0;
        Object.assign(row, { distance: dist, start: m.startTime, finish: m.finishTime, finished: !!m.finished, speed: t ? Math.round((dist / t) * 36000) / 10 : null });
      } else if (r.status === 'unknown') row.placeholder = true;
      if (handicap && cls.handicapScale) {
        const h = cls.handicapScale === '100' ? handicap / 100 : handicap;
        if (row.speed) row.hSpeed = Math.round((row.speed / h) * 10) / 10;
        if (row.distance) row.hDistance = Math.round((row.distance / h) * 10) / 10;
      }
      rows.push(row);
    }
    const scored = rows.filter((x) => x.status === 'scored file' || x.status === 'manual result');
    const sp = (x) => x.hSpeed || x.speed || 0;
    const dist = (x) => x.hDistance || x.distance || 0;
    const counted = scored.filter((x) => !x.competitor.hc);
    const vo = Math.max(1, ...counted.filter((x) => x.finished).map(sp));
    const dmax = Math.max(1, ...counted.map(dist));
    const vmin = Math.min(vo, ...counted.filter((x) => x.finished).map(sp));
    for (const x of scored) {
      let p = x.finished ? 650 + 350 * ((sp(x) - vmin) / Math.max(1, vo - vmin)) : 600 * (dist(x) / dmax);
      p = Math.round(p);
      if (x.result.penalty) p = Math.max(0, p - Number(x.result.penalty.points || 0));
      if (x.competitor.dsq) p = 0;
      x.points = p;
    }
    const ranked = scored.filter((x) => !x.competitor.hc && !x.competitor.dsq).sort((a, b) => b.points - a.points);
    ranked.forEach((x, i) => (x.rank = i > 0 && ranked[i - 1].points === x.points ? ranked[i - 1].rank : i + 1));
    for (const x of rows) {
      if (x.status === 'did not fly') x.rankLabel = 'DNF';
      else if (x.competitor.dsq) x.rankLabel = 'DSQ';
      else if (x.competitor.hc) x.rankLabel = 'HC';
      else if (x.placeholder) x.rankLabel = '–';
      else x.rankLabel = String(x.rank);
    }
    const order = (x) => (x.rank != null ? x.rank : x.competitor.hc ? 900 : x.competitor.dsq ? 950 : x.placeholder ? 980 : 990);
    rows.sort((a, b) => order(a) - order(b) || (b.points || 0) - (a.points || 0));
    const params = {
      N: rows.filter((x) => x.status !== 'did not fly' && !x.competitor.hc).length,
      n1: counted.filter((x) => x.finished).length,
      Do: Math.round(dmax * 10) / 10,
      Vo: Math.round(vo * 10) / 10,
      Pm: 1000,
    };
    return { rows, params };
  }
  KH.score = scoreClassDay;

  function snapshot(cd, status, at) {
    const { rows, params } = scoreClassDay(cd);
    const task = Q.task(cd);
    return {
      status, at, complaintDeadline: status === 'unofficial' ? cd.complaintDeadline : '', resultsNote: cd.resultsNote,
      taskLetter: task ? task.letter : '', taskLine: task ? Q.taskLine(task) : '', taskDistance: task ? Q.taskDistance(task) : 0,
      params, edition: Q.class(cd.classId).edition, engine: KH.ENGINE,
      rows: rows.map((x) => ({ competitorId: x.competitor.id, rankLabel: x.rankLabel, points: x.points, distance: x.distance, speed: x.speed, placeholder: x.placeholder, penalty: x.result.penalty ? x.result.penalty.points : null, key: [x.status, x.points, x.distance, x.speed].join(';') })),
    };
  }
  for (const cd of S.classDays) {
    if (cd.status === 'unplanned') continue;
    const publishedAt = cd.date === KH.TODAY ? KH.TODAY + 'T10:05' : addDays(cd.date, 1) + 'T07:30';
    if (cd.status === 'unofficial') cd.complaintDeadline = cd.date === '2026-07-25' ? '2026-07-26T21:30' : '2026-07-27T21:30';
    if (cd.status === 'preliminary') cd.resultsNote = 'Flights of D7 and KX still missing.';
    const t = Q.task(cd);
    cd.publishedTask = t ? { at: cd.date + 'T10:05', letter: t.letter, line: Q.taskLine(t), distance: Q.taskDistance(t), type: t.type } : null;
    cd.published = cd.status === 'task published' ? { status: 'task published', at: publishedAt, rows: [] } : snapshot(cd, cd.status, publishedAt);
  }
  Q.classDayOn('cl2', '2026-07-27').reasons = ['Results'];
  Q.classDayOn('cl3', '2026-07-28').reasons = ['Start procedure'];
  // The 18 m start opening time moved after the task was published at 10:05.

  // ---------- archived competition ----------
  // Its scoring work is gone. Only the directory fields and the published results remain.

  // ---------- permissions ----------

  KH.session = { role: 'scorer' };
  Q.me = () => Q.user(KH.PERSONAS[KH.session.role].userId);
  Q.roleIn = (comp) => {
    const me = Q.me();
    if (me.staff) return 'staff';
    const m = Q.membership(me.id, comp.id);
    return m ? m.role : null;
  };
  Q.can = (what, comp) => {
    const role = Q.roleIn(comp);
    if (!role) return false;
    if (comp.lifecycle === 'archived') return what === 'view' || ((what === 'delete') && role !== 'scorer');
    if (comp.blocked && role !== 'staff') return false;
    if (['admin-fields', 'members', 'archive', 'delete'].includes(what)) return role === 'admin' || role === 'staff';
    if (what === 'staff') return role === 'staff';
    return true;
  };
  Q.myCompetitions = () => {
    const me = Q.me();
    if (me.staff) return S.competitions.slice();
    return S.competitions.filter((c) => Q.membership(me.id, c.id) && (!c.blocked));
  };
  Q.invitationsUsed = (userId) => S.users.filter((u) => u.inviterId === userId).length + S.invitations.filter((i) => i.inviterId === userId && i.expires > KH.NOW).length;

  // Derived work counters for a class day.
  Q.dayCounts = (cd) => {
    const results = Q.resultsOf(cd);
    const check = results.filter((r) => r.checkReasons.length).length;
    const unknown = results.filter((r) => r.status === 'unknown').length;
    const stale = Q.staleFilesOf(cd).length;
    return { results: results.length, check, unknown, stale, ok: results.length - check };
  };
  Q.deadlinePassed = (cd) => cd.status === 'unofficial' && cd.complaintDeadline && cd.complaintDeadline < KH.NOW;

  // ---------- actions ----------

  const A = (KH.act = {});
  const touch = () => S.version++;
  function markUnpublished(cd, kind) {
    if (cd && cd.published && !cd.reasons.includes(kind)) cd.reasons.push(kind);
  }
  function addCheckReason(result, text, f) {
    result.checkReasons.push({ text, file: f ? f.id : null, at: KH.NOW });
  }
  function markStale(files, reason) {
    for (const f of files) if (!f.analysis.stale.some((s) => s.reason === reason)) f.analysis.stale.push({ reason, at: KH.NOW });
  }
  function filesOfClassDay(cd) {
    return S.files.filter((f) => { const r = Q.resolve(f); return r.ok && r.classDay === cd; });
  }
  function filesOfClass(cls) {
    return S.files.filter((f) => { const r = Q.resolve(f); return r.ok && r.classDay.classId === cls.id; });
  }
  class Denied extends Error {}
  KH.Denied = Denied;
  function requireAdmin(comp, fields) {
    if (!Q.can('admin-fields', comp)) throw new Denied('403: ' + fields.join(', ') + ' can only be changed by an admin');
  }

  // Competitions
  A.createCompetition = (data) => {
    const me = Q.me();
    const comp = {
      id: newId('k'), slug: data.slug, name: data.name, organiser: data.organiser, location: data.location, country: data.country, timeZone: data.timeZone || 'Europe/Berlin',
      dates: dateRange(data.first, data.last), website: data.website || '', airfield: null, standingNotes: '', flightLevels: [], uploadPassword: Math.random().toString(36).slice(2, 8).toUpperCase(),
      openedAirspaceNames: [], lifecycle: 'live', blocked: null, createdAt: KH.NOW, createdBy: me.id,
      terms: { userId: me.id, version: 'organiser-terms-2026-11', at: KH.NOW, organiser: data.organiser }, turnpointFile: null, airspaceFile: null,
    };
    S.competitions.push(comp);
    if (!me.staff) S.memberships.push({ userId: me.id, competitionId: comp.id, role: 'admin' });
    touch();
    return comp;
  };
  A.updateCompetition = (comp, patch) => {
    const adminFields = Object.keys(patch).filter((k) => KH.ADMIN_FIELDS.includes(k) && JSON.stringify(patch[k]) !== JSON.stringify(comp[k]));
    if (adminFields.length) requireAdmin(comp, adminFields);
    if ('airfield' in patch && JSON.stringify(patch.airfield) !== JSON.stringify(comp.airfield)) {
      markStale(Q.filesOf(comp.id), 'airfield');
    }
    Object.assign(comp, patch);
    touch();
  };
  A.regeneratePassword = (comp) => {
    comp.uploadPassword = Array.from({ length: 6 }, () => 'ACDEFGHJKMNPQRTUVWXY34679'[Math.floor(Math.random() * 25)]).join('');
    touch();
  };
  A.uploadTurnpointFile = (comp) => {
    const hadTasks = S.taskCandidates.some((t) => Q.class(Q.classDay(t.classDayId).classId).competitionId === comp.id);
    comp.turnpointFile = comp.id === 'k2' ? turnpointFile('oberrhein-2026-v3.cup', KH.NOW, 34) : KH.DEMO_FILES.turnpoints();
    touch();
    return hadTasks;
  };
  A.uploadAirspaceFile = (comp) => {
    comp.airspaceFile = comp.id === 'k2' ? airspaceFile('oberrhein-2026-openair-v2.txt', KH.NOW) : KH.DEMO_FILES.airspace();
    touch();
  };
  A.toggleOpened = (comp, name) => {
    const i = comp.openedAirspaceNames.indexOf(name);
    if (i >= 0) comp.openedAirspaceNames.splice(i, 1);
    else comp.openedAirspaceNames.push(name);
    touch();
  };
  A.setDates = (comp, dates) => {
    requireAdmin(comp, ['dates']);
    comp.dates = dates.slice().sort();
    touch();
  };
  A.archive = (comp) => {
    comp.lifecycle = 'archived';
    comp.archivedAt = KH.NOW;
    comp.archive = { classes: Q.classesOf(comp.id).map((c) => ({ name: c.name, days: Q.classDaysOf(c.id).filter((d) => d.published).length, competitors: Q.competitorsOf(comp.id, c.id).length, lastStatus: 'final' })) };
    comp.uploadPassword = null;
    touch();
  };
  A.deleteCompetition = (comp) => {
    S.competitions.splice(S.competitions.indexOf(comp), 1);
    S.memberships = S.memberships.filter((m) => m.competitionId !== comp.id);
    touch();
  };
  A.blockCompetition = (comp, note) => {
    comp.blocked = { by: Q.me().id, at: KH.NOW, note };
    touch();
  };
  A.unblockCompetition = (comp) => {
    comp.blocked = null;
    touch();
  };

  // Classes
  A.createClass = (comp, data) => {
    const t = (KH.EDITIONS[data.edition].templates[data.template] || {});
    const cls = {
      id: newId('cl'), competitionId: comp.id, slug: (data.name || data.template).toLowerCase().replace(/[^a-z0-9]+/g, ''), name: data.name || data.template, colour: data.colour || '',
      edition: data.edition, handicapList: data.handicapList ?? t.handicapList ?? '', handicapScale: data.handicapScale ?? t.handicapScale ?? '', dm: Number(data.dm || t.dm || 100), d1: Number(data.d1 || t.d1 || 250),
      overrides: {}, deleted: false,
    };
    S.classes.push(cls);
    touch();
    return cls;
  };
  A.updateClass = (cls, patch) => {
    if (patch.edition && patch.edition !== cls.edition) markStale(filesOfClass(cls), 'rule set edition');
    if (patch.overrides) markStale(filesOfClass(cls), 'rule overrides');
    Object.assign(cls, patch);
    touch();
  };
  A.setClassDeleted = (cls, deleted) => {
    cls.deleted = deleted;
    touch();
  };

  // Class days
  A.touchClassDay = (cls, date) => {
    let cd = Q.classDayOn(cls.id, date);
    if (!cd) cd = newClassDay(cls, date, { overrides: {} });
    touch();
    return cd;
  };
  A.setPractice = (cd, practice) => {
    cd.practice = practice;
    touch();
  };
  A.setDayStatus = (cd, status) => {
    if (status === 'unofficial' && !cd.complaintDeadline) cd.complaintDeadline = addDays(cd.date, 1) + 'T08:00';
    cd.status = status;
    markUnpublished(cd, 'Status');
    touch();
  };
  A.updateClassDay = (cd, patch) => {
    if (patch.overrides) {
      const startKeys = ['startOpen', 'startClose', 'maxStartAlt', 'maxStartGs', 'pevStart', 'pevWait', 'pevWindow'];
      const changed = Object.keys(patch.overrides).filter((k) => String(patch.overrides[k] ?? '') !== String(cd.overrides[k] ?? ''));
      if (changed.length) {
        cd.inputVersion++;
        markStale(filesOfClassDay(cd), changed.some((k) => startKeys.includes(k)) ? 'start procedure' : 'rule overrides');
        markUnpublished(cd, changed.some((k) => startKeys.includes(k)) ? 'Start procedure' : 'Rule overrides');
      }
      patch = { ...patch, overrides: { ...cd.overrides, ...patch.overrides } };
    }
    if ('qnh' in patch && Number(patch.qnh) !== cd.qnh) {
      markStale(filesOfClassDay(cd), 'rule overrides');
    }
    Object.assign(cd, patch);
    touch();
  };
  A.addAirspaceException = (cd, name, direction) => {
    cd.airspaceExceptions.push({ name, direction });
    cd.inputVersion++;
    markStale(filesOfClassDay(cd), 'airspace');
    markUnpublished(cd, 'Airspace');
    touch();
  };
  A.removeAirspaceException = (cd, idx) => {
    cd.airspaceExceptions.splice(idx, 1);
    markStale(filesOfClassDay(cd), 'airspace');
    markUnpublished(cd, 'Airspace');
    touch();
  };
  A.addNotam = (cd) => {
    cd.notamAirspaces.push({ name: 'NOTAM ED-R ' + (300 + cd.notamAirspaces.length), file: 'notam-' + cd.date + '.txt', lower: 'GND', upper: 'FL 80' });
    markStale(filesOfClassDay(cd), 'airspace');
    markUnpublished(cd, 'Airspace');
    touch();
  };

  // Publishing a class day makes its status, task and results public together.
  A.publishClassDay = (cd, opts) => {
    if (opts && opts.status) cd.status = opts.status;
    if (opts && 'complaintDeadline' in opts) cd.complaintDeadline = opts.complaintDeadline;
    if (opts && 'resultsNote' in opts) cd.resultsNote = opts.resultsNote;
    const t = Q.task(cd);
    cd.publishedTask = t ? { at: KH.NOW, letter: t.letter, line: Q.taskLine(t), distance: Q.taskDistance(t), type: t.type } : null;
    cd.published = ['unplanned', 'task published'].includes(cd.status) ? { status: cd.status, at: KH.NOW, rows: [] } : snapshot(cd, cd.status, KH.NOW);
    cd.reasons = [];
    touch();
  };
  // What a publish dialog must confirm, derived from the data.
  Q.publishChecks = (cd, status) => {
    const out = [];
    const c = Q.dayCounts(cd);
    const resultsStatus = ['preliminary', 'unofficial', 'final'].includes(status);
    if (resultsStatus && c.check) out.push(c.check + ' results are in check');
    if (resultsStatus && c.stale) out.push(c.stale + ' files have a stale analysis: ' + Q.staleFilesOf(cd).slice(0, 4).map((f) => f.name).join(', ') + (c.stale > 4 ? '…' : ''));
    if (['unofficial', 'final'].includes(status) && c.unknown) out.push(c.unknown + ' results are still unknown and will be scored with placeholders');
    if (status === 'final' && cd.published && cd.published.status === 'final') {
      const now = snapshot(cd, 'final', KH.NOW);
      const differs = now.rows.map((r) => r.key).join('|') !== cd.published.rows.map((r) => r.key).join('|');
      if (differs) out.push('Results differ from the latest published final copy');
    }
    if (status === 'cancelled' && cd.published && cd.published.status === 'unofficial') out.push('Cancelling after unofficial results (SWO 7.9.5)');
    if (status === 'preliminary' && cd.published && cd.published.status === 'unofficial') out.push('Going back from unofficial to preliminary is defined by neither rule set');
    const t = Q.task(cd);
    if (t) out.push(...Q.taskDepartures(t, cd).map((d) => 'Task departs from the rule set: ' + d));
    return out;
  };

  // Tasks
  Q.taskDepartures = (t, cd) => {
    const cls = Q.class(cd.classId);
    const d = KH.EDITIONS[cls.edition].defaults;
    const out = [];
    const start = t.points[0];
    if (start && start.zone.kind === 'line' && Number(start.zone.length) > d.startLine) out.push('start line ' + start.zone.length + ' km is longer than ' + d.startLine + ' km');
    if (t.type === 'aat' && !t.minTaskTime) out.push('assigned area task without a minimum task time');
    return out;
  };
  Q.taskProblems = (t, cd) => {
    const comp = Q.competition(Q.class(cd.classId).competitionId);
    const out = [];
    if (t.points.length < 2) out.push('A task needs a start and a finish');
    if (!t.letter) out.push('A task candidate needs a letter to be published');
    if (comp.turnpointFile) for (const p of t.points) {
      const tp = comp.turnpointFile.turnpoints.find((x) => x.name === p.name);
      if (!tp) out.push(p.name + ' is no longer in the turnpoint file');
      else if (tp.lat !== p.lat || tp.lon !== p.lon) out.push(p.name + ' differs from the turnpoint file');
    }
    return out;
  };
  A.createCandidate = (cd, from) => {
    const cls = Q.class(cd.classId);
    const comp = Q.competition(cls.competitionId);
    const used = Q.candidates(cd.id, true).map((c) => c.letter);
    const letter = 'ABCDEFG'.split('').find((l) => !used.includes(l)) || '';
    const tps = comp.turnpointFile ? comp.turnpointFile.turnpoints : [];
    const names = from ? from.points.map((p) => p.name) : tps.length ? [tps[0].name, tps[0].name] : [];
    const c = {
      id: newId('t'), classDayId: cd.id, letter, deleted: false, type: from ? from.type : 'racing', minTaskTime: from ? from.minTaskTime : '', minFinishHeight: from ? from.minFinishHeight : '',
      dayNotes: from ? from.dayNotes : '',
      points: names.map((n, i) => {
        const t = tps.find((x) => x.name === n) || { name: n, lat: 0, lon: 0, elev: 0 };
        return { name: t.name, lat: t.lat, lon: t.lon, elev: t.elev, zone: zoneFor(i === 0 ? 'start' : i === names.length - 1 ? 'finish' : 'tp', cls.edition, from ? from.type : 'racing') };
      }),
    };
    S.taskCandidates.push(c);
    touch();
    return c;
  };
  A.importCup = (cd, which) => {
    if (which === 'blocked') return { error: 'Import blocked: waypoint "Hornisgrinde Nord" matches no turnpoint by name. Waypoint "Kandel" is 412 m from the turnpoint file entry (48.0600 N 8.0100 E vs 48.0637 N 8.0102 E).' };
    const cls = Q.class(cd.classId);
    const c = A.createCandidate(cd);
    const route = ['Hohenfels', 'Hornberg', 'Rottweil', 'Titisee', 'Hohenfels'];
    c.points = route.map((n, i) => taskPoint(n, i === 0 ? 'start' : i === route.length - 1 ? 'finish' : 'tp', cls.edition, 'racing'));
    c.points[0].zone.length = 40;
    touch();
    return { candidate: c };
  };
  function taskChanged(cand) {
    const cd = Q.classDay(cand.classDayId);
    if (cd.taskCandidateId === cand.id) {
      cd.inputVersion++;
      markStale(filesOfClassDay(cd), 'task');
      markUnpublished(cd, 'Task');
    }
  }
  A.updateCandidate = (cand, patch) => {
    Object.assign(cand, patch);
    taskChanged(cand);
    touch();
  };
  A.addTaskPoint = (cand, name, beforeFinish) => {
    const cd = Q.classDay(cand.classDayId);
    const cls = Q.class(cd.classId);
    const comp = Q.competition(cls.competitionId);
    const t = comp.turnpointFile.turnpoints.find((x) => x.name === name);
    const p = { name: t.name, lat: t.lat, lon: t.lon, elev: t.elev, zone: zoneFor('tp', cls.edition, cand.type) };
    if (beforeFinish && cand.points.length >= 2) cand.points.splice(cand.points.length - 1, 0, p);
    else cand.points.push(p);
    taskChanged(cand);
    touch();
  };
  A.removeTaskPoint = (cand, idx) => {
    cand.points.splice(idx, 1);
    taskChanged(cand);
    touch();
  };
  A.moveTaskPoint = (cand, idx, delta) => {
    const j = idx + delta;
    if (j < 0 || j >= cand.points.length) return;
    [cand.points[idx], cand.points[j]] = [cand.points[j], cand.points[idx]];
    taskChanged(cand);
    touch();
  };
  A.setZone = (cand, idx, zone) => {
    cand.points[idx].zone = { ...cand.points[idx].zone, ...zone };
    taskChanged(cand);
    touch();
  };
  A.deleteCandidate = (cand) => {
    cand.deleted = true;
    touch();
  };
  A.restoreCandidate = (cand) => {
    cand.deleted = false;
    touch();
  };
  // Publishing a candidate makes it the class day's task and publishes the class day.
  A.publishTask = (cand) => {
    const cd = Q.classDay(cand.classDayId);
    const switched = cd.taskCandidateId !== cand.id;
    cd.taskCandidateId = cand.id;
    if (cd.status === 'unplanned') cd.status = 'task published';
    if (switched) {
      cd.inputVersion++;
      markStale(filesOfClassDay(cd), 'task');
    }
    A.publishClassDay(cd);
  };
  A.withdrawTask = (cd) => {
    cd.taskCandidateId = null;
    cd.status = 'unplanned';
    markStale(filesOfClassDay(cd), 'task');
    markUnpublished(cd, 'Task');
    touch();
  };

  // Competitors and loggers
  A.saveCompetitor = (comp, data, existing) => {
    const c = existing || { id: newId('p'), competitionId: comp.id, dsq: null, deleted: false, crew: [], skill: 0.9 };
    const cls = Q.class(data.classId);
    if (existing && data.classId !== existing.classId) {
      const locked = S.results.some((r) => r.competitorId === existing.id && r.status !== 'unknown') || S.files.some((f) => { const r = Q.resolve(f); return r.ok && r.competitor === existing; });
      if (locked) throw new Denied('The class can change only while all results are unknown and no file resolves to the competitor');
    }
    if (S.competitors.some((x) => x !== existing && !x.deleted && x.classId === data.classId && x.cid === data.cid)) throw new Denied('Competition ID ' + data.cid + ' is already taken in ' + cls.name);
    const handicapFromList = cls.handicapList && KH.HANDICAP_LISTS[cls.handicapList] ? KH.HANDICAP_LISTS[cls.handicapList][data.gliderType] : null;
    Object.assign(c, {
      classId: data.classId, cid: data.cid, gliderType: data.gliderType, registration: data.registration || '', displayName: data.displayName || '',
      handicap: data.handicap !== undefined && data.handicap !== '' ? Number(data.handicap) : existing ? existing.handicap : handicapFromList, pureGlider: !!data.pureGlider, hc: !!data.hc,
    });
    if (data.crew) c.crew = data.crew;
    if (!existing) S.competitors.push(c);
    touch();
    return c;
  };
  A.deleteCompetitor = (c) => {
    if (S.results.some((r) => r.competitorId === c.id && !['unknown', 'did not fly'].includes(r.status))) throw new Denied('Only a competitor whose results are all unknown or did not fly can be deleted');
    c.deleted = true;
    for (const l of S.loggers) l.links = l.links.filter((k) => k.competitorId !== c.id);
    touch();
  };
  A.setDsq = (c, dsq) => {
    c.dsq = dsq;
    for (const cd of S.classDays.filter((d) => d.classId === c.classId)) markUnpublished(cd, 'Results');
    touch();
  };
  A.saveLogger = (comp, data, existing) => {
    const l = existing || { id: newId('l'), competitionId: comp.id, links: [] };
    const settingsChanged = existing && ['enl', 'mop', 'cur', 'minDuration'].some((k) => Number(data[k]) !== existing[k]);
    Object.assign(l, { manufacturer: data.manufacturer, serial: data.serial, enl: Number(data.enl || 500), mop: Number(data.mop || 500), cur: Number(data.cur || 20), minDuration: Number(data.minDuration || 30) });
    if (!existing) S.loggers.push(l);
    if (settingsChanged) markStale(S.files.filter((f) => f.loggerId === l.id), 'logger settings');
    touch();
    return l;
  };
  // Link edits move files between results: files arriving add check reasons, and newly resolved files go stale.
  function moveAware(fn) {
    const before = new Map(S.files.map((f) => [f.id, Q.resolve(f)]));
    fn();
    for (const f of S.files) {
      if (f.deleted) continue;
      const a = before.get(f.id);
      const b = Q.resolve(f);
      const ra = a && a.ok ? a.result : null;
      const rb = b.ok ? b.result : null;
      if (ra === rb) continue;
      if (ra) {
        addCheckReason(ra, 'File left', f);
        if (ra.scoredFileId === f.id) {
          ra.scoredFileId = null;
          ra.status = 'unknown';
        }
        markUnpublished(a.classDay, 'Results');
      }
      if (rb) {
        addCheckReason(rb, 'File arrived', f);
        markStale([f], 'class day');
      }
    }
  }
  Q.previewLinkMove = (logger, link) => {
    const files = S.files.filter((f) => f.loggerId === logger.id && !f.deleted);
    return files.map((f) => {
      const a = Q.resolve(f);
      const saved = logger.links.slice();
      logger.links = logger.links.concat([link]);
      const b = Q.resolve(f);
      logger.links = saved;
      return { file: f, from: a.ok ? a.competitor.cid + ' ' + Q.dayLabel(a.classDay.classId, a.classDay.date) : 'unresolved', to: b.ok ? b.competitor.cid + ' ' + Q.dayLabel(b.classDay.classId, b.classDay.date) : 'unresolved', moves: (a.ok ? a.result : null) !== (b.ok ? b.result : null) };
    }).filter((x) => x.moves);
  };
  A.addLink = (logger, link) => {
    moveAware(() => {
      if (link.role === 'primary') {
        for (const l of S.loggers) {
          if (l === logger) continue;
          const cur = Q.linkOn(l, link.from || '0000');
          if (cur && cur.competitorId === link.competitorId && cur.role === 'primary') l.links.push({ competitorId: link.competitorId, from: link.from, role: 'secondary' });
        }
      }
      logger.links.push(link);
    });
    touch();
  };
  A.removeLink = (logger, idx) => {
    moveAware(() => logger.links.splice(idx, 1));
    touch();
  };
  A.setLinkRole = (logger, idx, role) => {
    logger.links[idx].role = role;
    markStale(S.files.filter((f) => f.loggerId === logger.id), 'logger link role');
    touch();
  };

  // Files
  A.setDateOverride = (f, date) => {
    moveAware(() => (f.dateOverride = date));
    touch();
  };
  A.deleteFile = (f) => {
    const res = Q.resolve(f);
    if (res.ok && res.result.scoredFileId === f.id) throw new Denied('The scored file cannot be deleted. Pick another scored file first.');
    f.deleted = true;
    if (res.ok) {
      addCheckReason(res.result, 'File left', f);
      markUnpublished(res.classDay, 'Results');
    }
    touch();
  };
  A.setFileField = (f, patch) => {
    Object.assign(f, patch);
    touch();
  };
  A.rerun = (f) => {
    runAnalysis(f);
    touch();
  };
  A.scorerUpload = (comp, loggerId, date) => {
    const logger = Q.logger(loggerId);
    const link = Q.linkOn(logger, date);
    const c = link ? Q.competitor(link.competitorId) : S.competitors[0];
    const f = makeFile(logger, date, perfFor(rng(Date.now() & 0xffff), c, date), { uploadedBy: 'scorer', uploadedAt: KH.NOW, suffix: String(Date.now()) });
    runAnalysis(f, { silent: true });
    const res = Q.resolve(f);
    if (res.ok) {
      addCheckReason(res.result, 'File arrived', f);
      markUnpublished(res.classDay, 'Results');
    }
    touch();
    return f;
  };

  // Overrides feed the analysis of the file, which reruns at once.
  A.setOverride = (f, kind, value) => {
    if (value === null || value === undefined) delete f.overrides[kind];
    else f.overrides[kind] = value;
    runAnalysis(f);
    touch();
  };
  A.creditTurnpoint = (f, idx) => {
    f.overrides.tpCredits = (f.overrides.tpCredits || []).concat([idx]);
    runAnalysis(f);
    touch();
  };
  A.clearOverrides = (f) => {
    f.overrides = {};
    runAnalysis(f);
    touch();
  };

  // Results
  A.setScoredFile = (result, f) => {
    result.scoredFileId = f.id;
    result.status = 'scored file';
    if (f.analysis.stale.length === 0) addCheckReason(result, 'Scored file output changed (scored file chosen)', f);
    markUnpublished(Q.classDay(result.classDayId), 'Results');
    touch();
  };
  A.setResultStatus = (result, status) => {
    result.status = status;
    if (status !== 'scored file') result.scoredFileId = null;
    if (status === 'manual result' && !result.manual) result.manual = { startTime: '', finished: false, finishTime: '', distance: '', landing: '' };
    markUnpublished(Q.classDay(result.classDayId), 'Results');
    touch();
  };
  A.saveManual = (result, m) => {
    result.manual = m;
    result.status = 'manual result';
    result.scoredFileId = null;
    markUnpublished(Q.classDay(result.classDayId), 'Results');
    touch();
  };
  A.review = (result, seenCount) => {
    result.checkReasons = result.checkReasons.slice(seenCount === undefined ? result.checkReasons.length : seenCount);
    touch();
  };
  A.setPenalty = (result, penalty) => {
    result.penalty = penalty;
    markUnpublished(Q.classDay(result.classDayId), 'Penalties');
    touch();
  };
  A.setResultField = (result, patch) => {
    Object.assign(result, patch);
    if ('handicapOverride' in patch || 'publicRemark' in patch) markUnpublished(Q.classDay(result.classDayId), 'Results');
    touch();
  };

  // Members and invitations
  A.invite = (comp, email, role) => {
    const me = Q.me();
    const existing = S.users.find((u) => u.email === email && !u.deleted);
    if (existing) {
      if (comp && Q.membership(existing.id, comp.id)) throw new Denied(email + ' is already a member');
      if (!comp) throw new Denied(email + ' already has a login');
      S.competitionInvitations.push({ id: newId('ci'), senderId: me.id, inviteeId: existing.id, competitionId: comp.id, role, sentAt: KH.NOW, expires: addDays(KH.TODAY, 7) + 'T17:42' });
      touch();
      return 'competition invitation';
    }
    if (!me.staff && Q.invitationsUsed(me.id) >= me.invitationLimit) throw new Denied('Invitation limit reached (' + me.invitationLimit + ')');
    S.invitations.push({ id: newId('i'), inviterId: me.id, email, competitionId: comp ? comp.id : null, role: comp ? role : null, sentAt: KH.NOW, expires: addDays(KH.TODAY, 7) + 'T17:42' });
    touch();
    return 'invitation';
  };
  A.revokeInvitation = (id) => {
    S.invitations = S.invitations.filter((i) => i.id !== id);
    S.competitionInvitations = S.competitionInvitations.filter((i) => i.id !== id);
    touch();
  };
  A.acceptCompetitionInvitation = (id) => {
    const ci = S.competitionInvitations.find((i) => i.id === id);
    S.memberships.push({ userId: ci.inviteeId, competitionId: ci.competitionId, role: ci.role });
    A.revokeInvitation(id);
  };
  function adminCount(compId) {
    return S.memberships.filter((m) => m.competitionId === compId && m.role === 'admin').length;
  }
  A.setRole = (comp, userId, role) => {
    const m = Q.membership(userId, comp.id);
    if (m.role === 'admin' && role !== 'admin' && adminCount(comp.id) === 1) throw new Denied('The last admin cannot be downgraded');
    m.role = role;
    touch();
  };
  A.removeMember = (comp, userId) => {
    const m = Q.membership(userId, comp.id);
    if (m.role === 'admin' && adminCount(comp.id) === 1) throw new Denied('The last admin cannot leave or be removed');
    S.memberships.splice(S.memberships.indexOf(m), 1);
    touch();
  };

  // Staff
  A.blockUser = (u, note) => {
    u.blocked = { by: Q.me().id, at: KH.NOW, note };
    S.invitations = S.invitations.filter((i) => i.inviterId !== u.id);
    touch();
  };
  A.unblockUser = (u) => {
    u.blocked = null;
    touch();
  };
  A.setInvitationLimit = (u, n) => {
    u.invitationLimit = n;
    touch();
  };
  A.softDeleteUser = (u) => {
    u.deleted = true;
    u.email = '';
    u.name = '';
    u.staff = false;
    S.memberships = S.memberships.filter((m) => m.userId !== u.id);
    S.invitations = S.invitations.filter((i) => i.inviterId !== u.id);
    S.competitionInvitations = S.competitionInvitations.filter((i) => i.inviterId !== u.id && i.inviteeId !== u.id);
    touch();
  };
})();
