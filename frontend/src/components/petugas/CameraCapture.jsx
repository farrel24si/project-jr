import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  RefreshCw,
  AlertCircle,
  Check,
  ShieldCheck,
  MapPin,
  Calendar,
  User,
  Trash2,
  Plus,
  Eye,
  Video,
  X
} from 'lucide-react';
import { stampPhotoWatermark, compressImage, fileToSafeDataUrl } from '../../services/photoUtils';

export default function CameraCapture({
  onPhotoCaptured,
  onPhotosChanged,
  initialPhoto = null,
  initialPhotos = [],
  metadata = {}
}) {
  // Inisialisasi daftar foto dari initialPhotos atau initialPhoto
  const [photos, setPhotos] = useState(() => {
    if (Array.isArray(initialPhotos) && initialPhotos.length > 0) {
      return initialPhotos.filter(Boolean);
    }
    if (initialPhoto) {
      return [initialPhoto];
    }
    return [];
  });

  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [realtimeNow, setRealtimeNow] = useState(new Date());
  const [selectedZoomPhoto, setSelectedZoomPhoto] = useState(null);
  const [replacingIndex, setReplacingIndex] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Sinkronisasi saat initialPhoto/initialPhotos berubah dari luar (misal restore session atau reset form)
  useEffect(() => {
    if (Array.isArray(initialPhotos) && initialPhotos.length > 0) {
      setPhotos(initialPhotos.filter(Boolean));
    } else if (initialPhoto) {
      setPhotos([initialPhoto]);
    } else {
      setPhotos([]);
    }
  }, [initialPhoto, initialPhotos]);

  // Update jam realtime setiap detik untuk live stream
  useEffect(() => {
    const timer = setInterval(() => {
      setRealtimeNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const triggerNotify = (newPhotos) => {
    setPhotos(newPhotos);
    if (onPhotosChanged) {
      onPhotosChanged(newPhotos);
    }
    if (onPhotoCaptured) {
      onPhotoCaptured(newPhotos[0] || null);
    }
  };

  const startCamera = async () => {
    setIsInitializing(true);
    setErrorMessage(null);
    try {
      const isSecure = typeof window !== 'undefined'
        ? (window.isSecureContext ?? (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
        : true;

      if (!isSecure) {
        throw new Error('NON_SECURE_CONTEXT');
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser tidak mendukung akses kamera langsung. Gunakan tombol "Buka Kamera HP".');
      }

      stopCamera();

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (err) {
        // Fallback jika kamera belakang tidak ditemukan atau error
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      streamRef.current = stream;
      setIsStreaming(true);
    } catch (err) {
      console.warn('Camera access error, fallback to device camera input:', err);
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        setErrorMessage('Izin kamera ditolak atau kamera tidak terdeteksi pada perangkat Anda.');
      }
      setIsStreaming(false);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    if (isStreaming && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch((err) => {
        console.warn('Video auto-play warning:', err);
      });
    }
  }, [isStreaming]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  };

  const processAndApplyWatermark = async (rawUrl, targetIndex = null) => {
    setIsProcessing(true);
    setProcessingStatus('Membubuhkan Watermark Resmi & Kompresi...');
    try {
      const nowRealtimeIso = new Date().toISOString();
      const latVal = metadata.latitude !== undefined && metadata.latitude !== null
        ? Number(metadata.latitude)
        : (metadata.lat_petugas !== undefined && metadata.lat_petugas !== null ? Number(metadata.lat_petugas) : null);
      const lngVal = metadata.longitude !== undefined && metadata.longitude !== null
        ? Number(metadata.longitude)
        : (metadata.lng_petugas !== undefined && metadata.lng_petugas !== null ? Number(metadata.lng_petugas) : null);
      const accVal = metadata.akurasiLokasi !== undefined && metadata.akurasiLokasi !== null
        ? Number(metadata.akurasiLokasi)
        : (metadata.akurasi_lokasi_meter !== undefined && metadata.akurasi_lokasi_meter !== null ? Number(metadata.akurasi_lokasi_meter) : null);

      const watermarkData = {
        petugasNama: metadata.petugasNama || 'Petugas Lapangan Jasa Raharja',
        waktu: nowRealtimeIso,
        lokasi: metadata.rumahSakit || 'Rumah Sakit',
        latitude: Number.isFinite(latVal) ? latVal : null,
        longitude: Number.isFinite(lngVal) ? lngVal : null,
        akurasiLokasi: Number.isFinite(accVal) ? accVal : null,
        sumberKoordinat: metadata.sumberKoordinat || metadata.sumber_koordinat || (metadata.isSimulated ? 'Koordinat Rumah Sakit' : (Number.isFinite(latVal) ? 'GPS Perangkat' : null)),
        isSimulated: Boolean(metadata.isSimulated),
        korbanNama: metadata.korbanNama && typeof metadata.korbanNama === 'string' ? metadata.korbanNama.trim() : (metadata.korbanNama || null)
      };

      const watermarked = await stampPhotoWatermark(rawUrl, watermarkData, 720, 540, 0.75);

      let updatedPhotos;
      if (targetIndex !== null && targetIndex >= 0 && targetIndex < photos.length) {
        // Ganti foto pada indeks tertentu
        updatedPhotos = [...photos];
        updatedPhotos[targetIndex] = watermarked;
      } else {
        // Tambahkan foto baru ke daftar
        updatedPhotos = [...photos, watermarked];
      }

      triggerNotify(updatedPhotos);
      setReplacingIndex(null);
    } catch (err) {
      console.error('Error applying watermark:', err);
      const fallback = await compressImage(rawUrl, 640, 480, 0.7);
      let updatedPhotos;
      if (targetIndex !== null && targetIndex >= 0 && targetIndex < photos.length) {
        updatedPhotos = [...photos];
        updatedPhotos[targetIndex] = fallback;
      } else {
        updatedPhotos = [...photos, fallback];
      }
      triggerNotify(updatedPhotos);
      setReplacingIndex(null);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const takePhotoFromLiveStream = async () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const rawUrl = canvas.toDataURL('image/jpeg', 0.85);
      stopCamera();
      await processAndApplyWatermark(rawUrl, replacingIndex);
    } catch (err) {
      console.error('Error capturing photo from live stream:', err);
      setErrorMessage('Gagal memproses hasil foto kamera. Coba lagi.');
    }
  };

  const handleFileInputChange = async (e, targetIndex = null) => {
    const file = e.target.files?.[0];
    if (!file) {
      setReplacingIndex(null);
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Membaca & Mengoptimalkan Foto...');
    setErrorMessage(null);

    try {
      // Mengubah file foto kamera HP menjadi data URL resolusi aman (mencegah tab crash / OOM di browser HP)
      const safeDataUrl = await fileToSafeDataUrl(file, 1024, 768, 0.8);
      stopCamera();
      await processAndApplyWatermark(safeDataUrl, targetIndex);
    } catch (err) {
      console.error('Gagal memproses foto dari file input:', err);
      setErrorMessage('Gagal memproses file foto. Pastikan format foto didukung (JPG, PNG).');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
      // Reset input agar dapat memilih foto yang sama atau mengambil ulang
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleDeletePhoto = (indexToDelete, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const updated = photos.filter((_, idx) => idx !== indexToDelete);
    triggerNotify(updated);
  };

  const handleStartReplacePhoto = (indexToReplace, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setReplacingIndex(indexToReplace);
    startCamera();
  };

  const handleOpenHpCamera = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setReplacingIndex(null);
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Format jam realtime untuk live viewfinder (WIB / Asia/Jakarta)
  const formattedRealtimeClock = realtimeNow.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta'
  }) + ', ' + realtimeNow.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Jakarta'
  }).replace(/:/g, '.') + ' WIB';

  return (
    <div className="space-y-3">
      {/* Hidden File Input: Camera */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        onClick={(e) => {
          e.target.value = null;
        }}
        onChange={(e) => handleFileInputChange(e, replacingIndex)}
      />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-[#145DA0]" />
          <span>Foto Dokumentasi &amp; Watermark Lapangan</span>
          <span className="text-red-500">*Wajib</span>
        </label>
        {photos.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            <Check className="w-3 h-3 text-emerald-600" />
            <span>{photos.length} Foto Terlampir &amp; Terstempel</span>
          </span>
        )}
      </div>

      {/* Loading Indicator saat Memproses Watermark */}
      {isProcessing && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center gap-3 text-xs text-blue-900 font-semibold shadow-2xs animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-[#145DA0]" />
          <span>{processingStatus || 'Memproses foto & membubuhkan watermark...'}</span>
        </div>
      )}

      {/* Mode 1: Live Video Stream Viewfinder */}
      {isStreaming ? (
        <div className="relative rounded-xl overflow-hidden border border-slate-300 bg-black shadow-sm">
          <video
            ref={(el) => {
              videoRef.current = el;
              if (el && streamRef.current && el.srcObject !== streamRef.current) {
                el.srcObject = streamRef.current;
                el.play().catch(() => {});
              }
            }}
            playsInline
            autoPlay
            muted
            onLoadedMetadata={() => {
              if (videoRef.current) {
                videoRef.current.play().catch(() => {});
              }
            }}
            className="w-full max-h-80 object-contain bg-black"
          />

          {/* Logo Jasa Raharja di Kiri Atas Viewfinder */}
          <div className="absolute top-3 left-3 z-20 select-none pointer-events-none drop-shadow-md">
            <img
              src="/img/logo-jasa-raharja.png"
              alt="Logo PT Jasa Raharja"
              className="h-9 w-auto object-contain drop-shadow"
            />
          </div>

          {/* Jam Realtime di Kanan Atas Viewfinder */}
          <div className="absolute top-2.5 right-2.5 z-20 bg-slate-950/80 backdrop-blur-md text-white text-[10px] font-mono px-2.5 py-1.5 rounded-xl border border-white/20 shadow-lg flex items-center gap-1.5 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="font-bold text-emerald-400">{formattedRealtimeClock}</span>
          </div>

          {/* Banner Informasi Kunjungan di Bagian Bawah Viewfinder */}
          <div className="absolute bottom-16 left-2.5 right-2.5 z-20 bg-slate-950/80 backdrop-blur-md text-white p-2 rounded-lg text-[10px] space-y-0.5 border border-white/15 pointer-events-none">
            <p className="font-semibold text-slate-200">
              Petugas: <strong className="text-white">{metadata.petugasNama || 'Petugas Lapangan'}</strong>
              {metadata.korbanNama && <span> &bull; Pasien: <strong className="text-white">{metadata.korbanNama}</strong></span>}
            </p>
            <p className="text-slate-300">
              Lokasi: <strong className="text-white">{metadata.rumahSakit || 'Rumah Sakit'}</strong>
            </p>
            {metadata.latitude ? (
              <p className="text-emerald-400 font-mono font-bold">
                Titik GPS: {Number(metadata.latitude).toFixed(6)}, {Number(metadata.longitude).toFixed(6)}
                {metadata.akurasiLokasi ? ` (±${metadata.akurasiLokasi}m)` : ''}
              </p>
            ) : (
              <p className="text-amber-300 italic">Koordinat GPS belum terkunci</p>
            )}
          </div>

          <div className="p-3 bg-slate-900 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={takePhotoFromLiveStream}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white shadow-md transition-transform active:scale-95 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Ambil Foto &amp; Stempel Watermark</span>
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
            >
              Batal
            </button>
          </div>
        </div>
      ) : photos.length > 0 ? (
        /* Mode 2: Daftar Foto yang Sudah Diambil */
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {photos.map((photoUrl, idx) => (
              <div
                key={idx}
                className="relative rounded-xl overflow-hidden border border-slate-300 bg-slate-900 shadow-sm flex flex-col justify-between"
              >
                {/* Image Container with Zoom Click */}
                <div
                  className="relative group cursor-pointer bg-black flex items-center justify-center min-h-[160px] max-h-56 overflow-hidden"
                  onClick={() => setSelectedZoomPhoto(photoUrl)}
                >
                  <img
                    src={photoUrl}
                    alt={`Foto Dokumentasi ${idx + 1}`}
                    className="w-full h-48 object-contain bg-black group-hover:scale-102 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                    <span className="bg-black/75 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 shadow-md">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Klik untuk Memperbesar</span>
                    </span>
                  </div>
                  {/* Badge Nomor Foto */}
                  <div className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/20">
                    Foto #{idx + 1}
                  </div>
                </div>

                {/* Card Action & Info Bar */}
                <div className="p-2.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-300 space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Watermark Resmi JR</span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleStartReplacePhoto(idx, e)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                        title="Ganti foto ini dengan foto baru"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Ganti</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDeletePhoto(idx, e)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors cursor-pointer"
                        title="Hapus foto ini"
                      >
                        <Trash2 className="w-3 h-3 text-rose-400" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tombol Tambah Foto Berikutnya */}
          <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl flex flex-wrap items-center justify-between gap-2.5">
            <div className="text-[11px] text-slate-600">
              <span className="font-semibold text-slate-800">Perlu dokumentasi tambahan?</span>
              <p className="text-[10px] text-slate-500">Anda dapat mengambil foto tambahan tanpa menghapus foto sebelumnya.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startCamera}
                disabled={isProcessing || isInitializing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>+ Buka Kamera</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Mode 3: Idle State (Belum ada foto yang diambil) */
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center bg-slate-50/70 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center border border-blue-100 shadow-2xs">
            <Camera className="w-6 h-6" />
          </div>

          <div>
            <p className="text-xs font-bold text-slate-800">
              Dokumentasi Foto Kunjungan Rumah Sakit
            </p>
            <p className="text-[11px] text-slate-500 max-w-sm mt-0.5 leading-relaxed">
              Foto akan otomatis distempel dengan identitas Petugas, Waktu Aktual WIB, Lokasi RS, dan Titik Koordinat GPS.
            </p>
          </div>

          {/* Action Button: Buka Kamera Langsung */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            <button
              type="button"
              onClick={startCamera}
              disabled={isInitializing || isProcessing}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span>Buka Kamera</span>
            </button>
          </div>
        </div>
      )}

      {/* Error Message Box */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Perhatian Akses Kamera</p>
            <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">{errorMessage}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenHpCamera}
                className="px-3 py-1 rounded-lg bg-[#145DA0] font-bold text-white text-[11px] cursor-pointer"
              >
                Gunakan Kamera HP
              </button>
              <button
                type="button"
                onClick={handleOpenGallery}
                className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-semibold text-amber-950 text-[11px] cursor-pointer"
              >
                Pilih dari Galeri
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Zoom Preview Foto */}
      {selectedZoomPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedZoomPhoto(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs text-white">
              <span className="font-bold text-blue-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Pratinjau Foto Watermark Resmi Jasa Raharja</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedZoomPhoto(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2 bg-black flex items-center justify-center">
              <img
                src={selectedZoomPhoto}
                alt="Pratinjau Foto Dokumentasi"
                className="w-full max-h-[75vh] object-contain"
              />
            </div>

            <div className="p-3 bg-slate-950 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedZoomPhoto(null)}
                className="px-4 py-1.5 bg-white text-slate-900 font-bold rounded-xl text-xs hover:bg-slate-200 cursor-pointer"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
