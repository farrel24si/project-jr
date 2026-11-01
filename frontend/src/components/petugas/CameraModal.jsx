import React, { useState, useRef, useEffect } from 'react';
import Modal from '../common/Modal';
import { Camera, RefreshCw, Check, X, AlertCircle, Upload } from 'lucide-react';
import { compressImage } from '../../services/photoUtils';

export default function CameraModal({ isOpen, onClose, onPhotoConfirmed, currentPhoto = null }) {
  const [photoPreview, setPhotoPreview] = useState(currentPhoto);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const startCamera = async () => {
    setIsLoadingCamera(true);
    setErrorMsg(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Kamera tidak didukung oleh browser ini.');
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
      console.warn('Camera error:', err);
      setErrorMsg('Kamera tidak dapat diakses atau izin ditolak.');
      setIsStreaming(false);
    } finally {
      setIsLoadingCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  };

  const captureFrame = async () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const rawUrl = canvas.toDataURL('image/jpeg', 0.85);
      const compressed = await compressImage(rawUrl, 640, 480, 0.7);

      setPhotoPreview(compressed);
      stopCamera();
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal memproses foto.');
    }
  };

  const retake = () => {
    setPhotoPreview(null);
    startCamera();
  };

  const confirmPhoto = () => {
    if (photoPreview && onPhotoConfirmed) {
      onPhotoConfirmed(photoPreview);
      onClose();
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawUrl = event.target.result;
      const compressed = await compressImage(rawUrl, 640, 480, 0.7);
      setPhotoPreview(compressed);
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (isOpen) {
      setPhotoPreview(currentPhoto);
      if (!currentPhoto) {
        startCamera();
      }
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kamera Kunjungan Rumah Sakit"
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {photoPreview ? (
          /* Preview Result */
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black border border-slate-300 flex items-center justify-center">
              <img
                src={photoPreview}
                alt="Foto Kunjungan"
                className="w-full max-h-80 object-contain bg-black"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={retake}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Ulangi Foto</span>
              </button>

              <button
                type="button"
                onClick={confirmPhoto}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>Gunakan Foto Ini</span>
              </button>
            </div>
          </div>
        ) : isStreaming ? (
          /* Live Stream */
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black border border-slate-800">
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="w-full max-h-80 object-contain bg-black"
              />
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={captureFrame}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm bg-red-600 hover:bg-red-700 text-white shadow-md active:scale-95 transition-transform"
              >
                <Camera className="w-4 h-4" />
                <span>Ambil Foto</span>
              </button>
            </div>
          </div>
        ) : (
          /* Idle / Fallback */
          <div className="border border-slate-200 rounded-lg p-6 text-center space-y-4 bg-slate-50">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-[#0A3981] flex items-center justify-center mx-auto">
              <Camera className="w-6 h-6" />
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={startCamera}
                disabled={isLoadingCamera}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[#0A3981] text-white hover:bg-blue-900"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCamera ? 'animate-spin' : ''}`} />
                <span>Buka Kamera Perangkat</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Pilih dari Galeri/File</span>
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
      </div>
    </Modal>
  );
}
