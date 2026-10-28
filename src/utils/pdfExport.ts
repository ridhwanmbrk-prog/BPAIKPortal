import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PdfExportOptions {
  fileName?: string;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'letter';
  marginMm?: number;
}

/** Wait for document images (including the provided letterhead) before capture. */
async function waitForImages(element: HTMLElement): Promise<void> {
  await Promise.all(Array.from(element.querySelectorAll('img')).map(async (image) => {
    if (image.complete && image.naturalWidth > 0) return;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
      setTimeout(done, 5000);
    });
  }));
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

  // Ensure the kop and other images have loaded before exporting.
  await waitForImages(element);

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
