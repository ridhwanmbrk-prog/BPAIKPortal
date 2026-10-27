import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, QrCode as QrIcon, CheckCircle2, ShieldCheck, Download, CreditCard, Loader2, Image as ImageIcon } from 'lucide-react';
import QRCode from 'qrcode';
import { BPAIKUser } from '../types';
import { getCardQrUrl } from '../utils/cardQr';
import { downloadElementAsPdf } from '../utils/pdfExport';
import { downloadCardElementAsJpg, generateCardCanvasJpg } from '../utils/cardExport';
import { UnisaEmblem } from './Footer';

interface ParticipantCardModalProps {
  employee?: BPAIKUser | null;
  allEmployees?: BPAIKUser[];
  onClose: () => void;
}

export const ParticipantCardModal: React.FC<ParticipantCardModalProps> = ({
  employee,
  allEmployees = [],
  onClose
}) => {
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const [printMode, setPrintMode] = useState<'single' | 'batch'>(employee ? 'single' : 'batch');
  const [selectedUser, setSelectedUser] = useState<BPAIKUser | null>(employee || (allEmployees[0] || null));
  const [qrCodeUrls, setQrCodeUrls] = useState<Record<string, string>>({});
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingJpg, setIsDownloadingJpg] = useState(false);

  const listToRender = printMode === 'single'
    ? (selectedUser ? [selectedUser] : [])
    : allEmployees;

  // Generate QR codes for cards
  useEffect(() => {
    async function generateQRs() {
      const urls: Record<string, string> = {};
      const targets = printMode === 'single' ? (selectedUser ? [selectedUser] : []) : allEmployees;

      for (const u of targets) {
        try {
          const qrPayload = getCardQrUrl(u);
          if (!qrPayload) continue;
          const dataUrl = await QRCode.toDataURL(qrPayload, {
            width: 260,
            margin: 1,
            color: {
              dark: '#062416',
              light: '#ffffff'
            }
          });
          urls[u.id] = dataUrl;
        } catch (err) {
          console.warn('QR generate error for user:', u.id, err);
        }
      }
      setQrCodeUrls(urls);
    }

    generateQRs();
  }, [printMode, selectedUser, allEmployees]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!cardsContainerRef.current) return;
    setIsDownloadingPdf(true);
    try {
      const fileName = printMode === 'single' && selectedUser
        ? `kartu-peserta-bpaik-${selectedUser.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`
        : `semua-kartu-peserta-bpaik-${allEmployees.length}-orang.pdf`;

      await downloadElementAsPdf(cardsContainerRef.current, {
        fileName,
        orientation: 'portrait',
        format: 'a4',
        marginMm: 8
      });
    } catch (err) {
      console.error('PDF card export error:', err);
      alert('Gagal mengunduh PDF kartu peserta.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadJpg = async () => {
    if (!cardsContainerRef.current) return;
    setIsDownloadingJpg(true);
    try {
      const targetCard = cardsContainerRef.current.querySelector('.card-container') as HTMLElement;
      const targetUserObj = selectedUser || allEmployees[0];
      const cleanName = (targetUserObj?.name || 'peserta').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
      const fileName = `kartu-digital-bpaik-${cleanName}.jpg`;

      if (targetCard) {
        await downloadCardElementAsJpg(targetCard, fileName);
      } else if (targetUserObj) {
        const qrUrl = qrCodeUrls[targetUserObj.id] || '';
        const jpgDataUrl = await generateCardCanvasJpg(targetUserObj, qrUrl);
        const link = document.createElement('a');
        link.href = jpgDataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('JPG download error, trying direct canvas fallback:', err);
      try {
        const targetUserObj = selectedUser || allEmployees[0];
        if (targetUserObj) {
          const qrUrl = qrCodeUrls[targetUserObj.id] || '';
          const jpgDataUrl = await generateCardCanvasJpg(targetUserObj, qrUrl);
          const link = document.createElement('a');
          link.href = jpgDataUrl;
          link.download = `kartu-digital-bpaik-${targetUserObj.name.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (fallbackErr) {
        alert('Gagal mengunduh JPG kartu peserta.');
      }
    } finally {
      setIsDownloadingJpg(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Top Action Header */}
      <div className="print:hidden w-full max-w-4xl bg-slate-900 text-white px-4 py-3 rounded-t-2xl flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 shadow-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-islamic">Kartu Digital Peserta Kegiatan BPAIK</h3>
            <p className="text-[11px] text-slate-400">Desain Resmi UNISA Bandung • Foto 2x3 Proporsional</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Print Mode Switcher */}
          {allEmployees.length > 1 && (
            <div className="flex bg-slate-800 p-1 rounded-xl text-xs font-bold border border-slate-700">
              <button
                type="button"
                onClick={() => setPrintMode('single')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  printMode === 'single' ? 'bg-[#0f613c] text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                Kartu Tunggal
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('batch')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  printMode === 'batch' ? 'bg-[#0f613c] text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                Cetak Semua ({allEmployees.length})
              </button>
            </div>
          )}

          {printMode === 'single' && allEmployees.length > 1 && (
            <select
              value={selectedUser?.id || ''}
              onChange={(e) => {
                const found = allEmployees.find(u => u.id === e.target.value);
                if (found) setSelectedUser(found);
              }}
              className="bg-slate-800 text-xs text-white border border-slate-700 rounded-xl px-2.5 py-1.5 focus:outline-emerald-500 cursor-pointer max-w-[160px] truncate"
            >
              {allEmployees.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.npp || u.role})
                </option>
              ))}
            </select>
          )}

          {/* Unduh JPG Button */}
          <button
            type="button"
            disabled={isDownloadingJpg}
            onClick={handleDownloadJpg}
            className="px-3.5 py-1.5 bg-[#0f613c] hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-60 border border-emerald-500"
            title="Download kartu digital sebagai gambar JPG langsung"
          >
            {isDownloadingJpg ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F4C542]" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <ImageIcon className="w-3.5 h-3.5 text-[#F4C542]" />
                <span>Unduh JPG (.jpg)</span>
              </>
            )}
          </button>

          {/* Direct 1-Click PDF Download Button */}
          <button
            type="button"
            disabled={isDownloadingPdf}
            onClick={handleDownloadPdf}
            className="px-3.5 py-1.5 bg-[#F4C542] hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-60"
            title="Download kartu digital sebagai file PDF langsung"
          >
            {isDownloadingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-slate-950" />
                <span>Unduh PDF (.pdf)</span>
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
            <span>Cetak Kartu</span>
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

      {/* Sheet Content Area */}
      <div className="w-full max-w-4xl bg-slate-100 rounded-b-2xl p-4 sm:p-8 shadow-2xl max-h-[85vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:m-0 print:shadow-none print:w-full print:bg-white print:rounded-none">
        
        {/* Strictly Portrait Cards Layout with 2:3 uncompressed Photo */}
        <div ref={cardsContainerRef} className="print-cards-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 justify-items-center">
          {listToRender.map((emp) => {
            const qrUrl = qrCodeUrls[emp.id];
            return (
              <div
                key={emp.id}
                className="card-container w-[280px] h-[450px] bg-white rounded-3xl border-2 border-[#063921] shadow-xl overflow-hidden relative break-inside-avoid flex flex-col justify-between select-none"
              >
                {/* 1. KOP ATAS: Deep Forest Green (#073922) */}
                <div className="bg-[#073922] text-white p-3 flex items-center gap-2.5 shrink-0">
                  <div className="w-11 h-11 rounded-full bg-white p-1 shrink-0 flex items-center justify-center shadow-xs">
                    <img
                      src="/images/logoBPAIK.png"
                      alt="Logo UNISA"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <h4 className="text-[11px] font-black tracking-wider uppercase text-[#F4C542] font-serif leading-tight">
                      UNIVERSITAS 'AISYIYAH<br />BANDUNG
                    </h4>
                    <p className="text-[8.5px] text-white/95 font-medium tracking-normal mt-0.5 leading-tight">
                      Badan Pengembangan Al-Islam &<br />Kemuhammadiyahan
                    </p>
                  </div>
                </div>

                {/* Solid Gold Accent Divider Line */}
                <div className="w-full h-[2.5px] bg-[#F4C542] shrink-0" />

                {/* Subtitle Bar: Light Mint with green dot */}
                <div className="bg-[#eaf5ee] px-3 py-1 flex items-center justify-between border-b border-[#c8e5d6] text-[8.5px] font-bold text-[#093d26] tracking-wider font-mono shrink-0">
                  <span className="truncate">KARTU DIGITAL PESERTA BPAIK</span>
                  <div className="flex items-center gap-1 text-[#0f613c] font-black shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                    <span>AKTIF</span>
                  </div>
                </div>

                {/* 2. CARD BODY: Foto 2x3 Proporsional (strictly NOT gepeng) & Identitas */}
                <div className="p-3.5 flex-1 flex flex-col items-center justify-between text-center bg-white">
                  
                  {/* Photo container strictly 2x3 aspect ratio (w: 80px, h: 120px) - NOT GEPENG! */}
                  <div className="w-[84px] h-[126px] aspect-[2/3] rounded-2xl border-2 border-[#0f613c] bg-[#eaf5ee] overflow-hidden shadow-xs shrink-0 flex items-center justify-center mt-0.5">
                    {emp.avatarUrl ? (
                      <img
                        src={emp.avatarUrl}
                        alt={emp.name}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#0f613c] text-white flex flex-col items-center justify-center p-1 text-center">
                        <span className="text-xl font-black font-islamic">
                          {emp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </span>
                        <span className="text-[7.5px] text-[#F4C542] mt-0.5 font-bold font-mono">2:3</span>
                      </div>
                    )}
                  </div>

                  {/* Participant Name & Meta */}
                  <div className="w-full my-1 space-y-0.5">
                    <h5 className="font-extrabold text-xs text-slate-900 font-serif leading-tight line-clamp-2 px-1">
                      {emp.name}
                    </h5>
                    <p className="text-[10px] text-[#0d6b46] font-mono font-black tracking-wide">
                      {emp.npp || 'NPP. -'}
                    </p>
                    <p className="text-[9.5px] text-slate-500 font-medium truncate px-1">
                      {emp.jabatan || 'Civitas Akademika UNISA'}
                    </p>
                  </div>

                  {/* 3. SCANNABLE QR CODE IN ROUNDED WHITE BOX */}
                  <div className="w-24 h-24 shrink-0 rounded-2xl border border-slate-300 bg-white p-1.5 shadow-2xs flex items-center justify-center">
                    {qrUrl ? (
                      <img
                        src={qrUrl}
                        alt="QR Peserta"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-[8px] text-slate-400">QR Code</span>
                    )}
                  </div>
                </div>

                {/* 4. FOOTER BAR */}
                <div className="bg-slate-50 px-3 py-1 border-t border-slate-200 flex items-center justify-between text-[8px] text-slate-500 font-mono shrink-0">
                  <div className="flex items-center gap-1 text-[#0f613c] font-bold">
                    <ShieldCheck className="w-3 h-3 text-[#0f613c]" />
                    <span className="truncate max-w-[140px]">{emp.qrUniqueCode || emp.npp || emp.id}</span>
                  </div>
                  <span className="italic text-slate-400 font-serif">Portal BPAIK</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-cards-grid, .print-cards-grid * {
            visibility: visible;
          }
          .print-cards-grid {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 8mm !important;
            padding: 8mm !important;
            margin: 0 !important;
          }
          .card-container {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            box-shadow: none !important;
            border: 1.5pt solid #064e3b !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>
    </div>
  );
};
