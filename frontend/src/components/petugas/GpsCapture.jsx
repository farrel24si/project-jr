import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';

const HOSPITAL_COORDINATES = {
  'RSUP Dr. Cipto Mangunkusumo': { lat: -6.197210, lng: 106.848320, accuracy: 8 },
  'RS Polri Said Sukanto': { lat: -6.269100, lng: 106.868800, accuracy: 6 },
  'RSUD Tarakan': { lat: -6.168500, lng: 106.808000, accuracy: 9 },
  'RSUP Fatmawati': { lat: -6.294200, lng: 106.794600, accuracy: 7 },
  'RS Columbia Asia Pulomas': { lat: -6.177500, lng: 106.883400, accuracy: 8 },
  'RS Hermina Jatinegara': { lat: -6.224100, lng: 106.864700, accuracy: 10 },
  'RS Siloam Kebon Jeruk': { lat: -6.191200, lng: 106.764500, accuracy: 8 }
};

export default function GpsCapture({
  onLocationCaptured,
  initialLocation = null,
  hospitalName = 'RSUP Dr. Cipto Mangunkusumo'
}) {
  const [location, setLocation] = useState(initialLocation);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showMapPreview, setShowMapPreview] = useState(true);

  const fetchCurrentLocation = () => {
    setIsLoading(true);
    setErrorMessage(null);

    if (!navigator.geolocation) {
      setErrorMessage('Browser tidak mendukung Geolocation API.');
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          latitude: parseFloat(position.coords.latitude.toFixed(6)),
          longitude: parseFloat(position.coords.longitude.toFixed(6)),
          akurasiLokasi: Math.round(position.coords.accuracy),
          waktu: new Date().toISOString(),
          isSimulated: false
        };
        setLocation(loc);
        setIsLoading(false);
        if (onLocationCaptured) {
          onLocationCaptured(loc);
        }
      },
      (error) => {
        console.warn('Geolocation error:', error);
        let msg = 'Gagal mendeteksi lokasi GPS.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Izin lokasi GPS ditolak oleh browser. Mohon izinkan akses lokasi pada browser Anda.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Informasi lokasi perangkat saat ini tidak tersedia.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Waktu permintaan lokasi GPS habis (timeout).';
        }
        setErrorMessage(msg);
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const useHospitalGps = () => {
    const coords = HOSPITAL_COORDINATES[hospitalName] || {
      lat: -6.197210,
      lng: 106.848320,
      accuracy: 8
    };

    const mockLoc = {
      latitude: coords.lat,
      longitude: coords.lng,
      akurasiLokasi: coords.accuracy,
      waktu: new Date().toISOString(),
      isSimulated: true
    };
    setLocation(mockLoc);
    setErrorMessage(null);
    if (onLocationCaptured) {
      onLocationCaptured(mockLoc);
    }
  };

  const copyCoordinates = () => {
    if (!location) return;
    const text = `${location.latitude}, ${location.longitude}`;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  useEffect(() => {
    if (!initialLocation && !location) {
      fetchCurrentLocation();
    }
  }, []);

  const gmapsUrl = location
    ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
    : '#';

  const gmapsEmbedUrl = location
    ? `https://maps.google.com/maps?q=${location.latitude},${location.longitude}&hl=id&z=16&output=embed`
    : null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
          <span>Validasi Titik Koordinat GPS (Google Maps API)</span>
          <span className="text-red-500">*Wajib</span>
        </label>
        {location && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Lokasi Terverifikasi
          </span>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
        {location ? (
          <div className="space-y-3">
            {/* Coordinate Cards */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Latitude</span>
                <span className="font-mono font-bold text-slate-900 text-xs">{location.latitude}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Longitude</span>
                <span className="font-mono font-bold text-slate-900 text-xs">{location.longitude}</span>
              </div>
            </div>

            {/* GPS Metadata Bar & Google Maps Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs pt-1 border-t border-slate-200/80 text-slate-600">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <Navigation className="w-3.5 h-3.5 text-blue-600" />
                  <span>Akurasi: <strong className="text-slate-900 font-bold">±{location.akurasiLokasi || 8} m</strong></span>
                </span>
                {location.isSimulated && (
                  <span className="text-[10px] bg-blue-100 text-[#145DA0] font-semibold px-1.5 py-0.5 rounded">
                    Titik Presisi RS
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={copyCoordinates}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
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
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-[#145DA0] px-2 py-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh GPS</span>
                </button>
              </div>
            </div>

            {/* Google Maps Interactive Embed Preview */}
            {gmapsEmbedUrl && (
              <div className="pt-2">
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
          <div className="py-4 text-center space-y-2.5">
            <div className="flex items-center justify-center gap-2 text-slate-600 text-xs">
              <MapPin className="w-5 h-5 text-slate-400" />
              <span>{isLoading ? 'Sedang mengunci satelit GPS perangkat...' : 'Belum mendeteksi koordinat GPS.'}</span>
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={fetchCurrentLocation}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#145DA0] text-white hover:bg-[#0f497e] shadow-xs cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Mengunci Sinyal...' : 'Deteksi GPS Perangkat'}</span>
              </button>
              <button
                type="button"
                onClick={useHospitalGps}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <span>Gunakan Koordinat {hospitalName}</span>
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-amber-950">Akses Lokasi Terkendala</p>
              <p className="text-[11px] text-amber-800 mt-0.5">{errorMessage}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={fetchCurrentLocation}
                  className="px-2.5 py-1 rounded bg-amber-200 font-semibold text-amber-950 text-[11px] cursor-pointer"
                >
                  Coba Deteksi Ulang
                </button>
                <button
                  type="button"
                  onClick={useHospitalGps}
                  className="px-2.5 py-1 rounded bg-white border border-amber-300 font-medium text-amber-950 text-[11px] cursor-pointer"
                >
                  Gunakan Titik Presisi Rumah Sakit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
