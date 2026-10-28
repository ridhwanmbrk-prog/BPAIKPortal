import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PdfExportOptions {
  fileName?: string;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'letter';
  marginMm?: number;
}

async function waitForImages(element: HTMLElement): Promise<void> {
  await Promise.all(Array.from(element.querySelectorAll('img')).map(async (image) => {
    if (image.complete && image.naturalWidth > 0) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
      window.setTimeout(done, 8000);
    });
  }));
}

function inlineResolvedStyles(source: Element, target: Element): void {
  const sourceNodes = [source, ...Array.from(source.querySelectorAll('*'))];
  const targetNodes = [target, ...Array.from(target.querySelectorAll('*'))];
  const count = Math.min(sourceNodes.length, targetNodes.length);
  for (let index = 0; index < count; index++) {
    const sourceNode = sourceNodes[index];
    const targetNode = targetNodes[index] as HTMLElement | SVGElement;
    const computed = window.getComputedStyle(sourceNode);
    for (let styleIndex = 0; styleIndex < computed.length; styleIndex++) {
      const property = computed.item(styleIndex);
      const value = computed.getPropertyValue(property);
      if (!property || !value) continue;
      try { targetNode.style.setProperty(property, value); } catch { /* browser-specific computed property */ }
    }
    targetNodes[index].removeAttribute('class');
  }
}

async function renderElement(element: HTMLElement, squareCorners = false): Promise<HTMLCanvasElement> {
  await waitForImages(element);
  if (document.fonts?.ready) await document.fonts.ready;

  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width || element.scrollWidth));
  const height = Math.max(1, Math.ceil(rect.height || element.scrollHeight));
  const clone = element.cloneNode(true) as HTMLElement;
  inlineResolvedStyles(element, clone);
  if (squareCorners) {
    clone.style.setProperty('border-radius', '0', 'important');
    clone.style.setProperty('box-shadow', 'none', 'important');
  }
  Object.assign(clone.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    zIndex: '-2147483648',
    pointerEvents: 'none',
    maxWidth: 'none',
    maxHeight: 'none',
    overflow: 'visible',
    backgroundColor: '#ffffff'
  });
  document.body.appendChild(clone);
  try {
    await waitForImages(clone);
    const scale = Math.max(0.7, Math.min(2, 1800 / width, 14000 / height));
    const canvas = await html2canvas(clone, {
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: Math.max(window.innerWidth, width),
      windowHeight: Math.max(window.innerHeight, height),
      scrollX: 0,
      scrollY: 0
    });
    if (!canvas.width || !canvas.height) throw new Error('Kanvas hasil kosong. Periksa gambar kop dan tanda tangan.');
    return canvas;
  } finally {
    clone.remove();
  }
}

function safeFileName(fileName: string): string {
  return fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
}

/** Export a long HTML document by slicing into non-overlapping A4 pages. */
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
  const canvas = await renderElement(element);
  const pdf = new jsPDF({ orientation, unit: 'mm', format, compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginMm * 2;
  const contentHeight = pageHeight - marginMm * 2;
  const pixelsPerMm = canvas.width / contentWidth;
  const sourcePageHeight = Math.max(1, Math.floor(contentHeight * pixelsPerMm));

  let page = 0;
  for (let sourceY = 0; sourceY < canvas.height; sourceY += sourcePageHeight) {
    const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const context = slice.getContext('2d');
    if (!context) throw new Error('Gagal menyiapkan kanvas halaman PDF.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, slice.width, sliceHeight);
    if (page > 0) pdf.addPage(format, orientation);
    const imageData = slice.toDataURL('image/jpeg', 0.96);
    const imageHeightMm = sliceHeight / pixelsPerMm;
    pdf.addImage(imageData, 'JPEG', marginMm, marginMm, contentWidth, imageHeightMm, undefined, 'FAST');
    page++;
    slice.width = 1;
    slice.height = 1;
  }
  pdf.save(safeFileName(fileName));
}

/** Export each supplied element on a separate PDF page (used for participant cards). */
export async function downloadElementsAsPdf(
  elements: HTMLElement[],
  options: PdfExportOptions = {}
): Promise<void> {
  const {
    fileName = 'dokumen-bpaik.pdf',
    orientation = 'portrait',
    format = 'a4',
    marginMm = 10
  } = options;
  if (!elements.length) throw new Error('Tidak ada elemen yang siap diekspor.');

  const pdf = new jsPDF({ orientation, unit: 'mm', format, compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginMm * 2;
  const maxHeight = pageHeight - marginMm * 2;

  for (let index = 0; index < elements.length; index++) {
    const sourceCard = elements[index];
    // Make only the exported card's outer corners square without changing the on-screen preview.
    const canvas = await renderElement(sourceCard, true);
    const imageData = canvas.toDataURL('image/jpeg', 0.97);
    const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    const x = (pageWidth - width) / 2;
    const y = marginMm;
    if (index > 0) pdf.addPage(format, orientation);
    pdf.addImage(imageData, 'JPEG', x, y, width, height, undefined, 'FAST');
  }
  pdf.save(safeFileName(fileName));
}

/**
 * Export rekap attendance as paginated A4 pages. Each page gets the kop, title,
 * metadata and table header again. Signature rowspan pairs are kept together.
 */
export async function downloadAttendanceTableAsPdf(
  element: HTMLElement,
  options: PdfExportOptions & { rowsPerPage?: number } = {}
): Promise<void> {
  const {
    fileName = 'rekap-absensi-bpaik.pdf',
    orientation = 'portrait',
    format = 'a4',
    marginMm = 8,
    rowsPerPage = 12
  } = options;
  const sourceTable = element.querySelector('table');
  const sourceBody = sourceTable?.tBodies.item(0);
  if (!sourceTable || !sourceBody) throw new Error('Tabel rekap tidak ditemukan untuk ekspor PDF.');

  const sourceRows = Array.from(sourceBody.rows);
  const rowsPerPageEven = Math.max(2, Math.floor(rowsPerPage / 2) * 2);
  const chunks: HTMLTableRowElement[][] = [];
  if (!sourceRows.length) chunks.push([]);
  else {
    for (let offset = 0; offset < sourceRows.length; offset += rowsPerPageEven) {
      chunks.push(sourceRows.slice(offset, offset + rowsPerPageEven));
    }
  }

  const pdf = new jsPDF({ orientation, unit: 'mm', format, compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginMm * 2;
  const usableHeight = pageHeight - marginMm * 2;
  const renderWidth = Math.max(1, Math.round(element.getBoundingClientRect().width || element.scrollWidth || 900));

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex++) {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.setAttribute('aria-hidden', 'true');
    Object.assign(clone.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${renderWidth}px`,
      maxHeight: 'none',
      height: 'auto',
      overflow: 'visible',
      background: '#ffffff',
      zIndex: '-2147483648',
      pointerEvents: 'none'
    });

    const cloneTable = clone.querySelector('table');
    const cloneBody = cloneTable?.tBodies.item(0);
    if (!cloneBody) throw new Error('Gagal menyiapkan tabel rekap untuk halaman PDF.');
    cloneBody.replaceChildren(...chunks[pageIndex].map(row => row.cloneNode(true)));
    if (pageIndex < chunks.length - 1) {
      clone.querySelector('[data-report-footer="true"]')?.remove();
    }

    document.body.appendChild(clone);
    try {
      const canvas = await renderElement(clone);
      const imageData = canvas.toDataURL('image/jpeg', 0.96);
      const ratio = Math.min(usableWidth / canvas.width, usableHeight / canvas.height);
      const width = canvas.width * ratio;
      const height = canvas.height * ratio;
      const x = (pageWidth - width) / 2;
      const y = marginMm;
      if (pageIndex > 0) pdf.addPage(format, orientation);
      pdf.addImage(imageData, 'JPEG', x, y, width, height, undefined, 'FAST');
    } finally {
      clone.remove();
    }
  }
  pdf.save(safeFileName(fileName));
}
