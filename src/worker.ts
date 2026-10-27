interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  first<T = Record<string, unknown>>(
    columnName?: string
  ): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: unknown }>;
}

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  DB: {
    prepare(query: string): PreparedStatement;
    batch(statements: PreparedStatement[]): Promise<Array<{ success: boolean }>>;
  };
  FIREBASE_PROJECT_ID: string;
  SESSION_SECRET: string;
  QR_HMAC_SECRET: string;
}

interface FirebaseClaims {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  exp?: number;
  iat?: number;
}

interface FirebaseJwk extends JsonWebKey {
  kid?: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  npp: string;
  jabatan: string;
  whatsapp: string;
  avatar_url: string | null;
  role: "ADMIN" | "PESERTA";
  qr_unique_code: string | null;
  status: "aktif" | "nonaktif";
  created_at: string;
  updated_at: string;
}

let cachedJwks: FirebaseJwk[] | null = null;
let cachedJwksUntil = 0;

function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function decodeBase64Url(segment: string): ArrayBuffer {
  const base64 = segment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function decodeJsonSegment<T>(segment: string): T {
  return JSON.parse(
    new TextDecoder().decode(decodeBase64Url(segment))
  ) as T;
}

async function getFirebaseJwks(forceRefresh = false): Promise<FirebaseJwk[]> {
  if (!forceRefresh && cachedJwks && Date.now() < cachedJwksUntil) {
    return cachedJwks;
  }

  const response = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  );

  if (!response.ok) {
    throw new Error("Tidak dapat mengambil kunci verifikasi Firebase.");
  }

  const result = await response.json() as { keys?: FirebaseJwk[] };

  if (!result.keys?.length) {
    throw new Error("Kunci verifikasi Firebase tidak tersedia.");
  }

  cachedJwks = result.keys;
  cachedJwksUntil = Date.now() + 60 * 60 * 1000;

  return cachedJwks;
}

async function verifyFirebaseIdToken(
  token: string,
  projectId: string
): Promise<FirebaseClaims | null> {
  try {
    if (!token || token.length > 16384) return null;

    const segments = token.split(".");
    if (segments.length !== 3) return null;

    const [headerSegment, payloadSegment, signatureSegment] = segments;

    const header = decodeJsonSegment<{
      alg?: string;
      kid?: string;
    }>(headerSegment);

    const claims = decodeJsonSegment<FirebaseClaims>(payloadSegment);

    if (header.alg !== "RS256" || !header.kid) return null;

    let keys = await getFirebaseJwks();
    let jwk = keys.find(key => key.kid === header.kid);

    if (!jwk) {
      keys = await getFirebaseJwks(true);
      jwk = keys.find(key => key.kid === header.kid);
    }

    if (!jwk) return null;

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

    const validSignature = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      decodeBase64Url(signatureSegment),
      new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
    );

    if (!validSignature) return null;

    const now = Math.floor(Date.now() / 1000);

    if (
      claims.aud !== projectId ||
      claims.iss !== `https://securetoken.google.com/${projectId}` ||
      !claims.sub ||
      !claims.email ||
      claims.email_verified !== true ||
      typeof claims.exp !== "number" ||
      claims.exp <= now ||
      typeof claims.iat !== "number" ||
      claims.iat > now + 60
    ) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

function mapUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    npp: row.npp,
    jabatan: row.jabatan,
    whatsapp: row.whatsapp,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    role: row.role,
    ...(row.qr_unique_code
      ? { qrUniqueCode: row.qr_unique_code }
      : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function readBody(
  request: Request
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }

    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function getActiveUserByEmail(
  env: Env,
  email: string
): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT id, email, name, npp, jabatan, whatsapp,
            avatar_url, role, qr_unique_code, status,
            created_at, updated_at
       FROM users
      WHERE lower(email) = lower(?)
        AND status = 'aktif'
      LIMIT 1`
  ).bind(email).first<UserRow>();
}

async function getActiveUserByQr(
  env: Env,
  code: string
): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT id, email, name, npp, jabatan, whatsapp,
            avatar_url, role, qr_unique_code, status,
            created_at, updated_at
       FROM users
      WHERE qr_unique_code = ?
        AND status = 'aktif'
        AND role = 'PESERTA'
      LIMIT 1`
  ).bind(code).first<UserRow>();
}


interface SessionClaims {
  sub: string;
  exp: number;
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array
    ? value
    : new Uint8Array(value);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sessionSigningKey(secret: string, usages: KeyUsage[]) {
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET harus memiliki minimal 32 karakter.");
  }

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

async function createSessionToken(
  userId: string,
  secret: string
): Promise<string> {
  const claims: SessionClaims = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
  };

  const encodedPayload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(claims))
  );

  const key = await sessionSigningKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );

  return `${encodedPayload}.${encodeBase64Url(signature)}`;
}

async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionClaims | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [encodedPayload, encodedSignature] = parts;
    const claims = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedPayload))
    ) as SessionClaims;

    if (
      typeof claims.sub !== "string" ||
      !claims.sub ||
      typeof claims.exp !== "number" ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    const key = await sessionSigningKey(secret, ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload)
    );

    return valid ? claims : null;
  } catch {
    return null;
  }
}

function sessionCookie(
  request: Request,
  token: string | null
): string {
  const secure = new URL(request.url).protocol === "https:";
  const flags = [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    ...(secure ? ["Secure"] : [])
  ];

  if (!token) {
    flags.push("Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    return `bpaik_session=; ${flags.join("; ")}`;
  }

  flags.push("Max-Age=28800");
  return `bpaik_session=${token}; ${flags.join("; ")}`;
}

function readSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie") || "";

  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;

    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();

    if (name === "bpaik_session" && value) return value;
  }

  return null;
}

async function getActiveUserById(
  env: Env,
  id: string
): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT id, email, name, npp, jabatan, whatsapp,
            avatar_url, role, qr_unique_code, status,
            created_at, updated_at
       FROM users
      WHERE id = ? AND status = 'aktif'
      LIMIT 1`
  ).bind(id).first<UserRow>();
}


// BPAIK_EVENTS_API_HELPERS

interface EventRow {
  id: string;
  title: string;
  description: string;
  start_datetime: string;
  end_datetime: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  created_by: string;
  creator_name: string;
  status: "dijadwalkan" | "berlangsung" | "selesai" | "dibatalkan";
  session_duration_minutes: number;
  session_status: "belum_dibuka" | "aktif" | "ditutup";
  session_opened_at: string | null;
  session_closed_at: string | null;
  created_at: string;
  updated_at: string;
}

type SessionUserResult =
  | { ok: true; user: UserRow }
  | { ok: false; status: 401 | 503; error: string };

async function getSessionUserForApi(
  request: Request,
  env: Env
): Promise<SessionUserResult> {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return {
      ok: false,
      status: 503,
      error: "Sesi server belum dikonfigurasi."
    };
  }

  const token = readSessionCookie(request);
  if (!token) {
    return { ok: false, status: 401, error: "Silakan login terlebih dahulu." };
  }

  try {
    const claims = await verifySessionToken(token, env.SESSION_SECRET);
    if (!claims) {
      return { ok: false, status: 401, error: "Sesi tidak valid atau sudah berakhir." };
    }

    const user = await getActiveUserById(env, claims.sub);
    if (!user) {
      return { ok: false, status: 401, error: "Akun tidak aktif atau tidak ditemukan." };
    }

    return { ok: true, user };
  } catch {
    return { ok: false, status: 503, error: "Gagal memverifikasi sesi pengguna." };
  }
}

function mapEvent(row: EventRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startDateTime: row.start_datetime,
    endDateTime: row.end_datetime,
    date: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    createdBy: row.created_by,
    creatorName: row.creator_name,
    status: row.status,
    sessionDurationMinutes: row.session_duration_minutes,
    sessionStatus: row.session_status,
    sessionOpenedAt: row.session_opened_at,
    sessionClosedAt: row.session_closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseLocalDateTime(
  value: unknown
): { value: string; date: string; time: string } | null {
  if (typeof value !== "string") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, ys, mos, ds, hs, mis] = match;
  const year = Number(ys);
  const month = Number(mos);
  const day = Number(ds);
  const hour = Number(hs);
  const minute = Number(mis);

  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return { value, date: `${ys}-${mos}-${ds}`, time: `${hs}:${mis}` };
}

function jakartaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}




interface LeaveApiRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_npp: string;
  user_jabatan: string;
  user_whatsapp: string;
  event_id: string;
  event_title: string;
  event_date: string;
  reason: string;
  status: "MENUNGGU_ACC" | "DISETUJUI" | "DITOLAK";
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditApiRow {
  id: string;
  action: string;
  actor_email: string;
  actor_name: string;
  actor_role: string;
  target_type: string;
  target_id: string;
  description: string;
  details_json: string | null;
  timestamp: string;
}

function mapLeaveApiRow(row: LeaveApiRow) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    userNpp: row.user_npp,
    userJabatan: row.user_jabatan,
    userWhatsapp: row.user_whatsapp,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventDate: row.event_date,
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// BPAIK_QR_WORKER_HELPERS

interface AttendanceRow {
  id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  user_id: string;
  user_email: string;
  user_name: string;
  user_npp: string;
  user_jabatan: string;
  user_whatsapp: string | null;
  scan_time: string;
  attendance_status: "HADIR" | "IZIN" | "SAKIT" | "ALPA";
  signature_status: "MENUNGGU_KONFIRMASI" | "TERKONFIRMASI";
  signature_data: string | null;
  signature_timestamp: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerQrVerification {
  valid: boolean;
  eventId?: string;
  sessionId?: string;
  timestamp?: number;
  error?: string;
}

async function qrHmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  );

  return Array.from(signature)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function createWorkerQrToken(
  eventId: string,
  sessionId: string,
  secret: string,
  timestamp = Date.now()
): Promise<string> {
  const payload = `${eventId}:${sessionId}:${timestamp}`;
  const mac = await qrHmacHex(payload, secret);

  return encodeBase64Url(
    new TextEncoder().encode(`${payload}:${mac}`)
  );
}

function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyWorkerQrToken(
  token: string,
  secret: string,
  maxAgeMs = 15000,
  now = Date.now()
): Promise<WorkerQrVerification> {
  try {
    if (!token || token.length > 4096) {
      return { valid: false, error: "Token QR tidak boleh kosong atau terlalu panjang." };
    }

    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      decodeBase64Url(token)
    );
    const parts = decoded.split(":");

    if (parts.length !== 4) {
      return { valid: false, error: "Format QR token tidak valid." };
    }

    const [eventId, sessionId, timestampText, mac] = parts;

    if (
      !eventId || !sessionId ||
      !/^\d{13}$/.test(timestampText) ||
      !/^[0-9a-f]{64}$/.test(mac)
    ) {
      return { valid: false, error: "Isi QR token tidak valid." };
    }

    const timestamp = Number(timestampText);
    const expectedMac = await qrHmacHex(
      `${eventId}:${sessionId}:${timestamp}`,
      secret
    );

    if (!constantTimeStringEqual(mac, expectedMac)) {
      return { valid: false, error: "Tanda tangan token QR tidak sah." };
    }

    if (now - timestamp > maxAgeMs) {
      return { valid: false, error: "QR code sudah kedaluwarsa." };
    }

    if (timestamp - now > 60000) {
      return { valid: false, error: "Waktu token mendahului waktu server." };
    }

    return { valid: true, eventId, sessionId, timestamp };
  } catch {
    return { valid: false, error: "Token QR tidak valid atau tidak dapat diverifikasi." };
  }
}

async function getEventForQr(
  env: Env,
  eventId: string
): Promise<EventRow | null> {
  return env.DB.prepare(
    `SELECT id, title, description, start_datetime, end_datetime,
            event_date, start_time, end_time, location, created_by,
            creator_name, status, session_duration_minutes,
            session_status, session_opened_at, session_closed_at,
            created_at, updated_at
       FROM events
      WHERE id = ?
      LIMIT 1`
  ).bind(eventId).first<EventRow>();
}

async function validateOpenQrEvent(
  env: Env,
  eventId: string,
  sessionId: string,
  nowMs = Date.now()
): Promise<{ event?: EventRow; error?: string; status?: number }> {
  if (sessionId !== `${eventId}_session`) {
    return { error: "Token tidak cocok dengan sesi kegiatan.", status: 400 };
  }

  const event = await getEventForQr(env, eventId);

  if (!event) {
    return { error: "Kegiatan tidak ditemukan.", status: 404 };
  }

  if (
    event.session_status !== "aktif" ||
    event.status === "dibatalkan" ||
    !event.session_opened_at
  ) {
    return { error: "Sesi presensi kegiatan tidak sedang aktif.", status: 409 };
  }

  const openedAt = Date.parse(event.session_opened_at);
  const duration = Number(event.session_duration_minutes);

  if (
    !Number.isFinite(openedAt) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    nowMs > openedAt + duration * 60 * 1000
  ) {
    return { error: "Durasi sesi presensi telah berakhir.", status: 409 };
  }

  return { event };
}

function mapAttendanceRecord(row: AttendanceRow) {
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventDate: row.event_date,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    userNpp: row.user_npp,
    userJabatan: row.user_jabatan,
    userWhatsapp: row.user_whatsapp || undefined,
    scanTime: row.scan_time,
    attendanceStatus: row.attendance_status,
    signatureStatus: row.signature_status,
    signatureData: row.signature_data,
    signatureTimestamp: row.signature_timestamp,
    verifiedBy: row.verified_by,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}


function generateUserQrCredential(): string {
  const random = crypto.getRandomValues(new Uint8Array(32));
  return `BPAIK-${encodeBase64Url(random)}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health" && request.method === "GET") {
      try {
        await env.DB.prepare("SELECT 1 AS ok").first();

        return json({
          status: "ok",
          runtime: "cloudflare-workers",
          d1Connected: true,
          database: "pbaik-absensi-data"
        });
      } catch {
        return json({
          status: "error",
          d1Connected: false
        }, 503);
      }
    }

    if (path === "/api/d1/status" && request.method === "GET") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat melihat status D1." }, 403);
      }

      try {
        const result = await env.DB.prepare(
          `SELECT name FROM sqlite_master
            WHERE type = 'table'
              AND name NOT LIKE 'sqlite_%'
            ORDER BY name`
        ).all<{ name: string }>();

        const counts: Record<string, number> = {};

        for (const table of [
          "users",
          "events",
          "attendance_records",
          "leave_requests",
          "audit_logs"
        ]) {
          const count = await env.DB.prepare(
            `SELECT COUNT(*) AS count FROM "${table}"`
          ).first<{ count: number }>();

          counts[table] = count?.count ?? 0;
        }

        return json({
          connected: true,
          databaseName: "pbaik-absensi-data",
          tables: result.results.map(row => row.name),
          counts,
          dataMigrationComplete: false
        });
      } catch {
        return json({
          connected: false,
          error: "Tidak dapat membaca D1."
        }, 503);
      }
    }

    if (path === "/api/auth/me" && request.method === "GET") {
      if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
        return json({
          success: false,
          error: "Sesi server belum dikonfigurasi."
        }, 503);
      }

      const token = readSessionCookie(request);
      if (!token) {
        return json({ success: false, error: "Belum login." }, 401);
      }

      const claims = await verifySessionToken(token, env.SESSION_SECRET);
      if (!claims) {
        return json(
          { success: false, error: "Sesi tidak valid atau sudah berakhir." },
          401,
          { "Set-Cookie": sessionCookie(request, null) }
        );
      }

      try {
        const account = await getActiveUserById(env, claims.sub);

        if (!account) {
          return json(
            { success: false, error: "Akun tidak aktif atau tidak ditemukan." },
            401,
            { "Set-Cookie": sessionCookie(request, null) }
          );
        }

        return json({ success: true, user: mapUser(account) });
      } catch {
        return json({
          success: false,
          error: "Gagal membaca profil dari D1."
        }, 503);
      }
    }

    if (path === "/api/auth/logout" && request.method === "POST") {
      return json(
        { success: true },
        200,
        { "Set-Cookie": sessionCookie(request, null) }
      );
    }

    if (path === "/api/auth/profile" && request.method === "PUT") {
      if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
        return json({ success: false, error: "Sesi server belum dikonfigurasi." }, 503);
      }

      const sessionToken = readSessionCookie(request);
      const claims = sessionToken
        ? await verifySessionToken(sessionToken, env.SESSION_SECRET)
        : null;

      if (!claims) {
        return json({ success: false, error: "Sesi tidak valid atau sudah berakhir." }, 401);
      }

      const body = await readBody(request);
      if (!body) {
        return json({ success: false, error: "Data profil tidak valid." }, 400);
      }

      try {
        const current = await getActiveUserById(env, claims.sub);
        if (!current) {
          return json({ success: false, error: "Akun tidak aktif atau tidak ditemukan." }, 403);
        }

        const name = typeof body.name === "string" ? body.name.trim() : current.name;
        const jabatan = typeof body.jabatan === "string" ? body.jabatan.trim() : current.jabatan;
        const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() : current.whatsapp;
        const avatarUrl = typeof body.avatarUrl === "string"
          ? body.avatarUrl
          : current.avatar_url;

        if (
          !name || name.length > 120 ||
          jabatan.length > 160 ||
          whatsapp.length > 40 ||
          (avatarUrl !== null && avatarUrl.length > 400000)
        ) {
          return json({ success: false, error: "Data profil tidak valid atau terlalu panjang." }, 400);
        }

        if (
          avatarUrl &&
          !/^https:\/\//i.test(avatarUrl) &&
          !/^data:image\/(png|jpe?g|webp);base64,/i.test(avatarUrl)
        ) {
          return json({ success: false, error: "Format foto profil tidak didukung." }, 400);
        }

        await env.DB.prepare(
          `UPDATE users
              SET name = ?,
                  jabatan = ?,
                  whatsapp = ?,
                  avatar_url = ?,
                  updated_at = ?
            WHERE id = ? AND status = 'aktif'`
        ).bind(
          name,
          jabatan,
          whatsapp,
          avatarUrl || null,
          new Date().toISOString(),
          claims.sub
        ).run();

        const updated = await getActiveUserById(env, claims.sub);
        if (!updated) {
          return json({ success: false, error: "Profil tidak ditemukan setelah pembaruan." }, 404);
        }

        return json({ success: true, user: mapUser(updated) });
      } catch {
        return json({ success: false, error: "Gagal memperbarui profil pada D1." }, 503);
      }
    }

    if (path === "/api/auth/google" && request.method === "POST") {
      if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
        return json({
          success: false,
          error: "Sesi server belum dikonfigurasi."
        }, 503);
      }

      const body = await readBody(request);
      const idToken = body?.idToken;

      if (typeof idToken !== "string") {
        return json({
          success: false,
          error: "Token login Google tidak ditemukan."
        }, 400);
      }

      const claims = await verifyFirebaseIdToken(
        idToken,
        env.FIREBASE_PROJECT_ID
      );

      if (!claims?.email) {
        return json({
          success: false,
          error: "Token Google tidak valid atau sudah kedaluwarsa."
        }, 401);
      }

      try {
        const account = await getActiveUserByEmail(env, claims.email);

        if (!account) {
          return json({
            success: false,
            error: "Akun tidak terdaftar atau berstatus nonaktif di D1."
          }, 403);
        }

        const sessionToken = await createSessionToken(
          account.id,
          env.SESSION_SECRET
        );

        return json(
          { success: true, user: mapUser(account) },
          200,
          { "Set-Cookie": sessionCookie(request, sessionToken) }
        );
      } catch {
        return json({
          success: false,
          error: "Gagal memverifikasi profil melalui D1."
        }, 503);
      }
    }

    if (path === "/api/auth/card" && request.method === "POST") {
      if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
        return json({
          success: false,
          error: "Sesi server belum dikonfigurasi."
        }, 503);
      }

      const body = await readBody(request);
      const code = body?.code;

      if (typeof code !== "string" || !code.trim()) {
        return json({
          success: false,
          error: "Kode QR kartu tidak ditemukan."
        }, 400);
      }

      try {
        const account = await getActiveUserByQr(env, code.trim());

        if (!account) {
          return json({
            success: false,
            error: "Kode QR tidak terdaftar atau akun nonaktif di D1."
          }, 403);
        }

        const sessionToken = await createSessionToken(
          account.id,
          env.SESSION_SECRET
        );

        return json(
          { success: true, user: mapUser(account) },
          200,
          { "Set-Cookie": sessionCookie(request, sessionToken) }
        );
      } catch {
        return json({
          success: false,
          error: "Gagal memverifikasi QR melalui D1."
        }, 503);
      }
    }



    // BPAIK_USERS_API_ROUTES

    if (path === "/api/users" && request.method === "GET") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat melihat daftar pengguna." }, 403);
      }

      try {
        const result = await env.DB.prepare(
          `SELECT id, email, name, npp, jabatan, whatsapp,
                  avatar_url, role, qr_unique_code, status,
                  created_at, updated_at
             FROM users
            ORDER BY name COLLATE NOCASE ASC`
        ).all<UserRow>();

        return json({
          success: true,
          users: result.results.map(mapUser)
        });
      } catch {
        return json({ success: false, error: "Gagal membaca pengguna dari D1." }, 503);
      }
    }

    if (path === "/api/users" && request.method === "POST") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat membuat pengguna." }, 403);
      }

      const body = await readBody(request);
      if (!body) {
        return json({ success: false, error: "Data pengguna tidak valid." }, 400);
      }

      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const npp = typeof body.npp === "string" ? body.npp.trim() : "";
      const jabatan = typeof body.jabatan === "string" ? body.jabatan.trim() : "";
      const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() : "";
      const role = body.role === undefined ? "PESERTA" : body.role;
      const status = body.status === undefined ? "aktif" : body.status;

      if (
        !name || name.length > 120 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        npp.length > 80 || jabatan.length > 160 || whatsapp.length > 40 ||
        !["ADMIN", "PESERTA"].includes(String(role)) ||
        !["aktif", "nonaktif"].includes(String(status))
      ) {
        return json({ success: false, error: "Periksa nama, email, NPP, jabatan, nomor WhatsApp, peran, dan status." }, 400);
      }

      const now = new Date().toISOString();
      const id = `user_${crypto.randomUUID()}`;
      const qrCode = generateUserQrCredential();

      try {
        const existing = await env.DB.prepare(
          "SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1"
        ).bind(email).first<{ id: string }>();

        if (existing) {
          return json({ success: false, error: "Email tersebut sudah terdaftar." }, 409);
        }

        const newUser: UserRow = {
          id,
          name,
          email,
          npp,
          jabatan,
          whatsapp,
          avatar_url: null,
          role: role as "ADMIN" | "PESERTA",
          qr_unique_code: qrCode,
          status: status as "aktif" | "nonaktif",
          created_at: now,
          updated_at: now
        };

        const results = await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO users (
              id, email, name, npp, jabatan, whatsapp, avatar_url,
              role, qr_unique_code, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            newUser.id, newUser.email, newUser.name, newUser.npp,
            newUser.jabatan, newUser.whatsapp, newUser.avatar_url,
            newUser.role, newUser.qr_unique_code, newUser.status,
            newUser.created_at, newUser.updated_at
          ),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "CREATE_USER",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "USER",
            id,
            `Menambahkan pengguna: ${name} (${email})`,
            JSON.stringify({ role, status }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Batch D1 gagal.");
        }

        return json({ success: true, user: mapUser(newUser) }, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/UNIQUE constraint failed/i.test(message)) {
          return json({ success: false, error: "Email atau kode QR sudah digunakan." }, 409);
        }
        return json({ success: false, error: "Gagal menyimpan pengguna ke D1." }, 503);
      }
    }

    const userRoute = path.match(/^\/api\/users\/([^/]+)$/);

    if (userRoute && request.method === "PUT") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat mengubah pengguna." }, 403);
      }

      let userId: string;
      try {
        userId = decodeURIComponent(userRoute[1]);
      } catch {
        return json({ success: false, error: "ID pengguna tidak valid." }, 400);
      }

      const body = await readBody(request);
      if (!body) {
        return json({ success: false, error: "Data pengguna tidak valid." }, 400);
      }

      try {
        const current = await env.DB.prepare(
          `SELECT id, email, name, npp, jabatan, whatsapp,
                  avatar_url, role, qr_unique_code, status,
                  created_at, updated_at
             FROM users WHERE id = ? LIMIT 1`
        ).bind(userId).first<UserRow>();

        if (!current) {
          return json({ success: false, error: "Pengguna tidak ditemukan." }, 404);
        }

        const name = body.name === undefined
          ? current.name
          : typeof body.name === "string" ? body.name.trim() : "";
        const email = body.email === undefined
          ? current.email
          : typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const npp = body.npp === undefined
          ? current.npp
          : typeof body.npp === "string" ? body.npp.trim() : "";
        const jabatan = body.jabatan === undefined
          ? current.jabatan
          : typeof body.jabatan === "string" ? body.jabatan.trim() : "";
        const whatsapp = body.whatsapp === undefined
          ? current.whatsapp
          : typeof body.whatsapp === "string" ? body.whatsapp.trim() : "";
        const role = body.role === undefined ? current.role : body.role;
        const status = body.status === undefined ? current.status : body.status;

        if (
          !name || name.length > 120 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
          npp.length > 80 || jabatan.length > 160 || whatsapp.length > 40 ||
          !["ADMIN", "PESERTA"].includes(String(role)) ||
          !["aktif", "nonaktif"].includes(String(status))
        ) {
          return json({ success: false, error: "Data pengguna tidak valid." }, 400);
        }

        if (
          current.id === auth.user.id &&
          (role !== current.role || status !== current.status)
        ) {
          return json({
            success: false,
            error: "Anda tidak dapat mengubah peran atau menonaktifkan akun sendiri."
          }, 409);
        }

        const duplicate = await env.DB.prepare(
          "SELECT id FROM users WHERE lower(email) = lower(?) AND id <> ? LIMIT 1"
        ).bind(email, userId).first<{ id: string }>();

        if (duplicate) {
          return json({ success: false, error: "Email tersebut sudah digunakan pengguna lain." }, 409);
        }

        const now = new Date().toISOString();
        const action = role !== current.role
          ? "CHANGE_USER_ROLE"
          : status !== current.status
            ? "CHANGE_USER_STATUS"
            : "UPDATE_USER";

        const results = await env.DB.batch([
          env.DB.prepare(
            `UPDATE users
                SET email = ?, name = ?, npp = ?, jabatan = ?,
                    whatsapp = ?, role = ?, status = ?, updated_at = ?
              WHERE id = ?`
          ).bind(email, name, npp, jabatan, whatsapp, role, status, now, userId),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            action,
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "USER",
            userId,
            `Memperbarui pengguna: ${name} (${email})`,
            JSON.stringify({ role, status }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Batch D1 gagal.");
        }

        const updated = await env.DB.prepare(
          `SELECT id, email, name, npp, jabatan, whatsapp,
                  avatar_url, role, qr_unique_code, status,
                  created_at, updated_at
             FROM users WHERE id = ? LIMIT 1`
        ).bind(userId).first<UserRow>();

        if (!updated) {
          return json({ success: false, error: "Pengguna tidak ditemukan setelah pembaruan." }, 404);
        }

        return json({ success: true, user: mapUser(updated) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/UNIQUE constraint failed/i.test(message)) {
          return json({ success: false, error: "Email tersebut sudah digunakan." }, 409);
        }
        return json({ success: false, error: "Gagal memperbarui pengguna di D1." }, 503);
      }
    }

    if (userRoute && request.method === "DELETE") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat menghapus pengguna." }, 403);
      }

      let userId: string;
      try {
        userId = decodeURIComponent(userRoute[1]);
      } catch {
        return json({ success: false, error: "ID pengguna tidak valid." }, 400);
      }

      if (userId === auth.user.id) {
        return json({ success: false, error: "Anda tidak dapat menghapus akun sendiri." }, 409);
      }

      try {
        const target = await env.DB.prepare(
          "SELECT id, email, name FROM users WHERE id = ? LIMIT 1"
        ).bind(userId).first<{ id: string; email: string; name: string }>();

        if (!target) {
          return json({ success: false, error: "Pengguna tidak ditemukan." }, 404);
        }

        const now = new Date().toISOString();
        const results = await env.DB.batch([
          env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "DELETE_USER",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "USER",
            userId,
            `Menghapus pengguna: ${target.name} (${target.email})`,
            null,
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Batch D1 gagal.");
        }

        return json({ success: true, deletedId: userId });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/FOREIGN KEY constraint failed/i.test(message)) {
          const deactivatedUser = await env.DB.prepare(
          "SELECT name, email FROM users WHERE id = ? LIMIT 1"
        ).bind(userId).first<{ name: string; email: string }>();

        const userLabel = deactivatedUser?.name || userId;
        const userEmail = deactivatedUser?.email || "";

        const deactivationTime = new Date().toISOString();
        const deactivationResults = await env.DB.batch([
          env.DB.prepare(
            "UPDATE users SET status = 'nonaktif', updated_at = ? WHERE id = ?"
          ).bind(deactivationTime, userId),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "DEACTIVATE_USER",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "USER",
            userId,
            `Menonaktifkan akun ${userLabel} karena memiliki riwayat presensi atau izin`,
            JSON.stringify({
              email: userEmail,
              reason: "Riwayat presensi atau izin"
            }),
            deactivationTime
          )
        ]);

        if (deactivationResults.some(result => !result.success)) {
          throw new Error("Gagal menonaktifkan akun yang memiliki riwayat.");
        }

        return json({
          success: true,
          deactivated: true,
          message: `${userLabel} memiliki riwayat presensi atau izin. Status akun diubah menjadi nonaktif.`
        });
        }
        return json({ success: false, error: "Gagal menghapus pengguna dari D1." }, 503);
      }
    }


    // BPAIK_EVENTS_API_ROUTES

    if (path === "/api/events" && request.method === "GET") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }

      try {
        const result = await env.DB.prepare(
          `SELECT id, title, description, start_datetime, end_datetime,
                  event_date, start_time, end_time, location, created_by,
                  creator_name, status, session_duration_minutes,
                  session_status, session_opened_at, session_closed_at,
                  created_at, updated_at
             FROM events
            ORDER BY event_date DESC, start_time DESC, created_at DESC`
        ).all<EventRow>();

        return json({
          success: true,
          events: result.results.map(mapEvent)
        });
      } catch {
        return json({ success: false, error: "Gagal membaca kegiatan dari D1." }, 503);
      }
    }

    if (path === "/api/events" && request.method === "POST") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat membuat kegiatan." }, 403);
      }

      const body = await readBody(request);
      if (!body) {
        return json({ success: false, error: "Isi permintaan tidak valid." }, 400);
      }

      const title = typeof body.title === "string" ? body.title.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const location = typeof body.location === "string" ? body.location.trim() : "";
      const start = parseLocalDateTime(body.startDateTime);
      const end = parseLocalDateTime(body.endDateTime);
      const duration = body.sessionDurationMinutes === undefined
        ? 60
        : Number(body.sessionDurationMinutes);

      if (
        !title || title.length > 200 ||
        description.length > 12000 ||
        location.length > 300 ||
        !start || !end || start.value >= end.value ||
        !Number.isInteger(duration) || duration < 1 || duration > 1440
      ) {
        return json({
          success: false,
          error: "Data kegiatan tidak valid. Periksa nama, tanggal, waktu, lokasi, dan durasi sesi."
        }, 400);
      }

      const now = new Date().toISOString();
      const id = `event_${crypto.randomUUID()}`;

      const event: EventRow = {
        id,
        title,
        description,
        start_datetime: start.value,
        end_datetime: end.value,
        event_date: start.date,
        start_time: start.time,
        end_time: end.time,
        location,
        created_by: auth.user.email,
        creator_name: auth.user.name,
        status: "dijadwalkan",
        session_duration_minutes: duration,
        session_status: "belum_dibuka",
        session_opened_at: null,
        session_closed_at: null,
        created_at: now,
        updated_at: now
      };

      try {
        const results = await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO events (
              id, title, description, start_datetime, end_datetime,
              event_date, start_time, end_time, location, created_by,
              creator_name, status, session_duration_minutes,
              session_status, session_opened_at, session_closed_at,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            event.id, event.title, event.description,
            event.start_datetime, event.end_datetime, event.event_date,
            event.start_time, event.end_time, event.location,
            event.created_by, event.creator_name, event.status,
            event.session_duration_minutes, event.session_status,
            event.session_opened_at, event.session_closed_at,
            event.created_at, event.updated_at
          ),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "CREATE_EVENT",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "EVENT",
            id,
            `Membuat kegiatan baru: ${title}`,
            JSON.stringify({ location, startDateTime: start.value, endDateTime: end.value }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Operasi D1 tidak berhasil.");
        }

        return json({ success: true, event: mapEvent(event) }, 201);
      } catch {
        return json({
          success: false,
          error: "Gagal menyimpan kegiatan. Tidak ada keberhasilan yang dikonfirmasi."
        }, 503);
      }
    }


    // Edit / hapus kegiatan melalui D1. Riwayat presensi dan izin
    // dilindungi: kegiatan yang sudah memiliki rekam terkait tidak dihapus.
    const eventItemRoute = path.match(/^\/api\/events\/([^/]+)$/);
    if (eventItemRoute && (request.method === "PUT" || request.method === "DELETE")) {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error }, auth.status);
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat mengelola kegiatan." }, 403);
      }

      let eventId: string;
      try {
        eventId = decodeURIComponent(eventItemRoute[1]);
      } catch {
        return json({ success: false, error: "ID kegiatan tidak valid." }, 400);
      }

      try {
        const event = await env.DB.prepare(
          `SELECT id, title, description, start_datetime, end_datetime,
                  event_date, start_time, end_time, location, created_by,
                  creator_name, status, session_duration_minutes,
                  session_status, session_opened_at, session_closed_at,
                  created_at, updated_at
             FROM events WHERE id = ? LIMIT 1`
        ).bind(eventId).first<EventRow>();

        if (!event) {
          return json({ success: false, error: "Kegiatan tidak ditemukan." }, 404);
        }

        if (event.session_status === "aktif") {
          return json({
            success: false,
            error: "Tutup sesi QR terlebih dahulu sebelum mengubah atau menghapus kegiatan."
          }, 409);
        }

        if (request.method === "PUT") {
          if (event.status === "selesai" || event.status === "dibatalkan") {
            return json({
              success: false,
              error: "Kegiatan yang sudah selesai atau dibatalkan tidak dapat diedit."
            }, 409);
          }

          const body = await readBody(request);
          if (!body) {
            return json({ success: false, error: "Isi permintaan tidak valid." }, 400);
          }

          const title = typeof body.title === "string" ? body.title.trim() : "";
          const description = typeof body.description === "string" ? body.description.trim() : "";
          const location = typeof body.location === "string" ? body.location.trim() : "";
          const start = parseLocalDateTime(body.startDateTime);
          const end = parseLocalDateTime(body.endDateTime);
          const duration = Number(body.sessionDurationMinutes);

          if (
            !title || title.length > 200 ||
            description.length > 12000 || location.length > 300 ||
            !start || !end || start.value >= end.value ||
            !Number.isInteger(duration) || duration < 1 || duration > 1440
          ) {
            return json({
              success: false,
              error: "Data kegiatan tidak valid. Periksa nama, tanggal, waktu, lokasi, dan durasi."
            }, 400);
          }

          const now = new Date().toISOString();
          const updatedEvent: EventRow = {
            ...event,
            title,
            description,
            location,
            start_datetime: start.value,
            end_datetime: end.value,
            event_date: start.date,
            start_time: start.time,
            end_time: end.time,
            session_duration_minutes: duration,
            updated_at: now
          };

          const results = await env.DB.batch([
            env.DB.prepare(
              `UPDATE events
                  SET title = ?, description = ?, start_datetime = ?,
                      end_datetime = ?, event_date = ?, start_time = ?,
                      end_time = ?, location = ?, session_duration_minutes = ?,
                      updated_at = ?
                WHERE id = ?`
            ).bind(
              title, description, start.value, end.value, start.date,
              start.time, end.time, location, duration, now, eventId
            ),
            env.DB.prepare(
              `INSERT INTO audit_logs (
                id, action, actor_email, actor_name, actor_role,
                target_type, target_id, description, details_json, timestamp
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              `audit_${crypto.randomUUID()}`,
              "UPDATE_EVENT",
              auth.user.email,
              auth.user.name,
              auth.user.role,
              "EVENT",
              eventId,
              `Mengubah kegiatan: ${title}`,
              JSON.stringify({
                previousTitle: event.title,
                title,
                startDateTime: start.value,
                endDateTime: end.value,
                location
              }),
              now
            )
          ]);

          if (results.some(result => !result.success)) {
            throw new Error("Perubahan kegiatan gagal disimpan.");
          }

          return json({ success: true, event: mapEvent(updatedEvent) });
        }

        const attendanceCount = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM attendance_records WHERE event_id = ?"
        ).bind(eventId).first<{ count: number }>();

        const leaveCount = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM leave_requests WHERE event_id = ?"
        ).bind(eventId).first<{ count: number }>();

        if (Number(attendanceCount?.count ?? 0) > 0 || Number(leaveCount?.count ?? 0) > 0) {
          return json({
            success: false,
            error: "Kegiatan memiliki riwayat presensi atau izin. Hapus tidak diizinkan agar riwayat tetap terjaga."
          }, 409);
        }

        const now = new Date().toISOString();
        const results = await env.DB.batch([
          env.DB.prepare("DELETE FROM events WHERE id = ?").bind(eventId),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "DELETE_EVENT",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "EVENT",
            eventId,
            `Menghapus kegiatan tanpa riwayat presensi/izin: ${event.title}`,
            JSON.stringify({ title: event.title }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Penghapusan kegiatan gagal.");
        }

        return json({ success: true, deletedEventId: eventId });
      } catch (error) {
        console.error("Event update/delete error:", error);
        return json({
          success: false,
          error: "Gagal mengubah kegiatan di D1."
        }, 503);
      }
    }

    // Finalisasi terpisah dari penutupan sesi QR.
    const finishRoute = path.match(/^\/api\/events\/([^/]+)\/finish$/);
    if (finishRoute && request.method === "POST") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error }, auth.status);
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat menyelesaikan kegiatan." }, 403);
      }

      let eventId: string;
      try {
        eventId = decodeURIComponent(finishRoute[1]);
      } catch {
        return json({ success: false, error: "ID kegiatan tidak valid." }, 400);
      }

      try {
        const event = await env.DB.prepare(
          `SELECT id, title, description, start_datetime, end_datetime,
                  event_date, start_time, end_time, location, created_by,
                  creator_name, status, session_duration_minutes,
                  session_status, session_opened_at, session_closed_at,
                  created_at, updated_at
             FROM events WHERE id = ? LIMIT 1`
        ).bind(eventId).first<EventRow>();

        if (!event) return json({ success: false, error: "Kegiatan tidak ditemukan." }, 404);
        if (event.status === "selesai") {
          return json({ success: true, event: mapEvent(event) });
        }
        if (event.status === "dibatalkan") {
          return json({ success: false, error: "Kegiatan yang dibatalkan tidak dapat diselesaikan." }, 409);
        }
        if (event.session_status !== "ditutup") {
          return json({
            success: false,
            error: "Tutup sesi QR terlebih dahulu sebelum menandai kegiatan selesai."
          }, 409);
        }

        const now = new Date().toISOString();
        const results = await env.DB.batch([
          env.DB.prepare(
            "UPDATE events SET status = 'selesai', updated_at = ? WHERE id = ?"
          ).bind(now, eventId),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "FINISH_EVENT",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "EVENT",
            eventId,
            `Menandai kegiatan selesai: ${event.title}`,
            JSON.stringify({ previousStatus: event.status }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Finalisasi kegiatan gagal.");
        }

        return json({
          success: true,
          event: mapEvent({ ...event, status: "selesai", updated_at: now })
        });
      } catch (error) {
        console.error("Finish event error:", error);
        return json({ success: false, error: "Gagal menyelesaikan kegiatan di D1." }, 503);
      }
    }

    const sessionRoute = path.match(/^\/api\/events\/([^/]+)\/session$/);
    if (sessionRoute && request.method === "POST") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat mengubah sesi." }, 403);
      }

      let eventId: string;
      try {
        eventId = decodeURIComponent(sessionRoute[1]);
      } catch {
        return json({ success: false, error: "ID kegiatan tidak valid." }, 400);
      }

      try {
        const event = await env.DB.prepare(
          `SELECT id, title, description, start_datetime, end_datetime,
                  event_date, start_time, end_time, location, created_by,
                  creator_name, status, session_duration_minutes,
                  session_status, session_opened_at, session_closed_at,
                  created_at, updated_at
             FROM events WHERE id = ? LIMIT 1`
        ).bind(eventId).first<EventRow>();

        if (!event) {
          return json({ success: false, error: "Kegiatan tidak ditemukan." }, 404);
        }

        const currentlyActive = event.session_status === "aktif";
        if (!currentlyActive && (event.status === "dibatalkan" || event.status === "selesai")) {
          return json({
            success: false,
            error: "Kegiatan yang sudah selesai atau dibatalkan tidak dapat dibuka kembali."
          }, 409);
        }
        if (!currentlyActive && event.event_date < jakartaToday()) {
          return json({
            success: false,
            error: `Sesi tidak dapat dibuka karena tanggal kegiatan (${event.event_date}) telah terlewat.`
          }, 409);
        }

        const now = new Date().toISOString();
        const nextSessionStatus = currentlyActive ? "ditutup" : "aktif";
        const nextEventStatus = "berlangsung";
        const openedAt = currentlyActive ? event.session_opened_at : now;
        const closedAt = currentlyActive ? now : null;
        const action = currentlyActive ? "CLOSE_SESSION" : "OPEN_SESSION";
        const verb = currentlyActive ? "Menutup" : "Membuka";

        const results = await env.DB.batch([
          env.DB.prepare(
            `UPDATE events
                SET session_status = ?,
                    status = ?,
                    session_opened_at = ?,
                    session_closed_at = ?,
                    updated_at = ?
              WHERE id = ?`
          ).bind(
            nextSessionStatus, nextEventStatus, openedAt, closedAt, now, eventId
          ),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            action,
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "EVENT",
            eventId,
            `${verb} sesi presensi: ${event.title}`,
            JSON.stringify({
              previousSessionStatus: event.session_status,
              sessionStatus: nextSessionStatus
            }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Operasi D1 tidak berhasil.");
        }

        return json({
          success: true,
          event: mapEvent({
            ...event,
            session_status: nextSessionStatus,
            status: nextEventStatus,
            session_opened_at: openedAt,
            session_closed_at: closedAt,
            updated_at: now
          })
        });
      } catch {
        return json({ success: false, error: "Gagal memperbarui sesi di D1." }, 503);
      }
    }


    // BPAIK_QR_WORKER_ROUTES

    const qrTokenRoute = path.match(/^\/api\/qr\/token\/([^/]+)$/);

    if (qrTokenRoute && request.method === "GET") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat membuka proyektor QR." }, 403);
      }
      if (!env.QR_HMAC_SECRET || env.QR_HMAC_SECRET.length < 32) {
        return json({ success: false, error: "Secret QR belum dikonfigurasi." }, 503);
      }

      let eventId: string;
      try {
        eventId = decodeURIComponent(qrTokenRoute[1]);
      } catch {
        return json({ success: false, error: "ID kegiatan tidak valid." }, 400);
      }

      try {
        const event = await getEventForQr(env, eventId);
        if (!event) {
          return json({ success: false, error: "Kegiatan tidak ditemukan." }, 404);
        }

        const sessionId = `${eventId}_session`;
        const validation = await validateOpenQrEvent(env, eventId, sessionId);

        if (!validation.event) {
          return json({
            success: false,
            error: validation.error || "Sesi QR tidak aktif."
          }, validation.status || 409);
        }

        const timestamp = Date.now();
        const token = await createWorkerQrToken(
          eventId,
          sessionId,
          env.QR_HMAC_SECRET,
          timestamp
        );

        return json({
          success: true,
          token,
          eventId,
          sessionId,
          timestamp,
          expiresAt: timestamp + 15000,
          refreshSeconds: 10
        });
      } catch {
        return json({ success: false, error: "Gagal membuat token QR." }, 503);
      }
    }

    if (path === "/api/qr/verify-token" && request.method === "POST") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ valid: false, error: auth.error }, auth.status);
      }
      if (!env.QR_HMAC_SECRET || env.QR_HMAC_SECRET.length < 32) {
        return json({ valid: false, error: "Secret QR belum dikonfigurasi." }, 503);
      }

      const body = await readBody(request);
      if (!body || typeof body.token !== "string") {
        return json({ valid: false, error: "Token QR tidak ditemukan." }, 400);
      }

      try {
        const verification = await verifyWorkerQrToken(
          body.token,
          env.QR_HMAC_SECRET
        );

        if (!verification.valid || !verification.eventId || !verification.sessionId) {
          return json({
            valid: false,
            error: verification.error || "Token QR tidak valid."
          }, 400);
        }

        if (
          typeof body.eventId === "string" &&
          body.eventId !== verification.eventId
        ) {
          return json({
            valid: false,
            error: "Token QR tidak sesuai dengan kegiatan yang dipilih."
          }, 400);
        }

        const session = await validateOpenQrEvent(
          env,
          verification.eventId,
          verification.sessionId
        );

        if (!session.event) {
          return json({
            valid: false,
            error: session.error || "Sesi presensi tidak aktif."
          }, session.status || 409);
        }

        return json({
          valid: true,
          eventId: verification.eventId,
          sessionId: verification.sessionId,
          timestamp: verification.timestamp
        });
      } catch {
        return json({ valid: false, error: "Gagal memverifikasi QR." }, 503);
      }
    }

    if (path === "/api/attendance/scan" && request.method === "POST") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }
      if (!env.QR_HMAC_SECRET || env.QR_HMAC_SECRET.length < 32) {
        return json({ success: false, error: "Secret QR belum dikonfigurasi." }, 503);
      }

      const body = await readBody(request);
      if (!body || typeof body.token !== "string") {
        return json({ success: false, error: "Token QR tidak ditemukan." }, 400);
      }

      try {
        const verification = await verifyWorkerQrToken(
          body.token,
          env.QR_HMAC_SECRET
        );

        if (!verification.valid || !verification.eventId || !verification.sessionId) {
          return json({
            success: false,
            error: verification.error || "Token QR tidak valid."
          }, 400);
        }

        if (
          typeof body.eventId === "string" &&
          body.eventId !== verification.eventId
        ) {
          return json({
            success: false,
            error: "Token QR tidak sesuai dengan kegiatan yang dipilih."
          }, 400);
        }

        const session = await validateOpenQrEvent(
          env,
          verification.eventId,
          verification.sessionId
        );

        if (!session.event) {
          return json({
            success: false,
            error: session.error || "Sesi presensi tidak aktif."
          }, session.status || 409);
        }

        const event = session.event;
        const existing = await env.DB.prepare(
          `SELECT * FROM attendance_records
            WHERE event_id = ? AND user_id = ?
            LIMIT 1`
        ).bind(event.id, auth.user.id).first<AttendanceRow>();

        if (existing) {
          return json({
            success: true,
            duplicate: true,
            record: mapAttendanceRecord(existing)
          });
        }

        const now = new Date().toISOString();
        const record: AttendanceRow = {
          id: `att_${crypto.randomUUID()}`,
          event_id: event.id,
          event_title: event.title,
          event_date: event.event_date,
          user_id: auth.user.id,
          user_email: auth.user.email,
          user_name: auth.user.name,
          user_npp: auth.user.npp,
          user_jabatan: auth.user.jabatan,
          user_whatsapp: auth.user.whatsapp || null,
          scan_time: now,
          attendance_status: "HADIR",
          signature_status: "MENUNGGU_KONFIRMASI",
          signature_data: null,
          signature_timestamp: null,
          verified_by: "system-qr",
          notes: null,
          created_at: now,
          updated_at: now
        };

        try {
          const results = await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO attendance_records (
                id, event_id, event_title, event_date,
                user_id, user_email, user_name, user_npp,
                user_jabatan, user_whatsapp, scan_time,
                attendance_status, signature_status, signature_data,
                signature_timestamp, verified_by, notes, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              record.id, record.event_id, record.event_title, record.event_date,
              record.user_id, record.user_email, record.user_name, record.user_npp,
              record.user_jabatan, record.user_whatsapp, record.scan_time,
              record.attendance_status, record.signature_status, record.signature_data,
              record.signature_timestamp, record.verified_by, record.notes,
              record.created_at, record.updated_at
            ),
            env.DB.prepare(
              `INSERT INTO audit_logs (
                id, action, actor_email, actor_name, actor_role,
                target_type, target_id, description, details_json, timestamp
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              `audit_${crypto.randomUUID()}`,
              "SCAN_QR_SUCCESS",
              auth.user.email,
              auth.user.name,
              auth.user.role,
              "ATTENDANCE_RECORD",
              record.id,
              `Presensi berhasil via QR untuk kegiatan "${event.title}". Menunggu tanda tangan.`,
              JSON.stringify({ eventId: event.id, userId: auth.user.id }),
              now
            )
          ]);

          if (results.some(result => !result.success)) {
            throw new Error("Batch D1 gagal.");
          }

          return json({
            success: true,
            duplicate: false,
            record: mapAttendanceRecord(record)
          }, 201);
        } catch (writeError) {
          // Unique(event_id, user_id) tetap menjadi perlindungan terhadap scan bersamaan.
          const duplicate = await env.DB.prepare(
            `SELECT * FROM attendance_records
              WHERE event_id = ? AND user_id = ?
              LIMIT 1`
          ).bind(event.id, auth.user.id).first<AttendanceRow>();

          if (duplicate) {
            return json({
              success: true,
              duplicate: true,
              record: mapAttendanceRecord(duplicate)
            });
          }

          throw writeError;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        console.error("Attendance scan error:", message);
        return json({ success: false, error: "Gagal menyimpan presensi ke D1." }, 503);
      }
    }


    if (path === "/api/attendance" && request.method === "GET") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }

      const eventId = url.searchParams.get("eventId");

      try {
        let rows: AttendanceRow[];

        if (auth.user.role === "ADMIN" && eventId) {
          const result = await env.DB.prepare(
            `SELECT * FROM attendance_records
              WHERE event_id = ?
              ORDER BY scan_time DESC LIMIT 2000`
          ).bind(eventId).all<AttendanceRow>();
          rows = result.results;
        } else if (auth.user.role === "ADMIN") {
          const result = await env.DB.prepare(
            `SELECT * FROM attendance_records
              ORDER BY scan_time DESC LIMIT 5000`
          ).all<AttendanceRow>();
          rows = result.results;
        } else {
          const result = await env.DB.prepare(
            `SELECT * FROM attendance_records
              WHERE user_id = ?
              ORDER BY scan_time DESC LIMIT 1000`
          ).bind(auth.user.id).all<AttendanceRow>();
          rows = result.results;
        }

        return json({
          success: true,
          records: rows.map(mapAttendanceRecord)
        });
      } catch {
        return json({ success: false, error: "Gagal membaca presensi dari D1." }, 503);
      }
    }

    const signatureRoute = path.match(/^\/api\/attendance\/([^/]+)\/signature$/);

    if (signatureRoute && request.method === "PUT") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }

      let recordId: string;
      try {
        recordId = decodeURIComponent(signatureRoute[1]);
      } catch {
        return json({ success: false, error: "ID presensi tidak valid." }, 400);
      }

      const body = await readBody(request);
      const signatureData = body?.signatureData;

      if (
        typeof signatureData !== "string" ||
        signatureData.length > 900000 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(signatureData)
      ) {
        return json({
          success: false,
          error: "Format tanda tangan tidak valid atau ukuran terlalu besar."
        }, 400);
      }

      try {
        const existing = await env.DB.prepare(
          "SELECT * FROM attendance_records WHERE id = ? LIMIT 1"
        ).bind(recordId).first<AttendanceRow>();

        if (!existing) {
          return json({ success: false, error: "Data presensi tidak ditemukan." }, 404);
        }

        if (existing.user_id !== auth.user.id) {
          return json({
            success: false,
            error: "Anda hanya dapat mengonfirmasi tanda tangan presensi milik sendiri."
          }, 403);
        }

        if (existing.signature_status === "TERKONFIRMASI") {
          return json({
            success: true,
            alreadyConfirmed: true,
            record: mapAttendanceRecord(existing)
          });
        }

        const now = new Date().toISOString();

        const results = await env.DB.batch([
          env.DB.prepare(
            `UPDATE attendance_records
                SET signature_status = 'TERKONFIRMASI',
                    signature_data = ?,
                    signature_timestamp = ?,
                    updated_at = ?
              WHERE id = ?
                AND user_id = ?
                AND signature_status = 'MENUNGGU_KONFIRMASI'`
          ).bind(signatureData, now, now, recordId, auth.user.id),

          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "CONFIRM_ATTENDANCE_SIGNATURE",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "ATTENDANCE_RECORD",
            recordId,
            `Mengonfirmasi tanda tangan presensi untuk kegiatan "${existing.event_title}".`,
            JSON.stringify({ eventId: existing.event_id }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Pembaruan D1 gagal.");
        }

        const updated = await env.DB.prepare(
          "SELECT * FROM attendance_records WHERE id = ? LIMIT 1"
        ).bind(recordId).first<AttendanceRow>();

        if (!updated) {
          return json({ success: false, error: "Data presensi tidak ditemukan setelah pembaruan." }, 404);
        }

        if (updated.signature_status !== "TERKONFIRMASI") {
          return json({
            success: false,
            error: "Presensi sudah berubah. Muat ulang data sebelum mencoba lagi."
          }, 409);
        }

        return json({ success: true, record: mapAttendanceRecord(updated) });
      } catch {
        return json({
          success: false,
          error: "Gagal menyimpan tanda tangan ke D1."
        }, 503);
      }
    }



    // BPAIK_CORRECTION_AND_LEAVE_ROUTES


    const attendanceDeleteRoute = path.match(/^\/api\/attendance\/([^/]+)$/);
    if (attendanceDeleteRoute && request.method === "DELETE") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error }, auth.status);
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat menghapus presensi." }, 403);
      }

      let recordId: string;
      try {
        recordId = decodeURIComponent(attendanceDeleteRoute[1]);
      } catch {
        return json({ success: false, error: "ID presensi tidak valid." }, 400);
      }

      try {
        const record = await env.DB.prepare(
          `SELECT id, event_id, event_title, user_id, user_name,
                  user_email, attendance_status
             FROM attendance_records WHERE id = ? LIMIT 1`
        ).bind(recordId).first<{
          id: string;
          event_id: string;
          event_title: string;
          user_id: string;
          user_name: string;
          user_email: string;
          attendance_status: string;
        }>();

        if (!record) {
          return json({ success: false, error: "Catatan presensi tidak ditemukan." }, 404);
        }

        const now = new Date().toISOString();
        const results = await env.DB.batch([
          env.DB.prepare("DELETE FROM attendance_records WHERE id = ?").bind(recordId),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "DELETE_ATTENDANCE",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "ATTENDANCE_RECORD",
            recordId,
            `Menghapus presensi ${record.user_name} pada kegiatan ${record.event_title}`,
            JSON.stringify({
              eventId: record.event_id,
              userId: record.user_id,
              userEmail: record.user_email,
              previousStatus: record.attendance_status
            }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Penghapusan presensi gagal.");
        }

        return json({ success: true, deletedRecordId: recordId });
      } catch (error) {
        console.error("Delete attendance error:", error);
        return json({ success: false, error: "Gagal menghapus presensi dari D1." }, 503);
      }
    }

    const correctionRoute = path.match(/^\/api\/attendance\/([^/]+)\/correction$/);
    if (correctionRoute && request.method === "PUT") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error }, auth.status);
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat mengoreksi presensi." }, 403);
      }

      let recordId: string;
      try {
        recordId = decodeURIComponent(correctionRoute[1]);
      } catch {
        return json({ success: false, error: "ID presensi tidak valid." }, 400);
      }

      const body = await readBody(request);
      const status = body?.attendanceStatus;
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

      if (!["HADIR", "IZIN", "SAKIT", "ALPA"].includes(String(status)) ||
          !reason || reason.length > 2000) {
        return json({ success: false, error: "Status dan alasan koreksi wajib diisi." }, 400);
      }

      try {
        const record = await env.DB.prepare(
          "SELECT * FROM attendance_records WHERE id = ? LIMIT 1"
        ).bind(recordId).first<AttendanceRow>();
        if (!record) {
          return json({ success: false, error: "Data presensi tidak ditemukan." }, 404);
        }

        const now = new Date().toISOString();
        const note = `Koreksi manual oleh ${auth.user.name} (${auth.user.email}): ${reason} [Sebelumnya: ${record.attendance_status}]`;

        const results = await env.DB.batch([
          env.DB.prepare(
            `UPDATE attendance_records
                SET attendance_status = ?, verified_by = ?, notes = ?, updated_at = ?
              WHERE id = ?`
          ).bind(status, auth.user.email, note, now, recordId),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "MANUAL_CORRECTION",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "ATTENDANCE_RECORD",
            recordId,
            `Koreksi presensi ${record.user_name}: ${record.attendance_status} -> ${status}. Alasan: ${reason}`,
            JSON.stringify({
              oldStatus: record.attendance_status,
              newStatus: status,
              reason
            }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Batch koreksi gagal.");
        }
        return json({ success: true });
      } catch {
        return json({ success: false, error: "Gagal menyimpan koreksi presensi ke D1." }, 503);
      }
    }


    if (path === "/api/audit" && request.method === "DELETE") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
      }
      if (auth.user.role !== "ADMIN") {
        return json({
          success: false,
          error: "Hanya admin yang dapat menghapus audit log."
        }, 403);
      }

      const body = await readBody(request);
      if (!body) {
        return json({ success: false, error: "Isi permintaan tidak valid." }, 400);
      }

      const deleteAll = body.all === true;
      let ids: string[] = [];

      if (!deleteAll) {
        const rawIds = body.ids;
        if (
          !Array.isArray(rawIds) ||
          rawIds.length < 1 ||
          rawIds.length > 500 ||
          rawIds.some(id =>
            typeof id !== "string" || id.trim().length === 0 || id.length > 200
          )
        ) {
          return json({
            success: false,
            error: "Pilih minimal satu riwayat dan maksimal 500 riwayat per aksi."
          }, 400);
        }

        ids = [...new Set(rawIds as string[])];
      }

      try {
        let deletedCount: number;

        if (deleteAll) {
          const countRow = await env.DB.prepare(
            "SELECT COUNT(*) AS count FROM audit_logs"
          ).first<{ count: number }>();

          deletedCount = Number(countRow?.count ?? 0);
        } else {
          const placeholders = ids.map(() => "?").join(", ");
          const countRow = await env.DB.prepare(
            `SELECT COUNT(*) AS count
               FROM audit_logs
              WHERE id IN (${placeholders})`
          ).bind(...ids).first<{ count: number }>();

          deletedCount = Number(countRow?.count ?? 0);
        }

        const now = new Date().toISOString();
        const deleteStatement = deleteAll
          ? env.DB.prepare("DELETE FROM audit_logs")
          : env.DB.prepare(
              `DELETE FROM audit_logs WHERE id IN (${ids.map(() => "?").join(", ")})`
            ).bind(...ids);

        const action = deleteAll ? "CLEAR_AUDIT_LOGS" : "DELETE_AUDIT_LOGS";
        const description = deleteAll
          ? `Membersihkan seluruh audit log (${deletedCount} catatan)`
          : `Menghapus ${deletedCount} audit log terpilih`;

        // Batch ini membuat penghapusan dan audit aksi berada dalam
        // satu transaksi D1. Catatan baru tidak ikut terhapus.
        const results = await env.DB.batch([
          deleteStatement,
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            action,
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "AUDIT_LOG",
            "bulk",
            description,
            JSON.stringify({
              deleteAll,
              requestedIds: deleteAll ? [] : ids,
              deletedCount
            }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Operasi audit log tidak berhasil.");
        }

        return json({
          success: true,
          deletedCount,
          message: deleteAll
            ? `Pembersihan selesai. ${deletedCount} catatan lama dihapus.`
            : `${deletedCount} catatan audit dihapus.`
        });
      } catch (error) {
        console.error("Audit deletion error:", error);
        return json({
          success: false,
          error: "Gagal menghapus audit log dari D1."
        }, 503);
      }
    }

    if (path === "/api/audit" && request.method === "GET") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error }, auth.status);
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat melihat audit log." }, 403);
      }

      try {
        const result = await env.DB.prepare(
          `SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500`
        ).all<AuditApiRow>();

        return json({
          success: true,
          logs: result.results.map(row => ({
            id: row.id,
            action: row.action,
            actorEmail: row.actor_email,
            actorName: row.actor_name,
            actorRole: row.actor_role,
            targetType: row.target_type,
            targetId: row.target_id,
            description: row.description,
            details: row.details_json,
            timestamp: row.timestamp
          }))
        });
      } catch {
        return json({ success: false, error: "Gagal membaca audit log D1." }, 503);
      }
    }


    const leaveDeleteRoute = path.match(/^\/api\/leaves\/([^/]+)$/);
    if (leaveDeleteRoute && request.method === "DELETE") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error }, auth.status);

      if (auth.user.role !== "ADMIN") {
        return json({
          success: false,
          error: "Hanya admin yang dapat menghapus pengajuan izin."
        }, 403);
      }

      let leaveId: string;
      try {
        leaveId = decodeURIComponent(leaveDeleteRoute[1]);
      } catch {
        return json({ success: false, error: "ID pengajuan izin tidak valid." }, 400);
      }

      try {
        const leave = await env.DB.prepare(
          `SELECT id, user_name, user_email, event_title, status
             FROM leave_requests WHERE id = ? LIMIT 1`
        ).bind(leaveId).first<{
          id: string;
          user_name: string;
          user_email: string;
          event_title: string;
          status: string;
        }>();

        if (!leave) {
          return json({ success: false, error: "Pengajuan izin tidak ditemukan." }, 404);
        }

        const now = new Date().toISOString();
        const results = await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM leave_requests WHERE id = ?"
          ).bind(leaveId),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "DELETE_LEAVE_REQUEST",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "LEAVE_REQUEST",
            leaveId,
            `Menghapus pengajuan izin ${leave.user_name} untuk kegiatan ${leave.event_title}`,
            JSON.stringify({
              userEmail: leave.user_email,
              eventTitle: leave.event_title,
              previousStatus: leave.status
            }),
            now
          )
        ]);

        if (results.some(result => !result.success)) {
          throw new Error("Operasi hapus izin gagal.");
        }

        return json({
          success: true,
          deletedId: leaveId,
          message: "Pengajuan izin berhasil dihapus."
        });
      } catch (error) {
        console.error("Delete leave request error:", error);
        return json({
          success: false,
          error: "Gagal menghapus pengajuan izin dari D1."
        }, 503);
      }
    }

    if (path === "/api/leaves" && request.method === "GET") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error }, auth.status);

      try {
        const result = auth.user.role === "ADMIN"
          ? await env.DB.prepare(
              "SELECT * FROM leave_requests ORDER BY created_at DESC LIMIT 2000"
            ).all<LeaveApiRow>()
          : await env.DB.prepare(
              "SELECT * FROM leave_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 500"
            ).bind(auth.user.id).all<LeaveApiRow>();

        return json({
          success: true,
          leaves: result.results.map(mapLeaveApiRow)
        });
      } catch {
        return json({ success: false, error: "Gagal membaca pengajuan izin dari D1." }, 503);
      }
    }

    if (path === "/api/leaves" && request.method === "POST") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error }, auth.status);
      if (auth.user.role !== "PESERTA") {
        return json({ success: false, error: "Hanya peserta yang dapat mengajukan izin." }, 403);
      }

      const body = await readBody(request);
      const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

      if (!eventId || !reason || reason.length > 2000) {
        return json({ success: false, error: "Kegiatan dan alasan izin wajib diisi." }, 400);
      }

      try {
        const event = await getEventForQr(env, eventId);
        if (!event || event.status === "dibatalkan") {
          return json({ success: false, error: "Kegiatan tidak ditemukan atau dibatalkan." }, 404);
        }

        const pending = await env.DB.prepare(
          `SELECT id FROM leave_requests
            WHERE event_id = ? AND user_id = ? AND status = 'MENUNGGU_ACC'
            LIMIT 1`
        ).bind(eventId, auth.user.id).first<{ id: string }>();

        if (pending) {
          return json({ success: false, error: "Pengajuan izin untuk kegiatan ini masih menunggu persetujuan." }, 409);
        }

        const now = new Date().toISOString();
        const id = `leave_${crypto.randomUUID()}`;
        const leave: LeaveApiRow = {
          id,
          user_id: auth.user.id,
          user_name: auth.user.name,
          user_email: auth.user.email,
          user_npp: auth.user.npp,
          user_jabatan: auth.user.jabatan,
          user_whatsapp: auth.user.whatsapp,
          event_id: event.id,
          event_title: event.title,
          event_date: event.event_date,
          reason,
          status: "MENUNGGU_ACC",
          reviewed_by: null,
          reviewed_at: null,
          admin_notes: null,
          created_at: now,
          updated_at: now
        };

        const results = await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO leave_requests (
              id, user_id, user_name, user_email, user_npp, user_jabatan,
              user_whatsapp, event_id, event_title, event_date, reason,
              status, reviewed_by, reviewed_at, admin_notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            leave.id, leave.user_id, leave.user_name, leave.user_email,
            leave.user_npp, leave.user_jabatan, leave.user_whatsapp,
            leave.event_id, leave.event_title, leave.event_date, leave.reason,
            leave.status, leave.reviewed_by, leave.reviewed_at, leave.admin_notes,
            leave.created_at, leave.updated_at
          ),
          env.DB.prepare(
            `INSERT INTO audit_logs (
              id, action, actor_email, actor_name, actor_role,
              target_type, target_id, description, details_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            `audit_${crypto.randomUUID()}`,
            "SUBMIT_LEAVE",
            auth.user.email,
            auth.user.name,
            auth.user.role,
            "LEAVE_REQUEST",
            id,
            `Mengajukan izin untuk kegiatan: ${event.title}`,
            JSON.stringify({ eventId, reason }),
            now
          )
        ]);

        if (results.some(result => !result.success)) throw new Error("Batch izin gagal.");
        return json({ success: true, leave: mapLeaveApiRow(leave) }, 201);
      } catch {
        return json({ success: false, error: "Gagal menyimpan pengajuan izin ke D1." }, 503);
      }
    }

    const leaveReviewRoute = path.match(/^\/api\/leaves\/([^/]+)\/review$/);
    if (leaveReviewRoute && request.method === "POST") {
      const auth = await getSessionUserForApi(request, env);
      if (!auth.ok) return json({ success: false, error: auth.error }, auth.status);
      if (auth.user.role !== "ADMIN") {
        return json({ success: false, error: "Hanya admin yang dapat memutuskan pengajuan izin." }, 403);
      }

      let leaveId: string;
      try {
        leaveId = decodeURIComponent(leaveReviewRoute[1]);
      } catch {
        return json({ success: false, error: "ID pengajuan izin tidak valid." }, 400);
      }

      const body = await readBody(request);
      const decision = body?.decision;
      const adminNotes = typeof body?.adminNotes === "string" ? body.adminNotes.trim() : "";

      if (decision !== "DISETUJUI" && decision !== "DITOLAK") {
        return json({ success: false, error: "Keputusan izin tidak valid." }, 400);
      }

      try {
        const leave = await env.DB.prepare(
          "SELECT * FROM leave_requests WHERE id = ? LIMIT 1"
        ).bind(leaveId).first<LeaveApiRow>();

        if (!leave) return json({ success: false, error: "Pengajuan izin tidak ditemukan." }, 404);
        if (leave.status !== "MENUNGGU_ACC") {
          return json({ success: false, error: "Pengajuan izin sudah diproses." }, 409);
        }

        const now = new Date().toISOString();
        const statements = [
          env.DB.prepare(
            `UPDATE leave_requests
                SET status = ?, reviewed_by = ?, reviewed_at = ?,
                    admin_notes = ?, updated_at = ?
              WHERE id = ? AND status = 'MENUNGGU_ACC'`
          ).bind(decision, auth.user.email, now, adminNotes, now, leaveId)
        ];

        if (decision === "DISETUJUI") {
          const existing = await env.DB.prepare(
            `SELECT id FROM attendance_records
              WHERE event_id = ? AND user_id = ? LIMIT 1`
          ).bind(leave.event_id, leave.user_id).first<{ id: string }>();

          const attendanceId = `att_izin_${leave.id}`;
          const notes = `Disetujui Admin BPAIK (${auth.user.name}): ${leave.reason}`;

          if (existing) {
            statements.push(env.DB.prepare(
              `UPDATE attendance_records
                  SET attendance_status = 'IZIN',
                      signature_status = 'TERKONFIRMASI',
                      verified_by = ?,
                      notes = ?,
                      updated_at = ?
                WHERE id = ?`
            ).bind(auth.user.email, notes, now, existing.id));
          } else {
            statements.push(env.DB.prepare(
              `INSERT INTO attendance_records (
                id, event_id, event_title, event_date, user_id,
                user_email, user_name, user_npp, user_jabatan,
                user_whatsapp, scan_time, attendance_status,
                signature_status, signature_data, signature_timestamp,
                verified_by, notes, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IZIN',
                        'TERKONFIRMASI', NULL, NULL, ?, ?, ?, ?)`
            ).bind(
              attendanceId, leave.event_id, leave.event_title, leave.event_date,
              leave.user_id, leave.user_email, leave.user_name, leave.user_npp,
              leave.user_jabatan, leave.user_whatsapp, now,
              auth.user.email, notes, now, now
            ));
          }
        }

        statements.push(env.DB.prepare(
          `INSERT INTO audit_logs (
            id, action, actor_email, actor_name, actor_role,
            target_type, target_id, description, details_json, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          `audit_${crypto.randomUUID()}`,
          decision === "DISETUJUI" ? "APPROVE_LEAVE" : "REJECT_LEAVE",
          auth.user.email,
          auth.user.name,
          auth.user.role,
          "LEAVE_REQUEST",
          leaveId,
          `${decision === "DISETUJUI" ? "Menyetujui" : "Menolak"} izin ${leave.user_name} untuk kegiatan: ${leave.event_title}`,
          JSON.stringify({ decision, adminNotes }),
          now
        ));

        const results = await env.DB.batch(statements);
        if (results.some(result => !result.success)) throw new Error("Batch review izin gagal.");

        return json({ success: true, decision });
      } catch {
        return json({ success: false, error: "Gagal menyimpan keputusan izin ke D1." }, 503);
      }
    }

    if (path.startsWith("/api/")) {
      return json({
        success: false,
        error: "Endpoint ini belum dimigrasikan ke Cloudflare Worker."
      }, 501);
    }

    return env.ASSETS.fetch(request);
  }
};
