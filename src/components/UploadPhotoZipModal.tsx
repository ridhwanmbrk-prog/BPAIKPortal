import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { AlertTriangle, CheckCircle2, FileArchive, Loader2, Upload, X } from 'lucide-react';
import type { BPAIKUser } from '../types';

const MAX_PHOTO_BYTES = 1024 * 1024; // output must be strictly below 1 MiB
const MAX_ZIP_BYTES = 1024 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(jpe?g|png|webp)$/i;
const OUTPUT_MAX_WIDTH = 1200;
const OUTPUT_RATIO = 2 / 3;

type CandidateStatus = 'ready' | 'too-large' | 'no-match' | 'ambiguous' | 'duplicate' | 'uploaded' | 'failed';
interface Candidate {
  id: string; filename: string; sizeBytes: number; entry: JSZip.JSZipObject;
  user: BPAIKUser | null; status: CandidateStatus; message: string;
  cropFraction: number; horizontal: number; vertical: number; needsReview: boolean;
}
interface Props { participants: BPAIKUser[]; onClose: () => void; onUploaded: () => void; }
interface CropBox { sx: number; sy: number; sw: number; sh: number; }

interface FaceCropSettings { cropFraction: number; horizontal: number; vertical: number; needsReview: boolean; }

let faceDetectorPromise: Promise<FaceDetector> | null = null;
async function getFaceDetector(): Promise<FaceDetector> {
  if (!faceDetectorPromise) {
    faceDetectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm');
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5
      });
    })().catch(error => { faceDetectorPromise = null; throw error; });
  }
  return faceDetectorPromise;
}

function cropSettingsFromFace(width: number, height: number, face: { originX: number; originY: number; width: number; height: number }): FaceCropSettings {
  let sh = Math.min(height, Math.max(face.height * 4.2, height * 0.30));
  let sw = sh * OUTPUT_RATIO;
  if (sw > width) { sw = width; sh = sw / OUTPUT_RATIO; }
  if (sh > height) { sh = height; sw = sh * OUTPUT_RATIO; }
  const sx = Math.max(0, Math.min(width - sw, face.originX + face.width / 2 - sw / 2));
  const sy = Math.max(0, Math.min(height - sh, face.originY - face.height * 0.45));
  return {
    cropFraction: sh / height,
    horizontal: width > sw ? sx / (width - sw) : 0.5,
    vertical: height > sh ? sy / (height - sh) : 0,
    needsReview: false
  };
}

async function detectFaceCrop(input: Blob): Promise<FaceCropSettings | null> {
  const bitmap = await createImageBitmap(input);
  try {
    const detector = await getFaceDetector();
    const detections = detector.detect(bitmap).detections || [];
    const face = detections
      .filter(detection => detection.boundingBox && (detection.categories?.[0]?.score ?? 0) >= 0.5)
      .sort((a, b) => (b.categories?.[0]?.score ?? 0) - (a.categories?.[0]?.score ?? 0))[0]?.boundingBox;
    return face ? cropSettingsFromFace(bitmap.width, bitmap.height, face) : null;
  } finally { bitmap.close(); }
}

function normalizedName(value: string, filename = false): string {
  const base = filename ? (value.split('/').pop() || value).replace(IMAGE_EXTENSION, '') : value;
  return base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function fmtSize(n: number): string { return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`; }
function labelStatus(s: CandidateStatus): string {
  return ({ ready: 'Siap', 'too-large': 'Asli terlalu besar', 'no-match': 'Nama tidak ditemukan', ambiguous: 'Nama peserta ganda', duplicate: 'File duplikat untuk peserta', uploaded: 'Berhasil', failed: 'Gagal' } as Record<CandidateStatus, string>)[s];
}
function getCropBox(width: number, height: number, cropFraction: number, horizontal: number, vertical: number): CropBox {
  let sh = height * cropFraction;
  let sw = sh * OUTPUT_RATIO;
  if (sw > width) { sw = width; sh = sw / OUTPUT_RATIO; }
  const sx = Math.max(0, Math.min(width - sw, (width - sw) * horizontal));
  const sy = Math.max(0, Math.min(height - sh, (height - sh) * vertical));
  return { sx, sy, sw, sh };
}
async function blobFromCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Browser gagal mengompres foto.')), 'image/jpeg', quality));
}
async function cropAndCompress(input: Blob, cropFraction: number, horizontal: number, vertical: number): Promise<Blob> {
  const bitmap = await createImageBitmap(input);
  try {
    const crop = getCropBox(bitmap.width, bitmap.height, cropFraction, horizontal, vertical);
    let outWidth = Math.min(OUTPUT_MAX_WIDTH, Math.round(crop.sw));
    let outHeight = Math.round(outWidth / OUTPUT_RATIO);
    const canvas = document.createElement('canvas');
    for (let scale = 1; scale >= 0.40; scale *= 0.84) {
      outWidth = Math.max(480, Math.round(Math.min(OUTPUT_MAX_WIDTH, crop.sw) * scale));
      outHeight = Math.round(outWidth / OUTPUT_RATIO);
      canvas.width = outWidth; canvas.height = outHeight;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas tidak tersedia di browser ini.');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, outWidth, outHeight);
      ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, outWidth, outHeight);
      for (let quality = 0.92; quality >= 0.42; quality -= 0.08) {
        const blob = await blobFromCanvas(canvas, quality);
        if (blob.size < MAX_PHOTO_BYTES) return blob;
      }
    }
    throw new Error('Foto tidak bisa dikompres di bawah 1 MB. Coba foto lain.');
  } finally { bitmap.close(); }
}

export const UploadPhotoZipModal: React.FC<Props> = ({ participants, onClose, onUploaded }) => {
  const [zipName, setZipName] = useState('');
  const [rows, setRows] = useState<Candidate[]>([]);
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [previewId, setPreviewId] = useState('');
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const participantMap = useMemo(() => {
    const map = new Map<string, BPAIKUser[]>();
    participants.filter(p => p.role === 'PESERTA').forEach(p => {
      const key = normalizedName(p.name);
      if (key) map.set(key, [...(map.get(key) || []), p]);
    });
    return map;
  }, [participants]);
  const readyCount = rows.filter(r => r.status === 'ready' && !r.needsReview).length;
  const skippedCount = rows.filter(r => r.needsReview || !['ready', 'uploaded'].includes(r.status)).length;
  const selectedPreview = rows.find(r => r.id === previewId && r.status === 'ready') || rows.find(r => r.status === 'ready');

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const canvas = previewCanvas.current;
      if (!canvas || !selectedPreview) return;
      try {
        const blob = await selectedPreview.entry.async('blob');
        const image = await createImageBitmap(blob);
        if (cancelled) { image.close(); return; }
        const crop = getCropBox(image.width, image.height, selectedPreview.cropFraction, selectedPreview.horizontal, selectedPreview.vertical);
        canvas.width = 240; canvas.height = 360;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
        }
        image.close();
      } catch { /* Tampilkan pesan saat proses ZIP/unggah bila gambar tidak bisa dibaca. */ }
    };
    void draw();
    return () => { cancelled = true; };
  }, [selectedPreview?.id, selectedPreview?.cropFraction, selectedPreview?.horizontal, selectedPreview?.vertical]);

  const readZip = async (file?: File) => {
    setError(''); setSummary(''); setRows([]); setPreviewId('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) { setError('Pilih file ZIP berisi foto.'); return; }
    if (file.size > MAX_ZIP_BYTES) { setError('Ukuran ZIP melebihi 1 GB. Bagi menjadi beberapa ZIP agar browser stabil.'); return; }
    setReading(true); setZipName(file.name);
    try {
      const zip = await JSZip.loadAsync(file, { checkCRC32: false });
      const entries = Object.values(zip.files).filter(e => !e.dir && !e.name.startsWith('__MACOSX/') && !e.name.split('/').pop()?.startsWith('.') && IMAGE_EXTENSION.test(e.name));
      const candidates: Candidate[] = entries.map((entry, index) => {
        const filename = entry.name.split('/').pop() || entry.name;
        const matches = participantMap.get(normalizedName(filename, true)) || [];
        const unpacked = Number((entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0);
        let status: CandidateStatus = 'ready'; let message = 'Nama cocok.'; let user: BPAIKUser | null = null;
        if (unpacked >= MAX_PHOTO_BYTES) { status = 'ready'; message = `Foto asli ${fmtSize(unpacked)} akan dipotong dan dikompres sebelum upload.`; }
        if (!matches.length) { status = 'no-match'; message = 'Nama file tidak cocok dengan nama peserta.'; }
        else if (matches.length > 1) { status = 'ambiguous'; message = 'Nama peserta tidak unik; file dilewati.'; }
        else user = matches[0];
        return { id: `${entry.name}-${index}`, filename, sizeBytes: unpacked, entry, user, status, message, cropFraction: 0.52, horizontal: 0.5, vertical: 0, needsReview: false };
      });
      const counts = new Map<string, number>();
      candidates.filter(r => r.status === 'ready' && r.user).forEach(r => counts.set(r.user!.id, (counts.get(r.user!.id) || 0) + 1));
      const finalRows = candidates.map(r => r.status === 'ready' && r.user && (counts.get(r.user.id) || 0) > 1
        ? { ...r, status: 'duplicate' as const, message: 'Ada lebih dari satu file untuk peserta; tidak ada yang diproses.' } : r);
      const preparedRows = await Promise.all(finalRows.map(async row => {
        if (row.status !== 'ready' || !row.user) return row;
        try {
          const original = await row.entry.async('blob');
          const crop = await detectFaceCrop(original);
          return crop
            ? { ...row, ...crop, message: 'Wajah terdeteksi; crop otomatis siap. Periksa pratinjau sebelum upload.' }
            : { ...row, needsReview: true, message: 'Wajah tidak terdeteksi. Atur crop manual pada pratinjau sebelum upload.' };
        } catch {
          return { ...row, needsReview: true, message: 'Deteksi wajah gagal dimuat. Atur crop manual sebelum upload.' };
        }
      }));
      setRows(preparedRows); setPreviewId(preparedRows.find(r => r.status === 'ready' && r.user)?.id || '');
      if (!preparedRows.length) setError('Tidak ditemukan foto JPG, JPEG, PNG, atau WEBP di dalam ZIP.');
    } catch (e) { setError(e instanceof Error ? `ZIP gagal dibaca: ${e.message}` : 'File ZIP tidak valid.'); }
    finally { setReading(false); }
  };

  const uploadPhotos = async () => {
    const queue = rows.filter(r => r.status === 'ready' && r.user && !r.needsReview);
    if (!queue.length) return;
    setError(''); setSummary(''); setUploading(true); setProgress(0);
    const updated = [...rows]; let succeeded = 0; let failed = 0;
    for (let i = 0; i < queue.length; i++) {
      const row = queue[i];
      try {
        const original = await row.entry.async('blob');
        const compressed = await cropAndCompress(original, row.cropFraction, row.horizontal, row.vertical);
        if (compressed.size >= MAX_PHOTO_BYTES) throw new Error('Hasil foto masih 1 MB atau lebih.');
        const response = await fetch(`/api/users/${encodeURIComponent(row.user!.id)}/photo`, {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: compressed
        });
        let result: { success?: boolean; error?: string } = {};
        try { result = await response.json() as typeof result; } catch { /* server response kosong */ }
        if (!response.ok || result.success !== true) throw new Error(result.error || `HTTP ${response.status}`);
        const index = updated.findIndex(x => x.id === row.id);
        if (index >= 0) updated[index] = { ...updated[index], sizeBytes: compressed.size, status: 'uploaded', message: `Foto dipotong dan dikompres menjadi ${fmtSize(compressed.size)}.` };
        succeeded++;
      } catch (e) {
        const index = updated.findIndex(x => x.id === row.id);
        if (index >= 0) updated[index] = { ...updated[index], status: 'failed', message: e instanceof Error ? e.message : 'Gagal memproses foto.' };
        failed++;
      }
      setRows([...updated]); setProgress(Math.round(((i + 1) / queue.length) * 100));
    }
    setUploading(false);
    setSummary(`Selesai: ${succeeded} berhasil; ${failed} gagal diproses; ${skippedCount} file lain dilewati.`);
    if (succeeded) onUploaded();
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
    <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b-2 border-amber-400 bg-gradient-to-r from-emerald-950 via-emerald-800 to-emerald-900 p-4 text-white">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-slate-950"><FileArchive className="h-5 w-5" /></div><div><h3 className="text-sm font-bold sm:text-base">Upload Foto Peserta (ZIP)</h3><p className="mt-0.5 text-[11px] text-emerald-100">Cocokkan nama, crop kepala sampai dada, kompres otomatis, lalu simpan.</p></div></div>
        <button type="button" onClick={onClose} disabled={uploading} className="rounded-lg p-1 hover:bg-white/10 disabled:opacity-50" aria-label="Tutup"><X className="h-5 w-5" /></button>
      </div>
      <div className="grid min-h-0 gap-4 overflow-y-auto p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-950">
            <p className="font-bold">Format & aturan</p><p className="mt-1">Nama file harus sama dengan nama peserta, contoh <code>Abdul Rozak, S.E., M.Si.jpg</code>. Format JPG/JPEG, PNG, WEBP. Setiap hasil foto dipotong menjadi rasio 2:3 dan dikompres hingga <strong>kurang dari 1 MB</strong>. ZIP maksimal 1 GB.</p>
          </div>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-emerald-300 bg-slate-50 p-5 text-center hover:bg-emerald-50"><Upload className="mx-auto mb-2 h-7 w-7 text-emerald-700"/><span className="block text-sm font-bold text-slate-800">{zipName || 'Pilih file ZIP foto peserta'}</span><span className="mt-1 block text-[11px] text-slate-500">Aplikasi memproses satu foto pada satu waktu.</span><input type="file" accept=".zip,application/zip" disabled={reading || uploading} className="hidden" onChange={e => { void readZip(e.target.files?.[0]); e.currentTarget.value = ''; }}/></label>
          {reading && <p className="flex items-center gap-2 text-xs text-emerald-800"><Loader2 className="h-4 w-4 animate-spin"/>Membaca ZIP dan mencocokkan nama...</p>}
          {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertTriangle className="h-4 w-4 shrink-0"/><span>{error}</span></div>}
          {rows.length > 0 && <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg bg-emerald-50 p-2"><p className="text-[10px] text-emerald-700">Siap</p><p className="text-lg font-black">{readyCount}</p></div><div className="rounded-lg bg-slate-100 p-2"><p className="text-[10px] text-slate-600">File foto</p><p className="text-lg font-black">{rows.length}</p></div><div className="rounded-lg bg-amber-50 p-2"><p className="text-[10px] text-amber-700">Dilewati/gagal</p><p className="text-lg font-black">{skippedCount}</p></div><div className="rounded-lg bg-blue-50 p-2"><p className="text-[10px] text-blue-700">Berhasil</p><p className="text-lg font-black">{rows.filter(r=>r.status==='uploaded').length}</p></div></div>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">{rows.map(row => <div key={row.id} className="flex items-start justify-between gap-3 p-2.5 text-xs"><button type="button" disabled={row.status!=='ready'||uploading} onClick={()=>setPreviewId(row.id)} className="min-w-0 text-left"><p className="break-all font-bold text-slate-800">{row.filename}</p><p className="text-[10px] text-slate-500">{row.user?.name || row.message} · {fmtSize(row.sizeBytes)}</p>{row.user && <p className="text-[10px] text-slate-500">{row.message}</p>}</button><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${row.needsReview?'bg-amber-100 text-amber-900':row.status==='ready'||row.status==='uploaded'?'bg-emerald-100 text-emerald-800':row.status==='failed'?'bg-red-100 text-red-800':'bg-amber-100 text-amber-900'}`}>{row.needsReview ? 'Perlu koreksi' : labelStatus(row.status)}</span></div>)}</div>
          </>}
          {uploading && <div className="space-y-1"><div className="flex justify-between text-[11px] text-slate-600"><span>Crop + kompres + upload</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-600 transition-all" style={{width:`${progress}%`}}/></div></div>}
          {summary && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><CheckCircle2 className="h-4 w-4 shrink-0"/>{summary}</div>}
        </div>
        <aside className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h4 className="text-xs font-bold text-slate-800">Pratinjau crop foto terpilih</h4>
          <div className="mx-auto w-40 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm"><canvas ref={previewCanvas} width={240} height={360} className="block aspect-[2/3] w-full object-cover"/><p className="border-t border-slate-200 p-1 text-center text-[10px] text-slate-500">Kepala hingga dada</p></div>
          <label className="block text-[11px] font-semibold text-slate-700">Zoom/crop<input className="mt-1 w-full accent-emerald-700" type="range" min="0.25" max="0.95" step="0.01" value={selectedPreview?.cropFraction ?? 0.52} disabled={uploading || !selectedPreview} onChange={e=>{if(!selectedPreview)return;const value=Number(e.target.value);setRows(current=>current.map(r=>r.id===selectedPreview.id?{...r,cropFraction:value,needsReview:false,message:'Crop dikoreksi manual.'}:r));}}/></label>
          <label className="block text-[11px] font-semibold text-slate-700">Posisi horizontal<input className="mt-1 w-full accent-emerald-700" type="range" min="0" max="1" step="0.02" value={selectedPreview?.horizontal ?? 0.5} disabled={uploading || !selectedPreview} onChange={e=>{if(!selectedPreview)return;const value=Number(e.target.value);setRows(current=>current.map(r=>r.id===selectedPreview.id?{...r,horizontal:value,needsReview:false,message:'Crop dikoreksi manual.'}:r));}}/></label>
          <label className="block text-[11px] font-semibold text-slate-700">Posisi vertikal<input className="mt-1 w-full accent-emerald-700" type="range" min="0" max="1" step="0.02" value={selectedPreview?.vertical ?? 0} disabled={uploading || !selectedPreview} onChange={e=>{if(!selectedPreview)return;const value=Number(e.target.value);setRows(current=>current.map(r=>r.id===selectedPreview.id?{...r,vertical:value,needsReview:false,message:'Crop dikoreksi manual.'}:r));}}/></label>
          <p className="text-[10px] leading-relaxed text-slate-500">Crop otomatis mengikuti wajah tiap peserta. Pengaturan zoom/posisi hanya berlaku untuk foto terpilih. Foto tanpa deteksi wajah harus dikoreksi manual; foto tersebut belum bisa diunggah sebelum dikoreksi.</p>
        </aside>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Foto disimpan privat di R2; D1 hanya menyimpan referensinya.</p><div className="flex shrink-0 gap-2"><button type="button" onClick={onClose} disabled={uploading} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Tutup</button><button type="button" onClick={()=>void uploadPhotos()} disabled={!readyCount||uploading||reading} className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40">{uploading?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Upload className="h-3.5 w-3.5"/>}Proses & unggah {readyCount} foto</button></div></div>
    </div>
  </div>;
};
