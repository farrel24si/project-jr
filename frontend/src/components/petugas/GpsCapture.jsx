import { useState } from 'react';
import {
  MapPin,
  Navigation,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  ShieldAlert,
  Radio,
  Building2
} from 'lucide-react';

const HOSPITAL_COORDINATES = {
  'RS Syafira': { lat: 0.499680, lng: 101.454750, radius_meter: 200 },
  'RS Prima': { lat: 0.482310, lng: 101.418920, radius_meter: 200 },
  'RSUD Arifin Achmad': { lat: 0.528350, lng: 101.448550, radius_meter: 250 },
  'RS Awal Bros Sudirman': { lat: 0.505240, lng: 101.451890, radius_meter: 200 },
  'RS Awal Bros Panam': { lat: 0.468200, lng: 101.378900, radius_meter: 200 },
  'RS Santa Maria Pekanbaru': { lat: 0.531200, lng: 101.441800, radius_meter: 200 },
  'RS Sansani Pekanbaru': { lat: 0.472100, lng: 101.391200, radius_meter: 200 },
  'RS Tabrani Rab': { lat: 0.514300, lng: 101.449700, radius_meter: 200 },
  'RS Bhayangkara Pekanbaru': { lat: 0.522800, lng: 101.447900, radius_meter: 200 },
  'RSUD Petala Bumi': { lat: 0.520400, lng: 101.455200, radius_meter: 200 },
  'RSUD Kota Dumai': { lat: 1.673800, lng: 101.446800, radius_meter: 250 },
  'RSUD Mandau Duri': { lat: 1.258900, lng: 101.218500, radius_meter: 250 },
  'RSUD Puri Husada Tembilahan': { lat: -0.322100, lng: 103.155400, radius_meter: 250 }
};

/**
 * Formula Haversine standar (radius bumi 6.371.000 meter)
 * Menghitung jarak lurus (meter) antara 2 titik koordinat bumi.
 */
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Validasi ketat koordinat numerik
 * - Mendukung angka 0 (misal di garis khatulistiwa)
 * - Menolak null, undefined, NaN, Infinity, dan rentang di luar batas bumi
 */
function isValidCoordinate(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return false;
  return numLat >= -90 && numLat <= 90 && numLng >= -180 && numLng <= 180;
}

export default function GpsCapture({
  onLocationCaptured,
  initialLocation = null,
  hospitalName = 'RS Syafira',
  hospitalCoords = null
}) {
  const [location, setLocation] = useState(initialLocation);
  const [prevInitial, setPrevInitial] = useState(initialLocation);
  const [isLoading, setIsLoading] = useState(false);
  const [detectionStage, setDetectionStage] = useState(''); // 'high_accuracy' | 'network_fallback' | ''
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showMapPreview, setShowMapPreview] = useState(true);

  // Sinkronisasi jika initialLocation berubah dari luar (misal restore form session)
  if (initialLocation !== prevInitial) {
    setPrevInitial(initialLocation);
    if (initialLocation && isValidCoordinate(initialLocation.latitude ?? initialLocation.lat_petugas, initialLocation.longitude ?? initialLocation.lng_petugas)) {
      setLocation(initialLocation);
    }
  }

  // Periksa apakah konteks browser adalah Secure Context (HTTPS atau Localhost)
  const isSecure = typeof window !== 'undefined'
    ? (window.isSecureContext ?? (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    : true;

  // Resolusi titik acuan koordinat RS master (dari props, cache localStorage, atau static list)
  const getResolvedHospitalCoords = () => {
    if (hospitalCoords) {
      const lat = hospitalCoords.latitude !== undefined ? hospitalCoords.latitude : (hospitalCoords.lat !== undefined ? hospitalCoords.lat : hospitalCoords.hospital_lat);
      const lng = hospitalCoords.longitude !== undefined ? hospitalCoords.longitude : (hospitalCoords.lng !== undefined ? hospitalCoords.lng : hospitalCoords.hospital_lng);
      const rad = hospitalCoords.radius_meter !== undefined ? hospitalCoords.radius_meter : (hospitalCoords.hospital_radius !== undefined ? hospitalCoords.hospital_radius : 200);
      if (isValidCoordinate(lat, lng)) {
        return { lat: Number(lat), lng: Number(lng), radius_meter: Number(rad) || 200 };
      }
    }

    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('jr_monitoring_hospitals_v1');
        if (stored) {
          const list = JSON.parse(stored);
          if (Array.isArray(list)) {
            const cleanName = (hospitalName || '').toLowerCase().trim();
            const found = list.find((h) => {
              const hName = (h.nama_rs || '').toLowerCase().trim();
              return hName === cleanName || (cleanName.length >= 4 && (hName.includes(cleanName) || cleanName.includes(hName)));
            });
            if (found && isValidCoordinate(found.latitude, found.longitude)) {
              return {
                lat: Number(found.latitude),
                lng: Number(found.longitude),
                radius_meter: Number(found.radius_meter || 200)
              };
            }
          }
        }
      }
    } catch {
      // ignore
    }

    const staticCoord = HOSPITAL_COORDINATES[hospitalName];
    if (staticCoord && isValidCoordinate(staticCoord.lat, staticCoord.lng)) {
      return {
        lat: staticCoord.lat,
        lng: staticCoord.lng,
        radius_meter: staticCoord.radius_meter || 200
      };
    }

    return {
      lat: 0.499680,
      lng: 101.454750,
      radius_meter: 200
    };
  };

  /**
   * Menangani koordinat yang sukses diambil
   * @param {GeolocationPosition} position Objek posisi dari browser
   * @param {boolean} isSimulated Apakah ini titik alternatif RS (bukan sensor GPS)
   */
  const handlePositionSuccess = (position, isSimulated = false) => {
    const rawLat = position.coords.latitude;
    const rawLng = position.coords.longitude;
    const lat = Number(Number(rawLat).toFixed(6));
    const lng = Number(Number(rawLng).toFixed(6));

    // Akurasi: gunakan nilai nyata dari browser jika GPS perangkat, NULL jika titik acuan RS (jangan mengarang akurasi)
    const accuracy = !isSimulated && Number.isFinite(position.coords?.accuracy)
      ? Math.round(position.coords.accuracy)
      : null;

    const rsCoords = getResolvedHospitalCoords();
    let distanceMeter = null;
    let isOutsideRadius = false;
    let verificationAlert = null;

    if (rsCoords && isValidCoordinate(rsCoords.lat, rsCoords.lng)) {
      distanceMeter = haversine(lat, lng, rsCoords.lat, rsCoords.lng);
      const maxRadius = rsCoords.radius_meter || 200;
      isOutsideRadius = distanceMeter > maxRadius;
      if (isOutsideRadius && !isSimulated) {
        verificationAlert = `Lokasi GPS perangkat berada di luar radius RS (jarak ${distanceMeter} m, batas ${maxRadius} m). Kunjungan tetap dapat disimpan dan tercatat untuk verifikasi.`;
      }
    }

    const loc = {
      // Format frontend camelCase
      latitude: lat,
      longitude: lng,
      akurasiLokasi: accuracy,
      jarakDariRsMeter: distanceMeter,
      isOutsideHospitalRadius: isOutsideRadius,
      verificationAlert,
      source: isSimulated ? 'HOSPITAL_FALLBACK' : 'DEVICE_GPS',
      sumberKoordinat: isSimulated ? 'Koordinat Rumah Sakit' : 'GPS Perangkat',
      // Format backend MySQL snake_case
      lat_petugas: lat,
      lng_petugas: lng,
      akurasi_lokasi_meter: accuracy,
      jarak_dari_rs_meter: distanceMeter,
      hospital_radius_meter: rsCoords?.radius_meter || 200,
      is_outside_hospital_radius: isOutsideRadius,
      verification_alert: verificationAlert,
      sumber_koordinat: isSimulated ? 'Koordinat Rumah Sakit' : 'GPS Perangkat',
      waktu: new Date().toISOString(),
      isSimulated
    };

    setLocation(loc);
    setIsLoading(false);
    setDetectionStage('');
    setErrorMessage(null);
    setErrorCode(null);

    if (onLocationCaptured) {
      onLocationCaptured(loc);
    }
  };

  /**
   * Menangani error saat pengambilan lokasi
   */
  const handlePositionError = (error, stage = '') => {
    console.warn(`Geolocation error (${stage}):`, error);
    let msg = 'Gagal mendeteksi lokasi GPS perangkat.';

    if (error.code === 1 || error.code === error.PERMISSION_DENIED) {
      if (!isSecure) {
        msg = 'Browser memblokir sensor lokasi karena website belum diakses melalui koneksi aman (HTTPS). Geolocation API mewajibkan koneksi HTTPS (misalnya melalui Cloudflare Tunnel).';
      } else {
        msg = 'Izin akses lokasi ditolak oleh browser HP. Silakan aktifkan izin "Lokasi" pada pengaturan situs di browser Anda (ikon gembok pada address bar), lalu tekan tombol "Coba Deteksi Ulang".';
      }
    } else if (error.code === 2 || error.code === error.POSITION_UNAVAILABLE) {
      msg = 'Informasi lokasi perangkat tidak tersedia. Pastikan fitur Lokasi / GPS pada perangkat HP Anda sudah diaktifkan di panel pengaturan.';
    } else if (error.code === 3 || error.code === error.TIMEOUT) {
      msg = 'Waktu pencarian lokasi GPS habis (timeout). Sinyal GPS satelit atau jaringan lemah di dalam gedung. Silakan tekan Deteksi Ulang di area yang lebih terbuka.';
    }

    setErrorMessage(msg);
    setErrorCode(error.code);
    setIsLoading(false);
    setDetectionStage('');
  };

  /**
   * Mekanisme 2 Tahap Pengambilan Lokasi:
   * Tahap 1: GPS Akurasi Tinggi (Satelit GPS)
   * Tahap 2: Fallback Jaringan (Wi-Fi/Seluler) jika Tahap 1 gagal karena TIMEOUT atau POSITION_UNAVAILABLE
   * JANGAN fallback jika error PERMISSION_DENIED (izin ditolak).
   */
  const fetchCurrentLocation = () => {
    setErrorMessage(null);
    setErrorCode(null);

    // 1. Cek dukungan Geolocation API
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setErrorMessage('Browser atau perangkat ini tidak mendukung Geolocation API.');
      setErrorCode('UNSUPPORTED');
      setIsLoading(false);
      setDetectionStage('');
      return;
    }

    // 2. Cek Secure Context (Wajib HTTPS di HP)
    if (!isSecure) {
      setErrorMessage('Sensor GPS dinonaktifkan oleh browser HP karena koneksi belum HTTPS. Harap akses melalui URL HTTPS (Cloudflare Tunnel) agar browser mengizinkan sensor GPS.');
      setErrorCode('INSECURE');
      setIsLoading(false);
      setDetectionStage('');
      return;
    }

    setIsLoading(true);
    setDetectionStage('high_accuracy');

    // TAHAP 1: GPS Akurasi Tinggi (Satelit)
    // - enableHighAccuracy: true
    // - timeout: 20000 (20 detik)
    // - maximumAge: 0 (lokasi terbaru)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        handlePositionSuccess(position, false);
      },
      (error) => {
        // Jika izin ditolak oleh pengguna, JANGAN lakukan fallback otomatis
        if (error.code === 1 || error.code === error.PERMISSION_DENIED) {
          handlePositionError(error, 'high_accuracy_denied');
          return;
        }

        // TAHAP 2: Fallback Jaringan jika timeout atau position unavailable
        console.warn('GPS akurasi tinggi terkendala, mencoba fallback jaringan (Wi-Fi/seluler)...', error);
        setDetectionStage('network_fallback');

        navigator.geolocation.getCurrentPosition(
          (fallbackPosition) => {
            handlePositionSuccess(fallbackPosition, false);
          },
          (fallbackError) => {
            handlePositionError(fallbackError, 'network_fallback');
          },
          {
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 60000
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      }
    );
  };

  /**
   * Menggunakan titik alternatif koordinat RS jika GPS perangkat benar-benar terkendala
   * - Menandai sumber secara eksplisit: source = 'HOSPITAL_FALLBACK'
   * - Akurasi lokasi diset NULL (tidak mengarang nilai akurasi sensor)
   * - isSimulated = true
   */
  const useHospitalGps = () => {
    const coords = getResolvedHospitalCoords();
    const lat = Number(coords.lat.toFixed(6));
    const lng = Number(coords.lng.toFixed(6));

    const hospitalGpsLocation = {
      // Format frontend camelCase
      latitude: lat,
      longitude: lng,
      akurasiLokasi: null, // Jangan mengarang akurasi sensor GPS!
      jarakDariRsMeter: 0,
      isOutsideHospitalRadius: false,
      verificationAlert: null,
      source: 'HOSPITAL_FALLBACK',
      sumberKoordinat: 'Koordinat Rumah Sakit',
      // Format backend MySQL snake_case
      lat_petugas: lat,
      lng_petugas: lng,
      akurasi_lokasi_meter: null,
      jarak_dari_rs_meter: 0,
      hospital_radius_meter: coords.radius_meter || 200,
      is_outside_hospital_radius: false,
      verification_alert: null,
      sumber_koordinat: 'Koordinat Rumah Sakit',
      waktu: new Date().toISOString(),
      isSimulated: true
    };

    setLocation(hospitalGpsLocation);
    setErrorMessage(null);
    setErrorCode(null);
    if (onLocationCaptured) {
      onLocationCaptured(hospitalGpsLocation);
    }
  };

  const copyCoordinates = async () => {
    if (!location) return;
    const lat = location.latitude ?? location.lat_petugas;
    const lng = location.longitude ?? location.lng_petugas;
    if (!isValidCoordinate(lat, lng)) return;

    const text = `${lat}, ${lng}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.warn('Gagal menyalin koordinat:', err);
    }
  };

  // Status koordinat saat ini
  const currentLat = location?.latitude ?? location?.lat_petugas;
  const currentLng = location?.longitude ?? location?.lng_petugas;
  const hasValidLocation = isValidCoordinate(currentLat, currentLng);
  const isActualGps = hasValidLocation && !location?.isSimulated && location?.source !== 'HOSPITAL_FALLBACK';

  const gmapsUrl = hasValidLocation
    ? `https://www.google.com/maps?q=${currentLat},${currentLng}`
    : '#';

  const gmapsEmbedUrl = hasValidLocation
    ? `https://maps.google.com/maps?q=${currentLat},${currentLng}&hl=id&z=16&output=embed`
    : null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
          <span>Validasi Titik Koordinat GPS Lapangan</span>
          <span className="text-red-500">*Wajib</span>
        </label>

        {hasValidLocation && (
          isActualGps ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Lokasi Terverifikasi (GPS Perangkat)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              <Building2 className="w-3 h-3 text-blue-600" /> Titik Acuan Rumah Sakit (Alternatif Manual)
            </span>
          )
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
        {hasValidLocation ? (
          <div className="space-y-3">
            {/* Coordinate Cards */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Latitude (lat_petugas)</span>
                <span className="font-mono font-bold text-slate-900 text-xs">{currentLat}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Longitude (lng_petugas)</span>
                <span className="font-mono font-bold text-slate-900 text-xs">{currentLng}</span>
              </div>
            </div>

            {/* GPS Metadata Bar & Distance to Hospital */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs pt-1 border-t border-slate-200/80 text-slate-600">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Sumber Koordinat */}
                {isActualGps ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <Radio className="w-3 h-3 text-emerald-700" />
                    <span>Sumber: GPS Perangkat (Aktual)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                    <Building2 className="w-3 h-3 text-blue-700" />
                    <span>Sumber: Koordinat Rumah Sakit</span>
                  </span>
                )}

                {/* Akurasi */}
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <Navigation className="w-3.5 h-3.5 text-blue-600" />
                  {isActualGps && (location.akurasiLokasi || location.akurasi_lokasi_meter) ? (
                    <span>Akurasi Sensor: <strong className="text-slate-900 font-bold">±{location.akurasiLokasi || location.akurasi_lokasi_meter} m</strong></span>
                  ) : (
                    <span className="text-slate-500 italic">Akurasi: N/A (Titik Acuan Manual)</span>
                  )}
                </span>

                {/* Jarak ke RS */}
                {(location.jarak_dari_rs_meter !== null && location.jarak_dari_rs_meter !== undefined) && (
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${location.is_outside_hospital_radius
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      }`}
                  >
                    <MapPin className="w-3 h-3" />
                    <span>
                      Jarak ke RS: {location.jarak_dari_rs_meter} m
                      {location.is_outside_hospital_radius
                        ? ` (Di luar radius ${location.hospital_radius_meter || 200} m)`
                        : ` (Dalam radius ${location.hospital_radius_meter || 200} m)`}
                    </span>
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={copyCoordinates}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Salin koordinat lat, lng"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopied ? 'Tersalin' : 'Salin Koordinat'}</span>
                </button>

                <a
                  href={gmapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#145DA0] hover:bg-[#0f497e] px-2.5 py-1 rounded shadow-2xs transition-colors"
                  title="Buka titik koordinat di Google Maps"
                >
                  <span>Buka di Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                <button
                  type="button"
                  onClick={fetchCurrentLocation}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-[#145DA0] px-2 py-1 cursor-pointer"
                  title="Deteksi ulang GPS perangkat"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Mendeteksi...' : 'Deteksi Ulang'}</span>
                </button>
              </div>
            </div>

            {/* Peringatan Soft Geofence jika di luar radius */}
            {location.is_outside_hospital_radius && isActualGps && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Peringatan Soft Geofence:</strong> Lokasi GPS berada {location.jarak_dari_rs_meter} meter dari titik acuan RS (radius standar {location.hospital_radius_meter || 200} m). Sesuai SOP Jasa Raharja, kunjungan tetap dapat disimpan dan akan ditandai untuk verifikasi supervisor.
                </div>
              </div>
            )}

            {/* Google Maps Interactive Embed Preview */}
            {gmapsEmbedUrl && (
              <div className="pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-red-500" />
                    <span>Peta Lokasi Google Maps</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMapPreview(!showMapPreview)}
                    className="text-blue-700 hover:underline cursor-pointer"
                  >
                    {showMapPreview ? 'Sembunyikan Peta' : 'Tampilkan Peta'}
                  </button>
                </div>

                {showMapPreview && (
                  <div className="relative rounded-lg overflow-hidden border border-slate-300 shadow-2xs h-36 bg-slate-100">
                    <iframe
                      src={gmapsEmbedUrl}
                      className="w-full h-full border-0"
                      title="Google Maps Pin Preview"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="py-4 text-center space-y-3">
            <div className="flex flex-col items-center justify-center gap-1 text-slate-600 text-xs">
              <MapPin className="w-6 h-6 text-slate-400" />
              <p className="font-bold text-slate-800 text-xs">
                {isLoading
                  ? (detectionStage === 'high_accuracy'
                    ? 'Mengunci satelit GPS perangkat (Tahap 1, akurasi tinggi)...'
                    : 'Mencoba deteksi via jaringan seluler/Wi-Fi (Tahap 2)...')
                  : 'Lokasi GPS Perangkat Belum Terdeteksi'}
              </p>
              <p className="text-[11px] text-slate-500 max-w-sm">
                Tekan tombol di bawah untuk meminta koordinat lokasi langsung dari GPS perangkat HP Anda saat berada di faskes.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={fetchCurrentLocation}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] text-white hover:bg-[#0f497e] shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>
                  {isLoading
                    ? (detectionStage === 'high_accuracy' ? 'Mengunci Satelit GPS...' : 'Cek Jaringan...')
                    : 'Deteksi GPS Perangkat'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Banner Pesan Error & Solusi */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
            {errorCode === 'INSECURE' ? (
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 space-y-1.5">
              <p className="font-bold text-amber-950">
                {errorCode === 1 || errorCode === 'PERMISSION_DENIED'
                  ? 'Izin Akses Lokasi Ditolak'
                  : (errorCode === 'INSECURE'
                    ? 'Koneksi Belum Menggunakan HTTPS'
                    : 'Kendala Pengambilan GPS')}
              </p>
              <p className="text-[11px] text-amber-900 leading-relaxed">{errorMessage}</p>

              {/* Panduan khusus jika izin ditolak */}
              {(errorCode === 1 || errorCode === 'PERMISSION_DENIED') && (
                <div className="text-[11px] bg-white/70 p-2 rounded-md border border-amber-200 text-amber-950 space-y-1">
                  <p className="font-semibold">Cara Mengaktifkan Izin Lokasi di HP:</p>
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Ketuk ikon <strong>Gembok</strong> atau <strong>Setelan</strong> di sebelah kiri alamat web pada browser HP.</li>
                    <li>Pilih menu <strong>Izin Situs</strong> atau <strong>Permissions</strong>.</li>
                    <li>Ubah izin <strong>Lokasi</strong> menjadi <strong>Izinkan (Allow)</strong>.</li>
                    <li>Kembali ke halaman ini dan tekan tombol <strong>Coba Deteksi Ulang</strong> di bawah.</li>
                  </ol>
                </div>
              )}

              <div className="pt-1 flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={fetchCurrentLocation}
                  disabled={isLoading}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-200 hover:bg-amber-300 font-bold text-amber-950 text-[11px] cursor-pointer"
                >
                  Coba Deteksi Ulang
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
