import React, { useState } from 'react';
import Modal from '../common/Modal';
import SlaBadge from '../common/SlaBadge';
import ConditionBadge from '../common/ConditionBadge';
import MonitoringStatusBadge from '../common/MonitoringStatusBadge';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  Clock, 
  Camera, 
  Navigation, 
  User, 
  Activity, 
  CheckCircle2, 
  AlertCircle,
  AlertOctagon,
  ShieldCheck,
  ExternalLink,
  X
} from 'lucide-react';

export default function VictimDetailDrawer({ isOpen, onClose, victim }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  if (!victim) return null;

  const firstVisitSla = calculateFirstVisitSla(
    victim.tanggalInformasiDiterima,
    victim.kunjunganPertama
  );

  const monitoringSla = calculateMonitoringSla(victim);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
    } catch {
      return dateStr;
    }
  };

  const activities = (victim.riwayatAktivitas && victim.riwayatAktivitas.length > 0)
    ? victim.riwayatAktivitas
    : [
        ...(victim.riwayatKunjungan || []),
        ...(victim.riwayatPemantauan || [])
      ].sort((a, b) => new Date(b.tanggal || b.tanggalKunjungan).getTime() - new Date(a.tanggal || a.tanggalKunjungan).getTime());

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detail & Audit Monitoring Korban"
      subtitle={`ID Korban: ${victim.id} • Petugas: ${victim.namaPetugas}`}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4 text-xs">
        {/* Victim & SLA Overview Header */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-lg font-black text-slate-900">{victim.nama}</span>
              <MonitoringStatusBadge status={victim.statusPemantauan} size="sm" />
              <ConditionBadge
                kondisi={victim.kondisiTerakhir}
                statusKonfirmasi={victim.statusKonfirmasiKondisi}
                size="sm"
              />
            </div>
            <p className="text-slate-500 text-[11px] mt-1 font-mono">
              ID: {victim.id} &bull; NIK: {victim.nik} &bull; {victim.usia} thn ({victim.jenisKelamin})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                SLA Kunjungan Pertama
              </span>
              <SlaBadge slaInfo={firstVisitSla} showDescription />
            </div>

            {victim.statusPemantauan === 'Pemantauan Aktif' && (
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                  SLA Pemantauan
                </span>
                <SlaBadge slaInfo={monitoringSla} showDescription />
              </div>
            )}
          </div>
        </div>

        {/* Priority Warning if MD */}
        {victim.kondisiTerakhir === 'Meninggal Dunia' && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-950 flex items-start gap-2">
            <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Prioritas Khusus: Korban Meninggal Dunia</span>
              <p className="text-[11px] text-red-800 mt-0.5">
                Tindak Lanjut Ahli Waris: <strong>{victim.tindakLanjut}</strong>
              </p>
            </div>
          </div>
        )}

        {/* Info Grid (Strictly omitting nomor LP, ruangan/kamar, next schedule) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
            <h5 className="font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-[#145DA0]" />
              Data Kejadian &amp; Rumah Sakit
            </h5>
            <div className="space-y-1.5 text-xs">
              <p><strong>Nama Korban:</strong> {victim.nama}</p>
              <p><strong>Rumah Sakit:</strong> <span className="font-semibold text-[#145DA0]">{victim.rumahSakit}</span></p>
              <p><strong>Tanggal Kecelakaan (Tgl Laka):</strong> {formatDateTime(victim.tanggalKecelakaan)}</p>
              <p><strong>Tempat Kecelakaan (TKP):</strong> {victim.lokasiKejadian}</p>
              <p><strong>Kapan Masuk Rumah Sakit:</strong> {formatDateTime(victim.tanggalMasukRs || victim.tanggalInformasiDiterima)}</p>
              <p><strong>Sumber Informasi:</strong> {victim.sumberInformasi || 'IRSMS Korlantas Polri'}</p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
            <h5 className="font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#145DA0]" />
              Status Pemantauan &amp; Penugasan Petugas
            </h5>
            <div className="space-y-1.5 text-xs">
              <p><strong>Petugas Penanggung Jawab:</strong> {victim.namaPetugas}</p>
              <p><strong>Status Pemantauan:</strong> <span className="font-semibold">{victim.statusPemantauan}</span></p>
              <p><strong>Kondisi Terakhir:</strong> <span className="font-semibold">{victim.kondisiTerakhir}</span></p>
              <p><strong>Pemantauan Terakhir:</strong> {formatDateTime(victim.waktuPemantauanTerakhir || victim.tanggalPemantauanTerakhir || victim.tanggalKunjunganTerakhir)}</p>
              <p><strong>Tindak Lanjut:</strong> {victim.tindakLanjut}</p>
              <p><strong>Status Penjaminan:</strong> {victim.santunanSelesai ? 'Selesai / Terpenuhi' : 'Sedang Berjalan'}</p>
            </div>
          </div>
        </div>

        {/* Timeline of All Activities */}
        <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h5 className="font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#145DA0]" />
              <span>Riwayat Aktivitas Kunjungan &amp; Pemantauan</span>
            </h5>
            <span className="text-[11px] text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-full">
              {activities.length} Aktivitas
            </span>
          </div>

          {activities.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-center text-xs">
              Belum ada riwayat aktivitas yang dicatat oleh petugas.
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {activities.map((act, idx) => {
                const actDate = act.tanggal || act.tanggalKunjungan;
                const hasil = act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan;
                const tl = act.catatanTindakLanjut || act.tindakLanjut;

                return (
                  <div key={act.id || idx} className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs">
                          {act.jenisAktivitas || 'Aktivitas Petugas'}
                        </span>
                        <ConditionBadge kondisi={act.kondisiKorban} size="xs" />
                        <span className="font-mono text-slate-400 text-[11px]">&bull; {formatDateTime(actDate)}</span>
                      </div>
                      <span className="text-[11px] text-slate-600 font-medium">
                        Petugas: <strong>{act.petugasNama || victim.namaPetugas}</strong>
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 space-y-1">
                      <p><strong>Hasil:</strong> {hasil || '—'}</p>
                      {act.komunikasiKeluarga && <p><strong>Komunikasi:</strong> {act.komunikasiKeluarga}</p>}
                      {act.penyampaianHak && <p><strong>Hak Korban:</strong> {act.penyampaianHak}</p>}
                      {tl && <p><strong>Tindak Lanjut:</strong> {tl}</p>}
                    </div>

                    {/* Audit note if edited */}
                    {act.isEdited && (
                      <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[10px] text-amber-900 flex items-start gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>Catatan dikoreksi pada {formatDateTime(act.editedAt)} oleh {act.editedBy} (Alasan: {act.alasanKoreksi})</span>
                      </div>
                    )}

                    {/* Foto & GPS */}
                    {(act.fotoUrl || act.latitude) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                        {act.fotoUrl && (
                          <div>
                            <span className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                              <Camera className="w-3.5 h-3.5 text-[#145DA0]" /> Bukti Foto:
                            </span>
                            <div 
                              onClick={() => setSelectedPhoto(act.fotoUrl)}
                              className="cursor-pointer group relative rounded-lg border border-slate-300 overflow-hidden bg-black max-w-[200px]"
                            >
                              <img
                                src={act.fotoUrl}
                                alt="Bukti Kunjungan"
                                className="w-full h-24 object-cover group-hover:opacity-90"
                              />
                              <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[9px] px-1.5 py-0.5 rounded">
                                Perbesar
                              </span>
                            </div>
                          </div>
                        )}

                        {act.latitude && (
                          <div>
                            <div className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center justify-between gap-1">
                              <span className="flex items-center gap-1">
                                <Navigation className="w-3.5 h-3.5 text-[#145DA0]" /> Koordinat Lokasi GPS:
                              </span>
                              <a
                                href={`https://www.google.com/maps?q=${act.latitude},${act.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#145DA0] hover:underline"
                                title="Buka titik koordinat di Google Maps"
                              >
                                <span>Google Maps</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-200 font-mono text-[11px] space-y-0.5 shadow-2xs">
                              <p>Lat: <strong>{act.latitude}</strong></p>
                              <p>Lng: <strong>{act.longitude}</strong></p>
                              <p className="text-slate-400">Akurasi: ±{act.akurasiLokasi || 10} meter</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="max-w-2xl w-full bg-white rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold">Foto Bukti Aktivitas Petugas</span>
              <button 
                type="button" 
                onClick={() => setSelectedPhoto(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img src={selectedPhoto} alt="Full view" className="w-full max-h-[80vh] object-contain bg-black" />
          </div>
        </div>
      )}
    </Modal>
  );
}
