import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Check, Building2, ChevronDown } from 'lucide-react';

export default function HospitalSingleSearchSelect({
  value = '',
  onChange,
  hospitals = [],
  excludeHospital = '',
  placeholder = 'Ketik nama atau kata kunci rumah sakit...',
  disabled = false
}) {
  const [searchQuery, setSearchQuery] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setSearchQuery(value || '');
  }, [value]);

  const availableList = useMemo(() => {
    const excludeLower = (excludeHospital || '').trim().toLowerCase();
    const seen = new Set();
    return (hospitals || [])
      .map((h) => (typeof h === 'string' ? h : h?.nama_rs || '').trim())
      .filter((name) => {
        if (!name) return false;
        const lower = name.toLowerCase();
        if (excludeLower && lower === excludeLower) return false;
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
  }, [hospitals, excludeHospital]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q === (value || '').trim().toLowerCase()) return availableList;
    return availableList.filter((name) => name.toLowerCase().includes(q));
  }, [availableList, searchQuery, value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery(value || '');
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery(value || '');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [value]);

  const handleSelect = (name) => {
    setSearchQuery(name);
    onChange(name);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSearchQuery('');
    onChange('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div className="relative" ref={containerRef}>
      <div
        className={`flex items-center bg-white border rounded-lg transition-all ${
          isOpen ? 'border-[#145DA0] ring-2 ring-blue-500/20' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <Search className="w-3.5 h-3.5 text-slate-400 ml-3 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={searchQuery}
          onChange={(e) => {
            const next = e.target.value;
            setSearchQuery(next);
            if (!next.trim() && value) onChange('');
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full px-2.5 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
        />
        <div className="flex items-center pr-2 gap-0.5 shrink-0">
          {searchQuery && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 cursor-pointer"
              title="Hapus pilihan"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen((prev) => !prev)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 cursor-pointer"
            title={isOpen ? 'Tutup daftar' : 'Buka daftar'}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180 text-[#145DA0]' : ''}`} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-500 font-medium flex items-center justify-between">
            <span>
              {filteredList.length} rumah sakit ditemukan
            </span>
            <span>Klik untuk memilih</span>
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 p-1">
            {filteredList.length === 0 ? (
              <div className="py-6 px-3 text-center text-slate-400">
                <Building2 className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">Rumah sakit tidak ditemukan</p>
                <p className="text-[10px]">Coba kata kunci lain</p>
              </div>
            ) : (
              filteredList.map((name) => {
                const isSelected = name.toLowerCase() === (value || '').trim().toLowerCase();
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelect(name)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 text-[#145DA0] font-bold'
                        : 'text-slate-700 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <span className="truncate">{name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#145DA0] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
