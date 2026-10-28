import html2canvas from 'html2canvas';
import { BPAIKUser } from '../types';

/**
 * Downloads the participant card element as a high-resolution, crisp JPG matching the visual design.
 */
export async function downloadCardElementAsJpg(
  cardElement: HTMLElement,
  fileName: string = 'kartu-digital-peserta-bpaik.jpg'
): Promise<void> {
  // Use scale: 3 for ultra-crisp retina quality
  const canvas = await html2canvas(cardElement, {
    scale: 3,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false
  });

  const jpgUrl = canvas.toDataURL('image/jpeg', 0.98);
  const link = document.createElement('a');
  link.href = jpgUrl;
  link.download = fileName.endsWith('.jpg') ? fileName : `${fileName}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Fallback canvas drawer that renders the exact card layout with strict 2:3 photo proportions (no stretching/gepeng)
 */
export async function generateCardCanvasJpg(
  user: BPAIKUser,
  qrDataUrl: string
): Promise<string> {
  const canvas = document.createElement('canvas');
  const width = 640;
  const height = 1040;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Card Base Background (White) with Rounded Corners
  const radius = 0; // sudut luar kartu lurus, tanpa rounded corners
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 2. Gunakan kop kartu resmi dari aset yang disiapkan pengguna.
  const kopImg = new Image();
  kopImg.src = '/images/KOP-KARTU-BPAIK.jpg';
  await new Promise<void>((resolve, reject) => {
    if (kopImg.complete) {
      if (kopImg.naturalWidth > 0) resolve();
      else reject(new Error('KOP-KARTU-BPAIK.jpg gagal dimuat.'));
      return;
    }
    kopImg.onload = () => resolve();
    kopImg.onerror = () => reject(new Error('KOP-KARTU-BPAIK.jpg gagal dimuat.'));
  });
  if (!kopImg.naturalWidth || !kopImg.naturalHeight) {
    throw new Error('KOP-KARTU-BPAIK.jpg tidak valid.');
  }
  const headerHeight = Math.round(width * kopImg.naturalHeight / kopImg.naturalWidth);
  ctx.drawImage(kopImg, 0, 0, width, headerHeight);

  // Foto dan isi kartu mulai tepat di bawah kop; tidak ada subtitle bar lama.
  const photoW = 220;
  const photoH = 330;
  const photoX = (width - photoW) / 2;
  const photoY = headerHeight + 35;
  const photoRadius = 24;

  ctx.save();
  // Rounded photo box path
  ctx.beginPath();
  ctx.moveTo(photoX + photoRadius, photoY);
  ctx.lineTo(photoX + photoW - photoRadius, photoY);
  ctx.quadraticCurveTo(photoX + photoW, photoY, photoX + photoW, photoY + photoRadius);
  ctx.lineTo(photoX + photoW, photoY + photoH - photoRadius);
  ctx.quadraticCurveTo(photoX + photoW, photoY + photoH, photoX + photoW - photoRadius, photoY + photoH);
  ctx.lineTo(photoX + photoRadius, photoY + photoH);
  ctx.quadraticCurveTo(photoX, photoY + photoH, photoX, photoY + photoH - photoRadius);
  ctx.lineTo(photoX, photoY + photoRadius);
  ctx.quadraticCurveTo(photoX, photoY, photoX + photoRadius, photoY);
  ctx.closePath();
  ctx.clip();

  // Background for photo
  ctx.fillStyle = '#eaf5ee';
  ctx.fillRect(photoX, photoY, photoW, photoH);

  if (user.avatarUrl) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = user.avatarUrl!;
      });

      if (img.width && img.height) {
        // PROPORTIONAL CROP TO 2:3 RATIO (NEVER STRETCH)
        const targetRatio = 2 / 3;
        const imgRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (imgRatio > targetRatio) {
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, photoX, photoY, photoW, photoH);
      }
    } catch (_) {}
  } else {
    // Placeholder initials
    ctx.fillStyle = '#0f613c';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(user.name.charAt(0) || 'P', width / 2, photoY + 185);
  }
  ctx.restore();

  // Photo border in green
  ctx.save();
  ctx.strokeStyle = '#0f613c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(photoX + photoRadius, photoY);
  ctx.lineTo(photoX + photoW - photoRadius, photoY);
  ctx.quadraticCurveTo(photoX + photoW, photoY, photoX + photoW, photoY + photoRadius);
  ctx.lineTo(photoX + photoW, photoY + photoH - photoRadius);
  ctx.quadraticCurveTo(photoX + photoW, photoY + photoH, photoX + photoW - photoRadius, photoY + photoH);
  ctx.lineTo(photoX + photoRadius, photoY + photoH);
  ctx.quadraticCurveTo(photoX, photoY + photoH, photoX, photoY + photoH - photoRadius);
  ctx.lineTo(photoX, photoY + photoRadius);
  ctx.quadraticCurveTo(photoX, photoY, photoX + photoRadius, photoY);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // 5. Name, NPP, and Jabatan
  ctx.textAlign = 'center';

  // Full Name (Serif/Formal font)
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText(user.name, width / 2, photoY + photoH + 42);

  // NPP
  ctx.fillStyle = '#0d6b46';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(user.npp || 'NPP. -', width / 2, photoY + photoH + 74);

  // Jabatan
  ctx.fillStyle = '#64748b';
  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillText(user.jabatan || 'Peserta Pembinaan BPAIK', width / 2, photoY + photoH + 104);

  // 6. QR Code Box (Rounded White Box with Border)
  const qrBoxSize = 220;
  const qrBoxX = (width - qrBoxSize) / 2;
  const qrBoxY = photoY + photoH + 125;
  const qrRadius = 24;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(qrBoxX + qrRadius, qrBoxY);
  ctx.lineTo(qrBoxX + qrBoxSize - qrRadius, qrBoxY);
  ctx.quadraticCurveTo(qrBoxX + qrBoxSize, qrBoxY, qrBoxX + qrBoxSize, qrBoxY + qrRadius);
  ctx.lineTo(qrBoxX + qrBoxSize, qrBoxY + qrBoxSize - qrRadius);
  ctx.quadraticCurveTo(qrBoxX + qrBoxSize, qrBoxY + qrBoxSize, qrBoxX + qrBoxSize - qrRadius, qrBoxY + qrBoxSize);
  ctx.lineTo(qrBoxX + qrRadius, qrBoxY + qrBoxSize);
  ctx.quadraticCurveTo(qrBoxX, qrBoxY + qrBoxSize, qrBoxX, qrBoxY + qrBoxSize - qrRadius);
  ctx.lineTo(qrBoxX, qrBoxY + qrRadius);
  ctx.quadraticCurveTo(qrBoxX, qrBoxY, qrBoxX + qrRadius, qrBoxY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (qrDataUrl) {
    try {
      const qrImg = new Image();
      await new Promise<void>((res) => {
        qrImg.onload = () => res();
        qrImg.onerror = () => res();
        qrImg.src = qrDataUrl;
      });
      ctx.drawImage(qrImg, qrBoxX + 15, qrBoxY + 15, qrBoxSize - 30, qrBoxSize - 30);
    } catch (_) {}
  }

  // 7. Footer Bar
  const footerY = height - 52;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(32, footerY, width - 64, 1);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f613c';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(user.qrUniqueCode || user.npp || `BPAIK-${user.id}`, 36, footerY + 28);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillText("Portal BPAIK", width - 36, footerY + 28);

  // Outer Border for entire card
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = '#063921';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.98);
}
