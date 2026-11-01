import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import SlaBadge from '../../components/common/SlaBadge';
import ConditionBadge from '../../components/common/ConditionBadge';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import FormPemantauanModal from '../../components/petugas/FormPemantauanModal';
import ModalKoreksiCatatan from '../../components/petugas/ModalKoreksiCatatan';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Camera,
  Navigation,
  AlertOctagon,
  PlusCircle,
  Activity,
  User,
  FileText,
  Phone,
  MapPin,
  X,
  Edit3,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) +
      ', ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) +
      ' WIB'
    );
  } catch {
    return dateStr;
  }
}

function InfoItem({ label, value, span = false, highlight = false }) {
  return (
    <div className={`p-2.5 rounded-lg border ${highlight ? 'bg-blue-50/60 border-blue-200' : 'bg-slate-50 border-slate-200/80'} ${span ? 'col-span-1 sm:col-span-2' : ''}`}>
      <dt className="text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-wider">{label}</dt>
      <dd className={`text-xs font-bold ${highlight ? 'text-[#145DA0]' : 'text-slate-800'}`}>{value || '—'}</dd>
    </div>
  );
}

export default function PetugasVictimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [victim, setVictim] = useState(null);
  const [isMonitoringModalOpen, setIsMonitoringModalOpen] = useState(false);
  const [selectedImagePreview, setSelectedImagePreview] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);

  const loadVictim = () => {
    const data = storageService.getVictimById(id);
    if (!data) {
      navigate('/petugas/korban');
      return;
    }
    setVictim(data);
  };

  useEffect(() => {
    loadVictim();
    window.addEventListener('jr_victims_updated', loadVictim);
    return () => window.removeEventListener('jr_victims_updated', loadVictim);
  }, [id]);

  if (!victim) {
    return (
      <div className="py-16 text-center text-xs text-slate-400">
        Memuat data korban...
      </div>
    );
  }

  const firstVisitSla = calculateFirstVisitSla(victim.tanggalInformasiDiterima, victim.kunjunganPertama);
  const monitoringSla = calculateMonitoringSla(victim);

  // Activities timeline (unified 1-to-many list)
  const activities = (victim.riwayatAktivitas && victim.riwayatAktivitas.length > 0)
    ? victim.riwayatAktivitas
    : [
        ...(victim.riwayatKunjungan || []),
        ...(victim.riwayatPemantauan || [])
      ].sort((a, b) => new Date(b.tanggal || b.tanggalKunjungan).getTime() - new Date(a.tanggal || a.tanggalKunjungan).getTime());

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header: Navigation & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <Link
          to="/petugas/korban"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs transition-colors self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Korban</span>
        </Link>

        {/* Action Buttons: + Lakukan Pemantauan & Catat Kunjungan */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsMonitoringModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-sm shadow-blue-900/15 transition-all cursor-pointer"
          >
            <Activity className="w-4 h-4" />
            <span>+ Lakukan Pemantauan</span>
          </button>

          <Link
            to={`/petugas/kunjungan/${victim.id}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors"
          >
            <PlusCircle className="w-4 h-4 text-[#145DA0]" />
            <span>{victim.kunjunganPertama ? 'Catat Kunjungan Tambahan' : 'Catat Kunjungan RS'}</span>
          </Link>
        </div>
      </div>

      {/* Identitas Korban Utama Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{victim.nama}</h1>
              <MonitoringStatusBadge status={victim.statusPemantauan} size="md" />
              <ConditionBadge
                kondisi={victim.kondisiTerakhir}
                statusKonfirmasi={victim.statusKonfirmasiKondisi}
                size="md"
              />
            </div>
            <p className="text-xs text-slate-500 font-mono mt-1">
              ID Korban: <strong className="text-slate-700">{victim.id}</strong> &bull; NIK: {victim.nik}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 min-w-[150px]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                SLA Kunjungan Pertama
              </p>
              <SlaBadge slaInfo={firstVisitSla} showDescription />
            </div>

            {victim.statusPemantauan === 'Pemantauan Aktif' && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 min-w-[150px]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  SLA Pemantauan Berkala
                </p>
                <SlaBadge slaInfo={monitoringSla} showDescription />
              </div>
            )}
          </div>
        </div>

        {/* Warning Khusus Korban Meninggal Dunia */}
        {victim.kondisiTerakhir === 'Meninggal Dunia' && (
          <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
            <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-950 uppercase tracking-wide text-xs">
                Perhatian: Korban Meninggal Dunia
              </p>
              <p className="mt-0.5 text-red-800">
                Koordinasikan jemput bola dokumen ahli waris untuk percepatan santunan meninggal dunia sebesar Rp50.000.000,-.
              </p>
              {victim.tindakLanjut && (
                <p className="font-semibold mt-1">Tindak Lanjut: {victim.tindakLanjut}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grid Informasi Inti: Nama Korban, Tgl Laka, RS, Tempat Kecelakaan, Kapan Masuk RS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Kolom Kiri: Data Kecelakaan & Masuk Rumah Sakit */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3.5">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Building2 className="w-4 h-4 text-[#145DA0]" />
            Informasi Kejadian &amp; Rumah Sakit
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <InfoItem label="Nama Korban" value={victim.nama} span highlight />
            <InfoItem label="Rumah Sakit Tempat Dirawat" value={victim.rumahSakit} span highlight />
            <InfoItem label="Tanggal Kecelakaan (Tgl Laka)" value={formatDateTime(victim.tanggalKecelakaan)} highlight />
            <InfoItem label="Kapan Masuk Rumah Sakit" value={formatDateTime(victim.tanggalMasukRs || victim.tanggalInformasiDiterima)} highlight />
            <InfoItem label="Tempat Kecelakaan (TKP)" value={victim.lokasiKejadian} span highlight />
            <InfoItem label="Sumber Informasi" value={victim.sumberInformasi || 'IRSMS Korlantas Polri'} />
            <InfoItem label="Waktu Info Masuk Sistem" value={formatDateTime(victim.tanggalInformasiDiterima)} />
          </dl>
        </div>

        {/* Kolom Kanan: Status Pemantauan & Penanggung Jawab */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3.5">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <User className="w-4 h-4 text-[#145DA0]" />
            Status Pemantauan &amp; Kondisi Korban
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <InfoItem label="Status Pemantauan Saat Ini" value={victim.statusPemantauan} highlight />
            <InfoItem label="Kondisi Terakhir Korban" value={victim.kondisiTerakhir} highlight />
            <InfoItem label="Petugas Penanggung Jawab" value={victim.namaPetugas} />
            <InfoItem
              label="Waktu Pemantauan Terakhir"
              value={formatDateTime(victim.waktuPemantauanTerakhir || victim.tanggalPemantauanTerakhir || victim.tanggalKunjunganTerakhir)}
            />
            <InfoItem label="Usia & Jenis Kelamin" value={`${victim.usia} Tahun / ${victim.jenisKelamin}`} />
            <InfoItem label="Nomor Telepon" value={victim.telepon} />
            <InfoItem label="Alamat Domisili" value={victim.alamat} span />
            {victim.tindakLanjut && (
              <div className="col-span-1 sm:col-span-2 pt-1">
                <dt className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                  Rencana Tindak Lanjut Terkini
                </dt>
                <dd className="text-xs font-semibold text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {victim.tindakLanjut}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Riwayat Kunjungan dan Pemantauan (Satu Korban, Banyak Aktivitas) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Riwayat Kunjungan &amp; Pemantauan Korban
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh riwayat kunjungan pertama dan pemantauan berkala tersimpan lengkap dan tidak ditimpa.
            </p>
          </div>
          <span className="text-xs text-slate-600 bg-slate-100 px-3 py-1 rounded-full font-bold">
            Total {activities.length} Aktivitas Tercatat
          </span>
        </div>

        {activities.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-xs text-slate-400">Belum ada riwayat aktivitas untuk korban ini.</p>
            <p className="text-[11px] text-slate-500">
              Gunakan tombol <strong>+ Lakukan Pemantauan</strong> atau <strong>Catat Kunjungan RS</strong> untuk merekam aktivitas.
            </p>
          </div>
        ) : (
          <div className="relative pl-7 space-y-6 pt-2">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />

            {activities.map((act, idx) => {
              const isFirstVisit = act.jenisAktivitas === 'Kunjungan Pertama';
              const Icon = isFirstVisit ? CheckCircle2 : Activity;
              const iconClass = isFirstVisit
                ? 'bg-emerald-100 text-emerald-700'
                : act.kondisiKorban === 'Meninggal Dunia'
                ? 'bg-red-100 text-red-700'
                : 'bg-sky-100 text-sky-700';

              const actDate = act.tanggal || act.tanggalKunjungan;
              const hasilTeks = act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan;
              const tindakLanjutTeks = act.catatanTindakLanjut || act.tindakLanjut;

              return (
                <div key={act.id || idx} className="relative">
                  <div
                    className={`absolute -left-7 top-0 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-2xs ${iconClass}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-2.5">
                    {/* Header Catatan Aktivitas */}
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200/60 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">
                          {act.jenisAktivitas || (isFirstVisit ? 'Kunjungan Pertama' : 'Pemantauan Lanjutan')}
                        </span>
                        <ConditionBadge kondisi={act.kondisiKorban} size="xs" />
                        <span className="text-[11px] text-slate-400">&bull; {formatDateTime(actDate)}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 font-medium">
                          Oleh: <strong>{act.petugasNama || victim.namaPetugas}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingActivity(act)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#145DA0] hover:text-[#0f497e] bg-white border border-slate-200 px-2 py-0.5 rounded-md hover:bg-blue-50 transition-colors cursor-pointer"
                          title="Koreksi catatan aktivitas"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Koreksi</span>
                        </button>
                      </div>
                    </div>

                    {/* Konten Pemantauan / Kunjungan */}
                    <div className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
                      <p>
                        <strong>Hasil Pemantauan / Kunjungan:</strong> {hasilTeks || '—'}
                      </p>
                      {act.komunikasiKeluarga && (
                        <p>
                          <strong>Komunikasi Keluarga:</strong> {act.komunikasiKeluarga}
                        </p>
                      )}
                      {act.penyampaianHak && (
                        <p>
                          <strong>Penyampaian Hak Korban:</strong> {act.penyampaianHak}
                        </p>
                      )}
                      {tindakLanjutTeks && (
                        <p>
                          <strong>Tindak Lanjut:</strong> {tindakLanjutTeks}
                        </p>
                      )}
                      {act.sumberInfo && (
                        <p className="text-[11px] text-slate-500">
                          <strong>Sumber Info:</strong> {act.sumberInfo}
                        </p>
                      )}
                    </div>

                    {/* Jejak Audit Koreksi jika pernah diedit */}
                    {act.isEdited && (
                      <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-2 text-[10px] text-amber-900 flex items-start gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Catatan telah dikoreksi pada {formatDateTime(act.editedAt)} oleh {act.editedBy}</span>
                          <span className="block text-amber-800">Alasan audit: {act.alasanKoreksi || 'Perbaikan redaksi'}</span>
                        </div>
                      </div>
                    )}

                    {/* Bukti Foto & Koordinat GPS */}
                    {(act.fotoUrl || act.latitude) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-slate-200/70 mt-2">
                        {act.fotoUrl && (
                          <div>
                            <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mb-1.5">
                              <Camera className="w-3.5 h-3.5 text-[#145DA0]" /> Foto Dokumentasi
                            </p>
                            <div
                              onClick={() => setSelectedImagePreview(act.fotoUrl)}
                              className="cursor-pointer rounded-lg border border-slate-300 overflow-hidden max-w-[200px] group relative shadow-2xs"
                            >
                              <img
                                src={act.fotoUrl}
                                alt="Dokumentasi Kunjungan"
                                className="w-full h-24 object-cover group-hover:opacity-90 transition-opacity"
                              />
                              <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                                <span className="bg-black/75 text-white text-[10px] font-semibold px-2 py-0.5 rounded opacity-0 group-hover:opacity-100">
                                  Perbesar Foto
                                </span>
                              </span>
                            </div>
                          </div>
                        )}

                        {act.latitude && (
                          <div>
                            <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between gap-1 mb-1.5">
                              <span className="flex items-center gap-1">
                                <Navigation className="w-3.5 h-3.5 text-[#145DA0]" /> Koordinat Lokasi GPS
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
                            <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[11px] space-y-0.5 shadow-2xs">
                              <p>Lat: <strong>{act.latitude}</strong></p>
                              <p>Lng: <strong>{act.longitude}</strong></p>
                              <p className="text-slate-400">Akurasi: ±{act.akurasiLokasi || 10} meter</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Formulir Pemantauan Lanjutan */}
      <FormPemantauanModal
        isOpen={isMonitoringModalOpen}
        onClose={() => setIsMonitoringModalOpen(false)}
        victim={victim}
        onMonitoringSaved={() => loadVictim()}
      />

      {/* Modal Koreksi Catatan Aktivitas (Audit Mechanism) */}
      {editingActivity && (
        <ModalKoreksiCatatan
          isOpen={!!editingActivity}
          onClose={() => setEditingActivity(null)}
          victimId={victim.id}
          activity={editingActivity}
          onCorrected={() => {
            setEditingActivity(null);
            loadVictim();
          }}
        />
      )}

      {/* Modal Preview Gambar / Foto Dokumentasi */}
      {selectedImagePreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setSelectedImagePreview(null)}
        >
          <div className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Foto Bukti Aktivitas Petugas</span>
              <button
                type="button"
                onClick={() => setSelectedImagePreview(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-900 flex items-center justify-center">
              <img
                src={selectedImagePreview}
                alt="Pratinjau Bukti"
                className="max-h-[70vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
