import React, { useRef, useState } from 'react';
import { X, Printer, Download, FileSpreadsheet, CheckCircle2, Loader2 } from 'lucide-react';
import { BPAIKEvent, AttendanceRecord } from '../types';
import { exportAttendanceToExcel } from '../utils/reportExport';
import { downloadAttendanceReportPdf } from '../utils/pdfExport';

interface AttendancePdfModalProps {
  event: BPAIKEvent;
  records: AttendanceRecord[];
  onClose: () => void;
}

export const AttendancePdfModal: React.FC<AttendancePdfModalProps> = ({
  event,
  records,
  onClose
}) => {
  const printAreaRef = useRef<HTMLDivElement | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Filter and sort records
  const sortedRecords = records
    .filter(record => record.attendanceStatus === 'HADIR')
    .sort(
      (a, b) => new Date(a.scanTime).getTime() - new Date(b.scanTime).getTime()
    );

  const handlePrint = () => { void handleDownloadPdf(); };

  const handleExcelExport = () => {
    exportAttendanceToExcel(event, records);
  };

  const handleDownloadPdf = async () => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      const cleanEventTitle = event.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 35);
      await downloadAttendanceReportPdf(event, sortedRecords, {
        fileName: `rekap-absensi-bpaik-${cleanEventTitle}-${event.date || 'kegiatan'}.pdf`
      });
    } catch (err) {
      console.error('PDF export error:', err);
      alert(`PDF gagal dibuat: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Tampilkan sesuai jumlah data yang tersedia; baris bertambah otomatis.
  const totalRows = sortedRecords.length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Action Bar (Hidden when printing) */}
      <div className="print:hidden w-full max-w-4xl bg-slate-900 text-white px-4 py-3 rounded-t-2xl flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <div>
            <h3 className="text-sm font-bold font-islamic">Pratinjau Cetak / Ekspor PDF Resmi</h3>
            <p className="text-[11px] text-slate-400">Dilengkapi KOP Surat Resmi BPAIK UNISA Bandung & Tanda Tangan Digital</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Direct 1-Click PDF Download Button */}
          <button
            type="button"
            disabled={isDownloadingPdf}
            onClick={handleDownloadPdf}
            className="px-3.5 py-1.5 bg-[#F4C542] hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-60"
            title="Download file PDF langsung ke perangkat Anda"
          >
            {isDownloadingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                <span>Memproses PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-slate-950" />
                <span>Unduh File PDF (.pdf)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleExcelExport}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
            title="Download Excel sesuai format"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline">Ekspor Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
            title="Unduh PDF rekap siap cetak tanpa dialog cetak browser"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            <span>Unduh PDF Siap Cetak</span>
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

      {/* Printable Sheet Wrapper */}
      <div className="w-full max-w-4xl bg-white text-slate-900 rounded-b-2xl p-6 sm:p-10 shadow-2xl max-h-[85vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:m-0 print:shadow-none print:w-full print:rounded-none">
        
        <div ref={printAreaRef} className="print-content space-y-4">
          
          {/* ========================================================
              KOP SURAT RESMI UNIVERSITAS 'AISYIYAH BANDUNG & BPAIK
          ======================================================== */}
          <div className="border-b-4 border-double border-slate-900 pb-3 text-center relative">
            <div className="flex items-center justify-between gap-4">
              {/* Logo / Badge UNISA / Muhammadiyah */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center">
                <img
                  src="/images/logoBPAIK.png"
                  alt="Logo BPAIK UNISA Bandung"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Fallback to stylized SVG emblem if image path fails
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              {/* Text Header */}
              <div className="flex-1 text-center">
                <p className="text-[11px] sm:text-xs font-bold tracking-wider uppercase text-slate-700 font-sans">
                  MAJELIS PENDIDIKAN TINGGI PENELITIAN DAN PENGEMBANGAN
                </p>
                <p className="text-[11px] sm:text-xs font-bold tracking-wider uppercase text-slate-700 font-sans">
                  PIMPINAN PUSAT MUHAMMADIYAH
                </p>
                <h1 className="text-base sm:text-xl font-extrabold text-emerald-950 font-serif tracking-wide uppercase mt-0.5">
                  UNIVERSITAS 'AISYIYAH BANDUNG
                </h1>
                <h2 className="text-xs sm:text-sm font-bold text-emerald-800 font-serif tracking-widest uppercase">
                  BADAN PENGEMBANGAN AL-ISLAM DAN KEMUHAMMADIYAHAN (BPAIK)
                </h2>
                <p className="text-[9px] sm:text-[10px] text-slate-600 mt-1 leading-tight font-sans">
                  kantor BPAIK: Gedung PESMA UNISA Bandung Jl. Terusan Rancagoong II No.1, Gumuruh, Kec. Batununggal, Kota Bandung 40275<br />
                  Telp: (022) 7305269 | Website: unisa-bandung.ac.id | Email: bpaik@unisa-bandung.ac.id
                </p>
              </div>

              {/* Secondary Emblem Placeholder */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 hidden sm:flex items-center justify-center p-1 border-2 border-emerald-800 rounded-full text-emerald-900 font-serif text-[10px] font-bold text-center leading-tight">
                UNISA<br/>BANDUNG
              </div>
            </div>
          </div>

          {/* Document Title */}
          <div className="text-center pt-2">
            <h2 className="text-sm sm:text-base font-black uppercase text-slate-900 underline underline-offset-4 tracking-wide font-sans">
              DAFTAR HADIR PESERTA KEGIATAN KAJIAN & PEMBINAAN
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Civitas Akademika Universitas 'Aisyiyah Bandung
            </p>
          </div>

          {/* Metadata Block exactly matching the format */}
          <div className="bg-slate-50 print:bg-transparent p-3 rounded-lg border border-slate-200 text-xs text-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4">
            <div>
              <span className="font-bold text-slate-900 inline-block w-28">Nama_Kegiatan</span>
              <span className="font-semibold text-emerald-900">: {event.title}</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 inline-block w-28">Tanggal</span>
              <span>: {event.date || new Date().toISOString().split('T')[0]}</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 inline-block w-28">Tempat</span>
              <span>: {event.location || 'Universitas \'Aisyiyah Bandung'}</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 inline-block w-28">Waktu</span>
              <span>: {event.startTime} - {event.endTime} WIB</span>
            </div>
          </div>

          {/* ========================================================
              TABEL DAFTAR HADIR DENGAN GREEN HEADER & ZIGZAG TANDA TANGAN
              Sesuai dengan referensi gambar (image_368705b6.png)
          ======================================================== */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border-2 border-slate-900 text-xs">
              <thead>
                <tr className="bg-[#c4e5b5] text-slate-950 font-bold border-b border-slate-900 text-center">
                  <th rowSpan={2} className="border border-slate-900 p-2 w-10">No</th>
                  <th rowSpan={2} className="border border-slate-900 p-2 text-left">Nama_Lengkap</th>
                  <th rowSpan={2} className="border border-slate-900 p-2 text-left w-48">Jabatan</th>
                  <th rowSpan={2} className="border border-slate-900 p-2 w-28">ScanTime</th>
                  <th colSpan={2} className="border border-slate-900 p-1.5 w-56">TANDA_TANGAN</th>
                </tr>
                <tr className="bg-[#c4e5b5] text-slate-950 font-bold border-b-2 border-slate-900 text-center text-[11px]">
                  <th className="border border-slate-900 py-1 w-28">1</th>
                  <th className="border border-slate-900 py-1 w-28">2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {Array.from({ length: totalRows }).map((_, index) => {
                  const rowNum = index + 1;
                  const rec = sortedRecords[index];
                  const isOdd = rowNum % 2 !== 0;

                  return (
                    <tr key={rowNum} className="border border-slate-900 text-slate-900 h-24">
                      {/* No */}
                      <td className="border border-slate-900 text-center font-semibold text-[11px] p-1 font-mono">
                        {rowNum}
                      </td>

                      {/* Nama Lengkap */}
                      <td className="border border-slate-900 px-2 py-1 font-medium">
                        {rec ? rec.userName : ''}
                      </td>

                      {/* Jabatan */}
                      <td className="border border-slate-900 px-2 py-1 text-[11px] text-slate-700">
                        {rec ? (rec.userJabatan || 'Peserta') : ''}
                      </td>

                      {/* ScanTime */}
                      <td className="border border-slate-900 text-center font-mono text-[10px] px-1 py-1">
                        {rec && (rec.attendanceStatus === 'IZIN' || (rec.notes && rec.notes.toLowerCase().includes('izin'))) ? (
                          <span className="font-sans font-bold text-amber-900 bg-amber-100/90 px-1 py-0.5 rounded text-[9px] border border-amber-300 inline-block">
                            Izin (Tidak Hadir)
                          </span>
                        ) : rec ? (
                          new Date(rec.scanTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
                        ) : ''}
                      </td>

                      {/* Tanda Tangan Kolom 1 (Ganjil: 1, 3, 5...) */}
                      <td className="border border-slate-900 p-1 relative text-left align-top w-32 h-24">
                        {isOdd ? (
                          <div className="flex flex-col h-full justify-between">
                            <span className="text-[9px] font-bold text-slate-500 font-mono leading-none pl-0.5 pt-0.5">
                              {rowNum}.
                            </span>
                            {rec && (rec.attendanceStatus === 'IZIN' || (rec.notes && rec.notes.toLowerCase().includes('izin'))) ? (
                              <span className="text-[9px] font-extrabold text-amber-900 bg-amber-100/90 rounded px-1.5 py-0.5 mx-auto -mt-1 border border-amber-300">
                                Izin (Tidak Hadir)
                              </span>
                            ) : rec && rec.signatureData ? (
                              <img
                                src={rec.signatureData}
                                alt={`TTD ${rec.userName}`}
                                className="h-20 w-full object-contain mx-auto p-0.5"
                              />
                            ) : rec && rec.signatureStatus === 'TERKONFIRMASI' ? (
                              <span className="text-[9px] font-bold text-emerald-800 text-center block pb-0.5">
                                Terkonfirmasi ✓
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </td>

                      {/* Tanda Tangan Kolom 2 (Genap: 2, 4, 6...) */}
                      <td className="border border-slate-900 p-1 relative text-left align-top w-32 h-24">
                        {!isOdd ? (
                          <div className="flex flex-col h-full justify-between">
                            <span className="text-[9px] font-bold text-slate-500 font-mono leading-none pl-0.5 pt-0.5">
                              {rowNum}.
                            </span>
                            {rec && (rec.attendanceStatus === 'IZIN' || (rec.notes && rec.notes.toLowerCase().includes('izin'))) ? (
                              <span className="text-[9px] font-extrabold text-amber-900 bg-amber-100/90 rounded px-1.5 py-0.5 mx-auto -mt-1 border border-amber-300">
                                Izin (Tidak Hadir)
                              </span>
                            ) : rec && rec.signatureData ? (
                              <img
                                src={rec.signatureData}
                                alt={`TTD ${rec.userName}`}
                                className="h-20 w-full object-contain mx-auto p-0.5"
                              />
                            ) : rec && rec.signatureStatus === 'TERKONFIRMASI' ? (
                              <span className="text-[9px] font-bold text-emerald-800 text-center block pb-0.5">
                                Terkonfirmasi ✓
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary and Legal Signature Footer */}
          <div className="pt-6 mt-4 flex flex-col sm:flex-row items-start justify-between gap-6 text-xs text-slate-800 break-inside-avoid">
            <div className="space-y-1">
              <p className="font-bold text-slate-900">Catatan Kehadiran:</p>
              <p className="text-[11px] text-slate-600">Total Hadir: <strong>{sortedRecords.length} Peserta</strong></p>
              <p className="text-[11px] text-slate-600">Dokumen ini diterbitkan otomatis melalui Sistem Presensi Resmi BPAIK UNISA Bandung.</p>
            </div>

            <div className="text-center sm:text-right w-full sm:w-auto">
              <p>Bandung, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p className="font-bold text-slate-900 mt-1">Mengetahui,</p>
              <p className="font-bold text-emerald-950">Kepala BPAIK Universitas 'Aisyiyah Bandung</p>

              {/* Digital Stamp / Verification seal */}
              <div className="h-16 flex items-center justify-center sm:justify-end my-1">
                <div className="px-3 py-1 border-2 border-emerald-700 text-emerald-800 rounded-lg text-[9px] font-bold uppercase tracking-wider font-mono">
                  TERVERIFIKASI SISTEM BPAIK
                </div>
              </div>

              <p className="font-bold text-slate-900 underline underline-offset-2">
                Dr. Mohammad Anwar Syi'aruddin, S.Hum., M.A.
              </p>
              <p className="text-[10px] text-slate-600 font-mono">NPP. 2025140290164</p>
            </div>
          </div>

        </div>

      </div>

      {/* Embedded print styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content, .print-content * {
            visibility: visible;
          }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 15mm;
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
