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
    { id: 'cl1', slug: 'club', name: 'Club', edition: 'DAeC SWO 2026', template: 'Club', colour: '#888888', speed: 88 },
    { id: 'cl2', slug: 'standard', name: 'Standard', edition: 'DAeC SWO 2026', template: 'Standard', colour: '#555555', speed: 97 },
    { id: 'cl3', slug: '18m', name: '18 m', edition: 'FAI Annex A 2025a', template: '18 m', colour: '#222222', speed: 108 },
  ];
  for (const def of CLASS_DEFS) {
    const t = KH.EDITIONS[def.edition].templates[def.template];
    S.classes.push({
      id: def.id, competitionId: 'k2', slug: def.slug, name: def.name, colour: def.colour, edition: def.edition,
      handicapList: t.handicapList, handicapScale: t.handicapScale, dm: t.dm, d1: t.d1,
      overrides: def.slug === 'standard' ? { maxAltitude: 'FL 95', startOpen: '12:30', maxStartAlt: 1500, pevStart: 'yes', pevWait: 5, pevWindow: 5 }
        : def.slug === 'club' ? { maxAltitude: 'FL 95', towAltitude: 1200, startOpen: '12:30', maxStartAlt: 1500 }
        : { maxAltitude: 'FL 100', earthModel: 'WGS84', startOpen: '12:30', maxStartGs: 150 },
      deleted: false, baseSpeed: def.speed,
    });
  }

  const GLIDERS = {
    club: ['LS4', 'Std Cirrus', 'ASW 19', 'DG-100', 'Pegase', 'ASW 20', 'Discus', 'LS1-f', 'DG-300', 'Astir CS'],
    standard: ['LS8-a', 'Discus 2a', 'ASW 28', 'LAK-19', 'Discus 2c FES', 'LS8-st'],
    '18m': ['ASG 29E', 'Ventus 3T', 'JS3-18', 'LS10-st', 'Antares 18T', 'ASG 29Es'],
  };
  const MOTOR = /E$|T$|Es$|-st|FES|Antares/;

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
  const usedNames = new Set();
  function person(r) {
    for (;;) {
      const p = { first: pick(r, FIRST), last: pick(r, LAST) };
      if (usedNames.has(p.first + p.last)) continue;
      usedNames.add(p.first + p.last);
      return { ...p, club: pick(r, CLUBS), country: pick(r, COUNTRIES), igcId: r() < 0.7 ? String(Math.floor(between(r, 1000, 9999))) : '' };
    }
  }
  function registration(r, motor) {
    const L = 'ABCDEFGHIJKLMNOPRSTUVWXYZ';
    return motor ? 'D-K' + [0, 1, 2].map(() => pick(r, L.split(''))).join('') : 'D-' + Math.floor(between(r, 1000, 9999));
  }

  let cn = 0;
  for (const cls of S.classes) {
    for (let i = 0; i < 25; i++) {
      const glider = pick(r0, GLIDERS[cls.slug]);
      const crewSize = cls.slug === 'club' && i === 7 ? 2 : 1;
      const crew = [];
      for (let k = 0; k < crewSize; k++) crew.push(person(r0));
      const id = 'p' + ++cn;
      const handicap = cls.handicapList ? KH.HANDICAP_LISTS[cls.handicapList][glider] || 100 : null;
      S.competitors.push({
        id, competitionId: 'k2', classId: cls.id, cid: compId(r0), gliderType: glider, registration: registration(r0, MOTOR.test(glider)),
        displayName: crewSize > 1 ? 'Team ' + crew[0].club.split(' ').pop() : '', handicap,
        pureGlider: !MOTOR.test(glider), hc: cls.slug === 'standard' && i === 24, dsq: null, deleted: false, crew,
        // Raw speed follows the glider's performance, so handicapped classes even out after scoring.
        skill: between(r0, 0.9, 1.0) * (handicap ? (cls.handicapScale === '100' ? handicap / 100 : handicap) : 1),
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
  KH.ZONES = {
    Keyhole: { kind: 'sector', preset: 'Keyhole', r1: 10, a1: 45, r2: 0.5, a2: 180, orientation: 'symmetric' },
    'Cylinder 0.5 km': { kind: 'sector', preset: 'Cylinder', r1: 0.5, a1: 180, r2: 0, a2: 0, orientation: 'symmetric' },
    'Cylinder 1 km': { kind: 'sector', preset: 'Cylinder', r1: 1, a1: 180, r2: 0, a2: 0, orientation: 'symmetric' },
    'Sector 90°': { kind: 'sector', preset: 'Sector', r1: 20, a1: 45, r2: 0, a2: 0, orientation: 'symmetric' },
    'Cylinder 10 km': { kind: 'sector', preset: 'Cylinder', r1: 10, a1: 180, r2: 0, a2: 0, orientation: 'symmetric' },
    'Cylinder 20 km': { kind: 'sector', preset: 'Cylinder', r1: 20, a1: 180, r2: 0, a2: 0, orientation: 'symmetric' },
    'Cylinder 3 km': { kind: 'cylinder', preset: 'Cylinder', r1: 3, a1: 180, r2: 0, a2: 0, orientation: 'symmetric' },
    'Cylinder 5 km': { kind: 'cylinder', preset: 'Cylinder', r1: 5, a1: 180, r2: 0, a2: 0, orientation: 'symmetric' },
    'Line 1 km': { kind: 'line', length: 1 },
  };
  // Effective rule values of a class day: edition defaults, then class overrides, then class day overrides.
  function effective(cd, cls) {
    cls = cls || S.classes.find((c) => c.id === cd.classId);
    const out = { ...KH.EDITIONS[cls.edition].defaults };
    for (const layer of [cls.overrides, cd ? cd.overrides : {}]) for (const [k, v] of Object.entries(layer || {})) if (v !== '' && v != null) out[k] = v;
    return out;
  }
  KH.effective = effective;
  function zoneFor(role, edition, type, eff) {
    const d = eff || KH.EDITIONS[edition].defaults;
    if (role === 'start') return { kind: 'line', length: Number(d.startLine) };
    if (role === 'finish') return { ...KH.ZONES[d.finishZone] };
    return { ...KH.ZONES[type === 'aat' ? d.aatZone : d.tpZone] };
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
    const ri = routeIdx++;
    for (const cls of S.classes) {
      let status = plan.status;
      if (cls.slug === 'standard' && plan.std) status = plan.std;
      const cd = newClassDay(cls, date, { practice: !!plan.practice, status, qnh: Math.round(between(r1, 1009, 1022)) });
      if (plan.noTask) continue;
      const route = ROUTES[(ri + (cls.slug === '18m' ? 3 : 0)) % ROUTES.length];
      const type = cls.slug === '18m' && !plan.practice && ri % 2 === 0 ? 'aat' : 'racing';
      const names = cls.slug === 'club' && route.length > 4 ? route.slice(0, -2).concat(route.slice(-1)) : route;
      const a = makeCandidate(cd, cls, 'A', type, names);
      if (r1() < 0.5) makeCandidate(cd, cls, 'B', type, [route[0], route[1], route[route.length - 2], route[route.length - 1]]);
      cd.taskCandidateId = a.id;
    }
  }
  // Tomorrow: Club has candidates prepared, still unplanned.
  {
    const club = S.classes[0];
    const cd = newClassDay(club, '2026-07-29', { qnh: 1018 });
    makeCandidate(cd, club, 'A', 'racing', ['Hohenfels', 'Freudenstadt', 'Villingen', 'Hohenfels']);
    makeCandidate(cd, club, 'B', 'racing', ['Hohenfels', 'Hornberg', 'Titisee', 'Hohenfels']);
    makeCandidate(cd, club, '', 'aat', ['Hohenfels', 'Wolfach', 'Neustadt', 'Hohenfels'], { minTaskTime: '02:30' });
  }
  // Day 3 was cancelled for weather before any task was published.

  // ---------- queries ----------

  // Lookups are cached while a page renders, because rendering does not change the data. Actions run uncached.
  let memo = null;
  KH.memoize = (fn) => {
    memo = { byId: new Map(), results: null, filesByResult: null };
    try {
      return fn();
    } finally {
      memo = null;
    }
  };
  const byId = (list, id) => {
    if (!memo) return list.find((x) => x.id === id);
    let index = memo.byId.get(list);
    if (!index) memo.byId.set(list, (index = new Map(list.map((x) => [x.id, x]))));
    return index.get(id);
  };
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
    const key = classDayId + ' ' + competitorId;
    if (memo && !memo.results) memo.results = new Map(S.results.map((x) => [x.classDayId + ' ' + x.competitorId, x]));
    let r = memo ? memo.results.get(key) : S.results.find((x) => x.classDayId === classDayId && x.competitorId === competitorId);
    if (!r) {
      r = { id: newId('r'), classDayId, competitorId, status: 'unknown', scoredFileId: null, checkReasons: [], manual: null, handicapOverride: '', publicRemark: '', internalRemark: '', penalty: null };
      S.results.push(r);
      if (memo) memo.results.set(key, r);
    }
    return r;
  };
  Q.filesOfResult = (result) => {
    if (memo) {
      if (!memo.filesByResult) {
        memo.filesByResult = new Map();
        for (const f of S.files) {
          if (f.deleted) continue;
          const res = Q.resolve(f);
          if (!res.ok) continue;
          if (!memo.filesByResult.has(res.result)) memo.filesByResult.set(res.result, []);
          memo.filesByResult.get(res.result).push(f);
        }
      }
      return (memo.filesByResult.get(result) || []).slice();
    }
    return S.files.filter((f) => {
      if (f.deleted) return false;
      const res = Q.resolve(f);
      return res.ok && res.result === result;
    });
  };
  Q.resultsOf = (cd) => Q.competitorsOf(Q.class(cd.classId).competitionId, cd.classId).map((c) => Q.resultFor(cd.id, c.id));
  Q.unresolvedFiles = (compId) => Q.filesOf(compId).filter((f) => !f.deleted && !Q.resolve(f).ok);
  Q.staleFilesOf = (cd) => S.files.filter((f) => !f.deleted && f.analysis.stale.length && (() => { const r = Q.resolve(f); return r.ok && r.classDay === cd; })());
  Q.reviewStatus = (result) => (result.checkReasons.length ? 'check' : 'OK');

  // ---------- fake flight analysis ----------

  const RULES = {
    'near-miss': { 'DAeC SWO 2026': 'SWO 7.5', 'FAI Annex A 2025a': 'Annex A 7.6.5' },
    'finish-height': { 'FAI Annex A 2025a': 'Annex A 7.8.2a' },
    'start-altitude': { 'FAI Annex A 2025a': 'Annex A 7.4.3.5' },
    secondary: { 'FAI Annex A 2025a': 'Annex A 5.3g' },
    'secondary-pev': { 'DAeC SWO 2026': 'SWO 5.9.4, 7.3.5', 'FAI Annex A 2025a': 'Annex A 5.3g' },
  };
  KH.ruleRef = (kind, edition) => (RULES[kind] && RULES[kind][edition]) || '';

  // Deterministic analysis from the file's seed, its class day inputs and its overrides.
  // Task-dependent overrides whose target no longer matches are dropped with a warning.
  function analyse(f) {
    const res = Q.resolve(f);
    const log = [];
    const entry = (level, time, text, extra) => log.push({ level, time, text, ...extra });
    const p = f.perf;
    const logger = Q.logger(f.loggerId);
    const base = { output: null, log, candidates: [], suggestions: [], landing: null };
    if (p.broken) {
      entry('error', '', 'File failed to parse: no usable fixes after line 212 (B records truncated)', { kind: 'parse' });
      return base;
    }
    entry('info', '', 'File parsed: ' + p.fixes + ' fixes, 1 s interval');
    if (f.gRecord === 'valid') entry('info', '', 'G record valid (validator vali-' + logger.manufacturer.toLowerCase() + ')');
    if (f.gRecord === 'invalid') entry('warning', '', 'G record not valid (validator vali-' + logger.manufacturer.toLowerCase() + ' rejected the file)', { kind: 'g-record' });
    if (f.gRecord === 'none') entry('warning', '', 'G record not checked: no supported validator for ' + logger.manufacturer, { kind: 'g-record' });
    if (f.recordedDate !== f.flightDate) entry('warning', '', 'Recorded date ' + f.recordedDate + ' corrected to ' + f.flightDate + ' (GPS week number rollover)', { kind: 'date' });
    const takeoff = secs(p.takeoff);
    entry('info', hms(takeoff), 'Take-off');
    if (p.selfLaunch) entry('info', hms(takeoff), 'Self-launch: engine run ' + hms(takeoff) + '–' + hms(takeoff + 400) + ', 215 m to ' + (700 + p.release % 200) + ' m MSL');
    else entry('info', hms(takeoff + 360), 'Release (aerotow) at ' + p.release + ' m MSL');
    if (p.engineTest) entry('info', hms(takeoff + 900), 'Engine test: 40 s, ' + (p.release + 380) + ' m to ' + (p.release + 350) + ' m MSL, 3.1 km from take-off');
    if (!res.ok) {
      entry('warning', '', 'No task analysis: file is unresolved. ' + res.reason, { kind: 'unresolved' });
      base.landing = takeoff + 5 * 3600;
      return base;
    }
    const cd = res.classDay;
    const cls = Q.class(cd.classId);
    const task = Q.task(cd);
    base.landing = takeoff + 5 * 3600;
    if (!task) {
      entry('info', '', 'Waiting for a published task on ' + Q.dayLabel(cd.classId, cd.date));
      return base;
    }
    const eff = effective(cd, cls);
    const rr = rng(f.seed ^ hash(task.id + ':' + cd.inputVersion));
    const ov = f.overrides;

    // Task-dependent overrides stay only where their target still matches.
    const dropped = [];
    if (ov.tpCredits) ov.tpCredits = ov.tpCredits.filter((c) => {
      const pt = task.points[c.idx + 1];
      const keep = pt && c.idx + 1 < task.points.length - 1 && pt.name === c.name;
      if (!keep) dropped.push('turnpoint credit ' + (c.idx + 1) + ' ' + c.name);
      return keep;
    });
    if (ov.aatPins) for (const k of Object.keys(ov.aatPins)) {
      const pt = task.points[Number(k) + 1];
      if (!pt || task.type !== 'aat' || pt.name !== ov.aatPins[k].name) {
        dropped.push('pinned fix ' + ov.aatPins[k].time + ' in ' + ov.aatPins[k].name);
        delete ov.aatPins[k];
      }
    }
    if (ov.finishCredit && task.points[task.points.length - 1].name !== ov.finishCredit.name) {
      dropped.push('finish credit at ' + ov.finishCredit.name);
      delete ov.finishCredit;
    }

    const startOpen = secs((eff.startOpen || '12:30') + ':00');
    const maxAlt = Number(eff.maxStartAlt) || null;
    const maxGs = Number(eff.maxStartGs) || null;
    entry('debug', hms(startOpen - 600 - rr() * 900), 'Start line crossing before the start opens');
    entry('debug', hms(startOpen - 200 - rr() * 300), 'Start line crossing before the start opens');

    const nCand = 1 + Math.floor(rr() * 3);
    const cands = [];
    let t = Math.max(startOpen + 240, takeoff + 2400) + rr() * 1500;
    for (let i = 0; i < nCand; i++) {
      const alt = maxAlt && rr() < 0.03 ? Math.round(maxAlt + 20 + rr() * 90) : Math.round((maxAlt || 1600) - 260 + rr() * 240);
      const gs = maxGs && rr() < 0.03 ? Math.round(maxGs + 4 + rr() * 15) : Math.round(112 + rr() * 30);
      const pev = eff.pevStart === 'yes' ? (rr() < 0.04 ? 'outside window' : 'in window') : '';
      const breaches = [];
      if (maxAlt && alt > maxAlt) breaches.push('above maximum start altitude (' + alt + ' m > ' + maxAlt + ' m)');
      if (maxGs && gs > maxGs) breaches.push('above maximum start ground speed (' + gs + ' km/h > ' + maxGs + ' km/h)');
      if (pev === 'outside window') breaches.push('outside the PEV start window');
      if (p.restart && i === 0) breaches.push('within 20 min after an in-flight restart');
      cands.push({ time: hms(t), alt, gs, pev, breaches, valid: breaches.length === 0, score: rr() });
      t += 400 + rr() * 1300;
    }
    const valid = cands.filter((c) => c.valid);
    const auto = (valid.length ? valid : cands).reduce((a, b) => (b.score > a.score ? b : a));
    auto.auto = true;
    let inUse = auto;
    let freeStart = null;
    if (ov.start && ov.start.kind === 'candidate') {
      const c = cands.find((x) => x.time === ov.start.time);
      if (c) inUse = c;
      else {
        dropped.push('start at ' + ov.start.time + ' (no crossing at that time any more)');
        delete ov.start;
      }
    }
    if (ov.start && ov.start.kind === 'free') freeStart = ov.start.time;
    inUse.inUse = !freeStart;
    for (const d of dropped) entry('warning', '', 'Override dropped after the task changed: ' + d + '. Enter it again if it still applies.', { kind: 'dropped' });
    for (const c of cands) {
      entry(c.valid ? 'info' : 'warning', c.time, 'Start candidate' + (c.auto ? ' (automatic choice)' : '') + (c.inUse ? ' (in use)' : '') + ': ' + c.alt + ' m MSL, ' + c.gs + ' km/h' + (c.pev ? ', PEV ' + c.pev : '') + (c.breaches.length ? ', ' + c.breaches.join(', ') : ''), { kind: 'start', candidate: c.time, rule: c.breaches.some((b) => b.includes('altitude')) ? KH.ruleRef('start-altitude', cls.edition) : '' });
    }
    if (!freeStart && !inUse.valid && valid.length) entry('warning', inUse.time, 'Another candidate avoids a start finding: ' + valid[0].time, { kind: 'start' });
    const betterProblem = cands.find((c) => !c.valid && c.score > inUse.score);
    if (!freeStart && inUse.valid && betterProblem) entry('info', betterProblem.time, 'A problematic candidate scores higher: ' + betterProblem.time + ' (' + betterProblem.breaches.join(', ') + '). Its penalty may still leave the pilot better off.');
    if (!valid.length) entry('warning', '', 'No valid start. The automatic choice has a breach.', { kind: 'start' });
    if (inUse.breaches.length && !freeStart) entry('warning', inUse.time, 'The start in use has a breach: ' + inUse.breaches.join(', '), { kind: 'start' });
    if (freeStart) entry('info', freeStart, 'Start time set by override');

    const startT = secs(freeStart || inUse.time);
    const taskDist = Q.taskDistance(task);
    const comp = res.competitor;
    const speed = (cls.baseSpeed || 95) * comp.skill * (0.94 + rr() * 0.1);
    let duration;
    let flyDist;
    if (task.type === 'aat') {
      duration = secs(task.minTaskTime + ':00') + rr() * 1500;
      flyDist = Math.round(((speed * duration) / 3600) * 10) / 10;
      if (ov.aatPins) for (const k of Object.keys(ov.aatPins)) flyDist = Math.round(flyDist * (1 + ((hash(ov.aatPins[k].time) % 40) - 20) / 1000) * 10) / 10;
    } else {
      flyDist = taskDist;
      duration = (taskDist / speed) * 3600;
    }
    let finished = p.finishRoll < 0.86;
    const legs = [];
    for (let i = 1; i < task.points.length; i++) legs.push(haversine(task.points[i - 1], task.points[i]));
    const total = legs.reduce((a, b) => a + b, 0) || 1;
    const cum = legs.map((_, i) => legs.slice(0, i + 1).reduce((a, b) => a + b, 0) / total);
    const tps = task.points.slice(1, -1);
    const credited = (ov.tpCredits || []).map((c) => c.idx);
    let frac = finished ? 1 : p.outlandingFrac;
    let missIdx = -1;
    if (!finished && p.nearMiss && task.type !== 'aat') {
      missIdx = tps.findIndex((_, i) => cum[i] > frac);
      if (missIdx < 0) missIdx = tps.length - 1;
      if (credited.includes(missIdx)) {
        finished = true;
        frac = 1;
      }
    }
    tps.forEach((pt, i) => {
      const tt = hms(startT + cum[i] * duration);
      if (frac >= cum[i] || credited.includes(i)) entry('info', tt, (task.type === 'aat' ? 'Assigned area ' : 'Turnpoint ') + (i + 1) + ' ' + pt.name + ' reached' + (credited.includes(i) ? ' (credited by override)' : ''));
      else if (i === missIdx) entry('warning', hms(startT + Math.min(cum[i], frac) * duration - 300), 'Turnpoint ' + (i + 1) + ' ' + pt.name + ' missed by 0.' + (2 + Math.floor(rr() * 3)) + ' km, closest fix ' + hms(startT + Math.min(cum[i], frac) * duration - 300) + ' at ' + (pt.lat + 0.004).toFixed(4) + ' N ' + (pt.lon - 0.003).toFixed(4) + ' E', { kind: 'near-miss', tpIndex: i, rule: KH.ruleRef('near-miss', cls.edition) });
      if (task.type === 'aat' && ov.aatPins && ov.aatPins[i]) entry('info', ov.aatPins[i].time, 'Assigned area ' + (i + 1) + ' ' + pt.name + ': pinned fix ' + ov.aatPins[i].time + ' (override)');
    });
    if (finished && p.finishMiss && !ov.finishCredit) {
      finished = false;
      frac = cum[cum.length - 2] + (1 - cum[cum.length - 2]) * 0.97;
      entry('warning', hms(startT + duration), 'Finish ' + task.points[task.points.length - 1].name + ' missed by 0.4 km, closest fix ' + hms(startT + duration), { kind: 'finish-miss' });
    }
    if (ov.finishCredit) entry('info', hms(startT + duration), 'Finish credited by override');
    if (p.engineAfterStart) {
      const et = hms(startT + duration * 0.62);
      base.suggestions.push({ kind: 'flight end', time: et, text: 'Engine run after the start' });
      entry('warning', et, 'Engine run after the start: ' + et + '–' + hms(secs(et) + 480) + ', 820 m to 1150 m MSL, 41 km from take-off', { kind: 'engine', suggestion: { kind: 'flight end', time: et } });
    }
    if (p.airspace) {
      const at = hms(startT + duration * Math.min(p.airspace, frac * 0.9));
      entry('warning', at, 'Entry into closed airspace ED-R 207: ' + at + '–' + hms(secs(at) + 95) + ', deepest 180 m', { kind: 'airspace', suggestion: { kind: 'flight end', time: at } });
      base.suggestions.push({ kind: 'flight end', time: at, text: 'Airspace entry ED-R 207' });
    }
    if (p.checkFail) entry('error', '', 'Check failed: airspace check for ED-R 132 could not run, terrain elevation missing for 14 fixes. The result is scored from the checks that worked.', { kind: 'check' });
    let distance;
    let finishT = null;
    let finishHeight = null;
    const flightEnd = ov.flightEnd || null;
    if (flightEnd) {
      finished = false;
      const fr = Math.min(0.97, Math.max(0.15, (secs(flightEnd) - startT) / duration));
      distance = Math.round(flyDist * fr * 0.97 * 10) / 10;
      entry('info', flightEnd, 'Flight end set by override. Scored up to ' + (cls.edition.startsWith('DAeC') ? 'the best performance fix.' : 'the entry or engine start position.'));
    } else if (finished) {
      distance = flyDist;
      finishT = ov.finishTime || hms(startT + duration);
      const min = Number(task.minFinishHeight) || 0;
      finishHeight = Math.round(min && rr() < 0.02 ? min - 15 - rr() * 40 : min ? min + 30 + rr() * 160 : 300 + rr() * 220);
      entry('info', finishT, 'Finish at ' + finishHeight + ' m MSL' + (ov.finishTime ? ' (time set by override)' : ''));
      if (min && finishHeight < min) entry('warning', finishT, 'Finish below minimum height: ' + finishHeight + ' m MSL < ' + min + ' m MSL', { kind: 'finish-height', rule: KH.ruleRef('finish-height', cls.edition) });
    } else {
      distance = Math.round(flyDist * frac * 10) / 10;
    }
    const landing = finished ? secs(finishT) + 240 + rr() * 500 : Math.max(startT + duration * Math.min(frac, 1) + 600, flightEnd ? secs(flightEnd) + 600 : 0);
    base.landing = landing;
    entry('info', hms(landing), finished ? 'Landing at Hohenfels' : 'Landing (outlanding) ' + Math.round(distance) + ' km into the task');
    if (p.gap) entry('warning', hms(startT + duration * 0.4), 'Fix interval above the rule set limit: 47 s gap', { kind: 'gap' });
    log.sort((a, b) => ((a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0));
    const time = finishT ? secs(finishT) - startT : null;
    const timeForSpeed = task.type === 'aat' && time ? Math.max(time, secs(task.minTaskTime + ':00')) : time;
    base.candidates = cands;
    base.output = {
      start: freeStart || inUse.time, finished, finish: finishT, landing: hms(landing), distance, finishHeight,
      time: time ? hms(time) : null, speed: finished ? Math.round((distance / timeForSpeed) * 3600 * 10) / 10 : null, flightEnd,
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
      id: newId('f'), loggerId: logger.id, sha: seed.toString(16).padStart(8, '0') + 'a3c1e9f0', uploadedAt: '',
      uploadedBy: 'pilot', recordedDate: date, flightDate: date, dateOverride: '', suggestedClass: '', suggestedCid: '', gRecord: logger.manufacturer === 'XCS' ? 'none' : 'valid',
      private: false, deleted: false, internalRemark: '', overrides: {}, seed, perf, analysis: null, name: '',
      ...extra,
    };
    f.name = date.slice(2).replace(/-/g, '') + '_' + logger.manufacturer + '_' + logger.serial + '.igc';
    S.files.push(f);
    return f;
  }
  function perfFor(r, comp) {
    const motor = !comp.pureGlider;
    return {
      takeoff: hms(secs('11:30:00') + r() * 3000), fixes: Math.floor(between(r, 17000, 26000)), release: Math.round(between(r, 560, 760)),
      finishRoll: r(), outlandingFrac: between(r, 0.35, 0.92), nearMiss: r() < 0.08, finishMiss: r() < 0.02,
      selfLaunch: motor && r() < 0.5, engineTest: motor && r() < 0.3, engineAfterStart: motor && r() < 0.04,
      restart: r() < 0.01, airspace: r() < 0.025 ? between(r, 0.2, 0.8) : 0, gap: r() < 0.02, uploadDelay: Math.round(between(r, 12, 110)),
    };
  }
  // Uploads follow landing. Analysis runs at upload.
  function analyseAtUpload(f, offsetMin) {
    runAnalysis(f, { silent: true });
    if (!f.uploadedAt) f.uploadedAt = f.flightDate + 'T' + hms(f.analysis.landing + (f.perf.uploadDelay + (offsetMin || 0)) * 60).slice(0, 5);
    f.analysis.ranAt = f.uploadedAt;
  }
  function dropFile(f) {
    S.files.splice(S.files.indexOf(f), 1);
  }

  const r2 = rng(4242);
  const MISSING = {};
  for (const cd of S.classDays.filter((d) => d.status !== 'unplanned' && d.status !== 'cancelled')) {
    const cls = Q.class(cd.classId);
    const isToday = cd.date === KH.TODAY;
    const isYesterday = cd.date === '2026-07-27';
    const comps = Q.competitorsOf('k2', cls.id);
    comps.forEach((comp, idx) => {
      const result = Q.resultFor(cd.id, comp.id);
      if (r2() < 0.03) {
        result.status = 'did not fly';
        return;
      }
      // Two Standard pilots have not delivered Day 7 yet.
      if (isYesterday && cls.slug === 'standard' && (idx === 5 || idx === 11)) {
        (MISSING[cd.id] = MISSING[cd.id] || []).push(comp.cid);
        return;
      }
      const loggers = S.loggers.filter((l) => l.links.some((k) => k.competitorId === comp.id));
      const primary = loggers.find((l) => Q.linkOn(l, cd.date) && Q.linkOn(l, cd.date).role === 'primary');
      const perf = perfFor(r2, comp);
      const files = [];
      if (primary) files.push(makeFile(primary, cd.date, perf));
      for (const l of loggers) if (l !== primary && r2() < 0.55) files.push(makeFile(l, cd.date, perf));
      files.forEach((f, i) => analyseAtUpload(f, i * 4));
      for (const f of files.slice()) if (f.uploadedAt > KH.NOW) {
        dropFile(f);
        files.splice(files.indexOf(f), 1);
      }
      if (!files.length) return;
      const scored = files[0];
      if (isToday) {
        for (const f of files) result.checkReasons.push({ text: 'File arrived', file: f.id, at: f.uploadedAt });
        if (r2() < 0.5) {
          result.status = 'scored file';
          result.scoredFileId = scored.id;
          result.checkReasons.push({ text: 'Scored file output changed (first analysis)', file: scored.id, at: scored.uploadedAt });
          if (r2() < 0.55) result.checkReasons = [];
        }
      } else {
        result.status = 'scored file';
        result.scoredFileId = scored.id;
        if (isYesterday && r2() < 0.1) result.checkReasons.push({ text: 'File arrived', file: (files[1] || scored).id, at: '2026-07-28T09:12' });
      }
    });
  }

  const filesOn = (cd) => S.files.filter((f) => { const r = Q.resolve(f); return r.ok && r.classDay === cd; });
  const scoredOn = (cd) => Q.resultsOf(cd).filter((r) => r.status === 'scored file');

  // Seeded cases on earlier days: overrides, penalties, a warning, a manual result, a secondary scored file.
  {
    const r3 = rng(99);
    const results = S.results.filter((r) => r.status === 'scored file' && S.classDays.find((d) => d.id === r.classDayId).date < KH.TODAY);
    let n = 0;
    for (const res of results) {
      const f = Q.file(res.scoredFileId);
      const alt = f.analysis.candidates.find((c) => !c.auto && c.valid);
      if (alt && r3() < 0.03 && n++ < 8) {
        f.overrides.start = { kind: 'candidate', time: alt.time };
        runAnalysis(f, { silent: true, at: f.uploadedAt });
      }
    }
    for (const r of results.filter((x) => Q.file(x.scoredFileId).analysis.log.some((e) => e.kind === 'airspace'))) {
      const f = Q.file(r.scoredFileId);
      if (r3() < 0.5) {
        f.overrides.flightEnd = f.analysis.suggestions.find((s) => s.text.startsWith('Airspace')).time;
        runAnalysis(f, { silent: true, at: f.uploadedAt });
      } else r.penalty = { points: 50, publicRemark: 'Airspace infringement ED-R 207', internalRemark: 'Pilot accepted at debriefing.' };
    }
    const d4 = Q.classDayOn('cl1', '2026-07-24');
    const warn = scoredOn(d4)[6];
    warn.penalty = { points: 0, publicRemark: 'Official warning: unsafe thermalling reported by two pilots', internalRemark: '' };
    warn.internalRemark = 'Talked to the pilot at 19:30.';
    const d2 = Q.classDayOn('cl1', '2026-07-22');
    const man = scoredOn(d2)[3];
    man.status = 'manual result';
    man.scoredFileId = null;
    man.manual = { startTime: '13:12:40', finished: false, finishTime: '', distance: Math.round(Q.taskDistance(Q.task(d2)) * 0.62 * 10) / 10, landing: 'Field near Villingen' };
    man.publicRemark = 'Logger failure. Distance from the landing certificate.';
    const d6 = Q.classDayOn('cl2', '2026-07-26');
    const sec = Q.resultsOf(d6).find((r) => Q.filesOfResult(r).some((f) => Q.resolve(f).role === 'secondary'));
    if (sec) {
      sec.scoredFileId = Q.filesOfResult(sec).find((f) => Q.resolve(f).role === 'secondary').id;
      sec.publicRemark = 'Scored from the secondary logger after a gap in the primary.';
    }
    const d7 = Q.classDayOn('cl1', '2026-07-27');
    const cf = Q.file(scoredOn(d7)[9].scoredFileId);
    cf.perf.checkFail = true;
    runAnalysis(cf, { silent: true, at: cf.uploadedAt });
    scoredOn(d7)[9].checkReasons.push({ text: 'Scored file output changed (rerun)', file: cf.id, at: '2026-07-28T08:55' });
    const d4f = filesOn(Q.classDayOn('cl2', '2026-07-24'))[3];
    d4f.private = true;
    d4f.internalRemark = 'Pilot asked to keep the file private.';
  }

  // Unresolved, waiting, broken, pending and odd files.
  {
    const kx = Q.competitorsOf('k2', 'cl1')[0];
    const u1 = makeFile(Q.logger('lx1'), '2026-07-28', perfFor(rng(5), kx), { suggestedClass: 'Club', suggestedCid: kx.cid });
    analyseAtUpload(u1);
    u1.uploadedAt = '2026-07-28T17:31';
    const std = Q.competitorsOf('k2', 'cl2').find((c) => c.cid.length === 2);
    const u2 = makeFile(Q.logger('lx2'), '2026-07-12', perfFor(rng(6), std), { suggestedClass: 'Standard', suggestedCid: std.cid, uploadedAt: '2026-07-12T20:05' });
    analyseAtUpload(u2);
    const l18 = S.loggers.find((l) => l.links.length && Q.competitor(l.links[0].competitorId).classId === 'cl3');
    const c18 = Q.competitor(l18.links[0].competitorId);
    const u3 = makeFile(l18, '2026-07-01', perfFor(rng(7), c18), { suggestedClass: '18 m', suggestedCid: c18.cid, uploadedAt: '2026-07-28T17:05', suffix: 'clock', internalRemark: 'Logger lost its clock. The pilot says it was flown today.' });
    analyseAtUpload(u3);
    const clubLoggers = S.loggers.filter((l) => l.links.length && Q.competitor(l.links[0].competitorId).classId === 'cl1' && l.id.endsWith('a'));
    const rl = clubLoggers[4];
    const roll = makeFile(rl, '2026-07-28', perfFor(rng(8), Q.competitor(rl.links[0].competitorId)), { recordedDate: '2006-12-12', suffix: 'roll' });
    analyseAtUpload(roll);
    if (roll.uploadedAt > KH.NOW) roll.uploadedAt = '2026-07-28T17:12';
    Q.resolve(roll).result.checkReasons.push({ text: 'File arrived', file: roll.id, at: roll.uploadedAt });
    // A training flight on the cancelled Day 3 waits for a task that never comes.
    const wl = clubLoggers[2];
    const wait = makeFile(wl, '2026-07-23', perfFor(rng(9), Q.competitor(wl.links[0].competitorId)), { uploadedAt: '2026-07-23T18:40' });
    analyseAtUpload(wait);
    // A truncated upload that fails to parse.
    const bl = clubLoggers[6];
    const broken = makeFile(bl, '2026-07-28', { ...perfFor(rng(10), Q.competitor(bl.links[0].competitorId)), broken: true }, { suffix: 'broken', uploadedAt: '2026-07-28T17:26' });
    analyseAtUpload(broken);
    Q.resolve(broken).result.checkReasons.push({ text: 'File arrived', file: broken.id, at: broken.uploadedAt });
    // An upload from a moment ago whose analysis is still running.
    const pl = clubLoggers[8];
    const pending = makeFile(pl, '2026-07-28', perfFor(rng(11), Q.competitor(pl.links[0].competitorId)), { suffix: 'pending', uploadedAt: '2026-07-28T17:41' });
    if (!filesOn(Q.classDayOn('cl1', KH.TODAY)).some((f) => f !== pending && f.loggerId === pl.id)) {
      pending.analysis = { engine: KH.ENGINE, state: 'pending', ranAt: '', stale: [], output: null, log: [], candidates: [], suggestions: [] };
      Q.resolve(pending).result.checkReasons.push({ text: 'File arrived', file: pending.id, at: pending.uploadedAt });
    } else dropFile(pending);
    // A file whose G record does not validate.
    const gf = filesOn(Q.classDayOn('cl2', KH.TODAY)).find((f) => Q.logger(f.loggerId).manufacturer === 'LXV');
    gf.gRecord = 'invalid';
    runAnalysis(gf, { silent: true, at: gf.uploadedAt });
    // A deleted duplicate on Day 6.
    const d6 = S.files.find((f) => f.flightDate === '2026-07-26' && Q.logger(f.loggerId).manufacturer === 'FLA' && Q.resolve(f).ok && Q.resolve(f).result.scoredFileId !== f.id);
    if (d6) d6.deleted = true;
  }

  // Stale analyses: a corrected start ground speed on 18 m Day 8, a changed ENL threshold, a changed link role.
  {
    const cd18 = Q.classDayOn('cl3', KH.TODAY);
    cd18.inputVersion = 2;
    cd18.overrides.maxStartGs = 160;
    for (const f of filesOn(cd18)) if (f.uploadedAt < '2026-07-28T17:35') f.analysis.stale.push({ reason: 'start procedure', at: '2026-07-28T17:35' });
    const motorLogger = S.loggers.find((l) => l.links.length && l.id.endsWith('a') && Q.competitor(l.links[0].competitorId).classId === 'cl2' && !Q.competitor(l.links[0].competitorId).pureGlider && S.files.some((f) => f.loggerId === l.id && f.flightDate === KH.TODAY));
    motorLogger.enl = 350;
    for (const f of S.files.filter((x) => x.loggerId === motorLogger.id && x.uploadedAt < '2026-07-28T17:20')) f.analysis.stale.push({ reason: 'logger settings', at: '2026-07-28T17:20' });
    const std7 = Q.classDayOn('cl2', '2026-07-27');
    filesOn(std7).slice(4, 6).forEach((f) => f.analysis.stale.push({ reason: 'logger link role', at: '2026-07-28T08:40' }));
  }

  // ---------- scoring ----------

  function scoreClassDay(cd) {
    const cls = Q.class(cd.classId);
    const task = Q.task(cd);
    const eff = effective(cd, cls);
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
        const dist = m.finished && task && task.type !== 'aat' ? Q.taskDistance(task) : Number(m.distance) || 0;
        const tSpeed = t && task && task.type === 'aat' ? Math.max(t, secs(task.minTaskTime + ':00')) : t;
        Object.assign(row, { distance: dist, start: m.startTime, finish: m.finishTime, finished: !!m.finished, speed: tSpeed ? Math.round((dist / tSpeed) * 36000) / 10 : null });
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
    const d1 = Number(eff.d1 || cls.d1) || 250;
    // Fake day devaluation: short days score fewer maximum points.
    const pm = dmax >= d1 ? 1000 : Math.round((1000 * dmax) / d1);
    for (const x of scored) {
      let p = x.finished ? 0.65 + 0.35 * ((sp(x) - vmin) / Math.max(1, vo - vmin)) : 0.6 * (dist(x) / dmax);
      p = Math.round(p * pm);
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
      Pm: pm,
    };
    return { rows, params };
  }
  KH.score = scoreClassDay;

  function snapshot(cd, status, at) {
    const { rows, params } = scoreClassDay(cd);
    const task = Q.task(cd);
    return {
      status, at, complaintDeadline: status === 'unofficial' ? cd.complaintDeadline : '', resultsNote: cd.resultsNote,
      taskLetter: task ? task.letter : '', taskLine: task ? Q.taskLine(task) : '', taskDistance: task ? Q.taskDistance(task) : 0, taskType: task ? task.type : '',
      params, edition: Q.class(cd.classId).edition, engine: KH.ENGINE, rulesHash: hash(Q.class(cd.classId).edition + JSON.stringify(effective(cd))).toString(16).slice(0, 8),
      rows: rows.map((x) => ({
        competitorId: x.competitor.id, rankLabel: x.rankLabel, points: x.points, distance: x.distance, speed: x.speed, start: x.start, finish: x.finish, placeholder: x.placeholder,
        handicap: x.result.handicapOverride || x.competitor.handicap, hc: x.competitor.hc,
        penalty: x.result.penalty ? x.result.penalty.points : null, penaltyRemark: x.result.penalty ? x.result.penalty.publicRemark : '', publicRemark: x.result.publicRemark || '',
        dsqRemark: x.competitor.dsq ? x.competitor.dsq.publicRemark : '', key: [x.status, x.points, x.distance, x.speed].join(';'),
      })),
    };
  }
  KH.snapshot = snapshot;
  // Publish times follow the statuses: preliminary the same evening, unofficial the next morning, final after the deadline.
  for (const cd of S.classDays) {
    if (cd.status === 'unplanned') continue;
    const at = {
      'task published': cd.date + 'T10:05', cancelled: cd.date + 'T10:30', preliminary: cd.date + 'T20:30',
      unofficial: addDays(cd.date, 1) + 'T08:00', final: addDays(cd.date, 2) + 'T09:00',
    }[cd.status];
    if (cd.status === 'unofficial') cd.complaintDeadline = addDays(cd.date, 1) + 'T22:00';
    if (MISSING[cd.id]) cd.resultsNote = 'Flights of ' + MISSING[cd.id].join(' and ') + ' still missing.';
    const t = Q.task(cd);
    cd.publishedTask = t ? { at: cd.date + 'T10:05', letter: t.letter, line: Q.taskLine(t), distance: Q.taskDistance(t), type: t.type } : null;
    cd.published = ['task published', 'cancelled'].includes(cd.status) ? { status: cd.status, at, rows: [] } : snapshot(cd, cd.status, at);
  }
  Q.classDayOn('cl2', '2026-07-27').reasons = ['Results'];
  Q.classDayOn('cl3', KH.TODAY).reasons = ['Start procedure'];

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
  // Keys whose value differs, treating empty and missing alike.
  function sameValues(next, prev) {
    const keys = new Set(Object.keys(next || {}).concat(Object.keys(prev || {})));
    return [...keys].filter((k) => String((next || {})[k] ?? '') !== String((prev || {})[k] ?? ''));
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
    S.memberships.push({ userId: me.id, competitionId: comp.id, role: 'admin' });
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
    if (comp.id === 'k2') {
      const next = airspaceFile('oberrhein-2026-openair-v2.txt', KH.NOW);
      next.airspaces = next.airspaces.filter((a) => a.name !== 'RMZ HOHENFELS' && a.name !== 'ED-R 132');
      comp.airspaceFile = next;
    } else comp.airspaceFile = KH.DEMO_FILES.airspace();
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
    if (patch.overrides && sameValues(patch.overrides, cls.overrides).length) markStale(filesOfClass(cls), 'rule overrides');
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
    if (cd.published && practice !== cd.practice) throw new Denied('The day kind can change only until the first publish');
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
      const changed = sameValues(patch.overrides, cd.overrides);
      if (changed.length) {
        cd.inputVersion++;
        markStale(filesOfClassDay(cd), changed.some((k) => startKeys.includes(k)) ? 'start procedure' : 'rule overrides');
        markUnpublished(cd, changed.some((k) => startKeys.includes(k)) ? 'Start procedure' : 'Rule overrides');
      }
      patch = { ...patch, overrides: { ...cd.overrides, ...patch.overrides } };
    }
    if ('qnh' in patch && Number(patch.qnh) !== cd.qnh) {
      markStale(filesOfClassDay(cd), 'rule overrides');
      markUnpublished(cd, 'QNH');
    }
    if ('practice' in patch && patch.practice !== cd.practice && cd.published) throw new Denied('The day kind can change only until the first publish');
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
    const def = (role) => zoneFor(role, cls.edition, t.type);
    const differs = (z, ref) => z.kind !== ref.kind || ['r1', 'a1', 'r2', 'a2', 'length'].some((k) => ref[k] !== undefined && Number(z[k]) !== Number(ref[k]));
    t.points.slice(1, -1).forEach((p, i) => {
      if (differs(p.zone, def('tp'))) out.push((t.type === 'aat' ? 'assigned area ' : 'turnpoint ') + (i + 1) + ' ' + p.name + ' uses ' + (p.zone.preset || 'a custom zone') + ' ' + p.zone.r1 + ' km instead of ' + (t.type === 'aat' ? d.aatZone : d.tpZone));
    });
    const fin = t.points[t.points.length - 1];
    if (t.points.length > 1 && differs(fin.zone, def('finish'))) out.push('finish ' + (fin.zone.kind === 'line' ? 'line ' + fin.zone.length : 'cylinder ' + fin.zone.r1) + ' km instead of ' + d.finishZone);
    const eff = effective(cd, cls);
    for (const [k, label] of [['earthModel', 'earth model'], ['finishToEdge', 'finish distance to the cylinder edge'], ['deliveryPeriod', 'delivery period']]) {
      if (eff[k] !== undefined && d[k] !== undefined && String(eff[k]) !== String(d[k]) && !(k === 'finishToEdge' && String(eff[k]) === 'yes' && d[k] === true)) out.push(label + ' ' + eff[k] + ' instead of ' + d[k]);
    }
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
        const role = i === 0 ? 'start' : i === names.length - 1 ? 'finish' : 'tp';
        const p = from && from.points[i];
        return { name: t.name, lat: t.lat, lon: t.lon, elev: t.elev, zone: p ? { ...p.zone } : zoneFor(role, cls.edition, from ? from.type : 'racing', effective(cd, cls)) };
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
      // Overrides follow a file within its class day and are dropped on a move to another one.
      if ((a && a.ok ? a.classDay : null) !== (b.ok ? b.classDay : null)) f.overrides = {};
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
  function demoteOtherPrimaries(logger, link) {
    for (const l of S.loggers) {
      if (l === logger || l.competitionId !== logger.competitionId) continue;
      for (const k of l.links) if (k.competitorId === link.competitorId && k.role === 'primary' && (k.from || '') >= (link.from || '')) {
        k.role = 'secondary';
        markStale(S.files.filter((f) => f.loggerId === l.id), 'logger link role');
      }
      const cur = Q.linkOn(l, link.from || '0000');
      if (cur && cur.competitorId === link.competitorId && cur.role === 'primary') {
        l.links.push({ competitorId: link.competitorId, from: link.from, role: 'secondary' });
        markStale(S.files.filter((f) => f.loggerId === l.id), 'logger link role');
      }
    }
  }
  A.addLink = (logger, link) => {
    moveAware(() => {
      if (link.role === 'primary') demoteOtherPrimaries(logger, link);
      logger.links.push(link);
    });
    touch();
  };
  A.removeLink = (logger, idx) => {
    moveAware(() => logger.links.splice(idx, 1));
    touch();
  };
  A.setLinkRole = (logger, idx, role) => {
    const link = logger.links[idx];
    // A competitor has at most one primary on any date: the other primary turns secondary from the same date.
    if (role === 'primary') demoteOtherPrimaries(logger, link);
    link.role = role;
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
    const task = Q.task(Q.resolve(f).classDay);
    f.overrides.tpCredits = (f.overrides.tpCredits || []).concat([{ idx, name: task.points[idx + 1].name }]);
    runAnalysis(f);
    touch();
  };
  A.creditFinish = (f) => {
    const task = Q.task(Q.resolve(f).classDay);
    f.overrides.finishCredit = { name: task.points[task.points.length - 1].name };
    runAnalysis(f);
    touch();
  };
  A.pinAatFix = (f, idx, time) => {
    const task = Q.task(Q.resolve(f).classDay);
    f.overrides.aatPins = { ...(f.overrides.aatPins || {}) };
    if (time) f.overrides.aatPins[idx] = { time, name: task.points[idx + 1].name };
    else delete f.overrides.aatPins[idx];
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
    addCheckReason(result, 'Scored file output changed (scored file chosen)', f);
    markUnpublished(Q.classDay(result.classDayId), 'Results');
    touch();
  };
  A.setResultStatus = (result, status) => {
    if (result.scoredFileId) result.lastScoredFileId = result.scoredFileId;
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
    S.competitionInvitations = S.competitionInvitations.filter((i) => i.senderId !== u.id);
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
    S.competitionInvitations = S.competitionInvitations.filter((i) => i.senderId !== u.id && i.inviteeId !== u.id);
    touch();
  };
})();
