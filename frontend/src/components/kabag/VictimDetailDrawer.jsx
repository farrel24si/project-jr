import React, { useState } from 'react';
import Modal from '../common/Modal';
import AuthenticatedImage from '../common/AuthenticatedImage';
import RiwayatPerawatanTimeline, { resolveReferralHospitals } from '../common/RiwayatPerawatanTimeline';
import ModalDetailKunjunganReadOnly from '../petugas/ModalDetailKunjunganReadOnly';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import { cleanPhoneNumber, cleanSumberInformasi } from '../../services/backendMapper';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  Clock, 
  User, 
  Activity, 
  AlertOctagon,
  X
} from 'lucide-react';

function getLastVisitTimestamp(v) {
  if (!v) return null;
  if (Array.isArray(v.riwayatAktivitas) && v.riwayatAktivitas.length > 0) {
    const sorted = [...v.riwayatAktivitas].sort((a, b) => {
      const da = new Date(a.waktuAktualKunjungan || a.tanggalKunjungan || a.tanggal || a.waktuFoto || 0).getTime();
      const db = new Date(b.waktuAktualKunjungan || b.tanggalKunjungan || b.tanggal || b.waktuFoto || 0).getTime();
      return db - da;
    });
    const ts = sorted[0].waktuAktualKunjungan || sorted[0].tanggalKunjungan || sorted[0].tanggal || sorted[0].waktuFoto;
    if (ts) return ts;
  }
  if (Array.isArray(v.riwayatKunjungan) && v.riwayatKunjungan.length > 0) {
    const sorted = [...v.riwayatKunjungan].sort((a, b) => {
      const da = new Date(a.waktuAktualKunjungan || a.tanggalKunjungan || a.tanggal || 0).getTime();
      const db = new Date(b.waktuAktualKunjungan || b.tanggalKunjungan || b.tanggal || 0).getTime();
      return db - da;
    });
    const ts = sorted[0].waktuAktualKunjungan || sorted[0].tanggalKunjungan || sorted[0].tanggal;
    if (ts) return ts;
  }
  return (
    v.tanggalKunjunganTerakhir ||
    v.waktuPemantauanTerakhir ||
    v.kunjunganPertama?.waktuAktualKunjungan ||
    v.kunjunganPertama?.tanggalKunjungan ||
    v.kunjunganPertama?.waktuFoto ||
    null
  );
}

export default function VictimDetailDrawer({ isOpen, onClose, victim }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [selectedVisitForDetail, setSelectedVisitForDetail] = useState(null);

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

  const { isReferred, rsAsal, rsTujuan, rsSaatIni } = resolveReferralHospitals(victim);

  const isDischarged =
    victim.kondisiTerakhir === 'Sudah Pulang' ||
    victim.kondisiTerakhir === 'Pulang' ||
    victim.kondisiTerakhir === 'Selesai' ||
    victim.statusPemantauan === 'Selesai Dipantau';

  const isReferredOut =
    (typeof victim.kondisiTerakhir === 'string' && victim.kondisiTerakhir.startsWith('Dirujuk')) ||
    (typeof victim.statusPemantauan === 'string' && victim.statusPemantauan.startsWith('Dirujuk')) ||
    (victim.statusPerawatan === 'Rujukan' && !victim.rujukanAccepted);

  const isIncomingReferral = victim.isRujukanMasuk && !victim.rujukanAccepted;

  // Single primary status badge matching Petugas detail style
  const renderPrimaryStatusBadge = () => {
    if (isDischarged) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Selesai / Sudah Pulang</span>
        </span>
      );
    }

    if (isReferredOut) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          <span>Dirujuk ke {rsTujuan || rsSaatIni}</span>
        </span>
      );
    }

    if (isIncomingReferral) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">
          <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse"></span>
          <span>Rujukan Masuk (dari {rsAsal})</span>
        </span>
      );
    }

    if (victim.statusPerawatan === 'Rawat Lanjutan' || victim.isRawatLanjutan) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
          <span className="w-2 h-2 rounded-full bg-sky-500"></span>
          <span>Rawatan Lanjutan</span>
        </span>
      );
    }

    if (victim.kondisiTerakhir === 'Meninggal Dunia') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          <span>Meninggal Dunia</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#145DA0] border border-blue-200">
        <span className="w-2 h-2 rounded-full bg-[#145DA0]"></span>
        <span>Masih Dirawat (Pemantauan Aktif)</span>
      </span>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detail & Audit Monitoring Korban"
      subtitle={`ID Korban: ${victim.id} • Petugas PJ: ${victim.namaPetugas || 'Petugas Jasa Raharja'}`}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4 text-xs">
        {/* Victim & SLA Overview Header (Gaya Bersih Tanpa Penumpukan Badge) */}
        <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xl font-black text-slate-900">{victim.nama}</span>
              {renderPrimaryStatusBadge()}
            </div>
            <p className="text-slate-500 text-xs mt-1.5 flex items-center gap-2 flex-wrap">
              <span>ID: <strong className="font-mono text-slate-700">{victim.id}</strong></span>
              <span className="text-slate-300">•</span>
              <span>NIK: <strong className="font-mono text-slate-700">{victim.nik || '—'}</strong></span>
              <span className="text-slate-300">•</span>
              <span>{victim.usia} Thn ({victim.jenisKelamin})</span>
              <span className="text-slate-300">•</span>
              <span>RS: <strong className="text-slate-700">{victim.rumahSakit}</strong></span>
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs bg-white border border-slate-200/80 rounded-xl px-3.5 py-2.5 self-start md:self-auto shrink-0 shadow-2xs">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kepatuhan SLA</span>
              <span className={`font-bold ${monitoringSla.isOverdue ? 'text-rose-600' : 'text-emerald-700'}`}>
                {monitoringSla.isOverdue ? 'Melewati Batas SLA 3 Hari' : (firstVisitSla.description || 'SLA Terpenuhi')}
              </span>
            </div>
          </div>
        </div>

        {/* Priority Warning if MD */}
        {victim.kondisiTerakhir === 'Meninggal Dunia' && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-950 flex items-center gap-2.5">
            <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
            <div>
              <span className="font-bold">Prioritas Khusus: Korban Meninggal Dunia.</span>
              <span className="text-red-800 ml-1">
                Tindak Lanjut Dokumen Santunan: <strong>{victim.tindakLanjut}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Grid Data Informasi Kejadian & Korban (Bersih & Elegan) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200/90 rounded-2xl p-5 bg-white space-y-3 shadow-2xs">
            <h5 className="font-bold text-slate-900 border-b border-slate-100 pb-2.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[#145DA0]" />
                <span>Data Kejadian &amp; Rumah Sakit</span>
              </span>
              <span className="text-[11px] font-semibold text-slate-400">Kasus Laka</span>
            </h5>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-500 font-medium">Rumah Sakit Dirawat</span>
                <span className="font-semibold text-[#145DA0] text-right">{victim.rumahSakit || rsSaatIni || rsAsal}</span>
              </div>
              <div className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-500 font-medium">Tanggal Laka</span>
                <span className="font-semibold text-slate-800 text-right">{formatDateTime(victim.tanggalKecelakaan)}</span>
              </div>
              <div className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-500 font-medium">Masuk RS</span>
                <span className="font-semibold text-slate-800 text-right">
                  {formatDateTime(victim.tanggalMasukTerbaru || victim.tanggalMasukRs || victim.tanggalInformasiDiterima)}
                </span>
              </div>
              <div className="py-2 flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-3">
                <span className="text-slate-500 font-medium shrink-0">Tempat Kejadian (TKP)</span>
                <span className="font-semibold text-slate-800 text-left sm:text-right leading-relaxed">{victim.lokasiKejadian || '—'}</span>
              </div>
              <div className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-500 font-medium">Sumber Informasi</span>
                <span className="font-semibold text-slate-800 text-right">{cleanSumberInformasi(victim.sumberInformasi)}</span>
              </div>
            </div>
          </div>

          <div className="border border-slate-200/90 rounded-2xl p-5 bg-white space-y-3 shadow-2xs">
            <h5 className="font-bold text-slate-900 border-b border-slate-100 pb-2.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#145DA0]" />
                <span>Status Pemantauan &amp; Penugasan</span>
              </span>
              <span className="text-[11px] font-semibold text-slate-400">Petugas Lapangan</span>
            </h5>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-500 font-medium">Petugas Penanggung Jawab</span>
                <span className="font-bold text-slate-900 text-right">{victim.namaPetugas || 'Petugas Jasa Raharja'}</span>
              </div>
              <div className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-500 font-medium">Status Pemantauan</span>
                <span className="font-semibold text-slate-800 text-right">{victim.statusPemantauan}</span>
              </div>
              <div className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-500 font-medium">Kunjungan Terakhir</span>
                <span className="font-semibold text-slate-800 text-right">
                  {formatDateTime(getLastVisitTimestamp(victim)) || 'Belum Ada Kunjungan'}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-500 font-medium">Status Penjaminan</span>
                <span className={`font-semibold text-right ${victim.santunanSelesai ? 'text-emerald-700' : 'text-slate-800'}`}>
                  {victim.santunanSelesai ? 'Selesai / Terpenuhi' : 'Sedang Berjalan'}
                </span>
              </div>
              {victim.tindakLanjut && (
                <div className="py-2 flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-3">
                  <span className="text-slate-500 font-medium shrink-0">Rencana Tindak Lanjut</span>
                  <span className="font-semibold text-slate-800 text-left sm:text-right leading-relaxed">{victim.tindakLanjut}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIWAYAT PERAWATAN & PERJALANAN FASKES KORBAN (BEAD LINE TIMELINE) ── */}
        <RiwayatPerawatanTimeline
          victim={victim}
          onSelectVisit={(act) => setSelectedVisitForDetail(act)}
          monitoringSla={monitoringSla}
        />

        {/* Footer: Close Button */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Modal Detail Kunjungan Pasien (Read-Only) */}
      {selectedVisitForDetail && (
        <ModalDetailKunjunganReadOnly
          isOpen={!!selectedVisitForDetail}
          onClose={() => setSelectedVisitForDetail(null)}
          activity={selectedVisitForDetail}
          victim={victim}
        />
      )}

      {/* Lightbox Modal jika klik foto */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Pratinjau Foto Bukti Kunjungan</span>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-900 flex items-center justify-center min-h-[300px]">
              <AuthenticatedImage
                src={selectedPhoto}
                alt="Foto Kunjungan Penuh"
                className="max-h-[75vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
