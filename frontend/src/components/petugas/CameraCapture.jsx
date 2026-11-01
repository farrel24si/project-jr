import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  RefreshCw,
  AlertCircle,
  Check,
  Image as ImageIcon,
  ShieldCheck,
  MapPin,
  Calendar,
  User,
  ExternalLink
} from 'lucide-react';
import { stampPhotoWatermark, compressImage } from '../../services/photoUtils';

export default function CameraCapture({
  onPhotoCaptured,
  initialPhoto = null,
  metadata = {}
}) {
  const [photoDataUrl, setPhotoDataUrl] = useState(initialPhoto);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isProcessingWatermark, setIsProcessingWatermark] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const startCamera = async () => {
    setIsInitializing(true);
    setErrorMessage(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser tidak mendukung akses kamera langsung. Gunakan opsi unggah file.');
      }

      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsStreaming(true);
    } catch (err) {
      console.warn('Camera access error:', err);
      let msg = 'Izin kamera ditolak atau perangkat kamera tidak terdeteksi.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Izin akses kamera ditolak oleh browser. Mohon izinkan akses kamera di pengaturan browser atau gunakan unggah foto.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Kamera tidak ditemukan pada perangkat Anda.';
      }
      setErrorMessage(msg);
      setIsStreaming(false);
    } finally {
      setIsInitializing(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  };

  const processAndApplyWatermark = async (rawUrl) => {
    setIsProcessingWatermark(true);
    try {
      const watermarkData = {
        petugasNama: metadata.petugasNama || 'Petugas Lapangan Jasa Raharja',
        waktu: metadata.waktu || new Date().toISOString(),
        lokasi: metadata.rumahSakit || 'Rumah Sakit',
        latitude: metadata.latitude || null,
        longitude: metadata.longitude || null,
        akurasiLokasi: metadata.akurasiLokasi || null,
        korbanNama: metadata.korbanNama || null
      };

      const watermarked = await stampPhotoWatermark(rawUrl, watermarkData, 720, 540, 0.75);
      setPhotoDataUrl(watermarked);
      if (onPhotoCaptured) {
        onPhotoCaptured(watermarked);
      }
    } catch (err) {
      console.error('Error applying watermark:', err);
      const fallback = await compressImage(rawUrl, 640, 480, 0.7);
      setPhotoDataUrl(fallback);
      if (onPhotoCaptured) {
        onPhotoCaptured(fallback);
      }
    } finally {
      setIsProcessingWatermark(false);
    }
  };

  const takePhoto = async () => {
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
      await processAndApplyWatermark(rawUrl);
    } catch (err) {
      console.error('Error capturing photo:', err);
      setErrorMessage('Gagal memproses hasil foto. Coba lagi.');
    }
  };

  const retakePhoto = () => {
    setPhotoDataUrl(null);
    if (onPhotoCaptured) {
      onPhotoCaptured(null);
    }
    startCamera();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawUrl = event.target.result;
      stopCamera();
      await processAndApplyWatermark(rawUrl);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const d = metadata.waktu ? new Date(metadata.waktu) : new Date();
  const formattedTime = d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) + ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-[#145DA0]" />
          <span>Foto Dokumentasi &amp; Watermark Lapangan</span>
          <span className="text-red-500">*Wajib</span>
        </label>
        {photoDataUrl && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <Check className="w-3 h-3 text-emerald-600" /> Foto Terstempel
          </span>
        )}
      </div>

      {/* Captured Preview */}
      {photoDataUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-slate-300 bg-slate-900 shadow-sm flex flex-col items-center">
          <img
            src={photoDataUrl}
            alt="Bukti Kunjungan Terstempel"
            className="w-full max-h-72 object-contain bg-black"
          />

          {/* Watermark Verification Badge Info Bar */}
          <div className="w-full p-3 bg-slate-900 border-t border-slate-800 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Watermark Resmi PT Jasa Raharja Tersemat</span>
              </span>
              <button
                type="button"
                onClick={retakePhoto}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-800 shadow-2xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Ambil Ulang</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px] text-slate-300 pt-1 border-t border-slate-800/80">
              <span className="flex items-center gap-1 truncate">
                <User className="w-3 h-3 text-slate-400 shrink-0" />
                <span>Petugas: {metadata.petugasNama || 'Petugas Lapangan'}</span>
              </span>
              <span className="flex items-center gap-1 truncate">
                <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                <span>Waktu: {formattedTime}</span>
              </span>
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                <span>Lokasi: {metadata.rumahSakit || 'Rumah Sakit'}</span>
              </span>
              <span className="flex items-center gap-1 font-mono text-emerald-400 truncate">
                <span>GPS: {metadata.latitude ? `${metadata.latitude}, ${metadata.longitude}` : 'Tersemat di Foto'}</span>
              </span>
            </div>
          </div>
        </div>
      ) : isStreaming ? (
        /* Live Video Stream */
        <div className="relative rounded-xl overflow-hidden border border-slate-300 bg-black shadow-sm">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full max-h-72 object-contain bg-black"
          />

          {/* Viewfinder Overlay */}
          <div className="absolute top-2 left-2 right-2 bg-slate-900/70 backdrop-blur-xs text-white p-2 rounded-lg text-[10px] space-y-0.5 border border-white/10 pointer-events-none">
            <p className="font-bold text-blue-300 uppercase tracking-wider">PT JASA RAHARJA • VIEW FINDER</p>
            <p>Petugas: {metadata.petugasNama || 'Petugas JR'} • Lokasi: {metadata.rumahSakit || 'RS'}</p>
            {metadata.latitude && (
              <p className="text-emerald-400 font-mono">GPS: {metadata.latitude}, {metadata.longitude}</p>
            )}
          </div>

          <div className="p-3 bg-slate-900 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={takePhoto}
              disabled={isProcessingWatermark}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white shadow-md transition-transform active:scale-95 cursor-pointer"
            >
              {isProcessingWatermark ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Membubuhkan Watermark...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>Ambil Foto &amp; Stempel Watermark</span>
                </>
              )}
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
      ) : (
        /* Idle State */
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center bg-slate-50/70 flex flex-col items-center justify-center gap-2.5">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center border border-blue-100 shadow-2xs">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">
              Dokumentasi Foto Langsung di Rumah Sakit
            </p>
            <p className="text-[11px] text-slate-500 max-w-sm mt-0.5">
              Foto akan otomatis distempel dengan identitas Petugas, Waktu, Lokasi RS, dan Titik Koordinat GPS.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            <button
              type="button"
              onClick={startCamera}
              disabled={isInitializing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-xs transition-colors cursor-pointer"
            >
              {isInitializing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Membuka Kamera...</span>
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5" />
                  <span>Buka Kamera Sekarang</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>Pilih Berkas Foto</span>
            </button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            capture="environment"
            className="hidden"
          />
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Perhatian Akses Kamera</p>
            <p className="text-[11px] text-amber-800 mt-0.5">{errorMessage}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={startCamera}
                className="px-2.5 py-1 rounded bg-amber-200 hover:bg-amber-300 font-bold text-amber-950 text-[11px] cursor-pointer"
              >
                Coba Buka Kamera Lagi
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 rounded bg-white border border-amber-300 font-semibold text-amber-950 text-[11px] cursor-pointer"
              >
                Pilih Berkas Foto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
