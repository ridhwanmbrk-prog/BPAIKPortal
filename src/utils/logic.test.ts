import test from 'node:test';
import assert from 'node:assert/strict';
import { createQrToken, verifyQrToken } from './qrCrypto';
import { parseEmployeeCsv } from './csvParser';
import { validateSignatureStrokes } from './signatureValidator';

test('QR Token generation and validation with HMAC', () => {
  const secret = 'super-secret-key-12345';
  const eventId = 'ev-bpaik-001';
  const sessionId = 'ses-001';
  const now = 1700000000000;

  const token = createQrToken(eventId, sessionId, secret, now);
  assert.ok(token, 'Token must be generated');

  // Verify valid token
  const result = verifyQrToken(token, secret, 20000, now + 5000);
  assert.equal(result.valid, true);
  assert.equal(result.eventId, eventId);
  assert.equal(result.sessionId, sessionId);

  // Reject expired token (> 20s)
  const expiredResult = verifyQrToken(token, secret, 20000, now + 25000);
  assert.equal(expiredResult.valid, false);
  assert.match(expiredResult.error || '', /kedaluwarsa/i);

  // Reject forged token
  const wrongSecretResult = verifyQrToken(token, 'wrong-secret', 20000, now + 5000);
  assert.equal(wrongSecretResult.valid, false);
  assert.match(wrongSecretResult.error || '', /tidak sah/i);
});

test('CSV Parser handles standard and custom BPAIK employee headers', () => {
  const csvData = `Nama,Email,NPP,Unit Kerja,Role,Status
Ahmad Fauzi,ahmad@aisyiyah.ac.id,NPP1001,Fakultas Ilmu Kesehatan,PEGAWAI,aktif
Siti Rahmah,siti@aisyiyah.ac.id,NPP1002,BPAIK,PANITIA,aktif
Nonaktif User,nonaktif@aisyiyah.ac.id,NPP1003,Biro Umum,PEGAWAI,nonaktif`;

  const result = parseEmployeeCsv(csvData);
  assert.equal(result.success, true);
  assert.equal(result.employees.length, 3);
  assert.equal(result.employees[0].nama, 'Ahmad Fauzi');
  assert.equal(result.employees[0].role, 'PEGAWAI');
  assert.equal(result.employees[1].role, 'PANITIA');
  assert.equal(result.employees[2].status, 'nonaktif');
});

test('CSV Parser rejects missing required columns or invalid rows', () => {
  const badCsv = `RandomColumn,SomethingElse\nValue1,Value2`;
  const result = parseEmployeeCsv(badCsv);
  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
});

test('Signature stroke validation checks emptiness and stroke length', () => {
  // Empty signature
  const emptyRes = validateSignatureStrokes([]);
  assert.equal(emptyRes.valid, false);

  // Single accidental dot (2 points, very short length)
  const dotRes = validateSignatureStrokes([
    [{ x: 10, y: 10 }, { x: 10.5, y: 10.5 }]
  ]);
  assert.equal(dotRes.valid, false);

  // Genuine signature (multiple strokes and points)
  const validStrokes = [
    [
      { x: 10, y: 10 }, { x: 20, y: 30 }, { x: 40, y: 50 }, { x: 60, y: 65 },
      { x: 80, y: 70 }, { x: 100, y: 60 }
    ],
    [
      { x: 50, y: 20 }, { x: 50, y: 80 }, { x: 70, y: 90 }, { x: 90, y: 85 },
      { x: 110, y: 60 }
    ]
  ];
  const validRes = validateSignatureStrokes(validStrokes);
  assert.equal(validRes.valid, true);
  assert.ok(validRes.pointCount >= 10);
  assert.ok(validRes.totalLength >= 30);
});

import {
  getCardQrCredential,
  getCardQrUrl,
  normalizeCardQrPayload
} from './cardQr';

test('Card QR supports plain text and structured JSON payloads', () => {
  const credential = 'BPAIK-KARTU-0415038102-HAMZAH';

  assert.equal(normalizeCardQrPayload(credential), credential);
  assert.equal(
    normalizeCardQrPayload(JSON.stringify({ qrUniqueCode: credential })),
    credential
  );
  assert.equal(
    normalizeCardQrPayload(JSON.stringify({ data: { qrCode: credential } })),
    credential
  );
});

test('Card QR deep-link opens the production beranda and normalizes its fragment', () => {
  const credential = 'BPAIK-EhZBUUnFFT0fF9pID5iNs-Cx-o6g9WIZFN1PswPFM9A';
  const url = getCardQrUrl({
    id: 'participant-test',
    npp: 'NPP-TEST',
    qrUniqueCode: credential
  });

  assert.equal(
    url,
    `https://bpaik.bimma-uab.my.id/beranda/#${credential}`
  );
  assert.equal(normalizeCardQrPayload(url), credential);
});

test('Card QR does not treat plain NPP or user ID as a credential', () => {
  assert.equal(
    normalizeCardQrPayload(JSON.stringify({
      id: 'peserta_123',
      npp: 'NPP. 0415038102'
    })),
    ''
  );
});

test('Card QR never creates login credentials from personal identifiers', () => {
  assert.equal(
    getCardQrCredential({
      id: 'user-1',
      npp: 'NPP. 0422019800'
    }),
    ''
  );

  assert.equal(
    getCardQrCredential({
      id: 'peserta_hamzah',
      npp: 'NPP. 0415038102',
      qrUniqueCode: 'BPAIK-KARTU-0415038102-HAMZAH'
    }),
    'BPAIK-KARTU-0415038102-HAMZAH'
  );
});
