import { getAuthToken } from './api.js';

const memoryPhotoCache = new Map();
const SESSION_CACHE_PREFIX = 'jr_photo_cache_';
const LOCAL_CACHE_PREFIX = 'jr_photo_loc_';

const DB_NAME = 'jr_photos_db';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

let dbPromise = null;

/**
 * Inisialisasi IndexedDB untuk penyimpanan foto asli persisten
 * Tanpa batas quota 1.5MB sessionStorage sehingga foto asli lapangan tersimpan aman dan tidak hilang
 */
function getDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        req.onsuccess = (e) => {
          const db = e.target.result;
          try {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              const records = getAllReq.result || [];
              records.forEach((rec) => {
                if (rec && rec.key && rec.data) {
                  // Cegah memuat key berupa angka murni (seperti '1') yang dapat menyebabkan tabrakan foto antar korban berbeda
                  if (!/^\d+$/.test(String(rec.key).trim())) {
                    memoryPhotoCache.set(rec.key, rec.data);
                  }
                }
              });
            };
          } catch (_) {}
          resolve(db);
        };
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

// Inisialisasi awal saat bundle dimuat di browser
if (typeof window !== 'undefined') {
  getDb();
  // Bersihkan cache lama yang sempat tersimpan dengan key angka telanjang (misal '1')
  // atau data: URL lama yang mengklaim nama file resmi /uploads/ atau VISIT
  try {
    [sessionStorage, localStorage].forEach((store) => {
      if (!store) return;
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i);
        if (k && (k.startsWith(SESSION_CACHE_PREFIX) || k.startsWith(LOCAL_CACHE_PREFIX))) {
          const stripped = k.replace(SESSION_CACHE_PREFIX, '').replace(LOCAL_CACHE_PREFIX, '');
          if (/^\d+$/.test(stripped)) {
            store.removeItem(k);
          } else if (k.includes('VISIT') || k.includes('uploads') || k.includes('visit_')) {
            const val = store.getItem(k);
            if (val && val.startsWith('data:')) {
              store.removeItem(k);
            }
          }
        }
      }
    });
    getDb().then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const st = tx.objectStore(STORE_NAME);
        const req = st.getAll();
        req.onsuccess = () => {
          (req.result || []).forEach((row) => {
            if (row && row.key) {
              const kStr = String(row.key);
              if (
                /^\d+$/.test(kStr) ||
                ((kStr.includes('VISIT') || kStr.includes('uploads') || kStr.includes('visit_')) &&
                  typeof row.data === 'string' &&
                  row.data.startsWith('data:'))
              ) {
                st.delete(row.key);
                memoryPhotoCache.delete(row.key);
              }
            }
          });
        };
      } catch (_) {}
    });
  } catch (_) {}
}

/**
 * Normalisasi key pencarian foto (mengambil nama file jika berupa URL)
 */
export function normalizePhotoKey(key) {
  if (!key) return '';
  const s = String(key).trim();
  if (s.includes('/')) {
    return s.split('/').pop().split('?')[0];
  }
  return s;
}

/**
 * Menyimpan data foto (Base64 Data URL atau Object URL) ke cache multi-tier:
 * 1. In-memory Map (akses instan sinkron)
 * 2. IndexedDB (penyimpanan persisten tahan refresh, tanpa batas quota 1.5MB)
 * 3. SessionStorage & LocalStorage (fallback sekunder)
 */
export function cachePhoto(key, dataUrlOrBlob) {
  if (!key || !dataUrlOrBlob) return;
  const rawKey = String(key).trim();
  // Cegah caching pada key angka telanjang (misal '1', '2') yang bertabrakan antar kasus/kunjungan berbeda
  if (/^\d+$/.test(rawKey)) {
    return;
  }
  const normalizedKey = normalizePhotoKey(rawKey);

  memoryPhotoCache.set(rawKey, dataUrlOrBlob);
  if (normalizedKey && normalizedKey !== rawKey) {
    memoryPhotoCache.set(normalizedKey, dataUrlOrBlob);
  }

  // Simpan ke IndexedDB untuk persistensi permanen
  getDb()
    .then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({ key: rawKey, data: dataUrlOrBlob, updatedAt: Date.now() });
        if (normalizedKey && normalizedKey !== rawKey) {
          store.put({ key: normalizedKey, data: dataUrlOrBlob, updatedAt: Date.now() });
        }
      } catch (_) {}
    })
    .catch(() => {});

  // Simpan ke sessionStorage & localStorage jika memungkinkan
  if (typeof dataUrlOrBlob === 'string' && dataUrlOrBlob.startsWith('data:')) {
    if (typeof sessionStorage !== 'undefined' && normalizedKey) {
      try {
        if (dataUrlOrBlob.length < 3000000) {
          sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${normalizedKey}`, dataUrlOrBlob);
        }
      } catch (_) {}
    }
    if (typeof localStorage !== 'undefined' && normalizedKey) {
      try {
        if (dataUrlOrBlob.length < 2000000) {
          localStorage.setItem(`${LOCAL_CACHE_PREFIX}${normalizedKey}`, dataUrlOrBlob);
        }
      } catch (_) {}
    }
  }
}

/**
 * Mengambil foto dari cache lokal multi-tier (sinkron)
 */
export function getCachedPhoto(key) {
  if (!key) return null;
  const rawKey = String(key).trim();
  // Cegah pencarian pada key angka telanjang (misal '1', '2') yang bertabrakan antar kasus/kunjungan berbeda
  if (/^\d+$/.test(rawKey)) {
    return null;
  }
  const normalizedKey = normalizePhotoKey(rawKey);

  if (memoryPhotoCache.has(rawKey)) {
    return memoryPhotoCache.get(rawKey);
  }
  if (normalizedKey && memoryPhotoCache.has(normalizedKey)) {
    return memoryPhotoCache.get(normalizedKey);
  }

  // Cek sessionStorage
  if (typeof sessionStorage !== 'undefined' && normalizedKey) {
    try {
      const stored =
        sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${normalizedKey}`) ||
        sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${rawKey}`);
      if (stored) {
        memoryPhotoCache.set(normalizedKey, stored);
        memoryPhotoCache.set(rawKey, stored);
        return stored;
      }
    } catch (_) {}
  }

  // Cek localStorage
  if (typeof localStorage !== 'undefined' && normalizedKey) {
    try {
      const stored =
        localStorage.getItem(`${LOCAL_CACHE_PREFIX}${normalizedKey}`) ||
        localStorage.getItem(`${LOCAL_CACHE_PREFIX}${rawKey}`);
      if (stored) {
        memoryPhotoCache.set(normalizedKey, stored);
        memoryPhotoCache.set(rawKey, stored);
        return stored;
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Memuat foto dari URL bukti backend dengan menyertakan token autentikasi (Authorization: Bearer)
 * Mencegah error 401/403 yang menyebabkan foto kembali ke SVG default.
 */
export async function loadAuthenticatedPhoto(src) {
  if (!src) return null;

  // Jika sudah berupa Data URL atau Blob URL, langsung gunakan
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    cachePhoto(src, src);
    return src;
  }

  const isUploadPath = src.includes('/uploads/');

  // Cek cache lokal sinkron (untuk /uploads/, hanya gunakan cache jika sudah berupa Object URL blob: aktif)
  const cached = getCachedPhoto(src);
  if (cached) {
    if (!isUploadPath || (typeof cached === 'string' && cached.startsWith('blob:'))) {
      return cached;
    }
  }

  // Cek IndexedDB secara async jika bukan file /uploads/
  if (!isUploadPath) {
    const db = await getDb();
    if (db) {
      const fromDb = await new Promise((res) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(src) || (normalizePhotoKey(src) ? store.get(normalizePhotoKey(src)) : null);
          req.onsuccess = () => res(req.result?.data || null);
          req.onerror = () => res(null);
        } catch (_) {
          res(null);
        }
      });
      if (fromDb) {
        cachePhoto(src, fromDb);
        return fromDb;
      }
    }
  }

  // Jika URL tidak mengarah ke /uploads/, kembalikan langsung
  if (!src.includes('/uploads/')) {
    return src;
  }

  const filename = normalizePhotoKey(src);
  if (!filename) return src;

  // Pastikan target URL mengarah ke endpoint /uploads/:filename di origin saat ini
  const targetPath = `/uploads/${filename}`;

  try {
    const token = getAuthToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchUrl = token ? `${targetPath}?token=${encodeURIComponent(token)}` : targetPath;

    const res = await fetch(fetchUrl, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      console.warn(`[photoService] Gagal memuat foto ${src}: HTTP ${res.status}`);
      // Jika fetch gagal (misal 403 atau 404), prioritaskan foto asli yang ada di cache/IndexedDB
      return getCachedPhoto(src) || getCachedPhoto(filename) || null;
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) {
      return getCachedPhoto(src) || getCachedPhoto(filename) || null;
    }

    const objectUrl = URL.createObjectURL(blob);
    cachePhoto(src, objectUrl);
    cachePhoto(targetPath, objectUrl);
    if (filename) cachePhoto(filename, objectUrl);

    return objectUrl;
  } catch (err) {
    console.warn(`[photoService] Error fetching authenticated photo ${src}:`, err.message);
    return getCachedPhoto(src) || getCachedPhoto(filename) || null;
  }
}

export default {
  cachePhoto,
  getCachedPhoto,
  normalizePhotoKey,
  loadAuthenticatedPhoto
};
