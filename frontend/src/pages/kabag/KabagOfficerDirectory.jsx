import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  Users, 
  UserCheck, 
  Building2, 
  Search, 
  Download, 
  MapPin, 
  ChevronRight, 
  RotateCcw,
  Phone, 
  Mail, 
  HeartHandshake, 
  LayoutGrid, 
  Table as TableIcon, 
  X, 
  Eye, 
  Activity, 
  ShieldCheck, 
  AlertCircle, 
  AlertTriangle,
  Clock, 
  ArrowUpRight, 
  Filter, 
  CheckCircle2, 
  ExternalLink, 
  Plus, 
  Check,
  Trash2,
  Edit3,
  Sliders,
  Power,
  ShieldAlert,
  Key,
  Copy,
  EyeOff,
  Lock
} from 'lucide-react';
import { api } from '../../services/api';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import { INITIAL_HOSPITALS } from '../../services/initialDataset';
import VictimDetailDrawer from '../../components/kabag/VictimDetailDrawer';

/**
 * Helper to determine if a victim is actively under responsibility
 * (still being monitored or hospitalized, not finalized/discharged)
 */
function isVictimActive(victim) {
  if (!victim) return false;
  if (victim.statusPemantauan === 'Selesai Dipantau') return false;
  
  const kondisi = (victim.kondisiTerakhir || '').trim().toLowerCase();
  if (kondisi === 'sudah pulang' || kondisi === 'pulang' || kondisi === 'selesai') return false;
  if (kondisi === 'meninggal dunia' && victim.statusKonfirmasiKondisi === 'Terkonfirmasi') return false;
  
  return true;
}

export default function KabagOfficerDirectory() {
  const navigate = useNavigate();
  const location = useLocation();

  // Storage data
  const filterValidOfficers = (list) => {
    const DUMMY_FILTER = ['citra dewi', 'budi santoso', 'eko prasetyo', 'doni setiawan', 'maya anggraini', 'hendra pratama', 'siti nurhaliza', 'dimas anggara', 'ahmad fauzi', 'adi putra'];
    return (list || []).filter((o) => {
      const lower = (o.nama || '').toLowerCase();
      return !DUMMY_FILTER.some((d) => lower.includes(d));
    });
  };

  const [officers, setOfficers] = useState(() => filterValidOfficers(storageService.getOfficers()));
  const [victims, setVictims] = useState(() => storageService.getVictims());
  const [availableHospitals, setAvailableHospitals] = useState(() => INITIAL_HOSPITALS || []);

  // Listen to live storage changes & initial backend sync
  useEffect(() => {
    storageService.syncWithBackend(true).catch(() => {});
    storageService.getOrFetchHospitals().then((res) => {
      if (Array.isArray(res)) {
        setAvailableHospitals(res.map((h) => typeof h === 'string' ? h : h.nama_rs).filter(Boolean));
      }
    }).catch(() => {});
    const handleUpdate = () => {
      setOfficers(filterValidOfficers(storageService.getOfficers()));
      setVictims(storageService.getVictims());
    };
    window.addEventListener('jr_victims_updated', handleUpdate);
    window.addEventListener('jr_officers_updated', handleUpdate);
    return () => {
      window.removeEventListener('jr_victims_updated', handleUpdate);
      window.removeEventListener('jr_officers_updated', handleUpdate);
    };
  }, []);

  // View Mode: 'table' (Tabel Matriks) or 'grid' (Kartu 4 Pilar)
  const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table'));

  // Filters & Search
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [hospitalFilter, setHospitalFilter] = useState('ALL');

  // Modal: View Assigned Victims for a specific officer
  const [activeOfficerModal, setActiveOfficerModal] = useState(null);
  const [modalVictimTab, setModalVictimTab] = useState('active'); // 'all', 'active', 'finished'

  // Drawer: View & Audit specific victim
  const [selectedVictimForDrawer, setSelectedVictimForDrawer] = useState(null);

  // Modal: Tambah Petugas Baru
  const [isAddOfficerModalOpen, setIsAddOfficerModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Modal: Konfirmasi Hapus Petugas
  const [officerToDelete, setOfficerToDelete] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState(null);

  // Listen to incoming redirect toastMessage (misal setelah hapus di halaman detail)
  useEffect(() => {
    if (location.state?.toastMessage) {
      setToastMessage(location.state.toastMessage);
      window.history.replaceState({}, document.title);
      const timer = setTimeout(() => setToastMessage(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const handleConfirmDeleteFromDirectory = async () => {
    if (!officerToDelete) return;
    try {
      const backendId = officerToDelete.backendOfficerId || officerToDelete.backendId || Number(String(officerToDelete.id).replace(/\D/g, ''));
      if (backendId) {
        try {
          await api.deleteOfficer(backendId);
        } catch (apiErr) {
          console.warn('[KabagOfficerDirectory] Gagal delete officer backend:', apiErr.message);
        }
      }
      storageService.deleteOfficer(officerToDelete.id);
      setIsDeleteModalOpen(false);
      if (activeOfficerModal && activeOfficerModal.id === officerToDelete.id) {
        setActiveOfficerModal(null);
      }
      setToastMessage(`Data petugas ${officerToDelete.nama} berhasil dinonaktifkan dari sistem.`);
      setOfficerToDelete(null);
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err) {
      setDeleteModalError(err.message || 'Gagal menghapus data petugas.');
    }
  };

  const initialOfficerForm = {
    nama: '',
    nip: '',
    jabatan: 'Mobile Service Officer',
    wilayah: 'Pekanbaru Kota',
    customWilayah: '',
    telepon: '',
    email: '',
    status: 'Aktif Lapangan',
    plottingRs: [],
    newRsInput: '',
    username: '',
    password: 'petugasjasaraharja',
    showPassword: false
  };
  const [newOfficerForm, setNewOfficerForm] = useState(initialOfficerForm);
  const [isSubmittingOfficer, setIsSubmittingOfficer] = useState(false);
  const [createdAccountModal, setCreatedAccountModal] = useState(null);
  const [copiedCredential, setCopiedCredential] = useState(false);

  const handleToggleHospitalSelection = (rsName) => {
    setNewOfficerForm((prev) => {
      const exists = prev.plottingRs.includes(rsName);
      const nextList = exists
        ? prev.plottingRs.filter((r) => r !== rsName)
        : [...prev.plottingRs, rsName];
      return { ...prev, plottingRs: nextList };
    });
  };

  const handleAddCustomHospital = () => {
    const custom = (newOfficerForm.newRsInput || '').trim();
    if (!custom) return;
    if (!newOfficerForm.plottingRs.includes(custom)) {
      setNewOfficerForm((prev) => ({
        ...prev,
        plottingRs: [...prev.plottingRs, custom],
        newRsInput: ''
      }));
    } else {
      setNewOfficerForm((prev) => ({ ...prev, newRsInput: '' }));
    }
  };

  const syncOfficerHospitalsToBackend = async (officerIdOrLocalId, hospitalNames = []) => {
    if (!officerIdOrLocalId) return;
    let backendId = Number(String(officerIdOrLocalId).replace(/\D/g, ''));
    if (!backendId || isNaN(backendId)) return;

    try {
      const masterHospitals = await api.getHospitals(true);
      const currentPlots = await api.getOfficerHospitals(backendId).catch(() => []);
      const currentHospitalIds = new Set((currentPlots || []).map((p) => p.hospital_id));

      const targetHospitalIds = new Set();
      for (let i = 0; i < hospitalNames.length; i++) {
        const rsName = hospitalNames[i];
        let matched = masterHospitals.find(
          (h) => (h.nama_rs || '').toLowerCase().trim() === rsName.toLowerCase().trim() ||
                 (h.nama_rs || '').toLowerCase().includes(rsName.toLowerCase()) ||
                 rsName.toLowerCase().includes((h.nama_rs || '').toLowerCase())
        );

        if (!matched) {
          try {
            matched = await api.createHospital({
              nama_rs: rsName,
              alamat: 'Pekanbaru, Riau',
              latitude: 0.5071,
              longitude: 101.4478,
              radius_meter: 200
            });
          } catch (_) {}
        }

        if (matched && matched.id) {
          targetHospitalIds.add(matched.id);
          if (!currentHospitalIds.has(matched.id)) {
            await api.plotHospitalToOfficer(backendId, matched.id, i === 0).catch(() => {});
          }
        }
      }

      // Lepas relasi RS di backend yang sudah tidak dipilih
      for (const existingPlot of currentPlots || []) {
        if (!targetHospitalIds.has(existingPlot.hospital_id)) {
          await api.removeHospitalFromOfficer(backendId, existingPlot.hospital_id).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[syncOfficerHospitalsToBackend] Warning:', err.message);
    }
  };

  const handleCreateOfficer = async (e) => {
    e.preventDefault();
    if (!newOfficerForm.nama.trim()) {
      alert('Mohon masukkan nama lengkap petugas.');
      return;
    }

    // Validasi Nomor HP Wajib & Format Indonesia
    const cleanPhone = (newOfficerForm.telepon || '').trim();
    if (!cleanPhone) {
      alert('Nomor HP petugas wajib diisi untuk keperluan koordinasi dan notifikasi penugasan.');
      return;
    }
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15 || (!cleanPhone.startsWith('08') && !cleanPhone.startsWith('628') && !cleanPhone.startsWith('+628'))) {
      alert('Format nomor HP tidak valid. Masukkan nomor HP aktif diawali 08 atau 628 dengan minimal 10 digit angka.');
      return;
    }

    // Validasi Email Wajib & Format Email Valid
    const cleanEmail = (newOfficerForm.email || '').trim();
    if (!cleanEmail) {
      alert('Email kedinasan petugas wajib diisi.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      alert('Format email tidak valid. Masukkan alamat email yang benar (contoh: petugas@jasaraharja.co.id).');
      return;
    }

    if (!newOfficerForm.plottingRs || newOfficerForm.plottingRs.length === 0) {
      alert('Mohon pilih minimal satu rumah sakit tanggung jawab (plotting RS) untuk petugas.');
      return;
    }

    const finalWilayah =
      newOfficerForm.wilayah === 'OTHER'
        ? (newOfficerForm.customWilayah || 'Pekanbaru Kota').trim()
        : newOfficerForm.wilayah;

    let cleanUsername = (newOfficerForm.username || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
    
    if (!cleanUsername) {
      const firstWord = newOfficerForm.nama.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
      cleanUsername = firstWord || 'petugas';
    }

    const finalPassword = (newOfficerForm.password || '').trim() || 'petugasjasaraharja';

    setIsSubmittingOfficer(true);
    let backendOfficerId = null;

    try {
      // 1. Simpan data personil petugas ke backend MySQL (tabel officers)
      const officerRes = await api.createOfficer({
        nama: newOfficerForm.nama.trim(),
        nip: newOfficerForm.nip.trim() || null,
        jabatan: newOfficerForm.jabatan.trim() || 'Mobile Service Officer',
        wilayah: finalWilayah,
        telepon: cleanPhone,
        email: cleanEmail
      });

      if (officerRes && officerRes.id) {
        backendOfficerId = officerRes.id;

        // 2. Buat akun login petugas di backend MySQL (tabel users)
        try {
          await api.createUser({
            username: cleanUsername,
            password: finalPassword,
            role: 'petugas',
            officer_id: officerRes.id
          });
        } catch (userErr) {
          console.warn('[KabagOfficerDirectory] Gagal buat user login backend:', userErr.message);
          // Jika username sudah dipakai, tambahkan suffix ID petugas
          if (userErr.message && (userErr.message.includes('sudah digunakan') || userErr.message.includes('Duplicate entry'))) {
            cleanUsername = `${cleanUsername}_${officerRes.id}`;
            await api.createUser({
              username: cleanUsername,
              password: finalPassword,
              role: 'petugas',
              officer_id: officerRes.id
            });
          }
        }

        // 3. Hubungkan plotting rumah sakit ke backend MySQL (tabel officer_hospitals)
        await syncOfficerHospitalsToBackend(officerRes.id, newOfficerForm.plottingRs);
      }
    } catch (err) {
      console.warn('[KabagOfficerDirectory] Backend createOfficer fallback:', err.message);
    }

    // 4. Simpan ke local storage service (agar langsung reaktif di UI frontend)
    const saved = storageService.addOfficer({
      backendId: backendOfficerId,
      backendOfficerId: backendOfficerId,
      username: cleanUsername,
      password: finalPassword,
      nama: newOfficerForm.nama.trim(),
      nip: newOfficerForm.nip.trim() || undefined,
      jabatan: newOfficerForm.jabatan.trim() || 'Mobile Service Officer',
      wilayah: finalWilayah,
      telepon: cleanPhone,
      email: cleanEmail,
      status: newOfficerForm.status,
      plottingRs: [...newOfficerForm.plottingRs]
    });

    setIsSubmittingOfficer(false);
    setIsAddOfficerModalOpen(false);

    // Buka modal kredensial akun sukses untuk Kabag
    setCreatedAccountModal({
      nama: newOfficerForm.nama.trim(),
      officerId: saved.id || (backendOfficerId ? `PET-${String(backendOfficerId).padStart(2, '0')}` : 'PET-03'),
      username: cleanUsername,
      telepon: cleanPhone,
      email: cleanEmail,
      wilayah: finalWilayah,
      plottingRs: newOfficerForm.plottingRs
    });

    setNewOfficerForm(initialOfficerForm);
    setToastMessage(`Akun Petugas ${saved.nama} berhasil diterbitkan dan siap login.`);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // ── MODAL: EDIT PETUGAS & PENUGASAN RS ──
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [editForm, setEditForm] = useState({
    nama: '',
    nip: '',
    jabatan: 'Mobile Service Officer',
    wilayah: 'Pekanbaru Kota',
    customWilayah: '',
    telepon: '',
    email: '',
    status: 'Aktif Lapangan',
    plottingRs: [],
    newRsInput: ''
  });

  const handleOpenEditModal = (officer) => {
    setEditingOfficer(officer);
    setEditForm({
      nama: officer.nama || '',
      nip: officer.nip && officer.nip !== '—' ? officer.nip : '',
      jabatan: officer.jabatan || 'Mobile Service Officer',
      wilayah: officer.wilayah || 'Pekanbaru Kota',
      customWilayah: '',
      telepon: officer.telepon && officer.telepon !== '—' ? officer.telepon : '',
      email: officer.email && officer.email !== '—' ? officer.email : '',
      status: officer.status || 'Aktif Lapangan',
      plottingRs: Array.isArray(officer.plottingRs) ? [...officer.plottingRs] : [],
      newRsInput: ''
    });
    setIsEditModalOpen(true);
  };

  const handleToggleEditHospital = (rsName) => {
    setEditForm((prev) => {
      const exists = prev.plottingRs.includes(rsName);
      const nextList = exists
        ? prev.plottingRs.filter((r) => r !== rsName)
        : [...prev.plottingRs, rsName];
      return { ...prev, plottingRs: nextList };
    });
  };

  const handleAddCustomEditHospital = () => {
    const custom = (editForm.newRsInput || '').trim();
    if (!custom) return;
    if (!editForm.plottingRs.includes(custom)) {
      setEditForm((prev) => ({
        ...prev,
        plottingRs: [...prev.plottingRs, custom],
        newRsInput: ''
      }));
    } else {
      setEditForm((prev) => ({ ...prev, newRsInput: '' }));
    }
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingOfficer) return;
    if (!editForm.nama.trim()) {
      alert('Nama petugas wajib diisi.');
      return;
    }

    const cleanPhone = (editForm.telepon || '').trim();
    if (cleanPhone && cleanPhone !== '—') {
      const phoneDigits = cleanPhone.replace(/\D/g, '');
      if (phoneDigits.length < 10 || phoneDigits.length > 15 || (!cleanPhone.startsWith('08') && !cleanPhone.startsWith('628') && !cleanPhone.startsWith('+628'))) {
        alert('Format nomor HP tidak valid. Masukkan nomor HP aktif diawali 08 atau 628 dengan minimal 10 digit angka.');
        return;
      }
    }

    const cleanEmail = (editForm.email || '').trim();
    if (cleanEmail && cleanEmail !== '—') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        alert('Format email tidak valid. Masukkan alamat email yang benar.');
        return;
      }
    }

    const finalWilayah =
      editForm.wilayah === 'OTHER'
        ? (editForm.customWilayah || 'Pekanbaru Kota').trim()
        : editForm.wilayah;

    const finalPlottingRs = [...editForm.plottingRs];

    const updated = storageService.updateOfficer(editingOfficer.id, {
      nama: editForm.nama.trim(),
      nip: editForm.nip.trim() || '—',
      jabatan: editForm.jabatan.trim() || 'Mobile Service Officer',
      wilayah: finalWilayah,
      telepon: cleanPhone || '—',
      email: cleanEmail || '—',
      status: editForm.status,
      plottingRs: finalPlottingRs
    });

    // Sinkronkan ke database backend MySQL (tabel officers & officer_hospitals)
    const targetOfficerId = editingOfficer.backendOfficerId || editingOfficer.backendId || Number(String(editingOfficer.id).replace(/\D/g, ''));
    if (targetOfficerId) {
      api.updateOfficer(targetOfficerId, {
        nama: editForm.nama.trim(),
        nip: editForm.nip.trim() || null,
        jabatan: editForm.jabatan.trim() || 'Mobile Service Officer',
        wilayah: finalWilayah,
        telepon: cleanPhone && cleanPhone !== '—' ? cleanPhone : null,
        email: cleanEmail && cleanEmail !== '—' ? cleanEmail : null,
        is_active: editForm.status !== 'Nonaktif'
      }).catch((e) => console.warn('[KabagOfficerDirectory] updateOfficer backend warning:', e.message));
    }
    syncOfficerHospitalsToBackend(targetOfficerId, finalPlottingRs);

    setIsEditModalOpen(false);
    setEditingOfficer(null);
    setToastMessage(`Data dan penugasan RS untuk ${updated.nama} berhasil diperbarui.`);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // ── MODAL: ATUR PENUGASAN RS KHUSUS ──
  const [isHospitalAssignmentModalOpen, setIsHospitalAssignmentModalOpen] = useState(false);
  const [assignmentOfficer, setAssignmentOfficer] = useState(null);
  const [assignmentRsList, setAssignmentRsList] = useState([]);
  const [newAssignmentRsInput, setNewAssignmentRsInput] = useState('');

  const handleOpenHospitalAssignmentModal = (officer) => {
    setAssignmentOfficer(officer);
    setAssignmentRsList(Array.isArray(officer.plottingRs) ? [...officer.plottingRs] : []);
    setNewAssignmentRsInput('');
    setIsHospitalAssignmentModalOpen(true);
  };

  const handleToggleAssignmentHospital = (rs) => {
    setAssignmentRsList((prev) =>
      prev.includes(rs) ? prev.filter((r) => r !== rs) : [...prev, rs]
    );
  };

  const handleAddCustomAssignmentHospital = () => {
    const clean = newAssignmentRsInput.trim();
    if (!clean) return;
    if (!assignmentRsList.includes(clean)) {
      setAssignmentRsList((prev) => [...prev, clean]);
    }
    setNewAssignmentRsInput('');
  };

  const handleSaveHospitalAssignment = () => {
    if (!assignmentOfficer) return;
    const finalPlottingRs = [...assignmentRsList];
    const updated = storageService.updateOfficer(assignmentOfficer.id, {
      plottingRs: finalPlottingRs
    });

    // Sinkronkan ke database backend MySQL (tabel officer_hospitals)
    const targetOfficerId = assignmentOfficer.backendOfficerId || assignmentOfficer.backendId || Number(String(assignmentOfficer.id).replace(/\D/g, ''));
    syncOfficerHospitalsToBackend(targetOfficerId, finalPlottingRs);

    setIsHospitalAssignmentModalOpen(false);
    setAssignmentOfficer(null);
    setToastMessage(`Penugasan rumah sakit untuk ${updated.nama} berhasil diperbarui (${finalPlottingRs.length} RS).`);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Quick toggle status aktif/nonaktif
  const handleQuickToggleStatus = async (officer) => {
    const nextStatus = officer.status === 'Nonaktif' ? 'Aktif Lapangan' : 'Nonaktif';
    const updated = storageService.updateOfficer(officer.id, { status: nextStatus });
    const targetOfficerId = officer.backendOfficerId || officer.backendId || Number(String(officer.id).replace(/\D/g, ''));
    if (targetOfficerId) {
      try {
        await api.updateOfficer(targetOfficerId, {
          is_active: nextStatus !== 'Nonaktif'
        });
      } catch (err) {
        console.warn('[KabagOfficerDirectory] toggle status backend warning:', err.message);
      }
    }
    setToastMessage(`Status petugas ${updated.nama} diubah menjadi "${nextStatus}".`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Extract distinct regions & hospitals for filter options
  const uniqueRegions = useMemo(() => {
    const set = new Set();
    officers.forEach((o) => {
      if (o.wilayah) set.add(o.wilayah);
    });
    return Array.from(set).sort();
  }, [officers]);

  const uniqueHospitals = useMemo(() => {
    const set = new Set();
    officers.forEach((o) => {
      (o.plottingRs || []).forEach((rs) => set.add(rs));
    });
    return Array.from(set).sort();
  }, [officers]);

  // Aggregate metrics per officer (menjawab pertanyaan pilar ke-4 secara akurat dan tersinkronisasi)
  const officerWorkloads = useMemo(() => {
    const map = {};
    officers.forEach((off) => {
      const assigned = storageService.getVictimsByOfficer(off);

      const active = assigned.filter(isVictimActive);
      const finished = assigned.filter((v) => !isVictimActive(v));

      // Calculate load % (default max 10 cases)
      const pct = Math.min(100, Math.round((active.length / 10) * 100));

      map[off.id] = {
        allVictims: assigned,
        activeVictims: active,
        finishedVictims: finished,
        activeCount: active.length,
        totalCount: assigned.length,
        capacityText: `${active.length}/10 Kasus`,
        loadPct: pct > 0 ? pct : (off.bebanKasusPct || 0)
      };
    });
    return map;
  }, [officers, victims]);

  // Global aggregate metrics (4 Header Cards)
  const globalMetrics = useMemo(() => {
    const totalOfficers = officers.length;
    const activeOfficersCount = officers.filter(
      (o) => o.status === 'Aktif Lapangan' || !o.status
    ).length;
    
    let totalActiveVictims = 0;
    Object.values(officerWorkloads).forEach((wl) => {
      totalActiveVictims += wl.activeCount;
    });

    return {
      totalOfficers,
      activeOfficersCount,
      totalRegions: uniqueRegions.length,
      totalHospitals: uniqueHospitals.length,
      totalActiveVictims
    };
  }, [officers, uniqueRegions, uniqueHospitals, officerWorkloads]);

  // Filtered officers list
  const filteredOfficers = useMemo(() => {
    return officers.filter((off) => {
      const workload = officerWorkloads[off.id] || { activeCount: 0 };
      const q = search.toLowerCase().trim();

      // Search matches
      const matchSearch =
        !q ||
        off.nama.toLowerCase().includes(q) ||
        off.nip.toLowerCase().includes(q) ||
        off.wilayah.toLowerCase().includes(q) ||
        (off.telepon && off.telepon.toLowerCase().includes(q)) ||
        (off.email && off.email.toLowerCase().includes(q)) ||
        (off.plottingRs && off.plottingRs.some((rs) => rs.toLowerCase().includes(q)));

      if (!matchSearch) return false;

      // Region filter
      if (regionFilter !== 'ALL' && off.wilayah !== regionFilter) return false;

      // Status filter
      if (statusFilter !== 'ALL' && off.status !== statusFilter) return false;

      // Hospital filter
      if (
        hospitalFilter !== 'ALL' &&
        !(off.plottingRs && off.plottingRs.includes(hospitalFilter))
      ) {
        return false;
      }

      return true;
    });
  }, [officers, search, regionFilter, statusFilter, hospitalFilter, officerWorkloads]);

  const resetFilters = () => {
    setSearch('');
    setRegionFilter('ALL');
    setStatusFilter('ALL');
    setHospitalFilter('ALL');
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'No',
      'Nama Petugas',
      'NIP',
      'Jabatan',
      'Status Petugas',
      'Wilayah Tugas',
      'Rumah Sakit Ditangani',
      'Korban Aktif Tanggung Jawab',
      'Total Korban Ditangani',
      'Kapasitas Beban',
      'Nomor Telepon',
      'Email'
    ];

    const rows = filteredOfficers.map((off, index) => {
      const wl = officerWorkloads[off.id] || { activeCount: 0, totalCount: 0, capacityText: '0/10' };
      const rsList = (off.plottingRs || []).join('; ');
      return [
        index + 1,
        `"${off.nama}"`,
        `"'\t${off.nip}"`, // prevent excel exponential format
        `"${off.jabatan || 'Mobile Service Officer'}"`,
        `"${off.status || 'Aktif Lapangan'}"`,
        `"${off.wilayah || '—'}"`,
        `"${rsList}"`,
        wl.activeCount,
        wl.totalCount,
        `"${wl.capacityText}"`,
        `"${off.telepon || '—'}"`,
        `"${off.email || '—'}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Data_Petugas_Jasa_Raharja_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Open Assigned Victims modal
  const handleOpenOfficerVictims = (officer) => {
    setActiveOfficerModal(officer);
    setModalVictimTab('active');
  };

  // Modal active victims filtered by tab
  const modalDisplayedVictims = useMemo(() => {
    if (!activeOfficerModal) return [];
    const wl = officerWorkloads[activeOfficerModal.id] || {
      allVictims: [],
      activeVictims: [],
      finishedVictims: []
    };

    if (modalVictimTab === 'active') return wl.activeVictims;
    if (modalVictimTab === 'finished') return wl.finishedVictims;
    return wl.allVictims;
  }, [activeOfficerModal, modalVictimTab, officerWorkloads]);

  const getStatusDisplay = (status) => {
    if (status === 'Nonaktif') return { label: 'Nonaktif', color: 'text-slate-500', dot: 'bg-slate-400' };
    if (status === 'Verifikasi Berkas') return { label: 'Verifikasi Berkas', color: 'text-blue-700', dot: 'bg-blue-500' };
    if (status === 'Perlu Perhatian') return { label: 'Perlu Perhatian', color: 'text-rose-700', dot: 'bg-rose-500' };
    return { label: 'Aktif Lapangan', color: 'text-emerald-700', dot: 'bg-emerald-500' };
  };

  const renderHospitalSummary = (hospitals, compact = false) => {
    const listedHospitals = hospitals || [];
    const visibleHospitals = listedHospitals.slice(0, compact ? 1 : 2);
    const remaining = listedHospitals.length - visibleHospitals.length;

    if (listedHospitals.length === 0) {
      return <span className="text-[11px] text-slate-400">Belum ada RS ditugaskan</span>;
    }

    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
        {visibleHospitals.map((hospital) => (
          <span key={hospital} className="truncate max-w-[170px]">{hospital}</span>
        ))}
        {remaining > 0 && (
          <span className="text-slate-400 whitespace-nowrap">+{remaining} lainnya</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Section (Bentuk Identik Petugas) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Data Petugas Lapangan
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
            Direktori personil petugas Jasa Raharja, penugasan wilayah, rumah sakit yang ditangani, dan kapasitas beban kasus.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* View mode toggle */}
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-[#0A3981] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Tampilan Tabel Matriks"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabel Matriks</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-[#0A3981] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Tampilan Kartu 4 Pilar"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kartu Profil</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Data (.CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddOfficerModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-2xs transition-all active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Petugas Baru</span>
          </button>
        </div>
      </div>


      {/* 2. Four Metric Cards representing the 4 Core Questions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Pilar 1: Siapa Petugasnya? */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex items-center gap-3.5 hover:border-blue-300 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center shrink-0 border border-blue-100">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              1. Siapa Petugasnya
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-black text-slate-900">
                {globalMetrics.totalOfficers}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Petugas</span>
            </div>
            <p className="text-[10px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {globalMetrics.activeOfficersCount} Aktif Lapangan
            </p>
          </div>
        </div>

        {/* Pilar 2: Di Mana Wilayah Tugasnya? */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex items-center gap-3.5 hover:border-emerald-300 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              2. Wilayah Tugas
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-black text-slate-900">
                {globalMetrics.totalRegions}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Wilayah</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
              Pekanbaru, Kampar, Dumai, dll.
            </p>
          </div>
        </div>

        {/* Pilar 3: Rumah Sakit Mana yang Ditangani? */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex items-center gap-3.5 hover:border-indigo-300 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              3. RS yang Ditangani
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-black text-slate-900">
                {globalMetrics.totalHospitals}
              </span>
              <span className="text-xs text-slate-500 font-semibold">RS Rujukan</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
              Plotting Fasilitas Kesehatan
            </p>
          </div>
        </div>

        {/* Pilar 4: Berapa Korban yang Sedang Menjadi Tanggung Jawabnya? */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex items-center gap-3.5 hover:border-amber-300 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-100">
            <HeartHandshake className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              4. Korban Tanggung Jawab
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-black text-slate-900">
                {globalMetrics.totalActiveVictims}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Korban Aktif</span>
            </div>
            <p className="text-[10px] text-amber-700 font-medium mt-0.5">
              Pasien dirawat / dipantau
            </p>
          </div>
        </div>
      </div>

      {/* 3. Search and Multi-Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama petugas, NIP, wilayah tugas, atau rumah sakit..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0] bg-slate-50/70 text-xs text-slate-900"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Wilayah */}
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="bg-slate-50/70 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Wilayah: Semua Wilayah</option>
              {uniqueRegions.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>

            {/* Filter Rumah Sakit */}
            <select
              value={hospitalFilter}
              onChange={(e) => setHospitalFilter(e.target.value)}
              className="bg-slate-50/70 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Rumah Sakit: Semua RS</option>
              {uniqueHospitals.map((rs) => (
                <option key={rs} value={rs}>
                  {rs}
                </option>
              ))}
            </select>

            {/* Filter Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50/70 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Status: Semua Status</option>
              <option value="Aktif Lapangan">Aktif Lapangan</option>
              <option value="Verifikasi Berkas">Verifikasi Berkas</option>
              <option value="Perlu Perhatian">Perlu Perhatian</option>
            </select>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded hover:bg-slate-100 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <span>
            Menampilkan <strong>{filteredOfficers.length}</strong> dari{' '}
            <strong>{officers.length}</strong> petugas operasional Jasa Raharja
          </span>
          <span className="text-slate-400">
            Klik nama petugas atau tombol &quot;Lihat Korban&quot; untuk rincian tanggung jawab
          </span>
        </div>
      </div>

      {/* 4. Main Content: Empty State OR (Table / Grid View) */}
      {officers.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center space-y-4 shadow-2xs">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#0A3981] flex items-center justify-center mx-auto border border-blue-100 shadow-xs">
            <Users className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              Belum Ada Data Petugas JR Terdaftar
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Sistem saat ini belum memiliki data personil petugas lapangan. Silakan tambahkan data petugas baru untuk mulai memetakan penugasan rumah sakit rujukan dan memantau pelayanan korban.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddOfficerModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-xs transition-all active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Petugas Pertama</span>
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* ======================== TABEL MATRIKS 4 PILAR ======================== */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200/90 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-3 text-center w-12">NO</th>
                  <th className="py-3 px-4 min-w-[240px]">
                    <div className="flex items-center gap-1.5 text-slate-900 font-black">
                      <Users className="w-3.5 h-3.5 text-[#0A3981]" />
                      <span>1. SIAPA PETUGASNYA</span>
                    </div>
                    <span className="text-[9px] font-normal text-slate-400 block normal-case">
                      Nama, NIP, Kontak &amp; Status
                    </span>
                  </th>
                  <th className="py-3 px-4 min-w-[160px]">
                    <div className="flex items-center gap-1.5 text-slate-900 font-black">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>2. WILAYAH TUGAS</span>
                    </div>
                    <span className="text-[9px] font-normal text-slate-400 block normal-case">
                      Area Operasional Penugasan
                    </span>
                  </th>
                  <th className="py-3 px-4 min-w-[240px]">
                    <div className="flex items-center gap-1.5 text-slate-900 font-black">
                      <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>3. RUMAH SAKIT DITANGANI</span>
                    </div>
                    <span className="text-[9px] font-normal text-slate-400 block normal-case">
                      Plotting Faskes Rujukan &amp; Penugasan
                    </span>
                  </th>
                  <th className="py-3 px-4 min-w-[200px]">
                    <div className="flex items-center gap-1.5 text-slate-900 font-black">
                      <HeartHandshake className="w-3.5 h-3.5 text-amber-600" />
                      <span>4. KORBAN TANGGUNG JAWAB</span>
                    </div>
                    <span className="text-[9px] font-normal text-slate-400 block normal-case">
                      Jumlah Korban Aktif &amp; Beban
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center w-36">AKSI OPERASIONAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOfficers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-600">
                        Tidak ada petugas yang cocok dengan filter atau kata kunci
                      </p>
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#0A3981] hover:underline"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Filter Pencarian</span>
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredOfficers.map((off, index) => {
                    const no = index + 1;
                    const wl = officerWorkloads[off.id] || {
                      activeCount: 0,
                      totalCount: 0,
                      capacityText: '0/10 Kasus',
                      loadPct: 0
                    };

                    return (
                      <tr key={off.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* NO */}
                        <td className="py-4 px-3 text-center font-bold text-slate-400">
                          {no}
                        </td>

                        {/* 1. SIAPA PETUGASNYA */}
                        <td className="py-4 px-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0A3981] to-[#145DA0] text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                              {off.avatar || 'JR'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/kabag/kinerja-petugas/${off.id}`}
                                className="font-extrabold text-slate-900 block text-xs hover:text-[#0A3981] transition-colors hover:underline"
                              >
                                {off.nama}
                              </Link>
                              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                NIP. {off.nip}
                              </span>
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                                  <Phone className="w-2.5 h-2.5 text-slate-400" />
                                  <span>{off.telepon || '—'}</span>
                                </span>
                                {(() => {
                                  const st = getStatusDisplay(off.status);
                                  return (
                                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${st.color}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                      <span>{st.label}</span>
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. WILAYAH TUGAS */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{off.wilayah}</span>
                          </div>
                        </td>

                        {/* 3. RUMAH SAKIT DITANGANI */}
                        <td className="py-4 px-4">
                          {renderHospitalSummary(off.plottingRs)}
                          <div className="flex items-center justify-between gap-2 mt-1.5 max-w-xs">
                            <span className="text-[10px] text-slate-400 font-medium">
                              Total {(off.plottingRs || []).length} Fasilitas Kesehatan
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenHospitalAssignmentModal(off)}
                              className="text-[10px] font-bold text-[#0A3981] hover:text-[#072B62] hover:underline cursor-pointer"
                              title="Atur penugasan rumah sakit untuk petugas ini"
                            >
                              Atur RS
                            </button>
                          </div>
                        </td>

                        {/* 4. KORBAN TANGGUNG JAWAB */}
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-bold text-slate-900">
                              {wl.activeCount} Korban Aktif
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {wl.capacityText} ({wl.loadPct}%)
                            </span>
                          </div>

                          {/* Progress bar kapasitas beban */}
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                wl.loadPct >= 90
                                  ? 'bg-rose-500'
                                  : wl.loadPct >= 70
                                  ? 'bg-[#0A3981]'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.max(8, wl.loadPct)}%` }}
                            />
                          </div>
                        </td>

                        {/* AKSI OPERASIONAL */}
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          <div className="flex flex-col gap-1.5 items-center justify-center">
                            <button
                              type="button"
                              onClick={() => handleOpenOfficerVictims(off)}
                              className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 text-[#0A3981] hover:bg-blue-100 border border-blue-200 transition-colors inline-flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Lihat Korban</span>
                            </button>
                            <div className="flex items-center gap-1 w-full">
                              <Link
                                to={`/kabag/kinerja-petugas/${off.id}`}
                                className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#0A3981] text-white hover:bg-[#072B62] transition-colors shadow-2xs"
                              >
                                <span>Detail</span>
                                <ChevronRight className="w-3 h-3" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(off)}
                                title="Edit Petugas & Penugasan RS"
                                className="p-1.5 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteModalError(null);
                                  setOfficerToDelete(off);
                                  setIsDeleteModalOpen(true);
                                }}
                                title="Hapus Petugas Ini"
                                className="p-1.5 rounded-lg text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
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
      ) : (
        /* ======================== GRID KARTU PROFIL 4 PILAR ======================== */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOfficers.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">
                Tidak ada data petugas yang cocok
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#0A3981] hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filter</span>
              </button>
            </div>
          ) : (
            filteredOfficers.map((off) => {
              const wl = officerWorkloads[off.id] || {
                activeCount: 0,
                totalCount: 0,
                capacityText: '0/10 Kasus',
                loadPct: 0
              };

              return (
                <div
                  key={off.id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow overflow-hidden flex flex-col"
                >
                  {/* Card Header: 1. SIAPA PETUGASNYA */}
                  <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/70 to-blue-50/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0A3981] to-[#145DA0] text-white font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
                          {off.avatar || 'JR'}
                        </div>
                        <div>
                          <Link
                            to={`/kabag/kinerja-petugas/${off.id}`}
                            className="font-extrabold text-slate-900 text-sm hover:text-[#0A3981] hover:underline block leading-snug"
                          >
                            {off.nama}
                          </Link>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            NIP. {off.nip}
                          </span>
                        </div>
                      </div>
                      <div>
                        {(() => {
                          const st = getStatusDisplay(off.status);
                          return (
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${st.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                              <span>{st.label}</span>
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{off.telepon || '—'}</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[140px]">{off.email || '—'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Card Body: 2, 3, 4 Pillars */}
                  <div className="p-4 space-y-3.5 flex-1 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Wilayah Tugas</span>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{off.wilayah}</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">RS Ditangani ({(off.plottingRs || []).length})</span>
                        <button type="button" onClick={() => handleOpenHospitalAssignmentModal(off)} className="text-[10px] font-bold text-[#0A3981] hover:underline cursor-pointer" title="Atur penugasan rumah sakit">Atur RS</button>
                      </div>
                      {renderHospitalSummary(off.plottingRs)}
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-xs font-bold text-slate-900">{wl.activeCount} Korban Aktif</span>
                        <span className="text-[10px] text-slate-400 font-mono">{wl.capacityText} ({wl.loadPct}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                        <div className={`h-full rounded-full ${wl.loadPct >= 90 ? 'bg-rose-500' : wl.loadPct >= 70 ? 'bg-[#0A3981]' : 'bg-emerald-500'}`} style={{ width: `${Math.max(8, wl.loadPct)}%` }} />
                      </div>
                      <button type="button" onClick={() => handleOpenOfficerVictims(off)} className="w-full mt-3 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100/80 text-[#0A3981] border border-blue-200/80 text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer">
                        <Eye className="w-3.5 h-3.5" />
                        <span>Lihat {wl.activeCount} Korban Tanggung Jawab</span>
                      </button>
                    </div>
                  </div>

                  {/* Card Footer: Detail Link & Delete */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-400">
                      Total riwayat: <strong>{wl.totalCount}</strong> korban
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(off)}
                        title="Edit Petugas & Penugasan RS"
                        className="p-1 rounded text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteModalError(null);
                          setOfficerToDelete(off);
                          setIsDeleteModalOpen(true);
                        }}
                        title="Hapus Petugas Ini"
                        className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <Link
                        to={`/kabag/kinerja-petugas/${off.id}`}
                        className="inline-flex items-center gap-1 font-bold text-[#0A3981] hover:text-[#072B62]"
                      >
                        <span>Evaluasi Kinerja</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: DAFTAR KORBAN TANGGUNG JAWAB PETUGAS                            */}
      {/* ========================================================================= */}
      {activeOfficerModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0A3981] to-[#145DA0] text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                  {activeOfficerModal.avatar || 'JR'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      Korban Tanggung Jawab: {activeOfficerModal.nama}
                    </h2>
                    <span className="text-xs font-semibold text-slate-500">
                      • {activeOfficerModal.wilayah}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    NIP. {activeOfficerModal.nip} • Plotting RS:{' '}
                    {(activeOfficerModal.plottingRs || []).join(', ')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveOfficerModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                title="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Sub-filter Tabs */}
            <div className="px-5 pt-2 pb-2 border-b border-slate-100 flex items-center gap-1.5 bg-white text-xs">
              <button
                type="button"
                onClick={() => setModalVictimTab('active')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  modalVictimTab === 'active'
                    ? 'bg-slate-100 text-slate-900 font-bold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Korban Aktif ({officerWorkloads[activeOfficerModal.id]?.activeCount || 0})
              </button>
              <button
                type="button"
                onClick={() => setModalVictimTab('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  modalVictimTab === 'all'
                    ? 'bg-slate-100 text-slate-900 font-bold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Semua ({officerWorkloads[activeOfficerModal.id]?.totalCount || 0})
              </button>
              <button
                type="button"
                onClick={() => setModalVictimTab('finished')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  modalVictimTab === 'finished'
                    ? 'bg-slate-100 text-slate-900 font-bold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Selesai Dipantau ({officerWorkloads[activeOfficerModal.id]?.finishedVictims?.length || 0})
              </button>
            </div>

            {/* Modal Table Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              {modalDisplayedVictims.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">
                    Tidak ada korban pada kategori ini
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Semua tugas pemantauan untuk kategori ini telah selesai atau belum ada penugasan baru.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-10">NO</th>
                        <th className="py-2.5 px-3">KORBAN &amp; USIA</th>
                        <th className="py-2.5 px-3">RUMAH SAKIT &amp; RUANGAN</th>
                        <th className="py-2.5 px-3">KONDISI TERAKHIR</th>
                        <th className="py-2.5 px-3">STATUS MONITORING</th>
                        <th className="py-2.5 px-3 text-center">STATUS SLA</th>
                        <th className="py-2.5 px-3 text-center w-28">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modalDisplayedVictims.map((vic, vIdx) => {
                        // Calculate SLA status
                        const firstVisitSla = calculateFirstVisitSla(
                          vic.tanggalInformasiDiterima,
                          vic.kunjunganPertama
                        );
                        const monitoringSla = calculateMonitoringSla(vic);
                        const currentSla = !vic.kunjunganPertama ? firstVisitSla : monitoringSla;

                        return (
                          <tr key={vic.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-3 text-center font-bold text-slate-400">
                              {vIdx + 1}
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-bold text-slate-900 block">
                                {vic.nama}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {vic.id} • {vic.usia ? `${vic.usia} Thn` : ''} ({vic.jenisKelamin || 'L'})
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-semibold text-slate-800 block">
                                {vic.rumahSakit}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[180px]">
                                {vic.ruangan || 'Rawat Inap'}
                              </span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-600">
                              {vic.kondisiTerakhir || '—'}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-600">
                              {vic.statusPemantauan || '—'}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <span className={`text-xs font-medium ${
                                currentSla.status === 'TERLAMBAT'
                                  ? 'text-rose-600'
                                  : currentSla.status === 'MENDEKATI_TENGGAT'
                                  ? 'text-amber-700'
                                  : currentSla.isCompleted
                                  ? 'text-emerald-700'
                                  : 'text-slate-500'
                              }`}>
                                {currentSla.label || (currentSla.isCompleted ? 'Terkunjungi' : 'Tepat Waktu')}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedVictimForDrawer(vic)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#0A3981] text-white hover:bg-[#072B62] transition-colors shadow-2xs"
                              >
                                <span>Audit Korban</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-slate-500">
                Menampilkan <strong>{modalDisplayedVictims.length}</strong> korban tanggung jawab
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteModalError(null);
                    setOfficerToDelete(activeOfficerModal);
                    setIsDeleteModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Hapus Petugas</span>
                </button>
                <Link
                  to={`/kabag/kinerja-petugas/${activeOfficerModal.id}`}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-[#0A3981] hover:bg-blue-50 border border-blue-200 transition-colors"
                >
                  Evaluasi Kinerja Petugas Ini
                </Link>
                <button
                  type="button"
                  onClick={() => setActiveOfficerModal(null)}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. DRAWER / MODAL: AUDIT DETAIL KORBAN                                     */}
      {/* ========================================================================= */}
      {selectedVictimForDrawer && (
        <VictimDetailDrawer
          isOpen={Boolean(selectedVictimForDrawer)}
          onClose={() => setSelectedVictimForDrawer(null)}
          victim={selectedVictimForDrawer}
        />
      )}

      {/* ========================================================================= */}
      {/* 7. TOAST NOTIFICATION                                                     */}
      {/* ========================================================================= */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-700 animate-slide-up">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL: TAMBAH DATA PETUGAS BARU (POV KABAG)                             */}
      {/* ========================================================================= */}
      {isAddOfficerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-[#0A3981] to-blue-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white border border-white/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    Tambah Petugas Lapangan Baru
                  </h3>
                  <p className="text-xs text-blue-100/90 mt-0.5">
                    Daftarkan personil baru untuk penugasan monitoring dan plotting RS di Riau
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOfficerModalOpen(false)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleCreateOfficer} className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Otoritas Kabag Banner */}
              <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Otoritas Kepala Bagian (Kabag):</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                    Kabag berwenang mendaftarkan personil baru sekaligus menerbitkan akun login sistem (username & kata sandi). Petugas yang didaftarkan dapat langsung login ke aplikasi menggunakan akun tersebut.
                  </p>
                </div>
              </div>

              {/* Seksi 1: Data Identitas & Kepegawaian */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <ShieldCheck className="w-4 h-4 text-[#0A3981]" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    1. Identitas & Kepegawaian Petugas
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nama Lengkap & Gelar <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Muhammad Ihsan, S.T."
                      value={newOfficerForm.nama}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewOfficerForm((prev) => {
                          const autoUser = val.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
                          return {
                            ...prev,
                            nama: val,
                            username: (!prev.username || prev.username === prev.nama.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '')) ? autoUser : prev.username
                          };
                        });
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      NIP / NRP Pegawai
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: 19950810 202012 1 002"
                      value={newOfficerForm.nip}
                      onChange={(e) => setNewOfficerForm({ ...newOfficerForm, nip: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Jabatan Operasional
                    </label>
                    <select
                      value={newOfficerForm.jabatan}
                      onChange={(e) => setNewOfficerForm({ ...newOfficerForm, jabatan: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Mobile Service Officer">Mobile Service Officer</option>
                      <option value="Petugas Pelayanan & Santunan">Petugas Pelayanan & Santunan</option>
                      <option value="Penanggung Jawab Samsat">Penanggung Jawab Samsat</option>
                      <option value="Staf Administrasi Klaim">Staf Administrasi Klaim</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Status Penugasan
                    </label>
                    <select
                      value={newOfficerForm.status}
                      onChange={(e) => setNewOfficerForm({ ...newOfficerForm, status: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Aktif Lapangan">Aktif Lapangan (Siap Visit)</option>
                      <option value="Siaga Kantor">Siaga Kantor / Administrasi</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Seksi 2: Wilayah Penugasan & Kontak */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    2. Wilayah Penugasan & Saluran Komunikasi
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Wilayah Kerja
                    </label>
                    <select
                      value={newOfficerForm.wilayah}
                      onChange={(e) => setNewOfficerForm({ ...newOfficerForm, wilayah: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Pekanbaru Kota">Pekanbaru Kota</option>
                      <option value="Pekanbaru Barat & Sukajadi">Pekanbaru Barat & Sukajadi</option>
                      <option value="Kampar & Tampan">Kampar & Tampan</option>
                      <option value="Rumbai & Siak">Rumbai & Siak</option>
                      <option value="Kota Dumai & Duri">Kota Dumai & Duri</option>
                      <option value="Indragiri Hilir & Pelalawan">Indragiri Hilir & Pelalawan</option>
                      <option value="Rokan Hulu & Rokan Hilir">Rokan Hulu & Rokan Hilir</option>
                      <option value="Bengkalis & Meranti">Bengkalis & Meranti</option>
                      <option value="Kuantan Singingi">Kuantan Singingi</option>
                      <option value="OTHER">+ Wilayah Lainnya (Tulis Manual)</option>
                    </select>

                    {newOfficerForm.wilayah === 'OTHER' && (
                      <input
                        type="text"
                        placeholder="Ketik nama wilayah penugasan..."
                        value={newOfficerForm.customWilayah}
                        onChange={(e) => setNewOfficerForm({ ...newOfficerForm, customWilayah: e.target.value })}
                        className="mt-2 w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>Nomor Telepon / WhatsApp</span>
                      <span className="text-[10px] text-rose-500 font-bold">* Wajib Diisi</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: 0812-7654-3210"
                      value={newOfficerForm.telepon}
                      onChange={(e) => setNewOfficerForm({ ...newOfficerForm, telepon: e.target.value })}
                      required
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Nomor aktif WhatsApp untuk penerimaan notifikasi penugasan korban baru.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>Email Kedinasan Jasa Raharja</span>
                      <span className="text-[10px] text-rose-500 font-bold">* Wajib Diisi</span>
                    </label>
                    <input
                      type="email"
                      placeholder="Contoh: ihsan@jasaraharja.co.id"
                      value={newOfficerForm.email}
                      onChange={(e) => setNewOfficerForm({ ...newOfficerForm, email: e.target.value })}
                      required
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seksi 3: Plotting Rumah Sakit Tanggung Jawab */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      3. Plotting Rumah Sakit Tanggung Jawab
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {newOfficerForm.plottingRs.length} RS Dipilih
                  </span>
                </div>

                <p className="text-xs text-slate-500">
                  Pilih rumah sakit rujukan yang menjadi tanggung jawab pemantauan petugas ini:
                </p>

                {/* Hospital Selection Chips */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {availableHospitals.map((rs) => {
                    const isSelected = newOfficerForm.plottingRs.includes(rs);
                    return (
                      <button
                        key={rs}
                        type="button"
                        onClick={() => handleToggleHospitalSelection(rs)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-left border transition-all ${
                          isSelected
                            ? 'bg-blue-50 text-[#0A3981] border-blue-300 font-bold shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/50'
                        }`}
                      >
                        <span className="truncate pr-2">{rs}</span>
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-[#0A3981] shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded border border-slate-300 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Add Custom Hospital Input */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Tambah RS lainnya jika tidak ada di daftar..."
                    value={newOfficerForm.newRsInput}
                    onChange={(e) => setNewOfficerForm({ ...newOfficerForm, newRsInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomHospital();
                      }
                    }}
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomHospital}
                    className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
                  >
                    + Tambah RS
                  </button>
                </div>
              </div>

              {/* Seksi 4: Akun & Kredensial Login Petugas (Otoritas Kabag) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Key className="w-4 h-4 text-amber-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    4. Kredensial Akun Login Petugas (Diterbitkan oleh Kabag)
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Username Login <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: ihsan atau petugas_ihsan"
                      value={newOfficerForm.username}
                      onChange={(e) => setNewOfficerForm({ ...newOfficerForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Digunakan petugas untuk masuk di halaman login aplikasi.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        Kata Sandi (Password) <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewOfficerForm((prev) => ({ ...prev, password: 'petugasjasaraharja' }))}
                        className="text-[10px] text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                      >
                        Reset Default
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={newOfficerForm.showPassword ? 'text' : 'password'}
                        required
                        placeholder="Masukkan kata sandi..."
                        value={newOfficerForm.password}
                        onChange={(e) => setNewOfficerForm({ ...newOfficerForm, password: e.target.value })}
                        className="w-full px-3 py-2 pr-9 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setNewOfficerForm((prev) => ({ ...prev, showPassword: !prev.showPassword }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={newOfficerForm.showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                      >
                        {newOfficerForm.showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Bawaan sistem: <span className="font-mono font-bold text-slate-700">petugasjasaraharja</span> (bisa disesuaikan oleh Kabag).
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddOfficerModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOfficer}
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-2xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingOfficer ? 'Menerbitkan Akun...' : 'Terbitkan Akun Petugas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL: EDIT DATA PETUGAS & PENUGASAN RS                                */}
      {/* ========================================================================= */}
      {isEditModalOpen && editingOfficer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8 animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
                  <Edit3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black">Edit Profil & Penugasan Petugas</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
                      {editingOfficer.id}
                    </span>
                  </div>
                  <p className="text-xs text-blue-200 font-medium">
                    Perbarui identitas, status penugasan, dan plotting rumah sakit
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Notice Banner */}
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-800">
                <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Penyimpanan Terintegrasi Antarmuka:</p>
                  <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                    Perubahan data dan penugasan RS akan langsung tersimpan di sistem frontend dan otomatis memperbarui tanggung jawab kasus korban secara dinamis.
                  </p>
                </div>
              </div>

              {/* Seksi 1: Data Pokok Petugas */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Users className="w-4 h-4 text-[#0A3981]" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    1. Identitas Pokok Personil
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nama Lengkap & Gelar <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.nama}
                      onChange={(e) => setEditForm({ ...editForm, nama: e.target.value })}
                      placeholder="Contoh: Muhammad Ihsan, S.T."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      NIP (Nomor Induk Pegawai)
                    </label>
                    <input
                      type="text"
                      value={editForm.nip}
                      onChange={(e) => setEditForm({ ...editForm, nip: e.target.value })}
                      placeholder="Contoh: 19940815 201903 1 002"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Jabatan Operasional
                    </label>
                    <select
                      value={editForm.jabatan}
                      onChange={(e) => setEditForm({ ...editForm, jabatan: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Mobile Service Officer">Mobile Service Officer</option>
                      <option value="Staff Pelayanan Santunan">Staff Pelayanan Santunan</option>
                      <option value="Petugas Administrasi Klaim">Petugas Administrasi Klaim</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Status Penugasan Petugas
                    </label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Aktif Lapangan">Aktif Lapangan (Menerima Tugas Visit)</option>
                      <option value="Nonaktif">Nonaktif (Lepas Tanggung Jawab Kasus)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Seksi 2: Wilayah & Kontak */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    2. Wilayah Penugasan & Kontak
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Wilayah Kerja
                    </label>
                    <input
                      type="text"
                      value={editForm.wilayah}
                      onChange={(e) => setEditForm({ ...editForm, wilayah: e.target.value })}
                      placeholder="Contoh: Pekanbaru Kota / Kampar"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      No. Telepon / WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={editForm.telepon}
                      onChange={(e) => setEditForm({ ...editForm, telepon: e.target.value })}
                      placeholder="Contoh: 0812-3456-7890"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Email Kedinasan
                    </label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      placeholder="Contoh: nama@jasaraharja.co.id"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seksi 3: Plotting Rumah Sakit Tanggung Jawab */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      3. Plotting Rumah Sakit yang Ditangani
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {editForm.plottingRs.length} Rumah Sakit Terpilih
                  </span>
                </div>

                <p className="text-xs text-slate-500">
                  Centang rumah sakit yang ditugaskan ke petugas ini (satu petugas dapat menangani beberapa rumah sakit):
                </p>

                {/* Hospital Selection Chips */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {Array.from(new Set([...availableHospitals, ...editForm.plottingRs])).map((rs) => {
                    const isSelected = editForm.plottingRs.includes(rs);
                    return (
                      <button
                        key={rs}
                        type="button"
                        onClick={() => handleToggleEditHospital(rs)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-left border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 text-[#0A3981] border-blue-300 font-bold shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/50'
                        }`}
                      >
                        <span className="truncate pr-2">{rs}</span>
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-[#0A3981] shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded border border-slate-300 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Add Custom Hospital Input */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Tambah RS lainnya jika tidak ada di daftar..."
                    value={editForm.newRsInput}
                    onChange={(e) => setEditForm({ ...editForm, newRsInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomEditHospital();
                      }
                    }}
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomEditHospital}
                    className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    + Tambah RS
                  </button>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const toDelete = editingOfficer;
                    setIsEditModalOpen(false);
                    setDeleteModalError(null);
                    setOfficerToDelete(toDelete);
                    setIsDeleteModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Hapus Akun Petugas</span>
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-2xs transition-all active:scale-[0.98] cursor-pointer"
                  >
                    Simpan Perubahan
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. MODAL: ATUR PENUGASAN RUMAH SAKIT KHUSUS                               */}
      {/* ========================================================================= */}
      {isHospitalAssignmentModalOpen && assignmentOfficer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden my-8 animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-indigo-900 to-[#0A3981] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
                  <Sliders className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black">
                    Atur Penugasan Rumah Sakit
                  </h3>
                  <p className="text-xs text-indigo-200 font-medium">
                    {assignmentOfficer.nama} ({assignmentOfficer.id}) • {assignmentOfficer.wilayah}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHospitalAssignmentModalOpen(false)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Relasi Petugas JR & Rumah Sakit:</span>
                </div>
                <p className="text-[11px] text-indigo-800 leading-relaxed">
                  Satu petugas dapat menangani beberapa rumah sakit rujukan. Korban baru yang dilaporkan dari rumah sakit yang dicentang akan otomatis menjadi tanggung jawab <strong>{assignmentOfficer.nama}</strong>.
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-slate-700">
                  Daftar Rumah Sakit Wilayah Riau:
                </span>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                  {assignmentRsList.length} RS Terpilih
                </span>
              </div>

              {/* Hospital Selection Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                {Array.from(new Set([...availableHospitals, ...assignmentRsList])).map((rs) => {
                  const isSelected = assignmentRsList.includes(rs);
                  return (
                    <button
                      key={rs}
                      type="button"
                      onClick={() => handleToggleAssignmentHospital(rs)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-left border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-900 border-indigo-300 font-bold shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/50'
                      }`}
                    >
                      <span className="truncate pr-2">{rs}</span>
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded border border-slate-300 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Add Custom Hospital */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Ketik nama rumah sakit baru..."
                  value={newAssignmentRsInput}
                  onChange={(e) => setNewAssignmentRsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomAssignmentHospital();
                    }
                  }}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddCustomAssignmentHospital}
                  className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  + Tambah RS
                </button>
              </div>

              {/* Footer Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsHospitalAssignmentModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveHospitalAssignment}
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-2xs transition-all active:scale-[0.98] cursor-pointer"
                >
                  Simpan Penugasan RS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 10. MODAL: KONFIRMASI HAPUS AKUN PETUGAS                                  */}
      {/* ========================================================================= */}
      {isDeleteModalOpen && officerToDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center border border-rose-200 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Konfirmasi Hapus Akun Petugas
                  </h3>
                  <p className="text-xs text-rose-700 font-medium">
                    Tindakan ini memerlukan persetujuan Kepala Bagian
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-3.5">
              <div className="p-3.5 bg-rose-50/70 border border-rose-100 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs text-slate-800 leading-relaxed font-semibold">
                    Apakah Anda yakin ingin menghapus akun petugas{' '}
                    <span className="text-rose-700 font-bold underline decoration-rose-300">{officerToDelete.nama}</span>?
                  </p>
                  <p className="text-[11px] text-slate-600">
                    NIP/ID: <span className="font-mono font-bold text-slate-700">{officerToDelete.nip || officerToDelete.id}</span>
                    {officerToDelete.username ? ` • Username: @${officerToDelete.username}` : ''}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Informasi Pengalihan Tanggung Jawab:</span>
                </div>
                <p>
                  Seluruh data korban yang sebelumnya ditangani oleh petugas ini akan otomatis dialihkan ke petugas aktif lainnya agar operasional pelayanan dan pemantauan SLA tetap terjaga.
                </p>
              </div>

              {deleteModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{deleteModalError}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteFromDirectory}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-2xs cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Yakin Hapus</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: KREDENSIAL AKUN PETUGAS BARU DIBUAT (OTORITAS KABAG)               */}
      {/* ========================================================================= */}
      {createdAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-up">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black">Akun Petugas Berhasil Dibuat!</h3>
                  <p className="text-xs text-emerald-100 font-medium">
                    Akun login aktif di sistem & siap digunakan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreatedAccountModal(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Nama Petugas:</span>
                  <span className="font-bold text-slate-800">{createdAccountModal.nama}</span>
                </div>
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Username Login:</span>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{createdAccountModal.username}</span>
                </div>
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Nomor WhatsApp Terdaftar:</span>
                  <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {createdAccountModal.telepon || '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Email Kedinasan:</span>
                  <span className="font-medium text-slate-700">{createdAccountModal.email || '—'}</span>
                </div>
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Status Kata Sandi:</span>
                  <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1.5">
                    <span>••••••••••••</span>
                    <span className="text-[10px] text-emerald-700 font-sans font-semibold">(Default Sistem Ditetapkan)</span>
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Role Hak Akses:</span>
                  <span className="font-semibold text-slate-700">Petugas Lapangan</span>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-[#0A3981]">
                  <ShieldCheck className="w-4 h-4 text-[#0A3981]" />
                  <span>Pemberitahuan Akun Petugas:</span>
                </p>
                <p className="text-[11px] text-slate-600">
                  Akun petugas telah berhasil didaftarkan. Informasi password default sistem disiapkan untuk petugas melalui nomor WhatsApp terdaftar ({createdAccountModal.telepon}). Nomor HP ini akan menjadi tujuan notifikasi laporan penugasan korban selanjutnya.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = `Halo ${createdAccountModal.nama},\nAkun SIM JR Anda telah didaftarkan oleh Kabag.\n\nUsername: ${createdAccountModal.username}\nNomor Terdaftar: ${createdAccountModal.telepon || '-'}\nEmail: ${createdAccountModal.email || '-'}\nLink Login: ${window.location.origin}/login\n\nSilakan login menggunakan password default sistem yang telah ditetapkan untuk memeriksa penugasan korban.`;
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(text);
                    }
                    setCopiedCredential(true);
                    setTimeout(() => setCopiedCredential(false), 3000);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  {copiedCredential ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>Info Akun Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Salin Info Akun Petugas</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setCreatedAccountModal(null)}
                  className="py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
