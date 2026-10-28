import React, { useRef, useState } from 'react';
import { X, Printer, Download, FileSpreadsheet, CheckCircle2, Loader2 } from 'lucide-react';
import { BPAIKEvent, AttendanceRecord } from '../types';
import { exportAttendanceToExcel } from '../utils/reportExport';
import { downloadAttendanceTableAsPdf } from '../utils/pdfExport';

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

  const handlePrint = () => {
    window.print();
  };

  const handleExcelExport = () => {
    exportAttendanceToExcel(event, records);
  };

  const handleDownloadPdf = async () => {
    if (!printAreaRef.current) return;
    setIsDownloadingPdf(true);
    try {
      const cleanEventTitle = event.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 35);
      await downloadAttendanceTableAsPdf(printAreaRef.current, {
        fileName: `rekap-absensi-bpaik-${cleanEventTitle}-${event.date}.pdf`,
        orientation: 'portrait',
        format: 'a4',
        marginMm: 8,
        rowsPerPage: 12
      });
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF gagal dibuat. Silakan coba lagi; tidak ada dialog cetak tambahan yang dibuka.');
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
            title="Cetak langsung melalui driver cetak device"
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

      {/* Printable Sheet Wrapper */}
      <div className="w-full max-w-4xl bg-white text-slate-900 rounded-b-2xl p-6 sm:p-10 shadow-2xl max-h-[85vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:m-0 print:shadow-none print:w-full print:rounded-none">
        
        <div ref={printAreaRef} className="print-content space-y-4">
          
          {/* Kop rekap absensi memakai aset kop surat resmi BPAIK */}
          <img
            src="/images/KOP-SURAT-BPAIK.jpg"
            alt="Kop surat resmi BPAIK"
            className="block w-full h-auto"
            loading="eager"
          />

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
                {Array.from({ length: Math.max(1, Math.ceil(totalRows / 2)) }).map((_, pairIndex) => {
                  const leftNumber = pairIndex * 2 + 1;
                  const leftRecord = sortedRecords[leftNumber - 1];
                  const rightRecord = sortedRecords[leftNumber];

                  const renderRecordCells = (record: AttendanceRecord | undefined, rowNumber: number) => (
                    <>
                      <td className="border border-slate-900 text-center font-semibold text-[10px] p-1 font-mono">
                        {record ? rowNumber : ''}
                      </td>
                      <td className="border border-slate-900 px-2 py-1 font-medium text-[11px]">
                        {record ? record.userName : ''}
                      </td>
                      <td className="border border-slate-900 px-2 py-1 text-[10px] text-slate-700">
                        {record ? (record.userJabatan || 'Peserta') : ''}
                      </td>
                      <td className="border border-slate-900 text-center font-mono text-[9px] px-1 py-1">
                        {record && (record.attendanceStatus === 'IZIN' || (record.notes && record.notes.toLowerCase().includes('izin'))) ? (
                          <span className="font-sans font-bold text-amber-900 bg-amber-100/90 px-1 py-0.5 rounded border border-amber-300 inline-block">
                            Izin
                          </span>
                        ) : record ? (
                          new Date(record.scanTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'
                        ) : ''}
                      </td>
                    </>
                  );

                  const renderSignatureCell = (record: AttendanceRecord | undefined, number: number) => (
                    <td rowSpan={2} className="border border-slate-900 p-1 align-top w-28">
                      <div className="flex min-h-[64px] h-full flex-col items-stretch gap-1">
                        <span className="text-[9px] font-bold text-slate-600 font-mono leading-none">{number}.</span>
                        {record && (record.attendanceStatus === 'IZIN' || (record.notes && record.notes.toLowerCase().includes('izin'))) ? (
                          <span className="text-[8px] font-extrabold text-amber-900 bg-amber-100 rounded px-1 py-0.5 text-center border border-amber-300">
                            Izin
                          </span>
                        ) : record && record.signatureData ? (
                          <img src={record.signatureData} alt={`TTD ${record.userName}`} className="h-12 w-full object-contain mx-auto" />
                        ) : record && record.signatureStatus === 'TERKONFIRMASI' ? (
                          <span className="text-[8px] font-bold text-emerald-800 text-center">Terkonfirmasi ✓</span>
                        ) : null}
                      </div>
                    </td>
                  );

                  return (
                    <React.Fragment key={`attend-pair-${pairIndex}`}>
                      <tr className="border border-slate-900 text-slate-900 h-10">
                        {renderRecordCells(leftRecord, leftNumber)}
                        {renderSignatureCell(leftRecord, leftNumber)}
                        {renderSignatureCell(rightRecord, leftNumber + 1)}
                      </tr>
                      <tr className="border border-slate-900 text-slate-900 h-10">
                        {renderRecordCells(rightRecord, leftNumber + 1)}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary and Legal Signature Footer */}
          <div data-report-footer="true" className="pt-6 mt-4 flex flex-col sm:flex-row items-start justify-between gap-6 text-xs text-slate-800 break-inside-avoid">
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
                Dr. H. Ahmad Dahlan, M.Ag.
              </p>
              <p className="text-[10px] text-slate-600 font-mono">NPP. 0422019800</p>
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
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-content .overflow-x-auto {
            overflow: visible !important;
          }
          .print-content table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          .print-content thead {
            display: table-header-group !important;
          }
          .print-content tfoot {
            display: table-footer-group !important;
          }
          .print-content tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
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
