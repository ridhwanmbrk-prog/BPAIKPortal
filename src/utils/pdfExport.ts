import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PdfExportOptions {
  fileName?: string;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'letter';
  marginMm?: number;
}

/**
 * Downloads an HTML element as a high-fidelity PDF file.
 * Handles single or multiple pages automatically.
 */
export async function downloadElementAsPdf(
  element: HTMLElement,
  options: PdfExportOptions = {}
): Promise<void> {
  const {
    fileName = 'dokumen-bpaik.pdf',
    orientation = 'portrait',
    format = 'a4',
    marginMm = 10
  } = options;

  // Capture element using html2canvas with high-DPI scale for crisp text and signatures
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  const contentWidth = pageWidth - (marginMm * 2);
  const contentHeight = (canvas.height * contentWidth) / canvas.width;

  let heightLeft = contentHeight;
  let position = marginMm;

  // First page
  pdf.addImage(imgData, 'PNG', marginMm, position, contentWidth, contentHeight, undefined, 'FAST');
  heightLeft -= (pageHeight - marginMm * 2);

  // Subsequent pages if content overflows A4 height
  while (heightLeft > 0) {
    position = heightLeft - contentHeight + marginMm;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', marginMm, position, contentWidth, contentHeight, undefined, 'FAST');
    heightLeft -= (pageHeight - marginMm * 2);
  }

  const finalName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  pdf.save(finalName);
}


// ---------- Direct PDF exports (no DOM capture, no html2canvas/oklch parsing) ----------
export interface DirectAttendanceEvent {
  title: string;
  date?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
}

export interface DirectAttendanceRecord {
  userName: string;
  userJabatan?: string;
  scanTime: string | number | Date;
  attendanceStatus?: string;
  notes?: string | null;
  signatureData?: string | null;
  signatureStatus?: string;
}

function directSafeFilename(name: string): string {
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

function waitImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gambar tidak dapat dimuat: ${src}`));
    img.src = src;
  });
}

function dataUrlFromImage(img: HTMLImageElement, mime = 'image/jpeg', quality = 0.96): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser tidak dapat membuat gambar untuk PDF.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mime, quality);
}

/** Places each already-rendered card image on its own A4 PDF page, full page-height. */
export async function downloadImagesAsPdf(
  images: string[],
  options: { fileName?: string; format?: 'a4' | 'letter'; orientation?: 'portrait' | 'landscape' } = {}
): Promise<void> {
  const { fileName = 'kartu-peserta-bpaik.pdf', format = 'a4', orientation = 'portrait' } = options;
  if (!images.length) throw new Error('Tidak ada gambar kartu yang siap dimasukkan ke PDF.');
  const pdf = new jsPDF({ orientation, unit: 'mm', format, compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < images.length; i++) {
    const source = images[i];
    if (!source || !source.startsWith('data:image/')) {
      throw new Error(`Gambar kartu nomor ${i + 1} belum selesai dibuat.`);
    }
    const img = await waitImage(source);
    // Match the card's proportions and make it span the entire paper height.
    const fitScale = Math.min(pageH / img.naturalHeight, pageW / img.naturalWidth);
    const w = img.naturalWidth * fitScale;
    const h = img.naturalHeight * fitScale;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    if (i > 0) pdf.addPage(format, orientation);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageW, pageH, 'F');
    const type = source.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    pdf.addImage(source, type, x, y, w, h, undefined, 'FAST');
  }
  pdf.save(directSafeFilename(fileName));
}

/**
 * Draw an attendance report directly with jsPDF. Every page gets the official
 * letterhead, event metadata and repeated table column headings. Rows are paired
 * so each signature box spans both corresponding participant rows.
 */
export async function downloadAttendanceReportPdf(
  event: DirectAttendanceEvent,
  records: DirectAttendanceRecord[],
  options: { fileName?: string } = {}
): Promise<void> {
  const fileName = options.fileName || `rekap-absensi-bpaik-${(event.title || 'kegiatan').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${event.date || ''}.pdf`;
  const kopImg = await waitImage('/images/KOP-SURAT-BPAIK.jpg');
  const kopData = dataUrlFromImage(kopImg);
  const kopFormat = kopData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const left = 10;
  const right = 10;
  const contentW = pageW - left - right;
  const bottom = pageH - 9;
  const colW = [9, 51, 42, 31.5, 28.25, 28.25];
  const tableW = colW.reduce((a, b) => a + b, 0);
  const headerTopH = 7;
  const headerSubH = 6;
  const pairH = 18;
  const rowH = pairH / 2;
  const bodyReserve = 27; // keep the summary/authorization footer on the final page where possible
  const border = [35, 35, 35];
  const green = [196, 229, 181];

  const drawCell = (x: number, y: number, w: number, h: number, fill?: number[]) => {
    if (fill) { pdf.setFillColor(fill[0], fill[1], fill[2]); pdf.rect(x, y, w, h, 'FD'); }
    else { pdf.setDrawColor(border[0], border[1], border[2]); pdf.rect(x, y, w, h, 'S'); }
    pdf.setDrawColor(border[0], border[1], border[2]);
  };
  const drawCentered = (value: string, x: number, y: number, w: number, h: number, size = 7, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(20, 20, 20);
    pdf.text(value, x + w / 2, y + h / 2 + size * 0.12 / 2.8, { align: 'center', maxWidth: Math.max(1, w - 1.2) });
  };
  const drawLeft = (value: string, x: number, y: number, w: number, h: number, size = 7, bold = false) => {
    if (!value) return;
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(25, 25, 25);
    const lines = pdf.splitTextToSize(value, Math.max(2, w - 2));
    const limited = lines.slice(0, Math.max(1, Math.floor((h - 2) / (size * 0.42))));
    const lineH = size * 0.42;
    const blockH = limited.length * lineH;
    pdf.text(limited, x + 1.2, y + Math.max(3.2, (h - blockH) / 2 + lineH * 0.8), { maxWidth: w - 2.4 });
  };

  const drawPageHeaderAndTableHead = (): number => {
    let y = 8;
    const kopAspect = kopImg.naturalWidth / Math.max(1, kopImg.naturalHeight);
    const kopH = Math.min(39, contentW / kopAspect);
    pdf.addImage(kopData, kopFormat, left, y, contentW, kopH, undefined, 'FAST');
    y += kopH + 5;

    pdf.setTextColor(10, 30, 20);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('DAFTAR HADIR PESERTA KEGIATAN KAJIAN & PEMBINAAN', pageW / 2, y + 2, { align: 'center', maxWidth: contentW });
    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(75, 75, 75);
    pdf.text("Civitas Akademika Universitas 'Aisyiyah Bandung", pageW / 2, y + 1, { align: 'center' });
    y += 5;

    // Compact two-column event metadata, placed below the letterhead on every page.
    pdf.setFontSize(7.2);
    pdf.setTextColor(25, 25, 25);
    const meta = [
      [`Nama_Kegiatan: ${event.title || '-'}`, `Tanggal: ${event.date || '-'}`],
      [`Tempat: ${event.location || "Universitas 'Aisyiyah Bandung"}`, `Waktu: ${event.startTime || '-'} - ${event.endTime || '-'} WIB`]
    ];
    for (const row of meta) {
      pdf.text(row[0], left + 1, y + 3.2, { maxWidth: contentW / 2 - 2 });
      pdf.text(row[1], left + contentW / 2, y + 3.2, { maxWidth: contentW / 2 - 1 });
      y += 5.2;
    }
    y += 2;

    // Two-line table header: the five main labels repeat at the top of every page.
    let x = left;
    const mergedH = headerTopH + headerSubH;
    const mainHead = [
      ['No', colW[0]], ['Nama_Lengkap', colW[1]], ['Jabatan', colW[2]], ['ScanTime', colW[3]]
    ] as Array<[string, number]>;
    for (const [label, width] of mainHead) {
      drawCell(x, y, width, mergedH, green);
      drawCentered(label, x, y, width, mergedH, 7, true);
      x += width;
    }
    drawCell(x, y, colW[4] + colW[5], headerTopH, green);
    drawCentered('TANDA_TANGAN', x, y, colW[4] + colW[5], headerTopH, 7, true);
    drawCell(x, y + headerTopH, colW[4], headerSubH, green);
    drawCentered('1', x, y + headerTopH, colW[4], headerSubH, 7, true);
    drawCell(x + colW[4], y + headerTopH, colW[5], headerSubH, green);
    drawCentered('2', x + colW[4], y + headerTopH, colW[5], headerSubH, 7, true);
    return y + mergedH;
  };

  const dataPairs: Array<[DirectAttendanceRecord | undefined, DirectAttendanceRecord | undefined]> = [];
  if (!records.length) dataPairs.push([undefined, undefined]);
  else {
    for (let i = 0; i < records.length; i += 2) dataPairs.push([records[i], records[i + 1]]);
  }

  let cursorY = drawPageHeaderAndTableHead();
  let pairIndex = 0;
  const drawSignature = (record: DirectAttendanceRecord | undefined, number: number, x: number, y: number, w: number) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(70, 70, 70);
    pdf.text(`${number}.`, x + 1.4, y + 3.4);
    if (!record) return;
    const isExcused = record.attendanceStatus === 'IZIN' || Boolean(record.notes && record.notes.toLowerCase().includes('izin'));
    if (isExcused) {
      pdf.setFontSize(7);
      pdf.setTextColor(150, 90, 0);
      pdf.text('Izin', x + w / 2, y + 10, { align: 'center' });
    } else if (record.signatureData && /^data:image\/(png|jpeg|jpg);base64,/i.test(record.signatureData)) {
      try {
        const fmt = record.signatureData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        const im = pdf.getImageProperties(record.signatureData);
        const maxW = w - 4;
        const maxH = pairH - 7;
        const scale = Math.min(maxW / im.width, maxH / im.height);
        const iw = im.width * scale;
        const ih = im.height * scale;
        pdf.addImage(record.signatureData, fmt, x + (w - iw) / 2, y + (pairH - ih) / 2 + 1, iw, ih, undefined, 'FAST');
      } catch (e) {
        console.warn('Tanda tangan tidak bisa dimasukkan ke PDF:', e);
      }
    } else if (record.signatureStatus === 'TERKONFIRMASI') {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.3);
      pdf.setTextColor(15, 100, 60);
      pdf.text('Terkonfirmasi', x + w / 2, y + pairH / 2, { align: 'center' });
    }
  };

  const drawInfoRow = (record: DirectAttendanceRecord | undefined, number: number, y: number) => {
    let x = left;
    const values = [
      { text: record ? String(number) : '', w: colW[0], center: true },
      { text: record?.userName || '', w: colW[1], center: false },
      { text: record?.userJabatan || (record ? 'Peserta' : ''), w: colW[2], center: false },
      { text: record ? ((record.attendanceStatus === 'IZIN' || Boolean(record.notes && record.notes.toLowerCase().includes('izin'))) ? 'Izin' : `${new Date(record.scanTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB`) : '', w: colW[3], center: true }
    ];
    values.forEach((cell, i) => {
      drawCell(x, y, cell.w, rowH);
      if (cell.center) drawCentered(cell.text, x, y, cell.w, rowH, i === 3 ? 5.9 : 6.7, i === 0);
      else drawLeft(cell.text, x, y, cell.w, rowH, 6.7, i === 1);
      x += cell.w;
    });
  };

  for (; pairIndex < dataPairs.length; pairIndex++) {
    if (cursorY + pairH > bottom - bodyReserve) {
      pdf.addPage('a4', 'portrait');
      cursorY = drawPageHeaderAndTableHead();
    }
    const [leftRecord, rightRecord] = dataPairs[pairIndex];
    const nLeft = pairIndex * 2 + 1;
    drawInfoRow(leftRecord, nLeft, cursorY);
    drawInfoRow(rightRecord, nLeft + 1, cursorY + rowH);
    const sigX = left + colW[0] + colW[1] + colW[2] + colW[3];
    drawCell(sigX, cursorY, colW[4], pairH);
    drawCell(sigX + colW[4], cursorY, colW[5], pairH);
    drawSignature(leftRecord, nLeft, sigX, cursorY, colW[4]);
    drawSignature(rightRecord, nLeft + 1, sigX + colW[4], cursorY, colW[5]);
    cursorY += pairH;
  }

  // Summary and authorization footer follows the table on the last page.
  cursorY += 4;
  const available = bottom - cursorY;
  if (available < 22) {
    pdf.addPage('a4', 'portrait');
    cursorY = drawPageHeaderAndTableHead() + 3;
  }
  pdf.setDrawColor(190, 190, 190);
  pdf.line(left, cursorY, left + contentW, cursorY);
  cursorY += 5;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(30, 30, 30);
  pdf.text('Catatan Kehadiran:', left, cursorY);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text(`Total Hadir: ${records.length} Peserta`, left, cursorY + 4.2);
  pdf.text('Dokumen ini diterbitkan otomatis melalui Sistem Presensi Resmi BPAIK UNISA Bandung.', left, cursorY + 8.4, { maxWidth: 88 });

  const signX = left + contentW - 72;
  let sy = cursorY;
  pdf.setFontSize(7);
  pdf.text(`Bandung, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, signX, sy);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Mengetahui,', signX, sy + 4);
  pdf.setFontSize(6.6);
  pdf.text("Kepala BPAIK Universitas 'Aisyiyah Bandung", signX, sy + 8, { maxWidth: 72 });
  pdf.setDrawColor(15, 97, 60);
  pdf.setTextColor(15, 97, 60);
  pdf.roundedRect(signX + 9, sy + 10, 54, 5, 1, 1, 'S');
  pdf.setFontSize(5.7);
  pdf.text('TERVERIFIKASI SISTEM BPAIK', signX + 36, sy + 13.2, { align: 'center' });
  pdf.setTextColor(25, 25, 25);
  pdf.setFontSize(7.1);
  pdf.text("Dr. Mohammad Anwar Syi'aruddin, S.Hum., M.A.", signX, sy + 20, { maxWidth: 72 });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.text('NPP. 2025140290164', signX, sy + 24);

  pdf.save(directSafeFilename(fileName));
}
