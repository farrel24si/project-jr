import React, { useState } from 'react';
import Modal from '../common/Modal';
import AuthenticatedImage from '../common/AuthenticatedImage';
import { parseCatatanKondisi } from '../../services/backendMapper';
import { getCachedPhoto } from '../../services/photoService';
import { getRealVisitPhoto } from '../../utils/realPhotos';
import { formatDateTimeIndo } from '../../utils/dateUtils';
import {
  Calendar,
  Clock,
  Building2,
  User,
  CheckCircle2,
  Camera,
  Navigation,
  ExternalLink,
  Lock,
  X,
  AlertTriangle
} from 'lucide-react';

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return formatDateTimeIndo(dateStr);
}

export default function ModalDetailKunjunganReadOnly({
  isOpen,
  onClose,
  activity,
  victim
}) {
  const [photoZoom, setPhotoZoom] = useState(false);
  const [zoomedPhotoUrl, setZoomedPhotoUrl] = useState(null);

  if (!isOpen || !activity) return null;

  const actDate = activity.tanggal || activity.tanggalKunjungan;
  const parsed = parseCatatanKondisi(
    activity.catatan_kondisi ||
    activity.hasilKomunikasi ||
    activity.hasilKunjungan ||
    activity.hasilPemantauan
  );

  const tindakanList =
    activity.checklistTindakan && activity.checklistTindakan.length > 0
      ? activity.checklistTindakan
      : parsed.tindakanList;

  const statusTL = activity.statusTindakLanjut || parsed.statusTindakLanjut;
  const kebutuhanTL =
    activity.checklistKebutuhanLanjutan && activity.checklistKebutuhanLanjutan.length > 0
      ? activity.checklistKebutuhanLanjutan
      : parsed.kebutuhanLanjutanList;

  const customNote = activity.catatanTambahan || parsed.catatanTambahan;
  const ringkasanTeks =
    parsed.cleanRingkasan ||
    activity.hasilKomunikasi ||
    activity.hasilKunjungan ||
    activity.hasilPemantauan;

  const hospitalName =
    activity.rumahSakit ||
    activity.rumahSakitRujukan ||
    victim?.rumahSakit ||
    'Rumah Sakit';

  const officerName = activity.petugasNama || victim?.namaPetugas || 'Petugas Jasa Raharja';

  const photoToDisplay =
    activity.foto_bukti_url ||
    (activity.fotoUrl && !activity.fotoUrl.startsWith('data:') ? activity.fotoUrl : null) ||
    (activity.visitId ? getCachedPhoto(`VISIT-${activity.visitId}`) : null) ||
    (activity.id && !/^\d+$/.test(String(activity.id)) ? getCachedPhoto(activity.id) : null) ||
    activity.fotoUrl ||
    getRealVisitPhoto(activity.id || activity.visitId || victim?.id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detail Riwayat Kunjungan Pasien"
      subtitle="Arsip historis resmi pemantauan dan kunjungan rumah sakit (Read-Only)."
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4 text-xs">
        {/* Read-Only Notice Badge */}
        <div className="flex items-center gap-2 p-2.5 bg-slate-100 border border-slate-200/90 rounded-xl text-slate-600 text-[11px]">
          <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>
            <strong>Arsip Historis Permanen:</strong> Data kunjungan ini bersifat read-only dan tidak dapat diubah atau dihapus untuk menjaga integritas riwayat pelayanan dan batas waktu.
          </span>
        </div>

        {/* Ringkasan Header Kunjungan (Gaya Bersih, Selaras dengan Detail Pasien) */}
        <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4.5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-extrabold text-sm text-slate-900">
                {activity.jenisAktivitas || (activity.kunjunganKe === 1 ? 'Kunjungan Awal' : 'Kunjungan Pemantauan')}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-[#145DA0]"></span>
                <span>{activity.kondisiKorban || activity.kondisi || 'Masih Dirawat'}</span>
              </span>
              {activity.statusKunjungan && (
                <span className="text-[11px] font-semibold text-slate-500">
                  • {activity.statusKunjungan}
                </span>
              )}
            </div>

            <span className="text-[11px] font-mono text-slate-400">
              ID: {activity.id || `VISIT-${activity.visitId || Date.now()}`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Rumah Sakit Pelaksanaan
              </span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-[#145DA0] shrink-0" />
                <span>{hospitalName}</span>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Petugas Pelaksana Kunjungan
              </span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800 mt-0.5">
                <User className="w-3.5 h-3.5 text-[#145DA0] shrink-0" />
                <span>{officerName}</span>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Waktu Aktual Kunjungan
              </span>
              <div className="flex items-center gap-1.5 text-slate-800 font-semibold mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{formatDateTime(activity.waktuAktualKunjungan || actDate)}</span>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Waktu Pencatatan Sistem
              </span>
              <div className="flex items-center gap-1.5 text-slate-600 font-mono mt-0.5">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{formatDateTime(activity.waktuPencatatanSistem || actDate)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tindakan yang Dilaksanakan Petugas */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 space-y-2.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Tindakan Petugas yang Dilaksanakan:
          </span>
          {tindakanList && tindakanList.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tindakanList.map((item, i) => (
                <div
                  key={i}
                  className="inline-flex items-center gap-1.5 text-xs bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl font-medium"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-700 italic">
              {ringkasanTeks || 'Pemeriksaan kondisi pasien fisik terlaksana.'}
            </p>
          )}
        </div>

        {/* Status & Kebutuhan Tindak Lanjut */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Status Tindak Lanjut Pasca Kunjungan:
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
              <span className={`w-2 h-2 rounded-full ${statusTL === 'Sudah Selesai' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span>{statusTL || 'Masih Perlu Ditindaklanjuti'}</span>
            </span>
          </div>

          {kebutuhanTL && kebutuhanTL.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-semibold text-slate-600 block">Kebutuhan Lanjutan:</span>
              <div className="flex flex-wrap gap-1.5">
                {kebutuhanTL.map((item, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] bg-slate-50 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg font-medium"
                  >
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {customNote && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-700 mt-2">
              <span className="font-bold text-slate-800 block mb-0.5">Catatan Tambahan Petugas:</span>
              <p className="leading-relaxed">{customNote}</p>
            </div>
          )}
        </div>

        {/* Dokumentasi Foto & Koordinat Lokasi GPS */}
        {(photoToDisplay || activity.latitude) && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 space-y-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Bukti &amp; Verifikasi Kunjungan:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {photoToDisplay && (
                <div className="space-y-1.5 sm:col-span-1">
                  <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5 text-[#145DA0]" />
                    <span>Foto Dokumentasi Kunjungan</span>
                    {Array.isArray(activity.fotoUrls) && activity.fotoUrls.length > 1 && (
                      <span className="text-[10px] text-slate-500 font-normal">({activity.fotoUrls.length} foto)</span>
                    )}
                  </span>

                  {Array.isArray(activity.fotoUrls) && activity.fotoUrls.length > 1 ? (
                    <div className="grid grid-cols-2 gap-2 max-w-[320px]">
                      {activity.fotoUrls.map((pUrl, pIdx) => (
                        <div
                          key={pIdx}
                          onClick={() => {
                            setZoomedPhotoUrl(pUrl);
                            setPhotoZoom(true);
                          }}
                          className="cursor-pointer rounded-xl border border-slate-200 overflow-hidden group relative shadow-2xs hover:shadow-md transition-shadow"
                        >
                          <AuthenticatedImage
                            src={pUrl}
                            alt={`Dokumentasi Kunjungan #${pIdx + 1}`}
                            className="w-full h-24 object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                            <span className="bg-black/75 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                              Perbesar #{pIdx + 1}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        setZoomedPhotoUrl(photoToDisplay);
                        setPhotoZoom(true);
                      }}
                      className="cursor-pointer rounded-xl border border-slate-200 overflow-hidden group relative max-w-[260px] shadow-2xs hover:shadow-md transition-shadow"
                    >
                      <AuthenticatedImage
                        src={photoToDisplay}
                        alt="Dokumentasi Kunjungan"
                        className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                        <span className="bg-black/75 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          Klik untuk Perbesar
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(activity.latitude || activity.lat_petugas) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span className="flex items-center gap-1">
                      <Navigation className="w-3.5 h-3.5 text-[#145DA0]" /> Koordinat Lokasi GPS
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${activity.latitude ?? activity.lat_petugas},${activity.longitude ?? activity.lng_petugas}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#145DA0] hover:underline"
                    >
                      <span>Buka Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-[11px] space-y-1">
                    <p>Latitude: <strong>{activity.latitude ?? activity.lat_petugas}</strong></p>
                    <p>Longitude: <strong>{activity.longitude ?? activity.lng_petugas}</strong></p>
                    {((activity.jarak_dari_rs_meter !== null && activity.jarak_dari_rs_meter !== undefined) ||
                      (activity.jarakDariRsMeter !== null && activity.jarakDariRsMeter !== undefined)) && (
                      <div className="pt-0.5">
                        {((activity.jarak_dari_rs_meter ?? activity.jarakDariRsMeter) > (victim?.hospital_radius || 200) || activity.is_outside_hospital_radius) ? (
                          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 font-sans font-bold text-[10px] flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                            <span>Lokasi di Luar Radius RS ({activity.jarak_dari_rs_meter ?? activity.jarakDariRsMeter} m, batas {victim?.hospital_radius || 200} m) - Perlu Verifikasi Manual</span>
                          </p>
                        ) : (
                          <p className="text-emerald-700 font-sans font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                            <span>Jarak ke RS: {activity.jarak_dari_rs_meter ?? activity.jarakDariRsMeter} meter (Dalam Radius)</span>
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-slate-400 font-sans">
                      Akurasi Lokasi: ±{activity.akurasi_lokasi_meter || activity.akurasiLokasi || 10} meter
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Zoom Foto */}
        {photoZoom && photoToDisplay && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
            onClick={() => setPhotoZoom(false)}
          >
            <div
              className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Pratinjau Foto Dokumentasi Kunjungan
                </span>
                <button
                  type="button"
                  onClick={() => setPhotoZoom(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 bg-slate-900 flex items-center justify-center min-h-[300px]">
                <AuthenticatedImage
                  src={zoomedPhotoUrl || photoToDisplay}
                  alt="Foto Kunjungan Penuh"
                  className="max-h-[75vh] w-auto object-contain rounded"
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer: Read-only Close Button Only */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Tutup Pratinjau
          </button>
        </div>
      </div>
    </Modal>
  );
}

