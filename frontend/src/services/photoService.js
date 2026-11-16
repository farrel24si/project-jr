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
                  memoryPhotoCache.set(rec.key, rec.data);
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

  // Cek cache lokal sinkron
  const cached = getCachedPhoto(src);
  if (cached) {
    return cached;
  }

  // Cek IndexedDB secara async jika belum ada di memori
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

  // Jika URL tidak mengarah ke /uploads/, kembalikan langsung
  if (!src.includes('/uploads/')) {
    return src;
  }

  const filename = normalizePhotoKey(src);

  try {
    const token = getAuthToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(src, {
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
