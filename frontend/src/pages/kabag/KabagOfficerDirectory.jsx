import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Users, 
  UserCheck, 
  FileText, 
  Building2, 
  Search, 
  Download, 
  Plus, 
  MapPin, 
  ChevronRight, 
  RotateCcw,
  SlidersHorizontal,
  ChevronLeft
} from 'lucide-react';
import { storageService } from '../../services/storageService';

export default function KabagOfficerDirectory() {
  const navigate = useNavigate();
  const [officers, setOfficers] = useState(() => storageService.getOfficers());

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [regionFilter, setRegionFilter] = useState('ALL');

  // Filtered officers list
  const filteredOfficers = useMemo(() => {
    return officers.filter((off) => {
      const matchSearch =
        off.nama.toLowerCase().includes(search.toLowerCase()) ||
        off.nip.toLowerCase().includes(search.toLowerCase()) ||
        off.wilayah.toLowerCase().includes(search.toLowerCase()) ||
        (off.plottingRs && off.plottingRs.some((rs) => rs.toLowerCase().includes(search.toLowerCase())));

      if (!matchSearch) return false;
      if (statusFilter !== 'ALL' && off.status !== statusFilter) return false;
      if (regionFilter !== 'ALL' && !off.wilayah.includes(regionFilter)) return false;

      return true;
    });
  }, [officers, search, statusFilter, regionFilter]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setRegionFilter('ALL');
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Breadcrumb and Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
            DIREKTORI PERSONIL • KANTOR CABANG UTAMA DKI JAKARTA
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Direktori &amp; Manajemen Petugas Lapangan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola data mobile service officer Jasa Raharja, plotting rumah sakit rujukan, kapasitas penugasan aktif, dan status operasional harian.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => alert('Mengekspor Direktori Personil (.XLSX)...')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Direktori (.XLSX)</span>
          </button>
          <button
            type="button"
            onClick={() => alert('Membuka formulir registrasi mobile service officer baru...')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-[#072B62] text-white shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Petugas Baru</span>
          </button>
        </div>
      </div>

      {/* 2. Four Mini Metric Cards matching screenshot */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Petugas */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0A3981] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900">18</span>
              <span className="text-xs text-slate-500 font-medium">Total Petugas</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
              100% Terdaftar Aktif
            </p>
          </div>
        </div>

        {/* Card 2: On-Duty Lapangan */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900">15</span>
              <span className="text-xs text-slate-500 font-medium">On-Duty Lapangan</span>
            </div>
            <p className="text-[10px] text-emerald-600 mt-0.5 font-medium">
              ● 83.3% Kapasitas Siaga RS
            </p>
          </div>
        </div>

        {/* Card 3: Verifikasi Berkas */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900">3</span>
              <span className="text-xs text-slate-500 font-medium">Administrasi Berkas</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
              Pemberkasan Korban &amp; GL
            </p>
          </div>
        </div>

        {/* Card 4: RS Rujukan Tercover */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900">34</span>
              <span className="text-xs text-slate-500 font-medium">RS Rujukan Tercover</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
              Sistem Jasa Raharja
            </p>
          </div>
        </div>
      </div>

      {/* 3. Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari berdasarkan nama petugas, NIP, wilayah, atau rumah sakit..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white text-xs"
            />
          </div>

          {/* Status & Region Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-3 py-2"
            >
              <option value="ALL">Status: Semua Status</option>
              <option value="Aktif Lapangan">Aktif Lapangan</option>
              <option value="Verifikasi Berkas">Verifikasi Berkas</option>
              <option value="Perlu Perhatian">Perlu Perhatian</option>
            </select>

            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-3 py-2"
            >
              <option value="ALL">Wilayah: Semua Wilayah</option>
              <option value="Jakarta Pusat">Jakarta Pusat</option>
              <option value="Jakarta Selatan">Jakarta Selatan</option>
              <option value="Jakarta Timur">Jakarta Timur</option>
              <option value="Jakarta Barat">Jakarta Barat</option>
              <option value="Jakarta Utara">Jakarta Utara</option>
            </select>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1.5"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filter</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <span>Menampilkan <strong>{filteredOfficers.length}</strong> dari <strong>18</strong> petugas operasional • DKI Jakarta Raya</span>
        </div>
      </div>

      {/* 4. Directory Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200/80 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-3 text-center w-12">NO</th>
                <th className="py-3 px-4">PETUGAS &amp; NIP</th>
                <th className="py-3 px-4">WILAYAH</th>
                <th className="py-3 px-4">PLOTTING RS RUJUKAN</th>
                <th className="py-3 px-4">BEBAN KASUS AKTIF</th>
                <th className="py-3 px-4 text-center">KEPATUHAN SLA</th>
                <th className="py-3 px-4 text-center">STATUS</th>
                <th className="py-3 px-4 text-center w-36">AKSI OPERASIONAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOfficers.map((off, index) => {
                const no = index + 1;
                return (
                  <tr key={off.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* NO */}
                    <td className="py-3.5 px-3 text-center font-bold text-slate-400">
                      {no}
                    </td>

                    {/* PETUGAS & NIP */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#0A3981] text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                          {off.avatar || 'JR'}
                        </div>
                        <div>
                          <Link 
                            to={`/kabag/kinerja-petugas/${off.id}`}
                            className="font-extrabold text-slate-900 block text-xs hover:text-[#0A3981] transition-colors"
                          >
                            {off.nama}
                          </Link>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            NIP. {off.nip}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* WILAYAH */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {off.wilayah}
                      </span>
                    </td>

                    {/* PLOTTING RS RUJUKAN */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(off.plottingRs || ['RS Polri Kramat Jati', 'RS Premier']).slice(0, 2).map((rs, idx) => (
                          <span 
                            key={idx}
                            className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                          >
                            {rs.length > 20 ? rs.slice(0, 18) + '...' : rs}
                          </span>
                        ))}
                        {(off.plottingRs || []).length > 2 && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            +{off.plottingRs.length - 2} RS
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Total {off.plottingRs?.length || 2} RS Rujukan
                      </span>
                    </td>

                    {/* BEBAN KASUS AKTIF */}
                    <td className="py-3.5 px-4 min-w-[130px]">
                      <div className="flex items-center justify-between text-[11px] mb-1 font-semibold text-slate-800">
                        <span>{off.kapasitas || '8/10 Kasus'}</span>
                        <span className="text-slate-400 font-normal">{off.bebanKasusPct || 80}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            (off.bebanKasusPct || 80) >= 90 ? 'bg-rose-600' :
                            (off.bebanKasusPct || 80) >= 70 ? 'bg-[#0A3981]' :
                            'bg-emerald-600'
                          }`}
                          style={{ width: `${off.bebanKasusPct || 80}%` }}
                        />
                      </div>
                    </td>

                    {/* KEPATUHAN SLA */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="inline-flex flex-col items-center">
                        <span className="font-extrabold text-xs text-slate-900">
                          {off.id === 'PET-01' ? '96.5%' :
                           off.id === 'PET-02' ? '94.8%' :
                           off.id === 'PET-03' ? '91.2%' :
                           off.id === 'PET-04' ? '86.4%' :
                           off.id === 'PET-05' ? '81.9%' : '95.0%'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {off.id === 'PET-05' ? '(Tertunda)' :
                           off.id === 'PET-04' ? '(Sedang)' : '(Tinggi)'}
                        </span>
                      </div>
                    </td>

                    {/* STATUS */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {off.status === 'Verifikasi Berkas' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                          <span>Verifikasi Berkas</span>
                        </span>
                      ) : off.status === 'Perlu Perhatian' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                          <span>Perlu Perhatian</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          <span>Aktif Lapangan</span>
                        </span>
                      )}
                    </td>

                    {/* AKSI OPERASIONAL */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => alert(`Penugasan korban baru untuk ${off.nama}...`)}
                          className="px-2.5 py-1 rounded text-[11px] font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
                        >
                          Penugasan
                        </button>
                        <Link
                          to={`/kabag/kinerja-petugas/${off.id}`}
                          className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded text-[11px] font-bold bg-[#0A3981] text-white hover:bg-[#072B62] transition-colors shadow-2xs"
                        >
                          <span>Detail</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Baris per halaman:</span>
            <select className="border border-slate-300 rounded px-2 py-0.5 bg-white text-xs">
              <option>12</option>
              <option>24</option>
            </select>
            <span>Menampilkan 1-6 dari 18 petugas terdaftar</span>
          </div>

          <div className="flex items-center gap-1 self-start sm:self-auto">
            <button className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50" disabled>
              &lt;
            </button>
            <button className="px-2.5 py-1 rounded font-bold bg-[#0A3981] text-white">
              1
            </button>
            <button className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
              2
            </button>
            <button className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
              3
            </button>
            <button className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50">
              &gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
