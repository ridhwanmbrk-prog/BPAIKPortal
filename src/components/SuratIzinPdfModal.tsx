import React, { useRef, useState } from 'react';
import { X, Printer, Download, FileText, CheckCircle2, Loader2 } from 'lucide-react';
import { LeaveRequest } from '../types';
import { downloadElementAsPdf } from '../utils/pdfExport';

interface SuratIzinPdfModalProps {
  leave: LeaveRequest;
  onClose: () => void;
}

export const SuratIzinPdfModal: React.FC<SuratIzinPdfModalProps> = ({
  leave,
  onClose
}) => {
  const printAreaRef = useRef<HTMLDivElement | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!printAreaRef.current) return;
    setIsDownloadingPdf(true);
    try {
      const cleanName = leave.userName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 30);
      await downloadElementAsPdf(printAreaRef.current, {
        fileName: `surat-izin-resmi-bpaik-${cleanName}-${leave.id}.pdf`,
        orientation: 'portrait',
        format: 'a4',
        marginMm: 12
      });
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Gagal mengunduh file PDF secara langsung. Silakan gunakan tombol Cetak / Simpan PDF.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Generate formal letter number
  const dateObj = new Date(leave.createdAt || Date.now());
  const year = dateObj.getFullYear();
  const monthRoman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][dateObj.getMonth()];
  const idNumber = leave.id.replace(/[^0-9]/g, '').slice(-3) || '042';
  const letterNumber = `${idNumber}/BPAIK-UNISA/IZIN/${monthRoman}/${year}`;

  const formattedLetterDate = dateObj.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Top Action Header (Hidden in Print) */}
      <div className="print:hidden w-full max-w-3xl bg-slate-900 text-white px-4 py-3 rounded-t-2xl flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 shadow-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-islamic">Surat Izin Resmi BPAIK (PDF Surat Keluar)</h3>
            <p className="text-[11px] text-slate-400">Telah ditandatangani oleh Kepala BPAIK UNISA Bandung</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Direct 1-Click PDF Download Button */}
          <button
            type="button"
            disabled={isDownloadingPdf}
            onClick={handleDownloadPdf}
            className="px-3.5 py-1.5 bg-[#F4C542] hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-60"
            title="Download surat izin sebagai file PDF langsung"
          >
            {isDownloadingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                <span>Mengunduh PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-slate-950" />
                <span>Unduh Surat PDF (.pdf)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
            title="Cetak atau Unduh PDF melalui driver cetak device"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            <span>Cetak (Print Driver)</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sheet Content Wrapper */}
      <div className="w-full max-w-3xl bg-white text-slate-900 rounded-b-2xl p-6 sm:p-12 shadow-2xl max-h-[85vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:m-0 print:shadow-none print:w-full print:rounded-none">
        
        <div ref={printAreaRef} className="print-letter space-y-4 text-slate-900 text-xs sm:text-sm leading-relaxed">
          
          {/* Kop surat resmi BPAIK dari berkas yang disediakan */}
          <img
            src="/images/KOP-SURAT-BPAIK.jpg"
            alt="Kop surat resmi BPAIK"
            className="block w-full h-auto"
            loading="eager"
          />

          {/* Nomor & Perihal Surat */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2 pt-2">
            <div className="space-y-0.5">
              <div className="flex gap-2">
                <span className="w-16 font-semibold">Nomor</span>
                <span>: {letterNumber}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-16 font-semibold">Lampiran</span>
                <span>: -</span>
              </div>
              <div className="flex gap-2">
                <span className="w-16 font-semibold">Perihal</span>
                <span className="font-bold">: Surat Keterangan / Izin Tidak Hadir Kegiatan</span>
              </div>
            </div>

            <div className="text-right text-xs">
              <p>Bandung, {formattedLetterDate}</p>
            </div>
          </div>

          {/* Tujuan Surat */}
          <div className="space-y-1 pt-1">
            <p>Kepada Yth,</p>
            <p className="font-bold text-slate-900">{leave.userName}</p>
            <p className="text-slate-700">{leave.userJabatan || 'Civitas Akademika / Peserta Pembinaan'}</p>
            <p className="text-slate-600">Universitas 'Aisyiyah Bandung</p>
            <p>Di tempat</p>
          </div>

          {/* Salam Pembuka */}
          <div className="pt-2">
            <p className="font-semibold italic font-serif">Assalamu'alaikum Warahmatullahi Wabarakatuh,</p>
            <p className="mt-2 text-justify">
              Ba'da salam, semoga limpahan rahmat, taufiq, dan hidayah Allah Subhanahu Wa Ta'ala senantiasa menyertai kita semua dalam menjalankan amanah persyarikatan dan tridharma perguruan tinggi.
            </p>
            <p className="mt-2 text-justify">
              Menindaklanjuti permohonan izin ketidakhadiran yang diajukan melalui Portal BPAIK Universitas 'Aisyiyah Bandung oleh:
            </p>
          </div>

          {/* Identitas Pemohon */}
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-3.5 my-2 space-y-1.5 font-medium">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              <span className="text-slate-500">Nama Lengkap</span>
              <span className="sm:col-span-2 font-bold text-slate-900">: {leave.userName}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              <span className="text-slate-500">NPP / NIDN</span>
              <span className="sm:col-span-2 font-mono">: {leave.userNpp || '-'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              <span className="text-slate-500">Jabatan / Unit</span>
              <span className="sm:col-span-2">: {leave.userJabatan || 'Dosen / Tenaga Kependidikan'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              <span className="text-slate-500">Agenda Kegiatan</span>
              <span className="sm:col-span-2 font-bold text-emerald-950">: {leave.eventTitle}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              <span className="text-slate-500">Tanggal Kegiatan</span>
              <span className="sm:col-span-2">: {leave.eventDate}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              <span className="text-slate-500">Alasan Permohonan</span>
              <span className="sm:col-span-2 italic text-slate-800">: "{leave.reason}"</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              <span className="text-slate-500">Keputusan Admin</span>
              <span className="sm:col-span-2 font-bold text-emerald-800">: DISETUJUI (ACC RESMI)</span>
            </div>
          </div>

          {/* Pernyataan Izin */}
          <div className="space-y-2 text-justify">
            <p>
              Dengan ini Badan Pengembangan Al-Islam dan Kemuhammadiyahan (BPAIK) Universitas 'Aisyiyah Bandung memberikan persetujuan (izin) atas ketidakhadiran yang bersangkutan pada kegiatan tersebut di atas. Presensi yang bersangkutan telah dicatat secara sah dengan status <strong>IZIN</strong> dalam pangkalan data sistem presensi BPAIK.
            </p>
            <p>
              Demikian surat keterangan izin ini diterbitkan untuk dipergunakan sebagaimana mestinya. Atas perhatian dan kerjasamanya kami sampaikan terima kasih.
            </p>
            <p className="font-semibold italic font-serif">Nashrun Minallah Wa Fathun Qarib,</p>
            <p className="font-semibold italic font-serif">Wassalamu'alaikum Warahmatullahi Wabarakatuh.</p>
          </div>

          {/* Tanda Tangan Resmi Kepala BPAIK */}
          <div className="pt-6 flex justify-end break-inside-avoid">
            <div className="w-72 text-center space-y-1">
              <p className="text-slate-700 font-medium">Bandung, {formattedLetterDate}</p>
              <p className="font-bold text-slate-900 leading-tight">
                Kepala BPAIK Universitas 'Aisyiyah Bandung
              </p>

              {/* Tanda Tangan & Stempel Digital Resmi */}
              <div className="relative py-2 h-24 flex items-center justify-center">
                {/* Stempel bulat BPAIK UNISA */}
                <div className="absolute left-4 w-20 h-20 rounded-full border-2 border-dashed border-emerald-700/60 flex flex-col items-center justify-center text-emerald-800 text-[8px] font-bold uppercase rotate-[-12deg] pointer-events-none opacity-80">
                  <span>★ BPAIK ★</span>
                  <span className="text-[7px]">UNISA</span>
                  <span className="text-[6px]">BANDUNG</span>
                </div>

                {/* Grafis TTD Digital */}
                <div className="relative z-10">
                  <svg className="w-40 h-16 text-emerald-900" viewBox="0 0 200 80" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M 20,50 Q 40,10 60,45 T 100,30 T 140,55 Q 160,20 180,45" />
                    <path d="M 50,60 C 80,75 120,65 170,55" strokeWidth="2" />
                    <circle cx="85" cy="25" r="3" fill="currentColor" />
                  </svg>
                  <span className="text-[9px] font-mono text-emerald-800 block -mt-1 font-bold">
                    ✓ Valid Digital Signature
                  </span>
                </div>
              </div>

              {/* Nama Kepala BPAIK strictly per user requirement */}
              <div className="border-t border-slate-900 pt-1">
                <p className="font-extrabold text-slate-900 text-xs sm:text-sm underline">
                  Dr. Mohammad Anwar Syi'aruddin, S.Hum., M.A.
                </p>
                <p className="font-mono text-[11px] text-slate-700 font-semibold">
                  NPP. 2025140290164
                </p>
              </div>
            </div>
          </div>

          {/* Footer Security Note */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-400 font-mono">
            <span>Dokumen Resmi Diterbitkan oleh Portal BPAIK UNISA Bandung</span>
            <span>ID Verifikasi: {leave.id}</span>
          </div>

        </div>

      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-letter, .print-letter * {
            visibility: visible;
          }
          .print-letter {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 15mm 20mm !important;
            margin: 0 !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
};
