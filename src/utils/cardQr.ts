import type { BPAIKUser } from '../types';

const CREDENTIAL_KEYS = [
  'qrUniqueCode',
  'qrCode',
  'cardCode',
  'cardQr',
  'credential',
  'cardToken',
  'token',
  'code'
] as const;

/**
 * Membaca kode dari QR berbentuk teks, JSON, atau URL dengan
 * parameter kredensial. NPP dan ID biasa tidak dianggap kredensial.
 */
export function normalizeCardQrPayload(rawValue: string): string {
  const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!raw) return '';

  const extract = (value: unknown, depth = 0): string => {
    if (
      depth > 3 ||
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return '';
    }

    const record = value as Record<string, unknown>;

    for (const key of CREDENTIAL_KEYS) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    for (const key of ['payload', 'data', 'card']) {
      const nested = record[key];

      if (typeof nested === 'string') {
        try {
          const result = extract(JSON.parse(nested), depth + 1);
          if (result) return result;
        } catch {
          // Payload teks biasa tetap boleh menjadi kode kartu.
          if (nested.trim()) return nested.trim();
        }
      } else {
        const result = extract(nested, depth + 1);
        if (result) return result;
      }
    }

    return '';
  };

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed === 'string') {
      return parsed.trim();
    }

    // JSON terstruktur harus memiliki field kredensial yang dikenali.
    return extract(parsed);
  } catch {
    // QR kartu lama biasanya langsung berisi teks kode unik.
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);

      for (const key of CREDENTIAL_KEYS) {
        const candidate = url.searchParams.get(key);
        if (candidate?.trim()) return candidate.trim();
      }

      const fragment = url.hash.slice(1).trim();
      if (fragment) {
        let decoded = fragment;
        try {
          decoded = decodeURIComponent(fragment);
        } catch {
          // Pertahankan fragmen literal bila encoding tidak valid.
        }
        if (/^BPAIK-[A-Za-z0-9_-]{8,}$/i.test(decoded)) return decoded;
      }

      return '';
    } catch {
      return '';
    }
  }

  return raw;
}

/** URL produksi yang dicetak di QR kartu peserta. */
export const BPAIK_CARD_LOGIN_URL =
  'https://bpaik.bimma-uab.my.id/beranda';

/** Membuat URL login dari kode QR acak yang tersimpan di D1. */
export function getCardQrUrl(
  user: Pick<BPAIKUser, 'id' | 'npp' | 'qrUniqueCode'>
): string {
  const code = getCardQrCredential(user);
  return code ? `${BPAIK_CARD_LOGIN_URL}/#${encodeURIComponent(code)}` : '';
}

/**
 * Format tunggal untuk QR kartu:
 * gunakan qrUniqueCode jika tersedia, jika tidak gunakan format lama.
 */
export function getCardQrCredential(
  user: Pick<BPAIKUser, 'id' | 'npp' | 'qrUniqueCode'>
): string {
  // Kredensial login harus berupa kode acak yang tersimpan di D1.
  return user.qrUniqueCode?.trim() || '';
}
