import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { PegawaiView } from './components/PegawaiView';
import { AdminPortal } from './components/AdminPortal';
import { ProjectorQrView } from './components/ProjectorQrView';
import { QrScannerModal } from './components/QrScannerModal';
import { AttendanceSuccessModal } from './components/AttendanceSuccessModal';
import { SignaturePadModal } from './components/SignaturePadModal';
import { normalizeCardQrPayload } from './utils/cardQr';
import { BPAIKEvent, AttendanceRecord, BPAIKUser, AuditLog } from './types';

// Always scroll to top when route changes: "buka antar halaman mulai dari atas"
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);
  return null;
}

// Proyektor Route Page Component
function ProyektorRouteView({ events }: { events: BPAIKEvent[] }) {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const targetEvent = events.find(e => e.id === eventId);

  if (!targetEvent) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold font-islamic mb-2">Kegiatan Tidak Ditemukan</h2>
        <p className="text-xs text-slate-400 mb-6">Agenda kegiatan dengan ID "{eventId}" tidak terdaftar di sistem.</p>
        <button
          onClick={() => navigate('/kegiatan')}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold cursor-pointer"
        >
          Kembali ke Jadwal Kegiatan
        </button>
      </div>
    );
  }

  return (
    <ProjectorQrView
      event={targetEvent}
      onBack={() => navigate('/kegiatan')}
    />
  );
}

function MainAppContent() {
  const { bpaikUser, isLoading, logout, loginWithCardQr } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const autoCardQrAttemptRef = useRef<string | null>(null);
  const loginWithCardQrRef = useRef(loginWithCardQr);
  loginWithCardQrRef.current = loginWithCardQr;

  useEffect(() => {
    if (isLoading) return;

    const fragment = window.location.hash.slice(1).trim();
    if (!fragment) return;

    const code = normalizeCardQrPayload(fragment);
    if (!/^BPAIK-[A-Za-z0-9_-]{8,}$/i.test(code)) return;
    if (autoCardQrAttemptRef.current === code) return;

    autoCardQrAttemptRef.current = code;
    void loginWithCardQrRef.current(code).then(() => {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`
      );
    }).catch(() => {
      // AuthContext menampilkan error login; fragmen tetap ada untuk diagnosis.
    });
  }, [isLoading]);

  // Firestore collections state with rich defaults
  const [events, setEvents] = useState<BPAIKEvent[]>([]);
  const [employees, setEmployees] = useState<BPAIKUser[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [eventsReloadKey, setEventsReloadKey] = useState(0);
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  const [attendanceReloadKey, setAttendanceReloadKey] = useState(0);
  const [auditReloadKey, setAuditReloadKey] = useState(0);

  const refreshAppData = () => {
    setEventsReloadKey(value => value + 1);
    setUsersReloadKey(value => value + 1);
    setAttendanceReloadKey(value => value + 1);
    setAuditReloadKey(value => value + 1);
  };

  // Modals & Flows
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [justScannedRecord, setJustScannedRecord] = useState<AttendanceRecord | null>(null);
  const [recordForSignature, setRecordForSignature] = useState<AttendanceRecord | null>(null);

  // User login landing route enforcement:
  // "setiap login, masuknya ke dashboard dlu, atau beranda buat user"
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!bpaikUser) {
      prevUserIdRef.current = null;
      return;
    }

    const isFirstLogin = prevUserIdRef.current !== bpaikUser.id;
    prevUserIdRef.current = bpaikUser.id;

    const currentPath = location.pathname;

    if (isFirstLogin || currentPath === '/' || currentPath === '') {
      if (bpaikUser.role === 'ADMIN') {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/beranda', { replace: true });
      }
    }
  }, [bpaikUser, navigate, location.pathname]);

  // Sync Events from Cloudflare Worker / D1
  useEffect(() => {
    if (!bpaikUser) {
      setEvents([]);
      return;
    }

    const controller = new AbortController();

    const loadEvents = async () => {
      try {
        const response = await fetch('/api/events', {
          method: 'GET',
          credentials: 'same-origin',
          signal: controller.signal
        });

        const payload = await response.json() as {
          success?: boolean;
          events?: BPAIKEvent[];
          error?: string;
        };

        if (!response.ok || payload.success !== true || !Array.isArray(payload.events)) {
          throw new Error(payload.error || 'Gagal mengambil kegiatan dari D1.');
        }

        const list = [...payload.events].sort(
          (a, b) => b.date.localeCompare(a.date)
        );
        setEvents(list);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('D1 events sync error:', error);
      }
    };

    void loadEvents();
    return () => controller.abort();
  }, [bpaikUser?.id, eventsReloadKey]);

  // Sync users from Cloudflare Worker / D1 (admin only)
  useEffect(() => {
    if (!bpaikUser || bpaikUser.role !== 'ADMIN') {
      setEmployees([]);
      return;
    }

    const controller = new AbortController();

    const loadUsers = async () => {
      try {
        const response = await fetch('/api/users', {
          method: 'GET',
          credentials: 'same-origin',
          signal: controller.signal
        });

        const payload = await response.json() as {
          success?: boolean;
          users?: BPAIKUser[];
          error?: string;
        };

        if (!response.ok || payload.success !== true || !Array.isArray(payload.users)) {
          throw new Error(payload.error || 'Gagal mengambil pengguna dari D1.');
        }

        setEmployees(
          [...payload.users].sort((a, b) => a.name.localeCompare(b.name))
        );
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('D1 users sync error:', error);
      }
    };

    void loadUsers();
    return () => controller.abort();
  }, [bpaikUser?.id, bpaikUser?.role, usersReloadKey]);

  // Sync attendance from Worker / D1
  useEffect(() => {
    if (!bpaikUser) {
      setAttendanceRecords([]);
      return;
    }

    let active = true;
    const loadAttendance = async () => {
      try {
        const response = await fetch('/api/attendance', {
          credentials: 'same-origin'
        });
        const payload = await response.json() as {
          success?: boolean;
          records?: AttendanceRecord[];
          error?: string;
        };
        if (!response.ok || payload.success !== true || !Array.isArray(payload.records)) {
          throw new Error(payload.error || 'Gagal membaca presensi dari D1.');
        }
        if (active) setAttendanceRecords(payload.records);
      } catch (error) {
        if (active) console.error('D1 attendance sync error:', error);
      }
    };

    void loadAttendance();
    const interval = setInterval(() => void loadAttendance(), 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [bpaikUser?.id, bpaikUser?.role, attendanceReloadKey]);

  // Sync audit log from Worker / D1 (admin only)
  useEffect(() => {
    if (!bpaikUser || bpaikUser.role !== 'ADMIN') {
      setAuditLogs([]);
      return;
    }

    let active = true;
    const loadAudit = async () => {
      try {
        const response = await fetch('/api/audit', {
          credentials: 'same-origin'
        });
        const payload = await response.json() as {
          success?: boolean;
          logs?: AuditLog[];
          error?: string;
        };
        if (!response.ok || payload.success !== true || !Array.isArray(payload.logs)) {
          throw new Error(payload.error || 'Gagal membaca audit log dari D1.');
        }
        if (active) setAuditLogs(payload.logs);
      } catch (error) {
        if (active) console.error('D1 audit sync error:', error);
      }
    };

    void loadAudit();
    const interval = setInterval(() => void loadAudit(), 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [bpaikUser?.id, bpaikUser?.role, auditReloadKey]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-bold text-lg animate-bounce shadow-md">
          BP
        </div>
        <p className="mt-3 text-xs font-semibold text-emerald-900">Memuat Sistem Absensi BPAIK...</p>
        <p className="text-[11px] text-slate-400">Universitas 'Aisyiyah Bandung</p>
      </div>
    );
  }

  if (!bpaikUser) {
    return <LoginScreen />;
  }

  // Active events for scanner (strictly events where sessionStatus === 'aktif')
  const activeEvents = events.filter(e => e.sessionStatus === 'aktif');

  return (
    <div className="min-h-screen bg-slate-100 font-sans antialiased text-slate-900">
      <ScrollToTop />

      <Routes>
        {/* Proyektor Screen dedicated route */}
        <Route path="/proyektor/:eventId" element={<ProyektorRouteView events={events} />} />

        {/* Admin and Peserta Multi-page Routes */}
        <Route
          path="*"
          element={
            bpaikUser.role === 'ADMIN' ? (
              <AdminPortal
                currentUser={bpaikUser}
                events={events}
                employees={employees}
                attendanceRecords={attendanceRecords}
                auditLogs={auditLogs}
                onOpenProjectorQr={(event) => navigate(`/proyektor/${event.id}`)}
                onRefreshData={refreshAppData}
                onLogout={logout}
              />
            ) : (
              <PegawaiView
                user={bpaikUser}
                events={events}
                attendanceRecords={attendanceRecords}
                onOpenScanner={() => setIsScannerOpen(true)}
                onOpenSignPad={(record) => setRecordForSignature(record)}
                onLogout={logout}
              />
            )
          }
        />
      </Routes>

      {/* QR SCANNER MODAL */}
      {isScannerOpen && (
        <QrScannerModal
          user={bpaikUser}
          activeEvents={activeEvents}
          onAttendanceRecorded={(record) => {
            setIsScannerOpen(false);
            setJustScannedRecord(record);
          }}
          onClose={() => setIsScannerOpen(false)}
        />
      )}

      {/* ATTENDANCE SUCCESS CONFIRMATION MODAL (Step 1 mandatory popup) */}
      {justScannedRecord && (
        <AttendanceSuccessModal
          record={justScannedRecord}
          onProceedToSign={() => {
            const rec = justScannedRecord;
            setJustScannedRecord(null);
            setRecordForSignature(rec);
          }}
        />
      )}

      {/* DIGITAL SIGNATURE ARTBOARD MODAL (Step 2 mandatory signature) */}
      {recordForSignature && (
        <SignaturePadModal
          record={recordForSignature}
          onSuccess={() => {
            setRecordForSignature(null);
          }}
          onClose={() => setRecordForSignature(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MainAppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
