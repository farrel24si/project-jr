const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { parseLaporanRS } = require('./parser');
const { insertCaseWithRetry } = require('../services/caseCreation');
const { notifyNewAssignment } = require('../services/notificationDelivery');

const SESSION_DIR = path.resolve(__dirname, '..', '..', 'session_jr_bot');
let activeSocket = null;
let whatsappConnected = false;
let reconnectAttempts = 0;
let reconnectTimer = null;

// Cache pesan terkirim (maks 500 pesan) untuk melayani retry dekripsi ("Menunggu pesan ini") dari perangkat penerima
const MAX_SENT_MESSAGES_CACHE = 500;
const sentMessagesCache = new Map();

function cacheSentMessage(msg) {
  if (!msg || !msg.key || !msg.key.id || !msg.message) return;
  if (sentMessagesCache.size >= MAX_SENT_MESSAGES_CACHE) {
    const oldestKey = sentMessagesCache.keys().next().value;
    if (oldestKey !== undefined) sentMessagesCache.delete(oldestKey);
  }
  sentMessagesCache.set(msg.key.id, msg.message);
  if (msg.key.remoteJid) {
    sentMessagesCache.set(`${msg.key.remoteJid}:${msg.key.id}`, msg.message);
  }
}

async function getCachedSentMessage(key) {
  if (!key || !key.id) return undefined;
  if (key.remoteJid && sentMessagesCache.has(`${key.remoteJid}:${key.id}`)) {
    return sentMessagesCache.get(`${key.remoteJid}:${key.id}`);
  }
  return sentMessagesCache.get(key.id);
}

// Filter log internal libsignal ("Closing session:", "Opening session:") agar tidak membocorkan buffer kunci ke terminal
let libsignalConsoleFiltered = false;
function suppressLibsignalConsoleNoise() {
  if (libsignalConsoleFiltered) return;
  libsignalConsoleFiltered = true;
  const origInfo = console.info;
  const origWarn = console.warn;
  const NOISE_PREFIXES = [
    'Closing session:',
    'Opening session:',
    'Removing old closed session:',
    'Session already open'
  ];
  console.info = function (...args) {
    if (typeof args[0] === 'string' && NOISE_PREFIXES.some((p) => args[0].startsWith(p))) {
      return;
    }
    return origInfo.apply(console, args);
  };
  console.warn = function (...args) {
    if (typeof args[0] === 'string' && NOISE_PREFIXES.some((p) => args[0].startsWith(p))) {
      return;
    }
    return origWarn.apply(console, args);
  };
}

// Template #FORMAT dasar — tanpa baris RS karena RS dideteksi dari nama grup.
// Versi dengan baris RS dipakai untuk pesan DM/grup tidak dikenali.
const TEMPLATE_FORMAT_GRUP = `#LAPORLAKA
Nama:
NIK:
Umur:
Jenis Laka:
Alamat:
Tgl Laka:
Tgl Masuk:
Kronologi:
Status: Rawat Inap / Luka Ringan / Luka Berat / Meninggal Dunia`;

const TEMPLATE_FORMAT_DM = `#LAPORLAKA
RS: (nama rumah sakit sesuai daftar)
Nama:
NIK:
Umur:
Jenis Laka:
Alamat:
Tgl Laka:
Tgl Masuk:
Kronologi:
Status: Rawat Inap / Luka Ringan / Luka Berat / Meninggal Dunia`;

function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    ''
  );
}

/**
 * Normalisasi judul/alias: lowercase, trim, tanda baca/spasi berulang
 * menjadi satu spasi. Dipakai konsisten untuk alias dan canonical name.
 * @param {string} value
 * @returns {string}
 */
function normalizeSubjectTerm(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsNormalizedTerm(haystackNorm, needleNorm) {
  if (!haystackNorm || !needleNorm) return false;
  const escaped = needleNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i').test(haystackNorm);
}

// Token jenis fasilitas / gelar yang tidak boleh berdiri sendiri sebagai kata kunci RS
const GENERIC_FACILITY_TOKENS = new Set([
  'rs', 'rsud', 'rsu', 'rsd', 'rsia', 'rbia', 'rsau', 'upt', 'uptd', 'bk',
  'klinik', 'utama', 'umum', 'rumah', 'sakit', 'daerah', 'hospital',
  'medical', 'medika', 'centre', 'center', 'prof', 'dr', 'ibu', 'dan', 'anak',
  'mata', 'eye', 'kelas', 'd', 'tk', 'iv', '01', '07', '04', 'pemerintah', 'lanud'
]);

// Token nama kota/wilayah di ujung nama RS yang sering tidak ditulis di nama grup WA
const TRAILING_LOCATION_TOKENS = new Set([
  'pekanbaru', 'pku', 'riau', 'polda', 'kota', 'kab', 'kabupaten', 'kec', 'kecamatan',
  'rohul', 'rokan', 'hulu', 'kuansing', 'pelalawan', 'kampar', 'siak',
  'pasir', 'pangaraian', 'bagan', 'batu'
]);

// Seluruh token lokasi/cabang yang tidak boleh menjadi kata kunci tunggal tanpa nama RS
const ALL_LOCATION_TOKENS = new Set([
  ...TRAILING_LOCATION_TOKENS,
  'kuantan', 'dumai', 'duri', 'bengkalis', 'bangkinang', 'rengat',
  'tembilahan', 'siapi', 'api', 'ujung', 'tanjung', 'sorek',
  'tualang', 'mandau', 'sei', 'guntung', 'teluk', 'panam', 'sudirman', 'hangtuah'
]);

function isValidHospitalKeyword(phraseNorm) {
  if (!phraseNorm || phraseNorm.length < 3) return false;
  const tokens = phraseNorm.split(' ').filter(Boolean);
  if (tokens.length === 0) return false;

  const hasDistinctiveToken = tokens.some(
    (t) => !GENERIC_FACILITY_TOKENS.has(t) && !ALL_LOCATION_TOKENS.has(t)
  );
  if (hasDistinctiveToken) {
    return true;
  }

  // Untuk RS yang namanya murni kombinasi fasilitas + wilayah (mis. RSUD Kota Dumai, RS Pekanbaru Medical Centre),
  // wajib memuat minimal 2 token serta mengkombinasikan token fasilitas/medis dan token lokasi.
  const hasLocation = tokens.some((t) => ALL_LOCATION_TOKENS.has(t));
  const hasFacility = tokens.some((t) => GENERIC_FACILITY_TOKENS.has(t));
  return tokens.length >= 2 && hasLocation && hasFacility;
}

function stripTrailingLocationTokens(normStr) {
  const tokens = normStr.split(' ').filter(Boolean);
  let end = tokens.length;
  while (end > 1 && TRAILING_LOCATION_TOKENS.has(tokens[end - 1])) {
    end -= 1;
  }
  const candidate = tokens.slice(0, end).join(' ');
  return isValidHospitalKeyword(candidate) ? candidate : normStr;
}

function stripLeadingFacilityTokens(normStr) {
  const tokens = normStr.split(' ').filter(Boolean);
  let start = 0;
  while (start < tokens.length - 1 && GENERIC_FACILITY_TOKENS.has(tokens[start])) {
    start += 1;
  }
  return tokens.slice(start).join(' ');
}

/**
 * Ekstraksi kandidat kata kunci & singkatan dari nama kanonis RS.
 * Menangani penghilangan embel-embel lokasi di ujung ("- PEKANBARU", "Pekanbaru", "Polda - Riau"),
 * penghilangan awalan ("RS", "RSUD", "RS Umum", "RS Prof. Dr."), serta singkatan umum ("AB", "PMC", dll).
 * @param {string} namaRs
 * @returns {string[]} daftar kandidat kata kunci ter-normalisasi (terpanjang ke terpendek)
 */
function extractHospitalKeywords(namaRs) {
  if (typeof namaRs !== 'string' || !namaRs.trim()) return [];

  const candidates = new Set();
  const addCandidate = (rawOrNorm) => {
    const norm = normalizeSubjectTerm(rawOrNorm);
    if (isValidHospitalKeyword(norm)) {
      candidates.add(norm);
    }
  };

  const fullNorm = normalizeSubjectTerm(namaRs);
  addCandidate(fullNorm);

  // 1. Ambil akronim di dalam tanda kurung bila ada, mis. "(PBEC)", "(UNRI)"
  const parenMatches = namaRs.matchAll(/\(([A-Za-z0-9\s]{2,15})\)/g);
  for (const match of parenMatches) {
    const acr = normalizeSubjectTerm(match[1]);
    if (acr.length >= 3) {
      addCandidate(acr);
      addCandidate(`rs ${acr}`);
    }
  }
  const withoutParens = namaRs.replace(/\([^)]*\)/g, ' ');
  addCandidate(withoutParens);

  // 2. Potong bagian setelah tanda hubung " - " (umumnya "- PEKANBARU", "- RIAU", "- PELALAWAN")
  const stems = new Set([fullNorm, normalizeSubjectTerm(withoutParens)]);
  if (withoutParens.includes('-')) {
    const beforeHyphen = withoutParens.split('-')[0];
    const beforeHyphenNorm = normalizeSubjectTerm(beforeHyphen);
    if (isValidHospitalKeyword(beforeHyphenNorm)) {
      stems.add(beforeHyphenNorm);
      addCandidate(beforeHyphenNorm);
    }
  }

  // 3. Buang token wilayah/kota di ujung (mis. "Pekanbaru", "Polda Riau", "Kota Pekanbaru")
  for (const s of [...stems]) {
    const strippedLoc = stripTrailingLocationTokens(s);
    if (strippedLoc && isValidHospitalKeyword(strippedLoc)) {
      stems.add(strippedLoc);
      addCandidate(strippedLoc);
    }
  }

  // 4. Untuk setiap stem, bentuk variasi tanpa awalan RS/RSUD/Umum/Prof.Dr. dan tanpa akhiran "Hospital"
  for (const stem of [...stems]) {
    const core = stripLeadingFacilityTokens(stem);
    if (core && isValidHospitalKeyword(core)) {
      addCandidate(core);
      addCandidate(`rs ${core}`);
      if (stem.startsWith('rsud ')) {
        addCandidate(`rsud ${core}`);
      } else if (stem.startsWith('rs umum ') || stem.startsWith('rsu ')) {
        addCandidate(`rsu ${core}`);
      } else if (stem.startsWith('rs ibu dan anak ') || stem.startsWith('rbia ') || stem.startsWith('rsia ')) {
        addCandidate(`rsia ${core}`);
      }

      // Jika diakhiri kata "hospital" (mis. "eka hospital", "aulia hospital"), tambahkan bentuk singkatnya
      if (core.endsWith(' hospital')) {
        const withoutHospital = core.replace(/\s+hospital$/, '').trim();
        if (isValidHospitalKeyword(withoutHospital)) {
          addCandidate(withoutHospital);
          addCandidate(`rs ${withoutHospital}`);
        }
      }
    }
  }

  // 5. Variasi khusus & singkatan populer RS di Riau / Pekanbaru
  if (fullNorm.includes('awal bros')) {
    for (const existing of [...candidates]) {
      if (existing.includes('awal bros')) {
        addCandidate(existing.replace(/\bawal bros\b/g, 'ab'));
      }
    }
    if (fullNorm === 'rs awal bros pekanbaru') {
      addCandidate('rs awal bros sudirman');
      addCandidate('awal bros sudirman');
      addCandidate('rs ab sudirman');
      addCandidate('ab sudirman');
    }
    if (fullNorm.includes('ahmad yani')) {
      addCandidate('rs awal bros a yani');
      addCandidate('awal bros a yani');
      addCandidate('rs ab a yani');
      addCandidate('ab a yani');
      addCandidate('rs ab ahmad yani');
      addCandidate('ab ahmad yani');
    }
    if (fullNorm.includes('hangtuah')) {
      addCandidate('rs awal bros hang tuah');
      addCandidate('awal bros hang tuah');
      addCandidate('rs ab hang tuah');
      addCandidate('ab hang tuah');
      addCandidate('rs hangtuah');
      addCandidate('rs hang tuah');
    }
  }

  if (fullNorm.includes('pekanbaru medical centre') || fullNorm.includes('pekanbaru medical center')) {
    addCandidate('rs pekanbaru medical center');
    addCandidate('pekanbaru medical center');
    addCandidate('pekanbaru medical centre');
    addCandidate('rs pmc pekanbaru');
    addCandidate('rs pmc');
    addCandidate('pmc pekanbaru');
    addCandidate('pmc');
  }

  if (fullNorm.includes('arifin achmad')) {
    addCandidate('rsud arifin ahmad pekanbaru');
    addCandidate('rsud arifin ahmad');
    addCandidate('rs arifin ahmad');
    addCandidate('arifin ahmad');
    addCandidate('rsud arifin');
    addCandidate('rs arifin');
  }

  if (fullNorm.includes('tabrani')) {
    addCandidate('rs prof tabrani');
    addCandidate('prof dr tabrani');
    addCandidate('prof tabrani');
    addCandidate('rs dr tabrani');
    addCandidate('rs tabrani rab');
    addCandidate('tabrani rab');
  }

  if (fullNorm.includes('aulia')) {
    addCandidate('aulia soebrantas');
    addCandidate('rs aulia soebrantas');
  }

  if (fullNorm.includes('murni teguh eria')) {
    addCandidate('rs murni teguh pekanbaru');
    addCandidate('rs murni teguh');
    addCandidate('murni teguh');
    addCandidate('rs eria bunda');
    addCandidate('eria bunda');
    addCandidate('rs eria');
  }

  if (fullNorm.includes('bhayangkara')) {
    addCandidate('rs bhayangkara pekanbaru');
    addCandidate('bhayangkara pekanbaru');
    addCandidate('rs bhayangkara polda');
    addCandidate('bhayangkara polda');
  }

  return [...candidates].sort((a, b) => b.length - a.length);
}

/**
 * Eliminasi kandidat RS yang hanya cocok karena kata kuncinya merupakan
 * sub-frasa (prefix/substring berbatas kata) dari kata kunci RS lain yang lebih spesifik
 * di dalam teks yang sama (contoh: "rs awal bros" ter-subsumsi oleh "rs awal bros panam").
 * Kata kunci yang identik (kwA === kwB) TIDAK saling men-subsumsi agar tetap terdeteksi ambigu.
 */
function filterSubsumedHospitalMatches(entries) {
  if (entries.length <= 1) return entries;
  return entries.filter((entryA) => {
    const isSubsumedByAnother = entries.some((entryB) => {
      if (entryB.hospital.id === entryA.hospital.id) return false;
      return entryA.matchedTerms.every((termA) =>
        entryB.matchedTerms.some(
          (termB) => termB !== termA && containsNormalizedTerm(termB, termA)
        )
      );
    });
    return !isSubsumedByAnother;
  });
}

/**
 * Muat seluruh RS aktif dari DB, urutkan nama terpanjang ke terpendek
 * untuk menghindari substring match yang terlalu pendek.
 * @returns {Promise<Array<{id, nama_rs, latitude, longitude, radius_meter}>>}
 */
async function loadActiveHospitals() {
  const [rows] = await pool.execute(
    'SELECT id, nama_rs, alamat, latitude, longitude, radius_meter FROM hospitals WHERE is_active = 1'
  );
  return rows.sort((a, b) => b.nama_rs.length - a.nama_rs.length);
}

/**
 * Muat alias RS aktif dari tabel hospital_aliases.
 * Tabel mungkin belum ada (migration 010 belum diterapkan) -> hasil kosong.
 * @returns {Promise<Array<{hospital_id, alias_normalized, alias_display}>>}
 */
async function loadActiveAliases() {
  try {
    const [rows] = await pool.execute(
      'SELECT hospital_id, alias_normalized, alias_display, is_active FROM hospital_aliases WHERE is_active = 1'
    );
    return rows;
  } catch (err) {
    return [];
  }
}

/**
 * Muat binding JID grup WhatsApp aktif dari tabel hospital_whatsapp_groups.
 * Tabel mungkin belum ada (migration 010 belum diterapkan) -> hasil kosong.
 * @returns {Promise<Array<{hospital_id, group_jid, is_active}>>}
 */
async function loadActiveGroupBindings() {
  try {
    const [rows] = await pool.execute(
      'SELECT hospital_id, group_jid, is_active FROM hospital_whatsapp_groups WHERE is_active = 1'
    );
    return rows;
  } catch (err) {
    return [];
  }
}

async function loadGroupRoutingRules() {
  const [aliases, groupBindings] = await Promise.all([
    loadActiveAliases(),
    loadActiveGroupBindings()
  ]);
  return { aliases, groupBindings };
}

/**
 * Cocokkan nama RS dari judul grup (canonical name maupun ekstraksi kata kunci/singkatan).
 * Nol atau lebih dari satu hasil -> null.
 * @param {string} groupSubject  judul grup WhatsApp
 * @param {Array}  hospitals     hasil loadActiveHospitals()
 * @returns {object|null}  RS yang cocok (tepat satu), atau null
 */
function detectHospitalFromGroup(groupSubject, hospitals) {
  if (!groupSubject || !Array.isArray(hospitals) || hospitals.length === 0) return null;

  const subjectNorm = normalizeSubjectTerm(groupSubject);
  if (!subjectNorm) return null;

  // 1. Cek kecocokan nama kanonis utuh terlebih dahulu.
  const canonicalMatches = hospitals.filter((h) => {
    const nameNorm = normalizeSubjectTerm(h.nama_rs);
    return containsNormalizedTerm(subjectNorm, nameNorm);
  });

  if (canonicalMatches.length === 1) return canonicalMatches[0];
  if (canonicalMatches.length > 1) return null;

  // 2. Ekstraksi kata kunci & nama singkat (tanpa "Pekanbaru", tanpa awalan/gelar, atau singkatan).
  const keywordEntries = [];
  for (const h of hospitals) {
    const keywords = extractHospitalKeywords(h.nama_rs);
    const matchedTerms = keywords.filter((kw) => containsNormalizedTerm(subjectNorm, kw));
    if (matchedTerms.length > 0) {
      keywordEntries.push({ hospital: h, matchedTerms });
    }
  }

  const distinctEntries = filterSubsumedHospitalMatches(keywordEntries);
  return distinctEntries.length === 1 ? distinctEntries[0].hospital : null;
}

/**
 * Resolver RS dari grup WhatsApp dengan urutan deterministik:
 *   1. Binding JID grup aktif yang persis (exact).
 *   2. Alias aktif unik (ter-normalisasi) cocok di judul grup.
 *   3. Fallback ekstraksi kata kunci & canonical group-name, hanya bila tepat satu.
 * Nol/ambigu -> null.
 *
 * @param {string} groupSubject judul grup WhatsApp
 * @param {string} groupJid     JID grup (mis. 123456789@g.us); opsional
 * @param {Array}  hospitals    hasil loadActiveHospitals()
 * @param {Array}  aliases      [{hospital_id, alias_normalized, is_active}]
 * @param {Array}  groupBindings [{hospital_id, group_jid, is_active}]
 * @returns {object|null} hospital yang ter-resolve, atau null
 */
function resolveHospitalFromGroup(groupSubject, groupJid, hospitals, aliases = [], groupBindings = []) {
  const byId = new Map(hospitals.map((h) => [h.id, h]));
  const activeByHospital = (hospitalId) => byId.get(hospitalId) || null;

  // 1. Binding JID grup aktif yang persis.
  if (groupJid) {
    const jidMatches = groupBindings.filter(
      (b) => b.group_jid === groupJid && b.is_active !== 0
    );
    if (jidMatches.length === 1) {
      const hospital = activeByHospital(jidMatches[0].hospital_id);
      if (hospital) return hospital;
    }
    if (jidMatches.length > 1) return null; // JID unik global; defensif
  }

  // 2. Alias aktif unik pada judul grup ter-normalisasi.
  if (groupSubject) {
    const subjectNorm = normalizeSubjectTerm(groupSubject);
    if (subjectNorm) {
      const matchedByHospitalId = new Map();
      for (const alias of aliases) {
        if (!alias.alias_normalized || alias.is_active === 0) continue;
        const hospital = activeByHospital(alias.hospital_id);
        if (!hospital) continue;
        const aliasNorm = normalizeSubjectTerm(alias.alias_normalized);
        if (!aliasNorm) continue;
        if (containsNormalizedTerm(subjectNorm, aliasNorm)) {
          if (!matchedByHospitalId.has(hospital.id)) {
            matchedByHospitalId.set(hospital.id, { hospital, matchedTerms: [] });
          }
          matchedByHospitalId.get(hospital.id).matchedTerms.push(aliasNorm);
        }
      }
      const aliasEntries = filterSubsumedHospitalMatches([...matchedByHospitalId.values()]);
      if (aliasEntries.length === 1) return aliasEntries[0].hospital;
      if (aliasEntries.length > 1) return null; // ambigu, jangan pernah menebak
    }
  }

  // 3. Fallback canonical & keyword extraction, hanya bila tepat satu.
  return detectHospitalFromGroup(groupSubject, hospitals);
}

async function handleMessage(sock, msg) {
  if (!msg.message || msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const text = extractText(msg.message).trim();
  if (!text) return;

  const lowerText = text.toLowerCase();

  // ------------------------------------------------------------------ #FORMAT
  if (lowerText === '#format') {
    const template = isGroup ? TEMPLATE_FORMAT_GRUP : TEMPLATE_FORMAT_DM;
    await sock.sendMessage(jid, { text: template }, { quoted: msg });
    return;
  }

  // --------------------------------------------------------------- #LAPORLAKA
  if (!lowerText.includes('#laporlaka')) return;

  // Laporan #LAPORLAKA dibatasi hanya dari Grup RS (kecuali ALLOW_DM_REPORTS=true)
  if (!isGroup && process.env.ALLOW_DM_REPORTS !== 'true') {
    await sock.sendMessage(jid, {
      text: 'Laporan #LAPORLAKA hanya dapat dikirim melalui Grup WhatsApp Rumah Sakit yang terdaftar.'
    }, { quoted: msg });
    return;
  }

  // Parse isi pesan lebih dulu — RS tidak wajib ada di teks karena bisa dari nama grup.
  // Parsing tidak menyentuh DB, jadi pesan invalid langsung ditolak tanpa query.
  const parsed = parseLaporanRS(text, { requireRumahSakit: false });

  if (!parsed || !parsed.isValid) {
    const errorText = parsed && parsed.error
      ? parsed.error
      : 'Format Belum Lengkap.\nNama korban wajib diisi.';
    await sock.sendMessage(jid, {
      text: `${errorText}\nKetik #FORMAT untuk melihat format laporan yang benar.`
    }, { quoted: msg });
    return;
  }

  const hospitals = await loadActiveHospitals();

  // ------------------------------------------------------------- resolve RS
  let resolvedHospital = null;
  let loadedAliases = null;

  // 1. Coba deteksi dari grup: binding JID aktif -> alias unik -> kata kunci / canonical.
  if (isGroup) {
    try {
      const meta = await sock.groupMetadata(jid);
      const { aliases, groupBindings } = await loadGroupRoutingRules();
      loadedAliases = aliases;
      resolvedHospital = resolveHospitalFromGroup(
        meta.subject,
        jid,
        hospitals,
        aliases,
        groupBindings
      );
    } catch (metaErr) {
      console.warn('[WA-BOT] Gagal baca metadata grup:', metaErr.message);
    }
  }

  // 2. Baris RS: di pesan dipakai bila grup tidak memberi hasil,
  //    atau sebagai konfirmasi bila hasilnya sama.
  const namaFromMsg = parsed.data.rumah_sakit
    ? normalizeSubjectTerm(parsed.data.rumah_sakit)
    : null;

  if (namaFromMsg) {
    let matchFromMsg = hospitals.find(
      (h) => normalizeSubjectTerm(h.nama_rs) === namaFromMsg
    );

    if (!matchFromMsg) {
      if (!loadedAliases) {
        loadedAliases = await loadActiveAliases();
      }
      matchFromMsg = resolveHospitalFromGroup(
        parsed.data.rumah_sakit,
        null,
        hospitals,
        loadedAliases,
        []
      );
    }

    if (!matchFromMsg) {
      const namaRS = hospitals.map((h) => `• ${h.nama_rs}`).join('\n');
      await sock.sendMessage(jid, {
        text:
          `RS "${parsed.data.rumah_sakit}" tidak terdaftar atau tidak aktif.\n` +
          `RS yang terdaftar:\n${namaRS}`
      }, { quoted: msg });
      return;
    }

    if (resolvedHospital && matchFromMsg.id !== resolvedHospital.id) {
      await sock.sendMessage(jid, {
        text:
          `RS di pesan (${matchFromMsg.nama_rs}) berbeda dengan RS grup (${resolvedHospital.nama_rs}).\n` +
          'Hapus baris RS: dari pesan atau sesuaikan dengan nama grup.'
      }, { quoted: msg });
      return;
    }

    resolvedHospital = matchFromMsg;
  }

  // 3. Tidak ada RS dari grup maupun pesan → tolak, tampilkan daftar RS valid
  if (!resolvedHospital) {
    const namaRS = hospitals.map((h) => `• ${h.nama_rs}`).join('\n');
    await sock.sendMessage(jid, {
      text:
        'RS tidak diketahui. Pastikan nama grup memuat salah satu nama RS berikut,\n' +
        'atau tambahkan baris "RS: <nama rumah sakit>" di dalam laporan:\n' +
        namaRS
    }, { quoted: msg });
    return;
  }

  const sender = msg.key.participant || msg.key.remoteJid;
  const now = new Date();

  try {
    const result = await insertCaseWithRetry({
      ...parsed.data,
      rumah_sakit: resolvedHospital.nama_rs,
      hospital_id: resolvedHospital.id,
      no_pelapor_wa: sender,
      waktu_lapor_wa: now
    }, { autoAssign: true });

    const { tiket, caseId, visitId, assignedOfficer } = result;

    const archiveNotice = result.case.status_pemantauan === 'Diarsipkan'
      ? `\nTindak Lanjut: Diarsipkan — laka tunggal tidak ditindaklanjuti Jasa Raharja.`
      : '';
    const replySuccess =
      `Laporan berhasil diterima!\n\n` +
      `Nomor Tiket: ${tiket}\n` +
      `Keterjaminan: ${result.case.status_keterjaminan}\n` +
      `Nama Korban: ${parsed.data.nama_korban}\n` +
      `RS: ${resolvedHospital.nama_rs}\n` +
      `Status: ${parsed.data.status_kondisi}` +
      archiveNotice;

    await sock.sendMessage(jid, { text: replySuccess }, { quoted: msg });

    // Kirim notifikasi DM ke petugas yang ditugaskan (jika ada petugas ter-assign)
    if (assignedOfficer && assignedOfficer.telepon) {
      notifyNewAssignment(sock, {
        caseId,
        visitId,
        officerId: assignedOfficer.officer_id,
        officerName: assignedOfficer.nama,
        officerPhone: assignedOfficer.telepon,
        ticket: tiket,
        victimName: parsed.data.nama_korban,
        hospitalName: resolvedHospital.nama_rs,
        condition: parsed.data.status_kondisi,
        scheduledAt: new Date(now.getTime() + 72 * 3600 * 1000)
      }).catch((notifyErr) => {
        console.error('[WA-BOT] Gagal kirim notifikasi DM ke petugas:', notifyErr.message);
      });
    }
  } catch (dbErr) {
    console.error('[WA-BOT] Gagal menyimpan laporan:', dbErr);
    await sock.sendMessage(jid, {
      text:
        'Mohon maaf, terjadi kendala saat memproses laporan Anda ke sistem. ' +
        'Silakan coba beberapa saat lagi atau hubungi administrator.'
    }, { quoted: msg });
  }
}

function clearSession() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      console.log('[WA-BOT] Folder sesi lama dihapus otomatis.');
    }
  } catch (err) {
    console.error('[WA-BOT] Gagal hapus folder sesi:', err);
  }
}

async function startWhatsAppBot() {
  suppressLibsignalConsoleNoise();
  const silentLogger = pino({ level: 'silent' });
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const authKeys = typeof makeCacheableSignalKeyStore === 'function'
    ? makeCacheableSignalKeyStore(state.keys, silentLogger)
    : state.keys;

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: authKeys
    },
    logger: silentLogger,
    printQRInTerminal: false,
    getMessage: getCachedSentMessage
  });

  // Bungkus sendMessage agar setiap pesan keluar otomatis tersimpan di sentMessagesCache
  // untuk melayani permintaan retry dekripsi ("Menunggu pesan ini") dari perangkat penerima.
  const originalSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    const sent = await originalSendMessage(jid, content, options);
    if (sent) {
      cacheSentMessage(sent);
    } else if (content && typeof content === 'object' && typeof content.text === 'string') {
      // Fallback defensif bila objek fullMsg tidak dikembalikan
      cacheSentMessage({
        key: { remoteJid: jid, id: options?.messageId },
        message: { conversation: content.text }
      });
    }
    return sent;
  };

  activeSocket = sock;
  whatsappConnected = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[WA-BOT] Scan QR code berikut untuk login WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      if (activeSocket === sock) {
        whatsappConnected = false;
        activeSocket = null;
      }
      try {
        sock.ev.removeAllListeners();
      } catch (_) {}
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `[WA-BOT] Koneksi terputus (status: ${statusCode}). Reconnect: ${shouldReconnect}`
      );
      if (shouldReconnect) {
        reconnectAttempts += 1;
        const delayMs = Math.min(30000, 1000 * Math.pow(2, Math.min(reconnectAttempts - 1, 5)));
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          startWhatsAppBot().catch((err) => {
            console.error('[WA-BOT] Gagal reconnect:', err.message);
          });
        }, delayMs);
      } else {
        reconnectAttempts = 0;
        clearSession();
        console.log('[WA-BOT] Sesi WhatsApp sudah logout. Jalankan ulang server untuk tampilkan QR baru.');
      }
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      if (activeSocket === sock) whatsappConnected = true;
      console.log('[WA-BOT] WhatsApp bot berhasil terhubung.');
    } else if (connection === 'connecting' && activeSocket === sock) {
      whatsappConnected = false;
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      if (msg?.key?.fromMe && msg?.message) {
        cacheSentMessage(msg);
      }
    }
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg);
      } catch (err) {
        console.error('[WA-BOT] Error saat menangani pesan:', err);
      }
    }
  });

  return sock;
}

function getActiveWhatsAppSocket() {
  return whatsappConnected && activeSocket ? activeSocket : null;
}

module.exports = {
  startWhatsAppBot,
  handleMessage,
  detectHospitalFromGroup,
  resolveHospitalFromGroup,
  extractHospitalKeywords,
  normalizeSubjectTerm,
  loadActiveHospitals,
  loadActiveAliases,
  loadActiveGroupBindings,
  loadGroupRoutingRules,
  getActiveWhatsAppSocket,
  cacheSentMessage,
  getCachedSentMessage
};
