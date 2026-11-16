import React from 'react';
import { Phone, ArrowRight, AlertCircle, X, Check, Loader2 } from 'lucide-react';

/**
 * Modal Konfirmasi Perubahan Nomor HP
 * Menampilkan rincian nomor HP lama vs baru sebelum perubahan disimpan secara permanen.
 */
export default function ModalConfirmChangePhone({
  isOpen,
  onClose,
  onConfirm,
  oldPhone = '—',
  newPhone = '—',
  isLoading = false
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0A3981] flex items-center justify-center shrink-0 border border-blue-100">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Konfirmasi Perubahan Nomor HP
              </h3>
              <p className="text-xs text-slate-500">
                Pembaruan informasi kontak akun
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Apakah Anda yakin ingin memperbarui nomor telepon akun Anda? Nomor HP akan diperbarui setelah Anda menyetujui perubahan ini.
          </p>

          {/* Kotak Perbandingan Nomor HP Lama vs Baru */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Nomor HP Saat Ini (Lama)
              </span>
              <div className="font-mono text-xs font-semibold text-slate-700 bg-white px-3 py-2 rounded-lg border border-slate-200">
                {oldPhone || '—'}
              </div>
            </div>

            <div className="flex justify-center text-slate-300">
              <ArrowRight className="w-4 h-4 rotate-90 sm:rotate-0" />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block mb-1">
                Nomor HP Baru yang Disimpan
              </span>
              <div className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50/80 px-3 py-2 rounded-lg border border-emerald-200 flex items-center justify-between">
                <span>{newPhone}</span>
                <span className="text-[10px] bg-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  Baru
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-2.5 text-blue-950">
            <AlertCircle className="w-4 h-4 text-[#145DA0] shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              Pastikan nomor HP yang Anda masukkan aktif di <strong>WhatsApp</strong> untuk kelancaran penerimaan koordinasi dan penugasan kedinasan.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50/90 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Ya, Simpan Perubahan</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
