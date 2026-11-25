import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Check, Building2, ChevronDown } from 'lucide-react';
import { INITIAL_HOSPITALS } from '../../services/initialDataset';

/**
 * Komponen Searchable Multi-Select Rumah Sakit untuk Form Petugas (Kabag)
 * Memungkinkan pencarian interaktif langsung dengan multi-select dan tag/chips yang dapat dihapus.
 */
export default function HospitalSearchSelect({
  selectedHospitals = [],
  onChange,
  availableHospitals = INITIAL_HOSPITALS,
  label = 'Rumah Sakit yang Ditangani',
  required = true,
  error = ''
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Pastikan daftar RS selalu unik dan mencakup 69 RS tetap
  const allHospitalsList = useMemo(() => {
    const set = new Set();
    // Prioritaskan 69 RS standar terlebih dahulu
    (INITIAL_HOSPITALS || []).forEach((h) => {
      if (h && typeof h === 'string') set.add(h.trim());
    });
    // Tambahkan RS dari availableHospitals jika ada tambahan
    (availableHospitals || []).forEach((h) => {
      if (h && typeof h === 'string') set.add(h.trim());
    });
    // Tambahkan juga RS yang sudah terpilih agar tidak hilang
    (selectedHospitals || []).forEach((h) => {
      if (h && typeof h === 'string') set.add(h.trim());
    });
    return Array.from(set);
  }, [availableHospitals, selectedHospitals]);

  // Filter daftar rumah sakit secara langsung berdasarkan kata kunci pencarian
  const filteredHospitals = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allHospitalsList;
    return allHospitalsList.filter((rs) => rs.toLowerCase().includes(q));
  }, [allHospitalsList, searchQuery]);

  // Handle klik di luar komponen untuk menutup dropdown secara otomatis
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSelectHospital = (rs) => {
    if (!rs) return;
    const cleanRs = rs.trim();
    if (!selectedHospitals.includes(cleanRs)) {
      // Tambahkan ke daftar terpilih tanpa duplikat
      onChange([...selectedHospitals, cleanRs]);
    } else {
      // Toggle pembatalan jika diklik kembali di dropdown
      onChange(selectedHospitals.filter((item) => item !== cleanRs));
    }
    // Tetap fokuskan input untuk pencarian berikutnya
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleRemoveHospital = (rsToRemove) => {
    onChange(selectedHospitals.filter((rs) => rs !== rsToRemove));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div className="space-y-2.5 relative" ref={containerRef}>
      {/* Label Komponen */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <Building2 className="w-3.5 h-3.5 text-[#0A3981]" />
          <span>{label}</span>
          {required && <span className="text-red-500 font-extrabold">*</span>}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#0A3981] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            {selectedHospitals.length} Dipilih
          </span>
          {selectedHospitals.length > 1 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] text-slate-400 hover:text-red-600 font-medium transition-colors cursor-pointer"
            >
              Hapus Semua
            </button>
          )}
        </div>
      </div>

      {/* Kolom Pencarian Interaktif */}
      <div className="relative">
        <div
          className={`flex items-center bg-white border rounded-xl transition-all shadow-2xs ${
            isOpen
              ? 'border-[#0A3981] ring-2 ring-blue-500/20'
              : error
              ? 'border-red-400'
              : 'border-slate-300 hover:border-slate-400'
          }`}
        >
          <div className="pl-3.5 pr-2 text-slate-400 flex items-center justify-center">
            <Search className="w-4 h-4" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onClick={() => setIsOpen(true)}
            onFocus={() => setIsOpen(true)}
            placeholder="Cari atau pilih rumah sakit..."
            className="w-full py-2.5 pr-8 text-xs font-medium text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
          />
          <div className="flex items-center pr-2.5 gap-1">
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  if (inputRef.current) inputRef.current.focus();
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title={isOpen ? 'Tutup daftar' : 'Buka daftar'}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-[#0A3981]' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Dropdown Menu Tepat di Bawah Kolom Pencarian */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            {/* Header Mini Dropdown */}
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span>
                {searchQuery ? (
                  <>
                    Hasil pencarian: <strong>{filteredHospitals.length}</strong> RS
                  </>
                ) : (
                  <>
                    Menampilkan seluruh <strong>{allHospitalsList.length}</strong> RS rujukan
                  </>
                )}
              </span>
              <span className="text-[10px] text-slate-400">Klik untuk memilih / membatalkan</span>
            </div>

            {/* List Rumah Sakit dengan Scroll */}
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 p-1">
              {filteredHospitals.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2 stroke-[1.5]" />
                  <p className="text-xs font-bold text-slate-600">Rumah sakit tidak ditemukan</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tidak ada nama rumah sakit yang cocok dengan kata kunci &quot;{searchQuery}&quot;.
                  </p>
                </div>
              ) : (
                filteredHospitals.map((rs, index) => {
                  const isSelected = selectedHospitals.includes(rs);
                  return (
                    <button
                      key={rs}
                      type="button"
                      onClick={() => handleSelectHospital(rs)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/90 text-[#0A3981] font-bold hover:bg-blue-100/70'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-3">
                        <span className="text-[10px] font-mono text-slate-400 w-5 shrink-0">
                          {String(index + 1).padStart(2, '0')}.
                        </span>
                        <span className="truncate">{rs}</span>
                      </div>

                      {/* Indikator Visual Terpilih */}
                      {isSelected ? (
                        <div className="flex items-center gap-1.5 shrink-0 bg-blue-100/80 text-[#0A3981] px-2 py-0.5 rounded-md text-[10px] font-extrabold border border-blue-200">
                          <Check className="w-3 h-3 stroke-[3]" />
                          <span>Terpilih</span>
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded border border-slate-300 shrink-0 group-hover:border-slate-400 flex items-center justify-center" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pesan Error / Validasi jika belum memilih */}
      {error && (
        <p className="text-[11px] text-red-600 font-semibold flex items-center gap-1 mt-1">
          <span>•</span> {error}
        </p>
      )}

      {/* Rumah Sakit yang Sudah Dipilih Ditampilkan dalam Bentuk Tag / Chips */}
      {selectedHospitals.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Daftar Rumah Sakit Tanggung Jawab Petugas:</span>
            <span className="text-slate-400 text-[10px]">Klik tombol × untuk membatalkan</span>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50/80 rounded-xl border border-slate-200">
            {selectedHospitals.map((rs) => (
              <div
                key={rs}
                className="inline-flex items-center gap-1.5 bg-white text-[#0A3981] border border-blue-200/90 rounded-lg px-2.5 py-1 text-xs font-bold shadow-2xs group hover:border-blue-300 transition-all"
              >
                <Building2 className="w-3 h-3 text-[#0A3981] shrink-0" />
                <span className="max-w-[240px] truncate" title={rs}>
                  {rs}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveHospital(rs)}
                  className="p-0.5 ml-0.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  title={`Hapus ${rs}`}
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
