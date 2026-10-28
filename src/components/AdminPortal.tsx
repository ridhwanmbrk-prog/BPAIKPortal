import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  CalendarDays, 
  QrCode, 
  FileSpreadsheet, 
  Settings, 
  Plus, 
  Upload, 
  Download, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Eye, 
  Play, 
  Square, 
  ShieldCheck, 
  AlertTriangle, 
  UserCheck, 
  History, 
  FileText, 
  ChevronRight,
  LogOut,
  Check,
  X,
  Menu,
  FileCheck,
  HelpCircle,
  Save,
  Bell,
  UserPlus,
  Edit2,
  Shield,
  Printer,
  CreditCard
} from 'lucide-react';
import { BPAIKUser, BPAIKEvent, AttendanceRecord, AuditLog, LeaveRequest } from '../types';
import { exportAttendanceToExcel, downloadParticipantTemplateExcel } from '../utils/reportExport';
import { AttendancePdfModal } from './AttendancePdfModal';
import { ParticipantCardModal } from './ParticipantCardModal';
import { UploadExcelModal } from './UploadExcelModal';
import { UploadPhotoZipModal } from './UploadPhotoZipModal';
import { SuratIzinPdfModal } from './SuratIzinPdfModal';
import { Footer, UnisaEmblem } from './Footer';

interface AdminPortalProps {
  currentUser: BPAIKUser;
  events: BPAIKEvent[];
  employees: BPAIKUser[];
  attendanceRecords: AttendanceRecord[];
  auditLogs: AuditLog[];
  onOpenProjectorQr: (event: BPAIKEvent) => void;
  onRefreshData: () => void;
  onLogout: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  currentUser,
  events,
  employees,
  attendanceRecords,
  auditLogs,
  onOpenProjectorQr,
  onRefreshData,
  onLogout
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const mainContentRef = useRef<HTMLDivElement | null>(null);

  const [activeMenu, setActiveMenu] = useState<'dashboard' | 'kegiatan' | 'perizinan' | 'pegawai' | 'rekap' | 'pengaturan' | 'audit'>('dashboard');
  const [selectedAuditIds, setSelectedAuditIds] = useState<string[]>([]);
  const [isDeletingAudit, setIsDeletingAudit] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // New Modals: Upload Excel, PDF with KOP, and ID Card printing
  const [showUploadExcelModal, setShowUploadExcelModal] = useState(false);
  const [showUploadPhotoZipModal, setShowUploadPhotoZipModal] = useState(false);
  const [pdfModalEvent, setPdfModalEvent] = useState<BPAIKEvent | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [selectedEmployeeForCard, setSelectedEmployeeForCard] = useState<BPAIKUser | null>(null);
  const [selectedLeaveForLetter, setSelectedLeaveForLetter] = useState<LeaveRequest | null>(null);
  const [deletingLeaveId, setDeletingLeaveId] = useState<string | null>(null);
  const [selectedAdminEventForDetail, setSelectedAdminEventForDetail] = useState<BPAIKEvent | null>(null);

  // Synchronize URL route with activeMenu & scroll to top: "buka antar halaman mulai dari atas"
  useEffect(() => {
    const rawPath = location.pathname.replace(/^\//, '').split('/')[0];
    if (['dashboard', 'kegiatan', 'perizinan', 'rekap', 'pengaturan', 'audit'].includes(rawPath)) {
      setActiveMenu(rawPath as any);
    } else if (rawPath === 'peserta' || rawPath === 'pegawai') {
      setActiveMenu('pegawai');
    } else if (rawPath === 'kartu') {
      setActiveMenu('pegawai');
      setShowCardModal(true);
    }

    // Always scroll to top when route changes
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    mainContentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  // Helper to switch menu, navigate URL, auto-hide mobile drawer, and immediately scroll to top
  const handleSelectMenu = (menuKey: typeof activeMenu) => {
    setActiveMenu(menuKey);
    setIsMobileMenuOpen(false);
    const targetPath = menuKey === 'pegawai' ? 'peserta' : menuKey;
    navigate(`/${targetPath}`);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    mainContentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  // Participant / User Management state (Tambah, Hapus, Penetapan User)
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<BPAIKUser | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState<'ALL' | 'ADMIN' | 'PESERTA'>('ALL');
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    email: '',
    npp: '',
    jabatan: '',
    whatsapp: '',
    role: 'PESERTA' as 'ADMIN' | 'PESERTA',
    status: 'aktif' as 'aktif' | 'nonaktif'
  });
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);

  // Leave Requests state
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveFilter, setLeaveFilter] = useState<'ALL' | 'MENUNGGU_ACC' | 'DISETUJUI' | 'DITOLAK'>('MENUNGGU_ACC');

  // Modals
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [showManualCorrectionModal, setShowManualCorrectionModal] = useState(false);
  const [selectedRecordToCorrect, setSelectedRecordToCorrect] = useState<AttendanceRecord | null>(null);

  // Form states for Event creation
  // Per requirements:
  // - Nama kegiatan sebagai judul
  // - Tanggal/jam dari s/d tanggal/jam (startDateTime & endDateTime)
  // - Bawahnya deskripsi panjang
  // - Durasi sesi QR dihitung setelah sesi dibuka (bukan jam kegiatan)
  const todayStr = new Date().toISOString().split('T')[0];
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    startDateTime: `${todayStr}T08:30`,
    endDateTime: `${todayStr}T11:45`,
    location: "Auditorium Gedung KH. Ahmad Dahlan Lt. 4 UNISA Bandung",
    sessionDurationMinutes: 60
  });

  // Filter states for Rekap
  const [rekapSearch, setRekapSearch] = useState('');
  const [selectedEventFilter, setSelectedEventFilter] = useState('ALL');
  const [selectedSigStatusFilter, setSelectedSigStatusFilter] = useState('ALL');

  // Manual correction state
  const [correctionStatus, setCorrectionStatus] = useState<'HADIR' | 'IZIN' | 'SAKIT' | 'ALPA'>('HADIR');
  const [correctionReason, setCorrectionReason] = useState('');
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);

  // Settings State
  const [settingsForm, setSettingsForm] = useState({
    defaultSessionMinutes: 60,
    requireSignature: true,
    allowBackupCardScan: true,
    autoCloseExpiredSession: true
  });
  const [settingsSavedMsg, setSettingsSavedMsg] = useState(false);

  // Sync leave requests from Worker / D1
  useEffect(() => {
    let active = true;

    const loadLeaves = async () => {
      try {
        const response = await fetch('/api/leaves', { credentials: 'same-origin' });
        const payload = await response.json() as {
          success?: boolean;
          leaves?: LeaveRequest[];
          error?: string;
        };
        if (!response.ok || payload.success !== true || !Array.isArray(payload.leaves)) {
          throw new Error(payload.error || 'Gagal membaca pengajuan izin.');
        }
        if (active) {
          setLeaveRequests(
            [...payload.leaves].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
          );
        }
      } catch (error) {
        if (active) console.error('D1 leave sync error:', error);
      }
    };

    void loadLeaves();
    const interval = setInterval(() => void loadLeaves(), 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Quick stats
  const totalEvents = events.length;
  const activeEvents = events.filter(e => e.status === 'berlangsung' || e.sessionStatus === 'aktif').length;
  const totalHadir = attendanceRecords.filter(r => r.attendanceStatus === 'HADIR').length;
  const pendingLeaves = leaveRequests.filter(l => l.status === 'MENUNGGU_ACC').length;

  // Filtered attendance list
  const filteredRecords = attendanceRecords.filter(r => {
    const matchSearch = r.userName.toLowerCase().includes(rekapSearch.toLowerCase()) ||
      r.userEmail.toLowerCase().includes(rekapSearch.toLowerCase()) ||
      r.userNpp.toLowerCase().includes(rekapSearch.toLowerCase());
    const matchEvent = selectedEventFilter === 'ALL' || r.eventId === selectedEventFilter;
    const matchSig = selectedSigStatusFilter === 'ALL' || r.signatureStatus === selectedSigStatusFilter;
    return matchSearch && matchEvent && matchSig;
  });

  // Filtered leaves
  const filteredLeaves = leaveRequests.filter(l => {
    if (leaveFilter === 'ALL') return true;
    return l.status === leaveFilter;
  });

  // Filtered employees list (pencarian & penetapan peran)
  const filteredEmployees = employees.filter(emp => {
    const term = employeeSearch.toLowerCase().trim();
    const matchSearch = !term ||
      (emp.name || '').toLowerCase().includes(term) ||
      (emp.email || '').toLowerCase().includes(term) ||
      (emp.npp || '').toLowerCase().includes(term) ||
      (emp.jabatan || '').toLowerCase().includes(term);
    const matchRole = employeeRoleFilter === 'ALL' || emp.role === employeeRoleFilter;
    return matchSearch && matchRole;
  });

  // Export to CSV compatible with Microsoft Excel
  const handleExportCsv = () => {
    if (filteredRecords.length === 0) {
      alert('Tidak ada data yang sesuai filter untuk diekspor.');
      return;
    }

    const headers = ['No', 'Nama Pegawai/Peserta', 'Email', 'NPP/NIK', 'Jabatan', 'Kegiatan', 'Tanggal Kegiatan', 'Waktu Scan', 'Status Hadir', 'Status Tanda Tangan', 'Waktu Konfirmasi', 'Catatan'];
    const rows = filteredRecords.map((r, idx) => [
      idx + 1,
      `"${r.userName.replace(/"/g, '""')}"`,
      `"${r.userEmail}"`,
      `"${r.userNpp || '-'}"`,
      `"${r.userJabatan || '-'}"`,
      `"${r.eventTitle.replace(/"/g, '""')}"`,
      `"${r.eventDate}"`,
      `"${new Date(r.scanTime).toLocaleString('id-ID')}"`,
      `"${r.attendanceStatus}"`,
      `"${r.signatureStatus}"`,
      `"${r.signatureTimestamp ? new Date(r.signatureTimestamp).toLocaleString('id-ID') : '-'}"`,
      `"${r.notes || '-'}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Rekap_Presensi_BPAIK_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isEventExpired = (eventDate: string) => {
    const today = new Date().toISOString().split('T')[0];
    return eventDate < today;
  };

  // Toggle Event Session through the Worker / D1 API
  const handleToggleSession = async (event: BPAIKEvent) => {
    const isCurrentlyActive = event.sessionStatus === 'aktif';

    if (!isCurrentlyActive && isEventExpired(event.date)) {
      alert(`Sesi presensi tidak dapat dibuka karena tanggal kegiatan (${event.date}) telah terlewat. Kegiatan dinyatakan selesai.`);
      return;
    }

    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(event.id)}/session`,
        {
          method: 'POST',
          credentials: 'same-origin'
        }
      );

      const payload = await response.json() as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'Gagal memperbarui sesi kegiatan.');
      }

      onRefreshData();
    } catch (err) {
      console.error('Toggle session error:', err);
      alert(err instanceof Error
        ? err.message
        : 'Gagal memperbarui status sesi kegiatan.');
    }
  };


  const handleEditEvent = (event: BPAIKEvent) => {
    if (event.sessionStatus === "aktif") {
      alert("Tutup sesi QR terlebih dahulu sebelum mengedit kegiatan.");
      return;
    }
    if (event.status === "selesai" || event.status === "dibatalkan") {
      alert("Kegiatan yang sudah selesai atau dibatalkan tidak dapat diedit.");
      return;
    }

    setEditingEventId(event.id);
    setEventForm({
      title: event.title,
      description: event.description || "",
      startDateTime: event.startDateTime?.slice(0, 16) || `${event.date}T${event.startTime}`,
      endDateTime: event.endDateTime?.slice(0, 16) || `${event.date}T${event.endTime}`,
      location: event.location || "",
      sessionDurationMinutes: event.sessionDurationMinutes || 60
    });
    setSelectedAdminEventForDetail(null);
    setShowCreateEventModal(true);
  };

  const handleDeleteEvent = async (event: BPAIKEvent) => {
    if (!window.confirm(
      `Hapus kegiatan "${event.title}"? Kegiatan yang memiliki riwayat presensi/izin tidak dapat dihapus.`
    )) return;

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(event.id)}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || "Gagal menghapus kegiatan.");
      }
      setSelectedAdminEventForDetail(null);
      onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Gagal menghapus kegiatan.");
    }
  };

  const handleFinishEvent = async (event: BPAIKEvent) => {
    if (event.sessionStatus !== "ditutup") {
      alert("Tutup sesi QR terlebih dahulu sebelum menandai kegiatan selesai.");
      return;
    }
    if (!window.confirm(`Tandai "${event.title}" sebagai kegiatan selesai? Sesi QR tidak dapat dibuka kembali.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(event.id)}/finish`, {
        method: "POST",
        credentials: "same-origin"
      });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || "Gagal menyelesaikan kegiatan.");
      }
      setSelectedAdminEventForDetail(null);
      onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Gagal menyelesaikan kegiatan.");
    }
  };

  // Handle Create Event with startDateTime, endDateTime & long description
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title.trim()) {
      alert('Nama kegiatan wajib diisi');
      return;
    }

    try {
      const eventId = `ev_${Date.now()}`;
      const nowIso = new Date().toISOString();
      const sDateObj = new Date(eventForm.startDateTime);
      const eDateObj = new Date(eventForm.endDateTime);

      const dateStr = sDateObj.toISOString().split('T')[0];
      const sTimeStr = sDateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const eTimeStr = eDateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      const newEvent: BPAIKEvent = {
        id: eventId,
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        startDateTime: eventForm.startDateTime,
        endDateTime: eventForm.endDateTime,
        date: dateStr,
        startTime: sTimeStr,
        endTime: eTimeStr,
        location: eventForm.location.trim(),
        createdBy: currentUser.email,
        creatorName: currentUser.name,
        status: 'dijadwalkan',
        sessionDurationMinutes: Number(eventForm.sessionDurationMinutes) || 60,
        sessionStatus: 'belum_dibuka',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const response = await fetch(
        editingEventId ? `/api/events/${encodeURIComponent(editingEventId)}` : '/api/events',
        {
        method: editingEventId ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEvent.title,
          description: newEvent.description,
          startDateTime: eventForm.startDateTime,
          endDateTime: eventForm.endDateTime,
          location: newEvent.location,
          sessionDurationMinutes: newEvent.sessionDurationMinutes
        })
      });

      const payload = await response.json() as {
        success?: boolean;
        event?: BPAIKEvent;
        error?: string;
      };

      if (!response.ok || payload.success !== true || !payload.event) {
        throw new Error(payload.error || 'Gagal menyimpan kegiatan ke D1.');
      };


      setShowCreateEventModal(false);
      setEditingEventId(null);
      setEventForm({
        title: '',
        description: '',
        startDateTime: `${todayStr}T08:30`,
        endDateTime: `${todayStr}T11:45`,
        location: "Auditorium Gedung KH. Ahmad Dahlan Lt. 4 UNISA Bandung",
        sessionDurationMinutes: 60
      });
      onRefreshData();
    } catch (err) {
      console.error('Create event error:', err);
      alert(err instanceof Error ? err.message : 'Gagal menyimpan kegiatan.');
    }
  };

  // Review leave requests through Worker / D1
  const handleApproveLeave = async (leave: LeaveRequest) => {
    try {
      const response = await fetch(
        `/api/leaves/${encodeURIComponent(leave.id)}/review`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'DISETUJUI', adminNotes: '' })
        }
      );
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'Gagal menyetujui izin.');
      }
      alert(`Izin untuk ${leave.userName} telah disetujui dan dicatat sebagai IZIN.`);
      onRefreshData();
    } catch (error) {
      console.error('Approve leave error:', error);
      alert(error instanceof Error ? error.message : 'Gagal menyetujui izin.');
    }
  };

  const handleRejectLeave = async (leave: LeaveRequest) => {
    const reason = prompt('Masukkan catatan/alasan penolakan izin:');
    if (reason === null) return;

    try {
      const response = await fetch(
        `/api/leaves/${encodeURIComponent(leave.id)}/review`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'DITOLAK', adminNotes: reason })
        }
      );
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'Gagal menolak izin.');
      }
      onRefreshData();
    } catch (error) {
      console.error('Reject leave error:', error);
      alert(error instanceof Error ? error.message : 'Gagal menolak izin.');
    }
  };


  const handleDeleteLeave = async (leave: LeaveRequest) => {
    if (leave.status !== "DISETUJUI") {
      alert("Tombol hapus ini hanya tersedia untuk pengajuan yang telah disetujui.");
      return;
    }

    if (!window.confirm(
      `Hapus pengajuan izin ${leave.userName} untuk kegiatan "${leave.eventTitle}"? Catatan presensi yang sudah tercatat tetap dipertahankan.`
    )) return;

    setDeletingLeaveId(leave.id);
    try {
      const response = await fetch(`/api/leaves/${encodeURIComponent(leave.id)}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      const payload = await response.json() as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || "Gagal menghapus pengajuan izin.");
      }

      setLeaveRequests(current => current.filter(item => item.id !== leave.id));
      alert(payload.message || "Pengajuan izin berhasil dihapus.");
      onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Gagal menghapus pengajuan izin.");
    } finally {
      setDeletingLeaveId(null);
    }
  };

  // Manual attendance correction through Worker / D1
  const handleSaveCorrection = async () => {
    if (!selectedRecordToCorrect) return;
    if (!correctionReason.trim()) {
      alert('Alasan koreksi manual wajib diisi untuk rekam jejak audit.');
      return;
    }

    setIsSavingCorrection(true);
    try {
      const response = await fetch(
        `/api/attendance/${encodeURIComponent(selectedRecordToCorrect.id)}/correction`,
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attendanceStatus: correctionStatus,
            reason: correctionReason.trim()
          })
        }
      );
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'Gagal menyimpan koreksi manual.');
      }

      setShowManualCorrectionModal(false);
      setSelectedRecordToCorrect(null);
      setCorrectionReason('');
      onRefreshData();
    } catch (error) {
      console.error('Manual correction error:', error);
      alert(error instanceof Error ? error.message : 'Gagal menyimpan koreksi manual.');
    } finally {
      setIsSavingCorrection(false);
    }
  };


  const handleDeleteAttendance = async (record: AttendanceRecord) => {
    if (!window.confirm(
      `Hapus catatan presensi ${record.userName} pada kegiatan "${record.eventTitle}"? Tindakan ini dicatat dalam audit.`
    )) return;

    try {
      const response = await fetch(`/api/attendance/${encodeURIComponent(record.id)}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || "Gagal menghapus catatan presensi.");
      }
      onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Gagal menghapus catatan presensi.");
    }
  };


  const handleDeleteAuditLogs = async (deleteAll: boolean) => {
    const ids = [...selectedAuditIds];

    if (!deleteAll && ids.length === 0) {
      alert("Pilih setidaknya satu riwayat yang ingin dihapus.");
      return;
    }

    const confirmed = window.confirm(
      deleteAll
        ? "PERINGATAN: Hapus seluruh riwayat audit yang tersimpan di D1? Aksi ini tidak dapat dibatalkan. Satu catatan audit pembersihan akan tetap disimpan."
        : `Hapus ${ids.length} riwayat yang dipilih? Satu catatan audit penghapusan akan tetap disimpan.`
    );

    if (!confirmed) return;

    setIsDeletingAudit(true);
    try {
      const response = await fetch("/api/audit", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deleteAll ? { all: true } : { ids })
      });

      const payload = await response.json() as {
        success?: boolean;
        error?: string;
        message?: string;
        deletedCount?: number;
      };

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || "Gagal menghapus riwayat audit.");
      }

      setSelectedAuditIds([]);
      alert(payload.message || "Riwayat audit berhasil dibersihkan.");
      onRefreshData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Gagal menghapus riwayat audit."
      );
    } finally {
      setIsDeletingAudit(false);
    }
  };

  // Save Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSavedMsg(true);
    setTimeout(() => setSettingsSavedMsg(false), 3000);
  };

  // Open Add Participant Modal
  const handleOpenAddEmployee = () => {
    setEditingEmployee(null);
    setEmployeeForm({
      name: '',
      email: '',
      npp: '',
      jabatan: '',
      whatsapp: '',
      role: 'PESERTA',
      status: 'aktif'
    });
    setShowEmployeeModal(true);
  };

  // Open Edit/Assign Participant Modal
  const handleOpenEditEmployee = (emp: BPAIKUser) => {
    setEditingEmployee(emp);
    setEmployeeForm({
      name: emp.name || '',
      email: emp.email || '',
      npp: emp.npp || '',
      jabatan: emp.jabatan || '',
      whatsapp: emp.whatsapp || '',
      role: emp.role || 'PESERTA',
      status: emp.status || 'aktif'
    });
    setShowEmployeeModal(true);
  };

  // Save Participant through the Worker / D1 API
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!employeeForm.name.trim() || !employeeForm.email.trim()) {
      alert('Nama dan Email peserta wajib diisi.');
      return;
    }

    setIsSavingEmployee(true);

    try {
      const emailClean = employeeForm.email.trim().toLowerCase();

      if (!editingEmployee) {
        const existing = employees.find(
          emp => emp.email.toLowerCase() === emailClean
        );
        if (existing) {
          alert(`Email ${emailClean} sudah terdaftar atas nama ${existing.name}.`);
          return;
        }
      }

      const isEditing = Boolean(editingEmployee);
      const url = isEditing
        ? `/api/users/${encodeURIComponent(editingEmployee!.id)}`
        : '/api/users';

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: employeeForm.name.trim(),
          email: emailClean,
          npp: employeeForm.npp.trim(),
          jabatan: employeeForm.jabatan.trim(),
          whatsapp: employeeForm.whatsapp.trim(),
          role: employeeForm.role,
          status: employeeForm.status
        })
      });

      const payload = await response.json() as {
        success?: boolean;
        user?: BPAIKUser;
        error?: string;
      };

      if (!response.ok || payload.success !== true || !payload.user) {
        throw new Error(payload.error || 'Gagal menyimpan pengguna ke D1.');
      }

      setShowEmployeeModal(false);
      onRefreshData();

      alert(isEditing
        ? `Data peserta ${payload.user.name} berhasil diperbarui.`
        : `Peserta ${payload.user.name} berhasil ditambahkan. Kode QR unik dibuat oleh server dan tersimpan di D1.`);
    } catch (err) {
      console.error('Save employee error:', err);
      alert(err instanceof Error
        ? err.message
        : 'Gagal menyimpan data peserta.');
    } finally {
      setIsSavingEmployee(false);
    }
  };

  // Change user role through the Worker / D1 API
  const handleToggleUserRole = async (emp: BPAIKUser) => {
    if (emp.email.toLowerCase() === currentUser.email.toLowerCase()) {
      alert('Anda tidak dapat mengubah peran akun Anda sendiri.');
      return;
    }

    const newRole: 'ADMIN' | 'PESERTA' =
      emp.role === 'ADMIN' ? 'PESERTA' : 'ADMIN';

    if (!window.confirm(`Ubah penetapan peran ${emp.name} menjadi ${newRole}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(emp.id)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });

      const payload = await response.json() as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'Gagal mengubah peran pengguna.');
      }

      onRefreshData();
    } catch (err) {
      console.error('Toggle role error:', err);
      alert(err instanceof Error ? err.message : 'Gagal mengubah peran user.');
    }
  };

  // Change user status through the Worker / D1 API
  const handleToggleUserStatus = async (emp: BPAIKUser) => {
    if (emp.email.toLowerCase() === currentUser.email.toLowerCase()) {
      alert('Anda tidak dapat menonaktifkan akun Anda sendiri.');
      return;
    }

    const newStatus: 'aktif' | 'nonaktif' =
      emp.status === 'aktif' ? 'nonaktif' : 'aktif';

    if (!window.confirm(
      `Ubah penetapan status ${emp.name} menjadi ${newStatus.toUpperCase()}?`
    )) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(emp.id)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      const payload = await response.json() as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'Gagal mengubah status pengguna.');
      }

      onRefreshData();
    } catch (err) {
      console.error('Toggle status error:', err);
      alert(err instanceof Error ? err.message : 'Gagal mengubah status user.');
    }
  };

  // Delete user through the Worker / D1 API
  const handleDeleteEmployee = async (emp: BPAIKUser) => {
    if (emp.email.toLowerCase() === currentUser.email.toLowerCase()) {
      alert('Anda tidak dapat menghapus akun Anda sendiri.');
      return;
    }

    const confirmDelete = window.confirm(
      `Apakah Anda yakin ingin menghapus peserta "${emp.name}" (${emp.email}) dari daftar BPAIK?`
    );
    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(emp.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });

      const payload = await response.json() as {
        success?: boolean;
        error?: string;
        deactivated?: boolean;
        message?: string;
      };

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'Gagal menghapus pengguna.');
      }

      alert(`Peserta "${emp.name}" berhasil dihapus.`);
      if (payload.deactivated) {
        alert(payload.message || "Peserta memiliki riwayat. Akun berhasil dinonaktifkan.");
      }
      if (payload.deactivated) {
        alert(payload.message || "Peserta memiliki riwayat. Akun berhasil dinonaktifkan.");
      }
      onRefreshData();
    } catch (err) {
      console.error('Delete employee error:', err);
      alert(err instanceof Error
        ? err.message
        : 'Gagal menghapus peserta.');
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f5f3] flex flex-col font-sans antialiased text-slate-800">
      {/* 1. TOP STICKY HEADER - Flush at top, no floating gap */}
      <header className="sticky top-0 z-30 w-full bg-[#0f613c] border-b border-[#093d26] shadow-md px-4 sm:px-8 py-3 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F4C542] text-slate-950 font-black text-base flex items-center justify-center font-islamic border border-amber-300 shadow-xs"><img src="/images/logoBPAIK.png" alt="Logo BPAIK" className="w-full h-full object-contain" /></div>
          <div>
            <h1 className="text-base sm:text-lg font-bold font-islamic tracking-tight text-white leading-tight flex items-center gap-1.5">
              Portal<span className="text-[#F4C542]">BPAIK</span>
              <span className="text-[10px] bg-[#F4C542] text-slate-950 px-2 py-0.5 rounded-full font-mono font-bold">
                Admin
              </span>
            </h1>
            <p className="text-[10px] sm:text-[11px] text-emerald-200/90 font-medium leading-none mt-0.5">
              Universitas 'Aisyiyah Bandung
            </p>
          </div>
        </div>

        {/* User Info & Quick Action & Mobile Menu Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-white leading-tight">{currentUser.name}</p>
            <p className="text-[10px] text-emerald-200 font-mono">{currentUser.email}</p>
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-[#093d26] hover:bg-emerald-900 border border-emerald-600/60 rounded-xl text-xs font-bold text-white shadow-xs transition-all active:scale-95 cursor-pointer"
            title={isMobileMenuOpen ? "Tutup Menu" : "Buka Menu Admin"}
          >
            {isMobileMenuOpen ? (
              <>
                <X className="w-4 h-4 text-[#F4C542]" />
                <span>Tutup</span>
              </>
            ) : (
              <>
                <Menu className="w-4 h-4 text-[#F4C542]" />
                <span>Menu</span>
                {pendingLeaves > 0 && (
                  <span className="w-2 h-2 rounded-full bg-[#F4C542] animate-pulse" />
                )}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onLogout}
            title="Keluar Akun Admin"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* MOBILE DRAWER NAVIGATION (Hidden by default, auto-hides when menu item is clicked) */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-200">
          {/* Backdrop click to dismiss */}
          <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />

          <div className="bg-[#0f613c] text-white rounded-t-3xl border-t-2 border-[#1a8353] p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4 animate-in slide-in-from-bottom duration-250">
            <div className="flex items-center justify-between pb-3 border-b border-white/15">
              <div>
                <span className="text-xs font-bold font-islamic uppercase tracking-wider text-emerald-200">
                  Menu Utama Admin
                </span>
                <p className="text-[11px] text-emerald-100/80">Pilih menu untuk langsung membuka halaman</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
                aria-label="Tutup Menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Menu List */}
            <nav className="space-y-1.5">
              <button
                type="button"
                onClick={() => handleSelectMenu('dashboard')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'dashboard'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white bg-emerald-800/40 hover:bg-emerald-800/60'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>Dashboard Ringkasan</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMenu('kegiatan')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'kegiatan'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white bg-emerald-800/40 hover:bg-emerald-800/60'
                }`}
              >
                <CalendarDays className="w-4 h-4 shrink-0" />
                <span>Jadwal & Kegiatan</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMenu('perizinan')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'perizinan'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white bg-emerald-800/40 hover:bg-emerald-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileCheck className="w-4 h-4 shrink-0" />
                  <span>Persetujuan Perizinan</span>
                </div>
                {pendingLeaves > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#F4C542] text-slate-950 font-black text-[11px]">
                    {pendingLeaves} menunggu
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelectMenu('pegawai')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'pegawai'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white bg-emerald-800/40 hover:bg-emerald-800/60'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Data Peserta & Pegawai</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMenu('rekap')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'rekap'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white bg-emerald-800/40 hover:bg-emerald-800/60'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>Rekap Absensi</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMenu('pengaturan')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'pengaturan'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white bg-emerald-800/40 hover:bg-emerald-800/60'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>Pengaturan</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMenu('audit')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'audit'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white bg-emerald-800/40 hover:bg-emerald-800/60'
                }`}
              >
                <History className="w-4 h-4 shrink-0" />
                <span>Audit Log</span>
              </button>
            </nav>

            {/* Bottom Area: Clean Logout */}
            <div className="pt-3 border-t border-white/15">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar Akun Admin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Body: Locked Left Menu & Responsive Right Block */}
      <div className="flex-1 w-full max-w-[1536px] mx-auto p-3 sm:p-4 lg:p-5 flex flex-col md:flex-row gap-4 lg:gap-5 items-start">
        
        {/* DESKTOP SIDEBAR NAVIGATION (Locked sticky in place, responsive to screen height, never shrinking) */}
        <aside className="hidden md:flex w-64 lg:w-72 shrink-0 sticky top-20 h-[calc(100vh-6.5rem)] flex-col justify-between bg-[#0f613c] text-white p-4 lg:p-5 rounded-2xl lg:rounded-3xl shadow-[0_6px_0_0_#093d26] border border-[#093d26] select-none overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Sidebar Brand Mini */}
            <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-white/15 shrink-0">
              <span className="text-xs font-bold font-islamic uppercase tracking-wider text-emerald-200">
                Menu Utama Admin
              </span>
            </div>

            {/* Menu List: Scrollable if viewport is compact */}
            <nav className="space-y-1.5 overflow-y-auto flex-1 pr-1">
              <button
                type="button"
                onClick={() => handleSelectMenu('dashboard')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'dashboard'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white hover:bg-emerald-800/60'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMenu('kegiatan')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'kegiatan'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white hover:bg-emerald-800/60'
                }`}
              >
                <CalendarDays className="w-4 h-4 shrink-0" />
                <span>Jadwal & Kegiatan</span>
              </button>

              {/* PERIZINAN */}
              <button
                type="button"
                onClick={() => handleSelectMenu('perizinan')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'perizinan'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white hover:bg-emerald-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileCheck className="w-4 h-4 shrink-0" />
                  <span>Perizinan</span>
                </div>
                {pendingLeaves > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#F4C542] text-slate-950 font-black text-[10px]">
                    {pendingLeaves}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelectMenu('pegawai')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'pegawai'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white hover:bg-emerald-800/60'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Data Peserta</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMenu('rekap')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'rekap'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white hover:bg-emerald-800/60'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>Rekap Absensi</span>
              </button>

              {/* PENGATURAN */}
              <button
                type="button"
                onClick={() => handleSelectMenu('pengaturan')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'pengaturan'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white hover:bg-emerald-800/60'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>Pengaturan</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMenu('audit')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  activeMenu === 'audit'
                    ? 'tactile-3d-btn-accent text-slate-950'
                    : 'text-emerald-100 hover:text-white hover:bg-emerald-800/60'
                }`}
              >
                <History className="w-4 h-4 shrink-0" />
                <span>Audit Log</span>
              </button>
            </nav>
          </div>

          {/* Bottom Area: Clean Logout */}
          <div className="pt-3 border-t border-white/15 shrink-0">
            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2 px-3 bg-red-600/80 hover:bg-red-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Akun Admin</span>
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA: Follows height of menu, scrolls smoothly */}
        <main ref={mainContentRef} className="flex-1 min-w-0 min-h-[calc(100vh-6.5rem)] bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-[0_6px_0_0_#cbd5e1,0_16px_30px_rgba(0,0,0,0.06)] p-4 sm:p-6 lg:p-7 flex flex-col">
          
          <div className="space-y-4 sm:space-y-5">
            

            {/* Top Bar inside admin content */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold font-islamic text-slate-900 leading-tight">
                  {activeMenu === 'dashboard' && 'Dashboard Presensi BPAIK'}
                  {activeMenu === 'kegiatan' && 'Jadwal & Kegiatan Kajian'}
                  {activeMenu === 'perizinan' && 'Persetujuan Izin Kegiatan'}
                  {activeMenu === 'pegawai' && 'Daftar Peserta & Pegawai'}
                  {activeMenu === 'rekap' && 'Rekap Data Absensi'}
                  {activeMenu === 'pengaturan' && 'Pengaturan Sistem BPAIK'}
                  {activeMenu === 'audit' && 'Audit Log Aktivitas Server'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Universitas 'Aisyiyah Bandung — Badan Pengembangan Al-Islam & Kemuhammadiyahan
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 font-mono">
                  {currentUser.name} (Admin)
                </span>
              </div>
            </div>

            {/* ========================================================
                MENU 1: DASHBOARD
            ======================================================== */}
            {activeMenu === 'dashboard' && (
              <div className="space-y-5">
                {/* 3D Stat Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div className="tactile-3d-card p-4 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                      Total Hadir Sah
                    </span>
                    <p className="text-2xl font-black text-slate-900 font-mono mt-1">
                      {totalHadir}
                    </p>
                    <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">
                      Tercatat di server
                    </span>
                  </div>

                  <div className="tactile-3d-card p-4 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                      Sesi QR Aktif
                    </span>
                    <p className="text-2xl font-black text-emerald-700 font-mono mt-1">
                      {activeEvents}
                    </p>
                    <span className="text-[10px] text-slate-500 font-semibold mt-1 block">
                      Siap dipindai di aula
                    </span>
                  </div>

                  <div className="tactile-3d-card p-4 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                      Izin Menunggu ACC
                    </span>
                    <p className="text-2xl font-black text-amber-600 font-mono mt-1">
                      {pendingLeaves}
                    </p>
                    <span className="text-[10px] text-amber-700 font-semibold mt-1 block">
                      Butuh persetujuan admin
                    </span>
                  </div>

                  <div className="tactile-3d-card p-4 border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                      Total Agenda
                    </span>
                    <p className="text-2xl font-black text-slate-900 font-mono mt-1">
                      {totalEvents}
                    </p>
                    <span className="text-[10px] text-slate-500 font-semibold mt-1 block">
                      Terjadwal & selesai
                    </span>
                  </div>
                </div>

                {/* Quick Action Bar */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEventId(null);
                      setEventForm({
                        title: '',
                        description: '',
                        startDateTime: `${todayStr}T08:30`,
                        endDateTime: `${todayStr}T11:45`,
                        location: "Auditorium Gedung KH. Ahmad Dahlan Lt. 4 UNISA Bandung",
                        sessionDurationMinutes: 60
                      });
                      setShowCreateEventModal(true);
                    }}
                    className="tactile-3d-btn-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#F4C542]" />
                    <span>Tambah Agenda Kegiatan Baru</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="tactile-3d-btn-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-[#0f613c]" />
                    <span>Ekspor Rekap Excel (.CSV)</span>
                  </button>
                </div>

                {/* Recent Attendance Records */}
                <div className="tactile-3d-card p-4 sm:p-5 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900 font-islamic mb-3">
                    Presensi Masuk Terbaru
                  </h3>

                  {attendanceRecords.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">Belum ada presensi yang masuk.</p>
                  ) : (
                    <div className="space-y-2">
                      {attendanceRecords.slice(0, 5).map(rec => (
                        <div key={rec.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 truncate">{rec.userName}</p>
                            <p className="text-[10px] text-slate-500">{rec.eventTitle} • {rec.userJabatan || 'Peserta'}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              {rec.attendanceStatus}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {new Date(rec.scanTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================
                MENU 2: JADWAL & KEGIATAN
                - Sesuai instruksi:
                  - Isian: Judul, tanggal/jam dari s/d tanggal/jam, deskripsi panjang, durasi sesi QR
                  - Buka / Tutup Sesi
            ======================================================== */}
            {activeMenu === 'kegiatan' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Buka sesi presensi untuk mengaktifkan kode QR dinamis di layar proyektor. Batas scan dihitung sejak sesi dibuka.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEventId(null);
                      setEventForm({
                        title: '',
                        description: '',
                        startDateTime: `${todayStr}T08:30`,
                        endDateTime: `${todayStr}T11:45`,
                        location: "Auditorium Gedung KH. Ahmad Dahlan Lt. 4 UNISA Bandung",
                        sessionDurationMinutes: 60
                      });
                      setShowCreateEventModal(true);
                    }}
                    className="tactile-3d-btn-primary px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#F4C542]" />
                    <span>Tambah Kegiatan</span>
                  </button>
                </div>

                {/* TAMPILAN MOBILE ADMIN JADWAL: Ringkas seperti di akun user (Judul Kegiatan + Tanggal). Klik untuk buka Popup Deskripsi & CTA */}
                <div className="block md:hidden space-y-2">
                  {events.map(ev => {
                    const expired = isEventExpired(ev.date);
                    const isSessionActive = ev.sessionStatus === 'aktif';

                    return (
                      <div
                        key={`mobile-admin-ev-${ev.id}`}
                        onClick={() => setSelectedAdminEventForDetail(ev)}
                        className="tactile-3d-card p-3 border border-slate-200 hover:border-emerald-400 cursor-pointer transition-all flex items-center justify-between gap-2.5 shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`px-1.5 py-0.2 rounded-full text-[8.5px] font-bold ${
                              expired
                                ? 'bg-slate-200 text-slate-700'
                                : isSessionActive
                                ? 'bg-emerald-600 text-white animate-pulse'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {expired ? 'Kegiatan Selesai' : isSessionActive ? 'Sesi Terbuka' : 'Dijadwalkan'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono truncate">{ev.date}</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {ev.title}
                          </h4>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {ev.location} • {ev.startTime}-{ev.endTime} WIB
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 text-emerald-700">
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* TAMPILAN DESKTOP/TABLET JADWAL ADMIN */}
                <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-4">
                  {events.map(ev => {
                    const expired = isEventExpired(ev.date);
                    const isSessionActive = ev.sessionStatus === 'aktif';
                    return (
                      <div key={ev.id} className="tactile-3d-card p-5 border border-slate-200 flex flex-col justify-between gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              expired
                                ? 'bg-slate-200 text-slate-700'
                                : isSessionActive
                                ? 'bg-emerald-600 text-white animate-pulse'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {expired ? 'Kegiatan Selesai' : isSessionActive ? 'Sesi QR Sedang Terbuka' : 'Sesi Ditutup'}
                            </span>
                            <span className="text-xs font-semibold text-slate-400 font-mono">
                              {ev.date}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {ev.title}
                          </h3>

                          {ev.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                              {ev.description}
                            </p>
                          )}

                          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                            <p>📍 {ev.location}</p>
                            <p>⏰ Waktu: {ev.startTime} - {ev.endTime} WIB</p>
                            <p>⏳ Durasi Sesi QR: <strong>{ev.sessionDurationMinutes} Menit</strong> (dihitung sejak dibuka)</p>
                            {expired && (
                              <p className="text-red-700 font-bold text-[11px] pt-1">
                                *Kegiatan telah selesai karena tanggal pelaksanaan telah terlewat.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={expired && !isSessionActive}
                            onClick={() => handleToggleSession(ev)}
                            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                              expired && !isSessionActive
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                : isSessionActive
                                ? 'tactile-3d-btn-accent text-slate-950'
                                : 'tactile-3d-btn-primary'
                            }`}
                            title={expired && !isSessionActive ? "Kegiatan telah selesai, tidak dapat membuka sesi QR" : ""}
                          >
                            {isSessionActive ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            <span>{expired && !isSessionActive ? 'Kegiatan Selesai' : isSessionActive ? 'Tutup Sesi QR' : 'Buka Sesi QR'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={!isSessionActive}
                            onClick={() => {
                              if (!isSessionActive) {
                                alert('Sesi presensi kegiatan ini belum diaktifkan. Silakan klik tombol "Buka Sesi QR" terlebih dahulu agar kode QR dinamis dapat ditayangkan di proyektor.');
                                return;
                              }
                              onOpenProjectorQr(ev);
                            }}
                            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                              isSessionActive
                                ? 'tactile-3d-btn-accent text-slate-950 ring-2 ring-amber-400'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 border border-slate-200 opacity-60 cursor-not-allowed'
                            }`}
                            title={isSessionActive ? "Buka Layar Proyektor QR" : "Aktifkan sesi terlebih dahulu untuk membuka QR"}
                          >
                            <QrCode className={`w-3.5 h-3.5 ${isSessionActive ? 'text-slate-950' : 'text-slate-400'}`} />
                            <span>{isSessionActive ? 'Buka Proyektor' : 'QR Belum Aktif'}</span>
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          {ev.sessionStatus === 'ditutup' && ev.status !== 'selesai' && ev.status !== 'dibatalkan' && (
                            <button
                              type="button"
                              onClick={() => handleFinishEvent(ev)}
                              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Kegiatan Selesai
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEditEvent(ev)}
                            disabled={ev.status === 'selesai' || ev.status === 'dibatalkan' || isSessionActive}
                            className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEvent(ev)}
                            disabled={isSessionActive}
                            className="py-2 px-3 rounded-xl text-xs font-bold bg-red-50 text-red-700 border border-red-200 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Hapus
                          </button>
                        </div>

                        {/* Quick Reports per Event */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px]">
                          <button
                            type="button"
                            onClick={() => {
                              const recs = attendanceRecords.filter(r => r.eventId === ev.id);
                              exportAttendanceToExcel(ev, recs);
                            }}
                            className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-emerald-50 text-emerald-800 rounded-lg border border-slate-200 hover:border-emerald-300 font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                            title="Unduh file Excel (.xlsx) kegiatan ini sesuai format"
                          >
                            <FileSpreadsheet className="w-3 h-3 text-emerald-700" />
                            <span>Excel Hadir</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPdfModalEvent(ev);
                            }}
                            className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-amber-50 text-slate-800 rounded-lg border border-slate-200 hover:border-amber-300 font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                            title="Pratinjau & Cetak Dokumen PDF Resmi KOP BPAIK kegiatan ini"
                          >
                            <Printer className="w-3 h-3 text-amber-600" />
                            <span>PDF (KOP)</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ========================================================
                MENU 3: PERIZINAN (NEW REQUIREMENT)
                - Menunggu ACC
                - Tombol ACC dan Tolak
            ======================================================== */}
            {activeMenu === 'perizinan' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    Pengajuan izin dari peserta kegiatan. Persetujuan (ACC) akan otomatis mencatat status presensi sebagai <strong>IZIN</strong>.
                  </p>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setLeaveFilter('MENUNGGU_ACC')}
                      className={`px-3 py-1 text-xs rounded-lg font-bold ${
                        leaveFilter === 'MENUNGGU_ACC' ? 'bg-[#F4C542] text-slate-950' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Menunggu ACC ({pendingLeaves})
                    </button>
                    <button
                      onClick={() => setLeaveFilter('DISETUJUI')}
                      className={`px-3 py-1 text-xs rounded-lg font-bold ${
                        leaveFilter === 'DISETUJUI' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Disetujui
                    </button>
                    <button
                      onClick={() => setLeaveFilter('ALL')}
                      className={`px-3 py-1 text-xs rounded-lg font-bold ${
                        leaveFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Semua
                    </button>
                  </div>
                </div>

                {filteredLeaves.length === 0 ? (
                  <div className="tactile-3d-card p-8 text-center text-slate-400 border border-slate-200 text-xs">
                    <FileCheck className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-slate-700">Tidak ada data perizinan pada kategori ini</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredLeaves.map(leave => (
                      <div key={leave.id} className="tactile-3d-card p-4 sm:p-5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm text-slate-900">{leave.userName}</span>
                            <span className="text-[10px] text-slate-500">({leave.userJabatan || 'Peserta'})</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              leave.status === 'DISETUJUI'
                                ? 'bg-emerald-100 text-emerald-800'
                                : leave.status === 'DITOLAK'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}>
                              {leave.status === 'DISETUJUI' ? 'DISETUJUI (ACC)' : leave.status === 'DITOLAK' ? 'DITOLAK' : 'MENUNGGU ACC'}
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-[#0f613c]">
                            Kegiatan: {leave.eventTitle} ({leave.eventDate})
                          </p>
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 mt-2">
                            <span className="font-bold">Alasan Izin: </span>
                            <span>{leave.reason}</span>
                          </div>

                          <div className="text-[10px] text-slate-400 mt-2 flex gap-4">
                            <span>WA: {leave.userWhatsapp || '-'}</span>
                            <span>Email: {leave.userEmail}</span>
                            <span>Diajukan: {new Date(leave.createdAt).toLocaleString('id-ID')}</span>
                          </div>
                        </div>

                        {leave.status === 'MENUNGGU_ACC' && (
                          <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleApproveLeave(leave)}
                              className="tactile-3d-btn-primary px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 text-[#F4C542]" />
                              <span>ACC / Setujui</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRejectLeave(leave)}
                              className="tactile-3d-btn-danger px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5 text-white" />
                              <span>Tolak</span>
                            </button>
                          </div>
                        )}

                        {leave.status === 'DISETUJUI' && (
                          <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                            <button
                              type="button"
                              onClick={() => setSelectedLeaveForLetter(leave)}
                              className="tactile-3d-btn-accent px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                              title="Cetak Surat Izin Resmi Kepala BPAIK (PDF)"
                            >
                              <Printer className="w-3.5 h-3.5 text-slate-950" />
                              <span className="hidden sm:inline">Cetak Surat Izin (PDF)</span>
                            </button>
                            <button
                              type="button"
                              disabled={deletingLeaveId === leave.id}
                              onClick={() => void handleDeleteLeave(leave)}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                              title="Hapus pengajuan izin ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{deletingLeaveId === leave.id ? "Menghapus..." : "Hapus"}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================
                MENU 4: DATA PESERTA & PENETAPAN USER
                - Tambah Peserta Baru
                - Hapus Peserta
                - Penetapan User (Peran: ADMIN / PESERTA, Status: aktif / nonaktif)
            ======================================================== */}
            {activeMenu === 'pegawai' && (
              <div className="tactile-3d-card p-4 sm:p-5 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-islamic">
                      Daftar Peserta & Penetapan User ({filteredEmployees.length} dari {employees.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Kelola daftar civitas, tambah/hapus peserta, dan atur penetapan hak akses serta status akun.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleOpenAddEmployee}
                      className="tactile-3d-btn-primary px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#F4C542]" />
                      <span>+ Tambah Peserta</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowUploadExcelModal(true)}
                      className="tactile-3d-btn-accent text-slate-950 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Upload data peserta dari file Excel atau CSV"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-950" />
                      <span>Upload Excel</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowUploadPhotoZipModal(true)}
                      className="tactile-3d-btn-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Unggah foto banyak peserta sekaligus melalui ZIP"
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-800" />
                      <span>Upload Foto ZIP</span>
                    </button>

                    <button
                      type="button"
                      onClick={downloadParticipantTemplateExcel}
                      className="tactile-3d-btn-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Download template file Excel untuk format data peserta"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-800" />
                      <span>Template Excel</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmployeeForCard(null);
                        setShowCardModal(true);
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                      title="Cetak kartu identitas peserta (A4 batch / satu lembar)"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-amber-300" />
                      <span>Cetak Semua Kartu</span>
                    </button>
                  </div>
                </div>

                {/* Search & Filter Row */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
                  <div className="flex-1 relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Cari nama, email, NPP, jabatan..."
                      value={employeeSearch}
                      onChange={e => setEmployeeSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-emerald-600"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider hidden sm:inline">Peran:</span>
                    <button
                      type="button"
                      onClick={() => setEmployeeRoleFilter('ALL')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        employeeRoleFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Semua ({employees.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmployeeRoleFilter('PESERTA')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        employeeRoleFilter === 'PESERTA' ? 'bg-[#0f613c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Peserta ({employees.filter(e => e.role !== 'ADMIN').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmployeeRoleFilter('ADMIN')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        employeeRoleFilter === 'ADMIN' ? 'bg-[#F4C542] text-slate-950 font-black' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Admin ({employees.filter(e => e.role === 'ADMIN').length})
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                        <th className="pb-2">Nama & Kontak</th>
                        <th className="pb-2">NPP / NIK</th>
                        <th className="pb-2">Jabatan / Unit</th>
                        <th className="pb-2">Penetapan Peran</th>
                        <th className="pb-2">Status Akun</th>
                        <th className="pb-2 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            Tidak ada peserta yang cocok dengan pencarian atau filter.
                          </td>
                        </tr>
                      ) : (
                        filteredEmployees.map(emp => {
                          const isSelf = emp.email.toLowerCase() === currentUser.email.toLowerCase();
                          return (
                            <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2.5">
                                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{emp.name}</span>
                                  {isSelf && (
                                    <span className="text-[9px] bg-emerald-100 text-[#0f613c] font-black px-1.5 py-0.2 rounded-full font-mono">
                                      Akun Anda
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-500 font-mono">{emp.email}</p>
                                {emp.whatsapp && (
                                  <p className="text-[10px] text-emerald-700">WA: {emp.whatsapp}</p>
                                )}
                              </td>
                              <td className="py-2.5 text-slate-600 font-mono text-[11px]">
                                {emp.npp || '-'}
                              </td>
                              <td className="py-2.5 text-slate-700">
                                {emp.jabatan || 'Peserta Kajian'}
                              </td>
                              <td className="py-2.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleUserRole(emp)}
                                  disabled={isSelf}
                                  title={isSelf ? "Tidak dapat mengubah akun sendiri" : "Klik untuk mengubah peran (Penetapan Role)"}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                                    emp.role === 'ADMIN'
                                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  } ${isSelf ? 'opacity-80 cursor-default' : ''}`}
                                >
                                  <span>{emp.role === 'ADMIN' ? '👑 ADMIN' : '👤 PESERTA'}</span>
                                </button>
                              </td>
                              <td className="py-2.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleUserStatus(emp)}
                                  disabled={isSelf}
                                  title={isSelf ? "Tidak dapat menonaktifkan akun sendiri" : "Klik untuk mengubah status aktif/nonaktif"}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                                    emp.status === 'aktif'
                                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                      : 'bg-red-100 text-red-800 hover:bg-red-200'
                                  } ${isSelf ? 'opacity-80 cursor-default' : ''}`}
                                >
                                  {emp.status === 'aktif' ? '● Aktif' : '○ Nonaktif'}
                                </button>
                              </td>
                              <td className="py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedEmployeeForCard(emp);
                                      setShowCardModal(true);
                                    }}
                                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg transition-colors cursor-pointer"
                                    title="Cetak Kartu Identitas Peserta"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditEmployee(emp)}
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                                    title="Edit & Tetapkan User"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>

                                  {!isSelf && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteEmployee(emp)}
                                      className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors cursor-pointer"
                                      title="Hapus Peserta"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ========================================================
                MENU 5: REKAP ABSENSI
            ======================================================== */}
            {activeMenu === 'rekap' && (
              <div className="tactile-3d-card p-4 sm:p-5 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-islamic">
                      Rekap Presensi & Tanda Tangan ({filteredRecords.length})
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const targetEvent = events.find(e => e.id === selectedEventFilter) || events[0] || {
                          id: 'ev_all',
                          title: 'Rekap Presensi Kegiatan BPAIK',
                          date: new Date().toISOString().split('T')[0],
                          location: "Universitas 'Aisyiyah Bandung"
                        } as BPAIKEvent;
                        exportAttendanceToExcel(targetEvent, filteredRecords);
                      }}
                      className="tactile-3d-btn-accent text-slate-950 p-2 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Download file Excel (.xlsx) dengan format tabel presensi resmi"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-950" />
                      <span className="hidden sm:inline">Ekspor Excel Sesuai Format (.xlsx)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const targetEvent = events.find(e => e.id === selectedEventFilter) || events[0] || {
                          id: 'ev_all',
                          title: 'Daftar Hadir Civitas Akademika BPAIK',
                          date: new Date().toISOString().split('T')[0],
                          startTime: '08:00',
                          endTime: '12:00',
                          location: "Universitas 'Aisyiyah Bandung"
                        } as BPAIKEvent;
                        setPdfModalEvent(targetEvent);
                      }}
                      className="tactile-3d-btn-primary p-2 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Cetak atau unduh dokumen PDF resmi dengan KOP BPAIK & Tanda Tangan Digital"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#F4C542]" />
                      <span className="hidden sm:inline">Cetak PDF Resmi (KOP BPAIK)</span>
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    placeholder="Cari nama atau email..."
                    value={rekapSearch}
                    onChange={e => setRekapSearch(e.target.value)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                  <select
                    value={selectedEventFilter}
                    onChange={e => setSelectedEventFilter(e.target.value)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    <option value="ALL">Semua Kegiatan</option>
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.title}</option>
                    ))}
                  </select>
                  <select
                    value={selectedSigStatusFilter}
                    onChange={e => setSelectedSigStatusFilter(e.target.value)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    <option value="ALL">Semua Status TTD</option>
                    <option value="TERKONFIRMASI">Terkonfirmasi Sah</option>
                    <option value="MENUNGGU_KONFIRMASI">Menunggu TTD</option>
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                        <th className="pb-2">Nama Pegawai/Peserta</th>
                        <th className="pb-2">Kegiatan</th>
                        <th className="pb-2">Waktu Scan</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Tanda Tangan</th>
                        <th className="pb-2">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRecords.map(rec => (
                        <tr
                          key={rec.id}
                          className={employees.some(emp =>
                            emp.email.toLowerCase() === rec.userEmail.toLowerCase() &&
                            (emp.status || "").toLowerCase() === "nonaktif"
                          )
                            ? "bg-slate-100 text-slate-400 opacity-80"
                            : "hover:bg-slate-50"
                          }
                        >
                          <td className="py-2.5">
                            <p className={`font-bold ${
                              employees.some(emp =>
                                emp.email.toLowerCase() === rec.userEmail.toLowerCase() &&
                                (emp.status || "").toLowerCase() === "nonaktif"
                              )
                                ? "text-slate-400"
                                : "text-slate-800"
                            }`}>
                              {rec.userName}
                            </p>
                            <p className="text-[10px] text-slate-400">{rec.userEmail}</p>
                          </td>
                          <td className="py-2.5 text-slate-600 max-w-[180px] truncate">{rec.eventTitle}</td>
                          <td className="py-2.5 text-slate-500 font-mono text-[11px]">
                            {new Date(rec.scanTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                          </td>
                          <td className="py-2.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {rec.attendanceStatus}
                            </span>
                          </td>
                          <td className="py-2.5">
                            {rec.signatureData ? (
                              <div className="flex items-center gap-1.5">
                                <img
                                  src={rec.signatureData}
                                  alt={`TTD ${rec.userName}`}
                                  className="h-16 w-40 object-contain bg-white rounded-lg border border-slate-300 p-1 shadow-sm"
                                />
                                <span className="text-[10px] text-emerald-700 font-bold hidden sm:inline">✓</span>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                Menunggu TTD
                              </span>
                            )}
                          </td>
                          <td className="py-2.5">
                            <button
                              type="button"
                              disabled={employees.some(emp =>
                                emp.email.toLowerCase() === rec.userEmail.toLowerCase() &&
                                (emp.status || "").toLowerCase() === "nonaktif"
                              )}
                              onClick={() => {
                                setSelectedRecordToCorrect(rec);
                                setCorrectionStatus(rec.attendanceStatus);
                                setShowManualCorrectionModal(true);
                              }}
                              className={employees.some(emp =>
                                emp.email.toLowerCase() === rec.userEmail.toLowerCase() &&
                                (emp.status || "").toLowerCase() === "nonaktif"
                              )
                                ? "text-[11px] text-slate-400 font-bold cursor-not-allowed"
                                : "text-[11px] text-blue-600 hover:underline font-bold cursor-pointer"
                              }
                              title={employees.some(emp =>
                                emp.email.toLowerCase() === rec.userEmail.toLowerCase() &&
                                (emp.status || "").toLowerCase() === "nonaktif"
                              )
                                ? "Akun peserta nonaktif; koreksi dinonaktifkan"
                                : "Koreksi presensi"
                              }
                            >
                              Koreksi
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAttendance(rec)}
                              className="ml-2 text-[11px] text-red-600 hover:underline font-bold cursor-pointer"
                              title="Hapus catatan presensi"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ========================================================
                MENU 6: PENGATURAN (NEW REQUIREMENT)
            ======================================================== */}
            {activeMenu === 'pengaturan' && (
              <div className="max-w-xl space-y-4">
                <div className="tactile-3d-card p-5 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900 font-islamic mb-3">
                    Pengaturan Sesi Presensi & Sistem
                  </h3>

                  {settingsSavedMsg && (
                    <div className="p-3 bg-emerald-50 border border-emerald-300 text-xs text-emerald-800 rounded-xl mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Pengaturan berhasil disimpan!</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Default Durasi Sesi QR Presensi (Menit)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="240"
                        value={settingsForm.defaultSessionMinutes}
                        onChange={e => setSettingsForm(prev => ({ ...prev, defaultSessionMinutes: Number(e.target.value) }))}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Sesi QR proyektor akan dibuka selama rentang waktu ini setelah Admin menekan "Buka Sesi".
                      </p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.requireSignature}
                          onChange={e => setSettingsForm(prev => ({ ...prev, requireSignature: e.target.checked }))}
                          className="w-4 h-4 text-[#0f613c] rounded"
                        />
                        <span className="font-semibold text-slate-700">Wajibkan Tanda Tangan Digital pada gawai peserta</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.allowBackupCardScan}
                          onChange={e => setSettingsForm(prev => ({ ...prev, allowBackupCardScan: e.target.checked }))}
                          className="w-4 h-4 text-[#0f613c] rounded"
                        />
                        <span className="font-semibold text-slate-700">Aktifkan verifikasi kartu digital portrait cadangan</span>
                      </label>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        className="tactile-3d-btn-primary px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5 text-[#F4C542]" />
                        <span>Simpan Pengaturan</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ========================================================
                MENU 7: AUDIT LOG
            ======================================================== */}
            {activeMenu === 'audit' && (
              <div className="tactile-3d-card p-4 sm:p-5 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-islamic">
                      Rekam Jejak Audit Server ({auditLogs.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {selectedAuditIds.length} riwayat dipilih. Pilih Semua berlaku pada riwayat yang sedang tampil.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isDeletingAudit || auditLogs.length === 0}
                      onClick={() => setSelectedAuditIds(
                        selectedAuditIds.length === auditLogs.length
                          ? []
                          : auditLogs.map(log => log.id)
                      )}
                      className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
                    >
                      {selectedAuditIds.length === auditLogs.length && auditLogs.length > 0
                        ? "Batalkan Pilihan"
                        : "Pilih Semua"}
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingAudit || selectedAuditIds.length === 0}
                      onClick={() => void handleDeleteAuditLogs(false)}
                      className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                      Hapus Pilihan
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingAudit}
                      onClick={() => void handleDeleteAuditLogs(true)}
                      className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-bold disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                      Bersihkan Semua
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {auditLogs.map(log => (
                    <div key={log.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedAuditIds.includes(log.id)}
                          disabled={isDeletingAudit}
                          onChange={event => setSelectedAuditIds(current =>
                            event.target.checked
                              ? Array.from(new Set([...current, log.id]))
                              : current.filter(id => id !== log.id)
                          )}
                          className="mt-1 accent-emerald-700"
                          aria-label={`Pilih riwayat ${log.action}`}
                        />
                      </label>
                      <div className="flex-1 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 font-mono text-[10px] font-bold text-slate-700 mr-2">
                          {log.action}
                        </span>
                        <span className="text-slate-800 font-medium">{log.description}</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Oleh: {log.actorName} ({log.actorEmail})</p>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {new Date(log.timestamp).toLocaleString('id-ID')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* FOOTER AT THE VERY BOTTOM */}
      <Footer />

      {/* ========================================================
          MODAL: TAMBAH KEGIATAN BARU
          - Nama kegiatan sebagai judul
          - Tanggal & jam dari s/d sampai
          - Deskripsi panjang
          - Durasi sesi QR (menit)
      ======================================================== */}
      {showCreateEventModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="tactile-3d-card w-full max-w-lg bg-white p-5 sm:p-6 border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold font-islamic text-slate-900">
                  Tambah Agenda Kegiatan Baru
                </h3>
                <p className="text-xs text-slate-500">
                  Lengkapi jadwal kegiatan, rentang waktu, serta durasi buka sesi QR presensi.
                </p>
              </div>
              <button
                onClick={() => setShowCreateEventModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-3.5 text-xs">
              {/* Nama Kegiatan */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Kegiatan / Judul:
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: Kajian Tarjih & Pembinaan Civitas Akademika"
                  value={eventForm.title}
                  onChange={e => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Rentang Waktu (Dari Tanggal/Jam s/d Tanggal/Jam) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Dari (Tanggal & Jam):
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={eventForm.startDateTime}
                    onChange={e => setEventForm(prev => ({ ...prev, startDateTime: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Sampai (Tanggal & Jam):
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={eventForm.endDateTime}
                    onChange={e => setEventForm(prev => ({ ...prev, endDateTime: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Durasi Sesi QR Proyektor */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Durasi Sesi QR Presensi (Menit):
                </label>
                <input
                  type="number"
                  min="5"
                  max="360"
                  required
                  value={eventForm.sessionDurationMinutes}
                  onChange={e => setEventForm(prev => ({ ...prev, sessionDurationMinutes: Number(e.target.value) }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  *Dihitung setelah admin menekan "Buka Sesi", independen dari jam mulai kegiatan.
                </p>
              </div>

              {/* Lokasi */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Lokasi / Ruangan:
                </label>
                <input
                  type="text"
                  required
                  value={eventForm.location}
                  onChange={e => setEventForm(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Deskripsi Panjang */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Deskripsi Kegiatan:
                </label>
                <textarea
                  rows={4}
                  placeholder="Tuliskan deskripsi lengkap, silabus pembahasan, narasumber, atau instruksi kehadiran..."
                  value={eventForm.description}
                  onChange={e => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateEventModal(false)}
                  className="px-3 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="tactile-3d-btn-primary px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#F4C542]" />
                  <span>{editingEventId ? 'Simpan Perubahan' : 'Simpan Agenda'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: KOREKSI MANUAL PRESENSI
      ======================================================== */}
      {showManualCorrectionModal && selectedRecordToCorrect && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="tactile-3d-card w-full max-w-md bg-white p-5 sm:p-6 border border-slate-200">
            <h3 className="text-sm font-bold font-islamic text-slate-900 mb-1">
              Koreksi Presensi Manual
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              {selectedRecordToCorrect.userName} ({selectedRecordToCorrect.eventTitle})
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Ubah Status Kehadiran:</label>
                <select
                  value={correctionStatus}
                  onChange={e => setCorrectionStatus(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="HADIR">HADIR</option>
                  <option value="IZIN">IZIN</option>
                  <option value="SAKIT">SAKIT</option>
                  <option value="ALPA">ALPA</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Alasan Koreksi (Audit Trail):</label>
                <textarea
                  rows={3}
                  required
                  placeholder="contoh: Surat sakit dokter telah diserahkan ke bagian SDM..."
                  value={correctionReason}
                  onChange={e => setCorrectionReason(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualCorrectionModal(false)}
                  className="px-3 py-2 rounded-xl text-slate-500 font-bold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSavingCorrection}
                  onClick={handleSaveCorrection}
                  className="tactile-3d-btn-primary px-4 py-2 rounded-xl font-bold cursor-pointer"
                >
                  <span>{isSavingCorrection ? 'Menyimpan...' : 'Simpan Koreksi'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: TAMBAH / EDIT & PENETAPAN PESERTA
          - Tambah data peserta baru
          - Edit profil & penetapan hak akses (ADMIN vs PESERTA)
          - Penetapan status keaktifan akun (aktif vs nonaktif)
      ======================================================== */}
      {showEmployeeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="tactile-3d-card w-full max-w-lg bg-white p-5 sm:p-6 border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold font-islamic text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#0f613c]" />
                  <span>{editingEmployee ? 'Edit & Penetapan Peserta' : 'Tambah Peserta Baru'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingEmployee
                    ? `Perbarui profil atau sesuaikan penetapan hak akses dan status untuk ${editingEmployee.name}.`
                    : 'Daftarkan pegawai, dosen, atau tenaga kependidikan baru ke sistem presensi BPAIK.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEmployeeModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-4 text-xs">
              {/* Nama Lengkap */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Lengkap & Gelar: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: Dr. H. Ahmad Dahlan, M.Ag."
                  value={employeeForm.name}
                  onChange={e => setEmployeeForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-[#0f613c]"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Alamat Email (Google / UNISA): <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="contoh: dosen@unisa-bandung.ac.id"
                  value={employeeForm.email}
                  onChange={e => setEmployeeForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] focus:bg-white focus:outline-[#0f613c]"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Digunakan untuk verifikasi akun saat login dengan Google.
                </p>
              </div>

              {/* NPP & WhatsApp in 2 Cols */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    NPP / NIK:
                  </label>
                  <input
                    type="text"
                    placeholder="contoh: NPP. 0422019800"
                    value={employeeForm.npp}
                    onChange={e => setEmployeeForm(prev => ({ ...prev, npp: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] focus:bg-white focus:outline-[#0f613c]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nomor WhatsApp:
                  </label>
                  <input
                    type="tel"
                    placeholder="contoh: 081223344550"
                    value={employeeForm.whatsapp}
                    onChange={e => setEmployeeForm(prev => ({ ...prev, whatsapp: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] focus:bg-white focus:outline-[#0f613c]"
                  />
                </div>
              </div>

              {/* Jabatan / Unit Kerja */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Jabatan / Unit / Program Studi:
                </label>
                <input
                  type="text"
                  placeholder="contoh: Dosen Fikes / Tenaga Kependidikan"
                  value={employeeForm.jabatan}
                  onChange={e => setEmployeeForm(prev => ({ ...prev, jabatan: e.target.value }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-[#0f613c]"
                />
              </div>

              {/* ================= PENETAPAN USER ================= */}
              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#0f613c]" />
                    <span>Penetapan Peran (Role):</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setEmployeeForm(prev => ({ ...prev, role: 'PESERTA' }))}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        employeeForm.role === 'PESERTA'
                          ? 'border-[#0f613c] bg-emerald-50 ring-2 ring-[#0f613c]/30 text-slate-900'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-extrabold text-xs">👤 PESERTA</span>
                        {employeeForm.role === 'PESERTA' && (
                          <Check className="w-3.5 h-3.5 text-[#0f613c]" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        Hak akses presensi scan QR, riwayat hadir, perizinan & tanda tangan digital.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEmployeeForm(prev => ({ ...prev, role: 'ADMIN' }))}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        employeeForm.role === 'ADMIN'
                          ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-400/50 text-slate-900'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-extrabold text-xs text-amber-900">👑 ADMIN</span>
                        {employeeForm.role === 'ADMIN' && (
                          <Check className="w-3.5 h-3.5 text-amber-700" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        Akses penuh Portal Admin BPAIK: buka sesi QR, kelola jadwal, penetapan user & ekspor rekap.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Penetapan Status Akun */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Penetapan Status Akun:
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setEmployeeForm(prev => ({ ...prev, status: 'aktif' }))}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        employeeForm.status === 'aktif'
                          ? 'border-emerald-500 bg-emerald-100 text-emerald-900 ring-2 ring-emerald-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Akun Aktif</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEmployeeForm(prev => ({ ...prev, status: 'nonaktif' }))}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        employeeForm.status === 'nonaktif'
                          ? 'border-red-400 bg-red-100 text-red-900 ring-2 ring-red-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span>Nonaktif</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmployeeModal(false)}
                  className="px-3.5 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEmployee}
                  className="tactile-3d-btn-primary px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4 text-[#F4C542]" />
                  <span>{isSavingEmployee ? 'Menyimpan...' : 'Simpan Data Peserta'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UPLOAD EXCEL / CSV */}
      {showUploadExcelModal && (
        <UploadExcelModal
          currentUser={currentUser}
          onSuccess={() => {
            setShowUploadExcelModal(false);
            onRefreshData();
          }}
          onClose={() => setShowUploadExcelModal(false)}
        />
      )}

      {/* MODAL: UNGGAH FOTO PESERTA DARI ZIP */}
      {showUploadPhotoZipModal && (
        <UploadPhotoZipModal
          participants={employees.filter(user => user.role === 'PESERTA')}
          onClose={() => setShowUploadPhotoZipModal(false)}
          onUploaded={onRefreshData}
        />
      )}

      {/* MODAL: PRATINJAU & CETAK PDF RESMI DENGAN KOP SURAT */}
      {pdfModalEvent && (
        <AttendancePdfModal
          event={pdfModalEvent}
          records={attendanceRecords.filter(r => r.eventId === pdfModalEvent.id)}
          onClose={() => setPdfModalEvent(null)}
        />
      )}

      {/* MODAL: CETAK KARTU PESERTA (TUNGGAL ATAU SEMUA) */}
      {showCardModal && (
        <ParticipantCardModal
          employee={selectedEmployeeForCard}
          allEmployees={employees}
          onClose={() => {
            setShowCardModal(false);
            setSelectedEmployeeForCard(null);
          }}
        />
      )}

      {/* MODAL: PRATINJAU & CETAK SURAT IZIN RESMI KEPALA BPAIK */}
      {selectedLeaveForLetter && (
        <SuratIzinPdfModal
          leave={selectedLeaveForLetter}
          onClose={() => setSelectedLeaveForLetter(null)}
        />
      )}

      {/* POPUP DETAIL KEGIATAN & CTA UNTUK MOBILE */}
      {selectedAdminEventForDetail && (() => {
        const ev = selectedAdminEventForDetail;
        const expired = isEventExpired(ev.date);
        const isSessionActive = ev.sessionStatus === 'aktif';

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <div className="tactile-3d-card w-full max-w-lg bg-white p-5 border border-slate-200 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto space-y-4">
              <div className="flex items-start justify-between gap-3 pb-2 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      expired
                        ? 'bg-slate-200 text-slate-700'
                        : isSessionActive
                        ? 'bg-emerald-600 text-white animate-pulse'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {expired ? 'Kegiatan Selesai' : isSessionActive ? 'Sesi QR Sedang Terbuka' : 'Sesi Ditutup'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{ev.date}</span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 font-islamic leading-snug">
                    {ev.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAdminEventForDetail(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {ev.description && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed">
                  <span className="font-bold block text-slate-800 mb-1">Deskripsi Kegiatan:</span>
                  <p>{ev.description}</p>
                </div>
              )}

              <div className="text-xs text-slate-600 space-y-1.5 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                <p>📍 <strong>Lokasi:</strong> {ev.location}</p>
                <p>⏰ <strong>Waktu:</strong> {ev.startTime} - {ev.endTime} WIB</p>
                <p>⏳ <strong>Durasi Sesi QR:</strong> {ev.sessionDurationMinutes} Menit</p>
                {expired && (
                  <p className="text-red-700 font-bold text-[11px] pt-1 border-t border-red-200">
                    *Kegiatan Selesai: Tanggal pelaksanaan ({ev.date}) telah terlewat sehingga sesi QR tidak dapat dibuka kembali.
                  </p>
                )}
              </div>

              {/* ACTION CTAs */}
              <div className="space-y-2 pt-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={expired && !isSessionActive}
                    onClick={() => {
                      handleToggleSession(ev);
                      setSelectedAdminEventForDetail(null);
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm ${
                      expired && !isSessionActive
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        : isSessionActive
                        ? 'tactile-3d-btn-accent text-slate-950'
                        : 'tactile-3d-btn-primary'
                    }`}
                  >
                    {isSessionActive ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{expired && !isSessionActive ? 'Kegiatan Selesai (Off)' : isSessionActive ? 'Tutup Sesi QR' : 'Buka Sesi QR'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!isSessionActive}
                    onClick={() => {
                      onOpenProjectorQr(ev);
                      setSelectedAdminEventForDetail(null);
                    }}
                    className={`py-2.5 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                      isSessionActive
                        ? 'tactile-3d-btn-accent text-slate-950 ring-2 ring-amber-400'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 opacity-60'
                    }`}
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Layar Proyektor</span>
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedAdminEventForDetail.sessionStatus === 'ditutup' &&
                   selectedAdminEventForDetail.status !== 'selesai' &&
                   selectedAdminEventForDetail.status !== 'dibatalkan' && (
                    <button
                      type="button"
                      onClick={() => handleFinishEvent(selectedAdminEventForDetail)}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                      Kegiatan Selesai
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleEditEvent(selectedAdminEventForDetail)}
                    disabled={selectedAdminEventForDetail.status === 'selesai' ||
                              selectedAdminEventForDetail.status === 'dibatalkan' ||
                              selectedAdminEventForDetail.sessionStatus === 'aktif'}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 inline mr-1" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(selectedAdminEventForDetail)}
                    disabled={selectedAdminEventForDetail.sessionStatus === 'aktif'}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-700 border border-red-200 disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Hapus
                  </button>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const recs = attendanceRecords.filter(r => r.eventId === ev.id);
                      exportAttendanceToExcel(ev, recs);
                    }}
                    className="flex-1 py-2 px-3 bg-slate-50 hover:bg-emerald-50 text-emerald-800 rounded-xl border border-slate-200 hover:border-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Ekspor Excel</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPdfModalEvent(ev);
                      setSelectedAdminEventForDetail(null);
                    }}
                    className="flex-1 py-2 px-3 bg-slate-50 hover:bg-amber-50 text-slate-800 rounded-xl border border-slate-200 hover:border-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-600" />
                    <span>Cetak PDF KOP</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

