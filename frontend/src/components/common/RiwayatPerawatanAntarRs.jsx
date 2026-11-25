import React from 'react';
import {
  Building2,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Lock,
  Activity,
  FileText,
  Eye,
  Camera,
  ArrowRight,
  ShieldCheck,
  Stethoscope,
  Info
} from 'lucide-react';
import { formatCareDate, formatCareDateTime } from '../../services/careHistoryService';
import AuthenticatedImage from './AuthenticatedImage';
import { getRealVisitPhoto } from '../../utils/realPhotos';

/**
 * RiwayatPerawatanAntarRs
 * 
 * Komponen khusus untuk menampilkan segmentasi riwayat perawatan pasien antar-rumah sakit.
 * Memisahkan riwayat RS A (read-only, masa lalu) dan RS B (perawatan aktif saat ini),
 * sehingga data dan pemantauan tidak tercampur dan identitas pasien tetap satu kesatuan.
 */
export default function RiwayatPerawatanAntarRs({
  episodes = [],
  victim,
  onSelectVisit,
  onOpenMonitoringModal,
  onOpenTransitionModal
}) {
  if (!episodes || episodes.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500">
        <Building2 className="w-10 h-10 mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-semibold text-slate-700">Belum ada riwayat perawatan fasilitas kesehatan</p>
        <p className="text-xs text-slate-500 mt-1">Data perawatan akan muncul setelah pasien tercatat di fasilitas kesehatan.</p>
      </div>
    );
  }

  const isMultiEpisode = episodes.length > 1;

  return (
    <div className="space-y-6">
      {/* Banner Edukasi Multi-Episode (jika ada lebih dari 1 faskes) */}
      {isMultiEpisode && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-slate-50 border border-blue-200/90 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  Riwayat Perawatan Pasien Antar Fasilitas Kesehatan
                </h4>
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-600 text-white px-2 py-0.5 rounded-full">
                  Identitas Tunggal Terverifikasi
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Sistem mendeteksi pasien memiliki riwayat perawatan di lebih dari satu rumah sakit dengan NIK yang sama:{' '}
                <strong className="text-slate-800">{victim?.nik || '—'}</strong>. Setiap periode perawatan
                diarsipkan secara terisolasi per rumah sakit agar catatan perkembangan dan kunjungan petugas tidak tercampur.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Daftar Episode Perawatan */}
      <div className="space-y-6">
        {episodes.map((episode, epIndex) => {
          const isReadOnly = Boolean(episode.isReadOnly);
          const isActive = Boolean(episode.isAktif);

          return (
            <div
              key={episode.id || epIndex}
              className={`rounded-2xl border transition-all overflow-hidden ${
                isActive
                  ? 'border-emerald-300 bg-white shadow-sm ring-1 ring-emerald-200/50'
                  : 'border-slate-200/90 bg-slate-50/40 shadow-2xs'
              }`}
            >
              {/* Header Kartu Episode */}
              <div
                className={`p-4 sm:p-5 border-b ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-50/80 via-white to-slate-50 border-emerald-200/80'
                    : 'bg-gradient-to-r from-slate-100/90 via-slate-50 to-white border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        Periode {episode.nomorPeriode}
                      </span>

                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Perawatan Aktif Saat Ini</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-200/80 px-2.5 py-0.5 rounded-full border border-slate-300">
                          <Lock className="w-3 h-3 text-slate-500" />
                          <span>Perawatan Selesai (Read-Only)</span>
                        </span>
                      )}

                      <span className="text-xs text-slate-500 font-medium">
                        • {episode.tipePerawatan}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
                      <Building2 className={`w-5 h-5 ${isActive ? 'text-emerald-700' : 'text-slate-600'}`} />
                      <span>{episode.rumahSakit}</span>
                    </h3>
                  </div>

                  {/* Ringkasan Waktu Periode */}
                  <div className="flex items-center gap-3 text-xs text-slate-600 bg-white/80 p-2.5 rounded-xl border border-slate-200/70 shrink-0">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Mulai Masuk</span>
                      <span className="font-semibold text-slate-800">{formatCareDate(episode.tanggalMulai)}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">
                        {isActive ? 'Status Terkini' : 'Tanggal Pulang'}
                      </span>
                      <span className={`font-semibold ${isActive ? 'text-emerald-700 font-bold' : 'text-slate-800'}`}>
                        {isActive ? 'Masih Dirawat' : (formatCareDate(episode.tanggalSelesai) || 'Selesai')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sub-Info: Petugas yang Bertanggung Jawab */}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200/60 text-xs text-slate-600 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Petugas Bertugas:</span>
                    <strong className="text-slate-800 font-semibold">{episode.petugasNama}</strong>
                  </div>
                  <span className="text-slate-300">•</span>
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    <span>Kondisi Akhir Periode:</span>
                    <strong className="text-slate-800 font-semibold">{episode.kondisiTerakhir}</strong>
                  </div>
                  <span className="text-slate-300">•</span>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Total Kunjungan Dicatat:</span>
                    <strong className="text-slate-800 font-semibold">{episode.totalKunjungan} Kali</strong>
                  </div>
                </div>
              </div>

              {/* Notice Banner Khusus untuk Periode Read-Only */}
              {isReadOnly && (
                <div className="mx-4 sm:mx-5 mt-4 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-amber-900">Arsip Riwayat Perawatan Masa Lalu (Hanya-Baca)</p>
                    <p className="text-amber-800 text-[11px] leading-relaxed">
                      Pasien telah menyelesaikan perawatan di {episode.rumahSakit}. Seluruh riwayat kunjungan dan catatan medis
                      pada periode ini bersifat permanen sebagai referensi klinis dan tidak dapat diubah maupun dihapus oleh petugas faskes berikutnya.
                    </p>
                  </div>
                </div>
              )}

              {/* Rincian Klinis Periode */}
              <div className="p-4 sm:p-5 space-y-4">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <FileText className="w-3 h-3 text-slate-400" />
                    <span>Keterangan Medis &amp; Catatan Perawatan di {episode.rumahSakit}</span>
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {episode.alasanMasuk} {episode.catatanKlinis && episode.catatanKlinis !== episode.alasanMasuk ? `— ${episode.catatanKlinis}` : ''}
                  </p>
                </div>

                {/* Sub-Section: Daftar Kunjungan di Rumah Sakit Ini */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Stethoscope className="w-3.5 h-3.5 text-slate-500" />
                      <span>Daftar Kunjungan Petugas ({episode.rumahSakit})</span>
                    </h4>
                    <span className="text-xs text-slate-500 font-medium">
                      {episode.kunjunganList.length} Kunjungan
                    </span>
                  </div>

                  {episode.kunjunganList.length === 0 ? (
                    <div className="p-5 text-center bg-white rounded-xl border border-dashed border-slate-200 text-slate-500 space-y-2">
                      <Clock className="w-6 h-6 mx-auto text-slate-300" />
                      <p className="text-xs font-medium text-slate-600">
                        {isActive
                          ? `Belum ada kunjungan pemantauan yang dicatat di ${episode.rumahSakit}.`
                          : `Tidak ada riwayat kunjungan tercatat pada arsip periode ini.`}
                      </p>
                      {isActive && onOpenMonitoringModal && (
                        <button
                          type="button"
                          onClick={onOpenMonitoringModal}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs transition-colors cursor-pointer"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          <span>+ Catat Kunjungan Pertama di {episode.rumahSakit}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {episode.kunjunganList.map((vis, vIdx) => {
                        const visitNumber = vis.visitNumber || vis.nomorKunjungan || vIdx + 1;
                        const visitDate = vis.tanggalKunjungan || vis.tanggal || vis.waktuAktualKunjungan;
                        const visitOfficer = vis.petugasNama || episode.petugasNama;
                        const visitCondition = vis.kondisiKorban || vis.statusKondisi || vis.kondisiTerakhir || 'Stabil';
                        const photoUrl = vis.fotoUrl || vis.foto_bukti_url || getRealVisitPhoto(vis.id || vis.visitId || vIdx);

                        return (
                          <div
                            key={vis.id || vis.visitId || vIdx}
                            className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 hover:border-slate-300 transition-colors shadow-2xs flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                          >
                            <div className="flex items-start gap-3 flex-1">
                              {/* Foto Kunjungan Thumbnail jika ada */}
                              {photoUrl ? (
                                <div
                                  className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 cursor-pointer group/photo relative"
                                  onClick={() => onSelectVisit && onSelectVisit(vis)}
                                  title="Klik untuk melihat foto pemantauan lengkap"
                                >
                                  <AuthenticatedImage
                                    src={photoUrl}
                                    alt={`Foto Kunjungan ${visitNumber}`}
                                    className="w-full h-full object-cover group-hover/photo:scale-105 transition-transform"
                                  />
                                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center text-white">
                                    <Eye className="w-3.5 h-3.5" />
                                  </div>
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 border border-slate-200">
                                  <Camera className="w-4 h-4" />
                                </div>
                              )}

                              {/* Informasi Kunjungan */}
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-slate-900">
                                    Kunjungan Ke-{visitNumber}
                                  </span>
                                  <span className="text-[10px] text-slate-400">•</span>
                                  <span className="text-xs font-semibold text-slate-600">
                                    {formatCareDateTime(visitDate)}
                                  </span>
                                  <span className="text-[10px] text-slate-400">•</span>
                                  <span className="text-xs text-slate-500">
                                    Petugas: <strong className="text-slate-700 font-semibold">{visitOfficer}</strong>
                                  </span>
                                </div>

                                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                  {vis.cleanCatatan || vis.catatan_kondisi || vis.hasilKunjungan || 'Kunjungan telah selesai.'}
                                </p>

                                {/* Tindakan checklist */}
                                {Array.isArray(vis.tindakanList) && vis.tindakanList.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {vis.tindakanList.map((act, aIdx) => (
                                      <span
                                        key={aIdx}
                                        className="inline-flex items-center gap-1 text-[10px] bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md"
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>{act}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Tombol Detail Kunjungan */}
                            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                                <span>{visitCondition}</span>
                              </span>

                              {onSelectVisit && (
                                <button
                                  type="button"
                                  onClick={() => onSelectVisit(vis)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#145DA0] hover:text-[#0f497e] bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200/80 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                  title={isReadOnly ? 'Lihat Detail Kunjungan Arsip (Hanya-Baca)' : 'Lihat Detail Kunjungan'}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>{isReadOnly ? 'Lihat Detail (Read-Only)' : 'Lihat Detail'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

