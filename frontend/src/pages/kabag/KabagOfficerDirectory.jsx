import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Users,
  User,
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
  Lock,
  Loader2
} from 'lucide-react';
import { api } from '../../services/api';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import { INITIAL_HOSPITALS } from '../../services/initialDataset';
import VictimDetailDrawer from '../../components/kabag/VictimDetailDrawer';
import HospitalSearchSelect from '../../components/kabag/HospitalSearchSelect';
import { isVictimFinished } from '../../utils/monitoringStatus';
import { getReferralPerspectiveInfo } from '../../utils/referralUtils';

/**
 * Helper to determine if a victim is actively under responsibility
 * (still being monitored or hospitalized, not finalized/discharged)
 */
function isVictimActive(victim) {
  if (!victim) return false;
  return !isVictimFinished(victim);
}

export default function KabagOfficerDirectory() {
  const navigate = useNavigate();
  const location = useLocation();

  // Storage data
  const filterValidOfficers = (list) => {
    const DUMMY_FILTER = ['citra dewi', 'budi santoso', 'eko prasetyo', 'doni setiawan', 'maya anggraini', 'hendra pratama', 'siti nurhaliza', 'dimas anggara', 'ahmad fauzi', 'adi putra'];
    return (list || []).filter((o) => {
      // Petugas resmi sistem yang memiliki ID (PET-*) atau backendOfficerId selalu valid dan tidak boleh difilter
      if (o.id && (String(o.id).startsWith('PET-') || o.backendOfficerId || o.backendId)) {
        return true;
      }
      const lower = (o.nama || '').toLowerCase();
      return !DUMMY_FILTER.some((d) => lower.includes(d));
    });
  };

  const [officers, setOfficers] = useState(() => filterValidOfficers(storageService.getOfficers()));
  const [victims, setVictims] = useState(() => storageService.getVictims());
  const [availableHospitals, setAvailableHospitals] = useState(() => INITIAL_HOSPITALS || []);
  const [masterHospitals, setMasterHospitals] = useState(() => {
    return (INITIAL_HOSPITALS || []).map((hName, idx) => ({
      id: idx + 1,
      nama_rs: hName,
      alamat: 'Provinsi Riau',
      latitude: 0.5071,
      longitude: 101.4478,
      radius_meter: 200
    }));
  });
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Detail Modal & Hospital Popover states
  const [detailOfficerModal, setDetailOfficerModal] = useState(null);
  const [detailModalTab, setDetailModalTab] = useState('hospitals'); // 'hospitals' | 'victims' | 'history'
  const [showAllHospitalsOfficer, setShowAllHospitalsOfficer] = useState(null);

  // Single Hospital Assignment Modal (POV Data Rumah Sakit)
  const [singleAssignHospital, setSingleAssignHospital] = useState(null);
  const [singleAssignOfficerId, setSingleAssignOfficerId] = useState('NONE');
  const [isSavingSingleAssign, setIsSavingSingleAssign] = useState(false);

  // Filter & Search untuk Data Rumah Sakit
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [hospitalStatusFilter, setHospitalStatusFilter] = useState('ALL'); // 'ALL' | 'ASSIGNED' | 'UNASSIGNED'

  // Live backend data loading function
  const loadFreshBackendData = async () => {
    setIsLoadingData(true);
    try {
      // 1. Ambil seluruh RS master dari MySQL & gabungkan dengan daftar resmi 69 faskes
      const masterHs = await api.getHospitals(true).catch(() => []);
      const canonicalMap = new Map();

      // Inisialisasi ke-69 RS resmi sesuai urutan canonical (1 s/d 69)
      (INITIAL_HOSPITALS || []).forEach((hName, idx) => {
        const key = hName.toLowerCase().replace(/[\s\-_.]+/g, '');
        canonicalMap.set(key, {
          id: idx + 1,
          nama_rs: hName,
          alamat: 'Provinsi Riau',
          latitude: 0.5071,
          longitude: 101.4478,
          radius_meter: 200
        });
      });

      // Sinkronkan ID dan alamat dari backend MySQL jika sudah ada di database
      if (Array.isArray(masterHs) && masterHs.length > 0) {
        masterHs.forEach((bh) => {
          if (!bh.nama_rs) return;
          const key = bh.nama_rs.toLowerCase().replace(/[\s\-_.]+/g, '');
          if (canonicalMap.has(key)) {
            const existing = canonicalMap.get(key);
            canonicalMap.set(key, {
              ...existing,
              id: bh.id || existing.id,
              alamat: (bh.alamat && bh.alamat !== 'Provinsi Riau') ? bh.alamat : existing.alamat,
              latitude: bh.latitude || existing.latitude,
              longitude: bh.longitude || existing.longitude,
              radius_meter: bh.radius_meter || existing.radius_meter
            });
          }
        });
      }

      const mergedList = Array.from(canonicalMap.values());
      setMasterHospitals(mergedList);
      setAvailableHospitals(mergedList.map((h) => h.nama_rs));

      // 2. Ambil seluruh petugas dari MySQL beserta plotting RS aktif
      const backendOfficers = await api.getOfficers(true).catch(() => []);
      if (Array.isArray(backendOfficers) && backendOfficers.length > 0) {
        const enrichedOfficers = await Promise.all(
          backendOfficers.map(async (bo) => {
            let hospitals = [];
            try {
              hospitals = await api.getOfficerHospitals(bo.id);
            } catch (_) { }

            const plottingRs = (hospitals || []).map((h) => {
              const raw = h.nama_rs || '';
              const key = raw.toLowerCase().replace(/[\s\-_.]+/g, '');
              const matched = (INITIAL_HOSPITALS || []).find((cn) => cn.toLowerCase().replace(/[\s\-_.]+/g, '') === key);
              return matched || raw;
            });
            const nameParts = (bo.nama || 'Petugas').trim().split(/\s+/);
            const avatar = nameParts.length >= 2
              ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
              : nameParts[0].slice(0, 2).toUpperCase();

            // Pertahankan email & nomor telepon yang baru diperbarui jika backend belum menyinkronkan
            const localOfficer = storageService.getOfficers().find((lo) =>
              lo.id === `PET-${String(bo.id).padStart(2, '0')}` ||
              lo.backendOfficerId === bo.id ||
              (lo.nama && bo.nama && lo.nama.trim().toLowerCase() === bo.nama.trim().toLowerCase())
            );

            const effectiveEmail = (bo.email && bo.email !== '—')
              ? bo.email
              : (localOfficer?.email && localOfficer.email !== '—' ? localOfficer.email : '—');

            const effectivePhone = (bo.telepon && bo.telepon !== '—')
              ? bo.telepon
              : (localOfficer?.telepon && localOfficer.telepon !== '—' ? localOfficer.telepon : '—');

            return {
              id: `PET-${String(bo.id).padStart(2, '0')}`,
              backendId: bo.id,
              backendOfficerId: bo.id,
              username: bo.username || null,
              nama: bo.nama,
              nip: bo.nip || '—',
              jabatan: bo.jabatan || 'Mobile Service Officer',
              wilayah: bo.wilayah || 'Pekanbaru Kota',
              telepon: effectivePhone,
              email: effectiveEmail,
              avatar,
              status: bo.operational_status || (bo.is_active ? 'Aktif Lapangan' : 'Nonaktif'),
              kapasitas: '0/10 Kasus',
              plottingRs,
              hospitals: hospitals || []
            };
          })
        );
        const filtered = filterValidOfficers(enrichedOfficers);
        setOfficers(filtered);
        storageService.saveOfficers(enrichedOfficers);
      }

      // 3. Sinkronkan kasus dengan backend
      await storageService.syncWithBackend(true);
      setVictims(storageService.getVictims());
    } catch (err) {
      console.warn('[loadFreshBackendData] Warning:', err.message);
    } finally {
      setIsLoadingData(false);
    }
  };

  // Listen to live storage changes & initial backend sync
  useEffect(() => {
    loadFreshBackendData();
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
      const masterHs = await api.getHospitals(true).catch(() => masterHospitals);
      const currentPlots = await api.getOfficerHospitals(backendId).catch(() => []);
      const currentHospitalIds = new Set((currentPlots || []).map((p) => p.hospital_id));

      const targetHospitalIds = new Set();
      for (let i = 0; i < hospitalNames.length; i++) {
        const rsName = hospitalNames[i];
        let matched = (masterHs || []).find(
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
          } catch (_) { }
        }

        if (matched && matched.id) {
          const hid = Number(matched.id);
          targetHospitalIds.add(hid);

          // Lepas dari petugas lain jika RS ini sebelumnya dipegang oleh petugas lain (cegah penugasan ganda)
          for (const otherOff of officers) {
            const otherBackendId = otherOff.backendOfficerId || otherOff.backendId || Number(String(otherOff.id).replace(/\D/g, ''));
            if (otherBackendId && otherBackendId !== backendId) {
              const holds = (otherOff.hospitals || []).some((h) => Number(h.hospital_id || h.id) === hid);
              if (holds) {
                await api.removeHospitalFromOfficer(otherBackendId, hid).catch(() => {});
              }
            }
          }

          if (!currentHospitalIds.has(hid)) {
            await api.plotHospitalToOfficer(backendId, hid, i === 0).catch(() => { });
          }
        }
      }

      // Lepas relasi RS di backend yang sudah tidak dipilih oleh petugas ini
      for (const existingPlot of currentPlots || []) {
        if (!targetHospitalIds.has(existingPlot.hospital_id)) {
          await api.removeHospitalFromOfficer(backendId, existingPlot.hospital_id).catch(() => { });
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
      alert('Mohon pilih minimal satu rumah sakit yang ditangani untuk petugas.');
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

    if (cleanEmail && cleanEmail !== '—') {
      try {
        localStorage.setItem(`jr_officer_email_to_username_${cleanEmail.toLowerCase()}`, cleanUsername);
      } catch {
        // ignore
      }
    }

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

  const handleSaveEdit = async (e) => {
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

    if (!editForm.plottingRs || editForm.plottingRs.length === 0) {
      alert('Mohon pilih minimal satu rumah sakit yang ditangani untuk petugas.');
      return;
    }

    const finalWilayah =
      editForm.wilayah === 'OTHER'
        ? (editForm.customWilayah || 'Pekanbaru Kota').trim()
        : editForm.wilayah;

    const finalPlottingRs = [...editForm.plottingRs];

    // 1. Simpan perubahan ke storage service lokal
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

    // Simpan email baru dan arsipkan email lama ke daftar tidak aktif
    const oldEmail = (editingOfficer.email || '').toLowerCase().trim();
    const newEmail = cleanEmail.toLowerCase().trim();
    if (oldEmail && oldEmail !== '—' && newEmail && oldEmail !== newEmail) {
      try {
        const retired = JSON.parse(localStorage.getItem('jr_retired_officer_emails') || '[]');
        if (!retired.includes(oldEmail)) {
          retired.push(oldEmail);
          localStorage.setItem('jr_retired_officer_emails', JSON.stringify(retired));
        }
        localStorage.removeItem(`jr_officer_email_to_username_${oldEmail}`);
      } catch {
        // ignore
      }
    }

    if (newEmail && newEmail !== '—') {
      try {
        const targetUsername = editingOfficer.username || (editingOfficer.backendOfficerId === 1 ? 'petugas' : `petugas${editingOfficer.backendOfficerId || ''}`);
        localStorage.setItem(`jr_officer_email_to_username_${newEmail}`, targetUsername);
      } catch {
        // ignore
      }
    }

    // 2. Langsung perbarui local React state agar tabel & modal langsung menampilkan data & email baru
    setOfficers((prev) =>
      prev.map((o) => (String(o.id) === String(editingOfficer.id) ? { ...o, ...updated } : o))
    );
    if (detailOfficerModal && String(detailOfficerModal.id) === String(editingOfficer.id)) {
      setDetailOfficerModal((prev) => (prev ? { ...prev, ...updated } : null));
    }
    if (activeOfficerModal && String(activeOfficerModal.id) === String(editingOfficer.id)) {
      setActiveOfficerModal((prev) => (prev ? { ...prev, ...updated } : null));
    }

    // 3. Sinkronkan ke database backend MySQL (tabel officers & officer_hospitals)
    const targetOfficerId = editingOfficer.backendOfficerId || editingOfficer.backendId || Number(String(editingOfficer.id).replace(/\D/g, ''));
    if (targetOfficerId) {
      try {
        await api.updateOfficer(targetOfficerId, {
          nama: editForm.nama.trim(),
          nip: editForm.nip.trim() || null,
          jabatan: editForm.jabatan.trim() || 'Mobile Service Officer',
          wilayah: finalWilayah,
          telepon: cleanPhone && cleanPhone !== '—' ? cleanPhone : null,
          email: cleanEmail && cleanEmail !== '—' ? cleanEmail : null,
          is_active: editForm.status !== 'Nonaktif'
        });
      } catch (e) {
        console.warn('[KabagOfficerDirectory] updateOfficer backend warning:', e.message);
      }
      try {
        await syncOfficerHospitalsToBackend(targetOfficerId, finalPlottingRs);
      } catch (e) {
        console.warn('[KabagOfficerDirectory] syncOfficerHospitalsToBackend warning:', e.message);
      }
    }

    // 4. Siarkan event perubahan petugas agar seluruh komponen (termasuk profil) ikut sinkron
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('jr_officers_updated'));
    }

    setIsEditModalOpen(false);
    setEditingOfficer(null);
    setToastMessage(`Data dan penugasan RS untuk ${updated.nama} berhasil diperbarui.`);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // ── MODAL: KELOLA PENUGASAN RS (MULTI-SELECT) ──
  const [isHospitalAssignmentModalOpen, setIsHospitalAssignmentModalOpen] = useState(false);
  const [assignmentOfficer, setAssignmentOfficer] = useState(null);
  const [assignmentSelectedHospitalIds, setAssignmentSelectedHospitalIds] = useState(new Set());
  const [assignmentSearchTerm, setAssignmentSearchTerm] = useState('');
  const [assignmentTabFilter, setAssignmentTabFilter] = useState('all'); // 'all' | 'assigned' | 'available'
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [newAssignmentRsInput, setNewAssignmentRsInput] = useState('');

  const handleOpenHospitalAssignmentModal = async (officer) => {
    setAssignmentOfficer(officer);
    const officerBackendId = officer.backendOfficerId || officer.backendId || Number(String(officer.id).replace(/\D/g, ''));

    let currentPlotIds = [];
    if (officerBackendId) {
      try {
        const plots = await api.getOfficerHospitals(officerBackendId);
        currentPlotIds = plots.map((p) => p.hospital_id);
      } catch (_) {
        currentPlotIds = masterHospitals
          .filter((h) => (officer.plottingRs || []).includes(h.nama_rs))
          .map((h) => h.id);
      }
    } else {
      currentPlotIds = masterHospitals
        .filter((h) => (officer.plottingRs || []).includes(h.nama_rs))
        .map((h) => h.id);
    }

    setAssignmentSelectedHospitalIds(new Set(currentPlotIds));
    setAssignmentSearchTerm('');
    setAssignmentTabFilter('all');
    setNewAssignmentRsInput('');
    setIsHospitalAssignmentModalOpen(true);
  };

  const handleToggleAssignmentHospitalId = (hospitalId) => {
    setAssignmentSelectedHospitalIds((prev) => {
      const next = new Set(prev);
      if (next.has(hospitalId)) {
        next.delete(hospitalId);
      } else {
        next.add(hospitalId);
      }
      return next;
    });
  };

  const handleAddCustomAssignmentHospital = async () => {
    const clean = newAssignmentRsInput.trim();
    if (!clean) return;

    try {
      // Buat RS baru di backend jika belum ada
      const created = await api.createHospital({
        nama_rs: clean,
        alamat: 'Riau, Indonesia',
        latitude: 0.5071,
        longitude: 101.4478,
        radius_meter: 200
      });
      if (created && created.id) {
        setMasterHospitals((prev) => [...prev, created]);
        setAvailableHospitals((prev) => [...prev, created.nama_rs]);
        setAssignmentSelectedHospitalIds((prev) => new Set([...prev, created.id]));
      }
    } catch (err) {
      console.warn('[handleAddCustomAssignmentHospital] Backend create error:', err.message);
    }
    setNewAssignmentRsInput('');
  };

  const handleSaveHospitalAssignment = async () => {
    if (!assignmentOfficer) return;
    const officerBackendId = assignmentOfficer.backendOfficerId || assignmentOfficer.backendId || Number(String(assignmentOfficer.id).replace(/\D/g, ''));
    if (!officerBackendId) return;

    setIsSavingAssignment(true);
    try {
      const selectedIds = Array.from(assignmentSelectedHospitalIds).map((id) => Number(String(id).replace(/\D/g, ''))).filter((n) => !isNaN(n) && n > 0);
      const currentPlots = await api.getOfficerHospitals(officerBackendId).catch(() => []);
      const currentIds = new Set(currentPlots.map((p) => p.hospital_id));

      // 1. Tambah plotting RS baru & lepas dari petugas lama jika sebelumnya dipegang orang lain
      // Ketentuan: mencegah penugasan ganda & memastikan faskes tidak tetap menampilkan petugas lama
      for (const hid of selectedIds) {
        for (const otherOff of officers) {
          const otherBackendId = otherOff.backendOfficerId || otherOff.backendId || Number(String(otherOff.id).replace(/\D/g, ''));
          if (otherBackendId && otherBackendId !== officerBackendId) {
            const holds = (otherOff.hospitals || []).some((h) => Number(h.hospital_id || h.id) === hid);
            if (holds) {
              await api.removeHospitalFromOfficer(otherBackendId, hid).catch(() => {});
            }
          }
        }
        if (!currentIds.has(hid)) {
          await api.plotHospitalToOfficer(officerBackendId, hid).catch((err) => console.warn(err));
        }
      }

      // 2. Lepas plotting RS yang di-uncheck
      for (const plot of currentPlots) {
        if (!selectedIds.includes(plot.hospital_id)) {
          await api.removeHospitalFromOfficer(officerBackendId, plot.hospital_id).catch((err) => console.warn(err));
        }
      }

      // 3. Re-fetch data plotting RS terbaru seluruh petugas dari backend
      const freshPlots = await api.getOfficerHospitals(officerBackendId).catch(() => []);
      const freshRsNames = freshPlots.map((p) => p.nama_rs);

      const freshOfficers = await Promise.all(
        officers.map(async (o) => {
          const bId = o.backendOfficerId || o.backendId || Number(String(o.id).replace(/\D/g, ''));
          if (!bId) return o;
          try {
            const plots = await api.getOfficerHospitals(bId);
            return {
              ...o,
              hospitals: plots || [],
              plottingRs: (plots || []).map((p) => p.nama_rs)
            };
          } catch {
            return o;
          }
        })
      );
      setOfficers(freshOfficers);
      storageService.saveOfficers(freshOfficers);

      if (detailOfficerModal && String(detailOfficerModal.id) === String(assignmentOfficer.id)) {
        setDetailOfficerModal((prev) => ({
          ...prev,
          plottingRs: freshRsNames,
          hospitals: freshPlots
        }));
      }

      await storageService.syncWithBackend(true);
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('jr_officers_updated'));
        window.dispatchEvent(new Event('jr_victims_updated'));
      }

      setToastMessage(`Penugasan rumah sakit untuk ${assignmentOfficer.nama} berhasil diperbarui (${freshPlots.length} RS aktif).`);
      setTimeout(() => setToastMessage(null), 4500);
      setIsHospitalAssignmentModalOpen(false);
      setAssignmentOfficer(null);
    } catch (err) {
      alert(`Gagal menyimpan penugasan rumah sakit: ${err.message}`);
    } finally {
      setIsSavingAssignment(false);
    }
  };

  // Mengakhiri penugasan rumah sakit
  const handleEndAssignment = async (officer, hospitalId, hospitalName) => {
    const officerBackendId = officer.backendOfficerId || officer.backendId || Number(String(officer.id).replace(/\D/g, ''));
    const hid = Number(String(hospitalId).replace(/\D/g, ''));
    if (!officerBackendId || !hid) return;

    if (!window.confirm(`Yakin ingin mengakhiri penugasan ${officer.nama} untuk ${hospitalName}? Status RS ini akan menjadi "Belum ada Petugas".`)) {
      return;
    }

    try {
      await api.removeHospitalFromOfficer(officerBackendId, hid);
      const freshPlots = await api.getOfficerHospitals(officerBackendId).catch(() => []);
      const freshRsNames = freshPlots.map((p) => p.nama_rs);

      storageService.updateOfficer(officer.id, {
        plottingRs: freshRsNames,
        hospitals: freshPlots
      });

      const nextOfficers = officers.map((o) =>
        String(o.id) === String(officer.id)
          ? { ...o, plottingRs: freshRsNames, hospitals: freshPlots }
          : o
      );
      setOfficers(nextOfficers);
      storageService.saveOfficers(nextOfficers);

      if (detailOfficerModal && String(detailOfficerModal.id) === String(officer.id)) {
        setDetailOfficerModal((prev) => ({
          ...prev,
          plottingRs: freshRsNames,
          hospitals: freshPlots
        }));
      }

      await storageService.syncWithBackend(true);
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('jr_officers_updated'));
        window.dispatchEvent(new Event('jr_victims_updated'));
      }

      setToastMessage(`Penugasan di ${hospitalName} berhasil diakhiri. Rumah sakit kini berstatus "Belum ada Petugas".`);
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err) {
      alert(`Gagal mengakhiri penugasan: ${err.message}`);
    }
  };

  // Buka Modal Atur Petugas untuk Satu Rumah Sakit (POV Data Rumah Sakit)
  const handleOpenSingleAssignModal = (hospital) => {
    setSingleAssignHospital(hospital);
    const assignedOff = getHospitalAssignedOfficer(hospital.id, hospital.nama_rs);
    setSingleAssignOfficerId(assignedOff ? assignedOff.id : 'NONE');
  };

  // Simpan Penugasan untuk Satu Rumah Sakit
  const handleSaveSingleAssign = async () => {
    if (!singleAssignHospital) return;
    setIsSavingSingleAssign(true);
    try {
      const hid = Number(String(singleAssignHospital.id).replace(/\D/g, ''));
      if (!hid) throw new Error('ID rumah sakit tidak valid.');

      const currentAssigned = getHospitalAssignedOfficer(hid, singleAssignHospital.nama_rs);

      if (singleAssignOfficerId === 'NONE') {
        // Lepaskan penugasan jika dipilih Belum ada Petugas
        if (currentAssigned) {
          const cId = currentAssigned.backendOfficerId || currentAssigned.backendId || Number(String(currentAssigned.id).replace(/\D/g, ''));
          if (cId) {
            await api.removeHospitalFromOfficer(cId, hid);
          }
        }
      } else {
        const targetOfficer = officers.find((o) => String(o.id) === String(singleAssignOfficerId));
        if (!targetOfficer) throw new Error('Petugas yang dipilih tidak ditemukan.');
        const tBackendId = targetOfficer.backendOfficerId || targetOfficer.backendId || Number(String(targetOfficer.id).replace(/\D/g, ''));
        if (!tBackendId) throw new Error('ID backend petugas tidak valid.');

        // Lepas dari petugas sebelumnya jika ada (cegah penugasan ganda)
        if (currentAssigned && String(currentAssigned.id) !== String(targetOfficer.id)) {
          const cId = currentAssigned.backendOfficerId || currentAssigned.backendId || Number(String(currentAssigned.id).replace(/\D/g, ''));
          if (cId) {
            await api.removeHospitalFromOfficer(cId, hid).catch(() => {});
          }
        }

        // Hubungkan ke petugas baru
        await api.plotHospitalToOfficer(tBackendId, hid);
      }

      // Re-fetch seluruh data penugasan dari backend
      const freshOfficers = await Promise.all(
        officers.map(async (o) => {
          const bId = o.backendOfficerId || o.backendId || Number(String(o.id).replace(/\D/g, ''));
          if (!bId) return o;
          try {
            const plots = await api.getOfficerHospitals(bId);
            return {
              ...o,
              hospitals: plots || [],
              plottingRs: (plots || []).map((p) => p.nama_rs)
            };
          } catch {
            return o;
          }
        })
      );
      setOfficers(freshOfficers);
      storageService.saveOfficers(freshOfficers);

      await storageService.syncWithBackend(true);
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('jr_officers_updated'));
        window.dispatchEvent(new Event('jr_victims_updated'));
      }

      const assignedTarget = officers.find((o) => String(o.id) === String(singleAssignOfficerId));
      setToastMessage(
        singleAssignOfficerId === 'NONE'
          ? `Penugasan di ${singleAssignHospital.nama_rs} telah dilepas (Status: Belum ada Petugas).`
          : `Penugasan ${singleAssignHospital.nama_rs} berhasil dialihkan ke ${assignedTarget?.nama || 'Petugas'}.`
      );
      setTimeout(() => setToastMessage(null), 4500);
      setSingleAssignHospital(null);
    } catch (err) {
      alert(`Gagal menyimpan penugasan rumah sakit: ${err.message}`);
    } finally {
      setIsSavingSingleAssign(false);
    }
  };

  // Lepas Penugasan Rumah Sakit langsung dari baris tabel
  const handleUnassignHospital = async (hospital) => {
    const assignedOff = getHospitalAssignedOfficer(hospital.id, hospital.nama_rs);
    if (!assignedOff) return;

    if (!window.confirm(`Yakin ingin melepas penugasan ${assignedOff.nama} dari ${hospital.nama_rs}? Status rumah sakit akan menjadi "Belum ada Petugas".`)) {
      return;
    }

    const officerBackendId = assignedOff.backendOfficerId || assignedOff.backendId || Number(String(assignedOff.id).replace(/\D/g, ''));
    const hid = Number(String(hospital.id).replace(/\D/g, ''));
    if (!officerBackendId || !hid) return;

    try {
      await api.removeHospitalFromOfficer(officerBackendId, hid);
      const freshPlots = await api.getOfficerHospitals(officerBackendId).catch(() => []);
      const freshRsNames = freshPlots.map((p) => p.nama_rs);

      storageService.updateOfficer(assignedOff.id, {
        plottingRs: freshRsNames,
        hospitals: freshPlots
      });

      const nextOfficers = officers.map((o) =>
        String(o.id) === String(assignedOff.id)
          ? { ...o, plottingRs: freshRsNames, hospitals: freshPlots }
          : o
      );
      setOfficers(nextOfficers);
      storageService.saveOfficers(nextOfficers);

      await storageService.syncWithBackend(true);
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('jr_officers_updated'));
        window.dispatchEvent(new Event('jr_victims_updated'));
      }

      setToastMessage(`Penugasan ${assignedOff.nama} di ${hospital.nama_rs} berhasil diakhiri.`);
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err) {
      alert(`Gagal melepas penugasan: ${err.message}`);
    }
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

  // Fungsi kanonikal untuk mendapatkan petugas penanggung jawab satu RS (Utamakan ID)
  const getHospitalAssignedOfficer = (hospitalId, hospitalName) => {
    const numId = Number(String(hospitalId || '').replace(/\D/g, ''));
    const cleanName = (hospitalName || '').toLowerCase().replace(/[\s\-_.]+/g, '');

    // 1. Acuan Utama: ID Rumah Sakit & ID Petugas
    if (numId) {
      for (const off of officers) {
        if (off.status === 'Nonaktif') continue;
        if (Array.isArray(off.hospitals) && off.hospitals.some((h) => Number(h.hospital_id || h.id) === numId)) {
          return off;
        }
      }
    }

    // 2. Acuan Nama Fasilitas Kesehatan jika ID belum sinkron
    if (cleanName) {
      for (const off of officers) {
        if (off.status === 'Nonaktif') continue;
        if (Array.isArray(off.hospitals) && off.hospitals.some((h) => (h.nama_rs || '').toLowerCase().replace(/[\s\-_.]+/g, '') === cleanName)) {
          return off;
        }
        if (Array.isArray(off.plottingRs) && off.plottingRs.some((rs) => (rs || '').toLowerCase().replace(/[\s\-_.]+/g, '') === cleanName)) {
          return off;
        }
      }
    }

    return null;
  };

  // Rumah sakit yang belum memiliki petugas penanggung jawab
  const unassignedHospitals = useMemo(() => {
    return masterHospitals.filter((h) => !getHospitalAssignedOfficer(h.id, h.nama_rs));
  }, [officers, masterHospitals]);

  // Filtered Master Hospitals untuk POV Data Rumah Sakit
  const filteredMasterHospitals = useMemo(() => {
    return masterHospitals.filter((h) => {
      const q = hospitalSearch.trim().toLowerCase();
      const assignedOff = getHospitalAssignedOfficer(h.id, h.nama_rs);
      if (hospitalStatusFilter === 'ASSIGNED' && !assignedOff) return false;
      if (hospitalStatusFilter === 'UNASSIGNED' && assignedOff) return false;
      if (!q) return true;
      const matchName = (h.nama_rs || '').toLowerCase().includes(q);
      const matchAddr = (h.alamat || '').toLowerCase().includes(q);
      const matchOff = assignedOff && (assignedOff.nama || '').toLowerCase().includes(q);
      return matchName || matchAddr || matchOff;
    });
  }, [masterHospitals, hospitalSearch, hospitalStatusFilter, officers]);

  // Pemetaan RS ke petugas yang menangani (ID-based & Name-based)
  const hospitalAssignedOfficersMap = useMemo(() => {
    const map = new Map();
    officers.forEach((off) => {
      (off.hospitals || []).forEach((h) => {
        const hid = h.hospital_id || h.id;
        if (hid) {
          if (!map.has(hid)) map.set(hid, []);
          if (!map.get(hid).some((o) => String(o.id) === String(off.id))) {
            map.get(hid).push(off);
          }
        }
        if (h.nama_rs) {
          const lower = h.nama_rs.toLowerCase().trim();
          if (!map.has(lower)) map.set(lower, []);
          if (!map.get(lower).some((o) => String(o.id) === String(off.id))) {
            map.get(lower).push(off);
          }
        }
      });
      (off.plottingRs || []).forEach((rsName) => {
        const lower = (rsName || '').toLowerCase().trim();
        if (!map.has(lower)) map.set(lower, []);
        if (!map.get(lower).some((o) => String(o.id) === String(off.id))) {
          map.get(lower).push(off);
        }
      });
    });
    return map;
  }, [officers]);

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
      // Ambil seluruh korban yang berhubungan dengan petugas ini (baik aktif, rujukan masuk, maupun yang pernah dirujuk keluar)
      const allRelated = storageService.getOfficerVictimsForPortal(off);

      const activeVictims = [];
      const referredVictims = [];
      const finishedVictims = [];

      allRelated.forEach((v) => {
        const role = storageService.getOfficerVictimRole(off, v);
        const isDischarged =
          v.kondisiTerakhir === 'Sudah Pulang' ||
          v.kondisiTerakhir === 'Pulang' ||
          v.kondisiTerakhir === 'Selesai' ||
          v.kondisiTerakhir === 'Meninggal Dunia' ||
          v.statusPemantauan === 'Selesai Dipantau';

        if (role === 'ORIGIN_OFFICER') {
          // Korban yang pernah dirawat di RS binaan petugas ini namun telah dirujuk keluar ke RS lain
          referredVictims.push(v);
        } else if (isDischarged) {
          finishedVictims.push(v);
        } else {
          // Korban aktif dalam pemantauan petugas ini (penugasan langsung atau rujukan masuk)
          activeVictims.push(v);
        }
      });

      // Beban aktif HANYA dihitung dari korban aktif (korban yang sudah dirujuk ke RS lain tidak membebani kapasitas!)
      const activeCount = activeVictims.length;
      const pct = Math.min(100, Math.round((activeCount / 10) * 100));

      map[off.id] = {
        allVictims: allRelated,
        activeVictims,
        referredVictims,
        finishedVictims,
        activeCount,
        referredCount: referredVictims.length,
        finishedCount: finishedVictims.length,
        totalCount: allRelated.length,
        capacityText: `${activeCount}/10 Kasus`,
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

    const assignedCount = masterHospitals.filter((h) => getHospitalAssignedOfficer(h.id, h.nama_rs)).length;
    const unassignedCount = masterHospitals.length - assignedCount;

    return {
      totalOfficers,
      activeOfficersCount,
      totalRegions: uniqueRegions.length,
      totalHospitals: masterHospitals.length,
      assignedHospitalsCount: assignedCount,
      unassignedHospitalsCount: unassignedCount,
      totalActiveVictims
    };
  }, [officers, uniqueRegions, masterHospitals, officerWorkloads]);

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
      'Total Korban Ditangani',
      'Korban Aktif',
      'Nomor Telepon',
      'Email'
    ];

    const rows = filteredOfficers.map((off, index) => {
      const wl = officerWorkloads[off.id] || { activeCount: 0, totalCount: 0 };
      const rsList = (off.plottingRs || []).join('; ');
      return [
        index + 1,
        `"${off.nama}"`,
        `"'\t${off.nip}"`, // prevent excel exponential format
        `"${off.jabatan || 'Mobile Service Officer'}"`,
        `"${off.status || 'Aktif Lapangan'}"`,
        `"${off.wilayah || '—'}"`,
        `"${rsList}"`,
        wl.totalCount,
        wl.activeCount,
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
      referredVictims: [],
      finishedVictims: []
    };

    if (modalVictimTab === 'active') return wl.activeVictims || [];
    if (modalVictimTab === 'referred') return wl.referredVictims || [];
    if (modalVictimTab === 'finished') return wl.finishedVictims || [];
    return wl.allVictims || [];
  }, [activeOfficerModal, modalVictimTab, officerWorkloads]);

  const getStatusDisplay = (status) => {
    if (status === 'Nonaktif') return { label: 'Nonaktif', color: 'text-slate-500', dot: 'bg-slate-400' };
    if (status === 'Verifikasi Berkas') return { label: 'Verifikasi Berkas', color: 'text-blue-700', dot: 'bg-blue-500' };
    if (status === 'Perlu Perhatian') return { label: 'Perlu Perhatian', color: 'text-rose-700', dot: 'bg-rose-500' };
    return { label: 'Aktif Lapangan', color: 'text-emerald-700', dot: 'bg-emerald-500' };
  };

  const renderHospitalSummary = (hospitals, officer) => {
    const listedHospitals = hospitals || [];
    const visibleHospitals = listedHospitals.slice(0, 2);
    const remaining = listedHospitals.length - visibleHospitals.length;

    if (listedHospitals.length === 0) {
      return (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 font-medium bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Belum ada RS ditugaskan</span>
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {visibleHospitals.map((hospital) => (
            <span
              key={hospital}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 text-[#145DA0] border border-blue-200/80 max-w-[190px] truncate shadow-2xs"
              title={hospital}
            >
              <Building2 className="w-3 h-3 text-[#145DA0] shrink-0" />
              <span className="truncate">{hospital}</span>
            </span>
          ))}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShowAllHospitalsOfficer(officer)}
              className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-blue-100 hover:text-[#0A3981] text-slate-700 border border-slate-300 transition-colors cursor-pointer"
              title="Klik untuk melihat seluruh daftar rumah sakit"
            >
              +{remaining} lainnya
            </button>
          )}
        </div>

        <div className="pt-0.5">
          <span className="text-[10px] text-slate-400 font-medium">
            Total {listedHospitals.length} Fasilitas Kesehatan
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
            Data Petugas Lapangan
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
            Direktori personil petugas Jasa Raharja, penugasan wilayah, faskes rumah sakit yang ditangani, dan total beban kasus korban.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
          {/* View mode toggle */}
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${viewMode === 'table'
                ? 'bg-white text-[#145DA0] shadow-xs font-semibold'
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${viewMode === 'grid'
                ? 'bg-white text-[#145DA0] shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
                }`}
              title="Tampilan Kartu Profil"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kartu Profil</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('hospitals')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${viewMode === 'hospitals'
                ? 'bg-white text-[#145DA0] shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
                }`}
              title="Tampilan Data Rumah Sakit & Kelola Penugasan"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Data Rumah Sakit</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-200 text-slate-700">
                {masterHospitals.length}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsAddOfficerModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#145DA0] hover:bg-[#0A3981] text-white shadow-xs transition-all active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Petugas</span>
          </button>
        </div>
      </div>


      {/* 2. Four Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Petugas */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex items-center gap-3.5 hover:border-blue-200 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center shrink-0 border border-blue-100">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">
              Total Petugas
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-bold text-slate-800 tracking-tight">
                {globalMetrics.totalOfficers}
              </span>
              <span className="text-xs text-slate-500 font-normal">Petugas</span>
            </div>
          </div>
        </div>

        {/* Card 2: Wilayah Penugasan */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex items-center gap-3.5 hover:border-emerald-200 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">
              Wilayah Penugasan
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-bold text-slate-800 tracking-tight">
                {globalMetrics.totalRegions}
              </span>
              <span className="text-xs text-slate-500 font-normal">Wilayah</span>
            </div>
          </div>
        </div>

        {/* Card 3: Data Rumah Sakit */}
        <div
          onClick={() => setViewMode('hospitals')}
          className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-xs flex items-center gap-3.5 transition-all cursor-pointer group ${
            viewMode === 'hospitals'
              ? 'border-[#145DA0] ring-2 ring-blue-100 bg-blue-50/20'
              : 'border-slate-200/90 hover:border-indigo-200'
          }`}
          title="Klik untuk membuka Data Rumah Sakit & Kelola Penugasan Petugas"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100 group-hover:bg-[#145DA0] group-hover:text-white transition-colors">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">
              Fasilitas Kesehatan
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-bold text-slate-800 tracking-tight">
                {globalMetrics.totalHospitals}
              </span>
              <span className="text-xs text-slate-500 font-normal">Faskes RS</span>
            </div>
          </div>
        </div>

        {/* Card 4: Korban Tanggung Jawab */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex items-center gap-3.5 hover:border-amber-200 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-100">
            <HeartHandshake className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">
              Beban Kasus Korban
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-bold text-slate-800 tracking-tight">
                {globalMetrics.totalActiveVictims}
              </span>
              <span className="text-xs text-slate-500 font-normal">Pasien Aktif</span>
            </div>
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
      ) : viewMode === 'hospitals' ? (
        /* ======================== DATA RUMAH SAKIT & MATRIKS PENUGASAN ======================== */
        <div className="space-y-4">
          {/* Sub Header Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center shrink-0 border border-blue-100">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900 tracking-tight">
                  Direktori Data Rumah Sakit &amp; Penugasan Petugas
                </h2>
                <p className="text-[11px] text-slate-500">
                  Pemetaan akurat faskes di Provinsi Riau dengan petugas penanggung jawab lapangan.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {/* Search Hospital */}
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={hospitalSearch}
                  onChange={(e) => setHospitalSearch(e.target.value)}
                  placeholder="Cari RS, alamat, atau petugas..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0] bg-slate-50/70 text-xs text-slate-900"
                />
              </div>

              {/* Filter Status Penugasan */}
              <select
                value={hospitalStatusFilter}
                onChange={(e) => setHospitalStatusFilter(e.target.value)}
                className="bg-slate-50/70 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
              >
                <option value="ALL">Semua RS ({masterHospitals.length})</option>
                <option value="ASSIGNED">Sudah Ada Petugas ({globalMetrics.assignedHospitalsCount})</option>
                <option value="UNASSIGNED">Belum Ada Petugas ({globalMetrics.unassignedHospitalsCount})</option>
              </select>
            </div>
          </div>

          {/* Tabel Data Rumah Sakit */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/90 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-3 text-center w-12">NO</th>
                    <th className="py-3.5 px-3 w-24">KODE RS</th>
                    <th className="py-3.5 px-4 min-w-[260px]">NAMA RUMAH SAKIT</th>
                    <th className="py-3.5 px-4 min-w-[200px]">ALAMAT &amp; WILAYAH</th>
                    <th className="py-3.5 px-4 min-w-[240px]">PETUGAS PENANGGUNG JAWAB</th>
                    <th className="py-3.5 px-3 text-center min-w-[120px]">PASIEN AKTIF</th>
                    <th className="py-3.5 px-4 text-center w-48">KONTROL PENUGASAN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMasterHospitals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-700 text-xs">Tidak ada rumah sakit yang sesuai filter pencarian.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredMasterHospitals.map((hosp, idx) => {
                      const assignedOff = getHospitalAssignedOfficer(hosp.id, hosp.nama_rs);
                      const activeCasesInHosp = victims.filter((v) => {
                        if (!isVictimActive(v)) return false;
                        if (v.hospital_id && hosp.id && Number(v.hospital_id) === Number(hosp.id)) return true;
                        const vRs = (v.rumahSakit || '').toLowerCase().trim();
                        const hRs = (hosp.nama_rs || '').toLowerCase().trim();
                        return vRs === hRs || (hRs.length >= 4 && (vRs.includes(hRs) || hRs.includes(vRs)));
                      }).length;

                      return (
                        <tr key={hosp.id || idx} className="hover:bg-blue-50/30 transition-colors group">
                          {/* 1. NO */}
                          <td className="py-3.5 px-3 text-center text-slate-400 font-mono text-xs">
                            {idx + 1}
                          </td>

                          {/* 2. KODE RS */}
                          <td className="py-3.5 px-3 whitespace-nowrap font-mono text-xs text-slate-500 font-bold">
                            {typeof hosp.id === 'number' || !isNaN(Number(hosp.id)) ? `RS-${String(hosp.id).padStart(2, '0')}` : hosp.id}
                          </td>

                          {/* 3. NAMA RUMAH SAKIT */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#145DA0] flex items-center justify-center shrink-0 border border-blue-100">
                                <Building2 className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 group-hover:text-[#145DA0] text-xs block">
                                  {hosp.nama_rs}
                                </span>
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  Radius Audit: {hosp.radius_meter || 200} Meter
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 4. ALAMAT & WILAYAH */}
                          <td className="py-3.5 px-4 text-slate-600 text-xs">
                            <div className="flex items-start gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2 leading-relaxed">
                                {hosp.alamat || 'Provinsi Riau'}
                              </span>
                            </div>
                          </td>

                          {/* 5. PETUGAS PENANGGUNG JAWAB */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {assignedOff ? (
                              <div>
                                <Link
                                  to={`/kabag/kinerja?tab=detail&officerId=${assignedOff.id}`}
                                  className="font-bold text-slate-900 hover:text-[#145DA0] hover:underline block text-xs"
                                >
                                  {assignedOff.nama}
                                </Link>
                                <span className="text-[10px] text-slate-400 font-mono block">
                                  {assignedOff.nip && assignedOff.nip !== '—' ? `NIP. ${assignedOff.nip}` : assignedOff.wilayah}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Belum ada Petugas</span>
                              </span>
                            )}
                          </td>

                          {/* 6. PASIEN AKTIF */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            {activeCasesInHosp > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#0A3981] border border-blue-200">
                                <HeartHandshake className="w-3.5 h-3.5" />
                                <span>{activeCasesInHosp} Pasien</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">0 Pasien</span>
                            )}
                          </td>

                          {/* 7. KONTROL PENUGASAN */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenSingleAssignModal(hosp)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-[#0A3981] border border-blue-200 transition-colors cursor-pointer shadow-2xs"
                                title="Atur atau ubah petugas penanggung jawab RS ini"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                                <span>{assignedOff ? 'Ganti Petugas' : 'Atur Petugas'}</span>
                              </button>

                              {assignedOff && (
                                <button
                                  type="button"
                                  onClick={() => handleUnassignHospital(hosp)}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
                                  title="Lepas penugasan petugas dari RS ini"
                                >
                                  <Power className="w-3 h-3" />
                                  <span>Lepas</span>
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
        </div>
      ) : viewMode === 'table' ? (
        /* ======================== TABEL MATRIKS PETUGAS ======================== */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/90 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-3 text-center w-12">NO</th>
                  <th className="py-3.5 px-4 min-w-[240px]">NAMA PETUGAS</th>
                  <th className="py-3.5 px-3 min-w-[130px]">STATUS OPERASIONAL</th>
                  <th className="py-3.5 px-3 min-w-[130px]">WILAYAH TUGAS</th>
                  <th className="py-3.5 px-4 min-w-[240px]">RUMAH SAKIT DITANGANI</th>
                  <th className="py-3.5 px-3 text-center min-w-[110px]">TOTAL KORBAN</th>
                  <th className="py-3.5 px-3 text-center w-44">AKSI OPERASIONAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOfficers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-600">
                        Tidak ada petugas yang cocok dengan filter atau kata kunci
                      </p>
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#145DA0] hover:underline cursor-pointer"
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
                        {/* 1. NO */}
                        <td className="py-4 px-3 text-center font-bold text-slate-400">
                          {no}
                        </td>

                        {/* 2. NAMA PETUGAS (Nama, NIP, No HP) */}
                        <td className="py-4 px-4">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => handleOpenOfficerVictims(off)}
                              className="font-extrabold text-slate-900 block text-xs sm:text-sm hover:text-[#145DA0] transition-colors hover:underline text-left cursor-pointer"
                            >
                              {off.nama}
                            </button>
                              <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                                NIP: <span className="font-mono text-slate-700 font-semibold">{off.nip || off.id || '—'}</span>
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium block">
                                {off.telepon ? (
                                  <a
                                    href={`https://wa.me/${String(off.telepon).replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-slate-600 hover:text-emerald-600 transition-colors inline-flex items-center gap-1 font-mono"
                                    title="Hubungi via WhatsApp"
                                  >
                                    <span>{off.telepon}</span>
                                    <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                                  </a>
                                ) : (
                                  <span className="text-slate-400">No. HP: —</span>
                                )}
                              </span>
                              {off.email && off.email !== '—' && (
                                <span className="text-[11px] text-slate-500 font-medium block truncate max-w-[200px]" title={off.email}>
                                  <span className="font-mono text-slate-600">{off.email}</span>
                                </span>
                              )}
                          </div>
                        </td>

                        {/* 5. STATUS OPERASIONAL */}
                        <td className="py-4 px-3">
                          {(() => {
                            const st = getStatusDisplay(off.status);
                            return (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${off.status === 'Nonaktif'
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                <span>{st.label}</span>
                              </span>
                            );
                          })()}
                        </td>

                        {/* 6. WILAYAH TUGAS */}
                        <td className="py-4 px-3">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{off.wilayah || '—'}</span>
                          </div>
                        </td>

                        {/* 7. RUMAH SAKIT DITANGANI */}
                        <td className="py-4 px-4">
                          {renderHospitalSummary(off.plottingRs, off)}
                        </td>

                        {/* 8. TOTAL KORBAN */}
                        <td className="py-4 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenOfficerVictims(off)}
                            className="inline-flex flex-col items-center justify-center p-1.5 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer group"
                            title="Klik untuk melihat rincian korban yang ditangani"
                          >
                            <span className="text-sm font-black text-[#0A3981] group-hover:underline">
                              {wl.totalCount}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500">
                              Total Korban
                            </span>
                          </button>
                        </td>

                        {/* 10. AKSI OPERASIONAL */}
                        <td className="py-4 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenOfficerVictims(off)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#145DA0] text-white hover:bg-[#0A3981] transition-colors inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                              title="Lihat Detail Korban Tanggung Jawab"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Detail</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(off)}
                              className="p-1.5 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
                              title="Edit Data Petugas"
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
                              className="p-1.5 rounded-lg text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                              title="Nonaktifkan Petugas"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
                      </div>
                      {renderHospitalSummary(off.plottingRs)}
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-xs font-bold text-slate-900">{wl.totalCount} Total Korban</span>
                        <span className="text-[10px] text-slate-500 font-medium">{wl.activeCount} Aktif Dipantau</span>
                      </div>
                      <button type="button" onClick={() => handleOpenOfficerVictims(off)} className="w-full mt-2 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100/80 text-[#0A3981] border border-blue-200/80 text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer">
                        <Eye className="w-3.5 h-3.5" />
                        <span>Lihat {wl.totalCount} Korban Ditangani</span>
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
                  NIP. {activeOfficerModal.nip || activeOfficerModal.id || '—'} • Plotting RS:{' '}
                  {((activeOfficerModal.plottingRs && activeOfficerModal.plottingRs.length > 0)
                    ? activeOfficerModal.plottingRs
                    : (activeOfficerModal.hospitals || []).map((h) => h.nama_rs)
                  ).join(', ') || 'Belum diplot'}
                </p>
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
            <div className="px-5 pt-2 pb-2 border-b border-slate-100 flex items-center gap-1.5 bg-white text-xs overflow-x-auto">
              <button
                type="button"
                onClick={() => setModalVictimTab('active')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${modalVictimTab === 'active'
                  ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                Sedang Ditangani ({officerWorkloads[activeOfficerModal.id]?.activeCount || 0})
              </button>
              <button
                type="button"
                onClick={() => setModalVictimTab('referred')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${modalVictimTab === 'referred'
                  ? 'bg-purple-50 text-purple-900 font-bold border border-purple-200'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                Dirujuk ke RS Lain ({officerWorkloads[activeOfficerModal.id]?.referredCount || 0})
              </button>
              <button
                type="button"
                onClick={() => setModalVictimTab('finished')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${modalVictimTab === 'finished'
                  ? 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-200'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                Selesai Dipantau ({officerWorkloads[activeOfficerModal.id]?.finishedCount || 0})
              </button>
              <button
                type="button"
                onClick={() => setModalVictimTab('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${modalVictimTab === 'all'
                  ? 'bg-slate-100 text-slate-900 font-bold'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                Semua ({officerWorkloads[activeOfficerModal.id]?.totalCount || 0})
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
                        const refInfo = getReferralPerspectiveInfo(vic, selectedHospital?.nama_rs || null, selectedOfficer);

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
                              <div>
                                <span className="font-semibold text-slate-800 block">
                                  {refInfo.displayHospital}
                                </span>
                                <span className="text-[10px] text-slate-400 block truncate max-w-[180px]">
                                  {vic.ruangan || 'Rawat Inap'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-600">
                              {vic.kondisiTerakhir || '—'}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-xs">
                              {vic.statusPemantauan?.startsWith('Dirujuk ke') || vic.kondisiTerakhir === 'Dirujuk' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                  <span>{vic.statusPemantauan || 'Dirujuk ke RS Lain'}</span>
                                </span>
                              ) : (
                                <span className="text-slate-600">{vic.statusPemantauan || '—'}</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <span className={`text-xs font-medium ${currentSla.status === 'TERLAMBAT'
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
                  to={`/kabag/kinerja?tab=detail&officerId=${activeOfficerModal.id}`}
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

              {/* Seksi 3: Plotting Rumah Sakit yang Ditangani */}
              <div className="space-y-3">
                <HospitalSearchSelect
                  selectedHospitals={newOfficerForm.plottingRs}
                  onChange={(nextList) => setNewOfficerForm((prev) => ({ ...prev, plottingRs: nextList }))}
                  availableHospitals={availableHospitals}
                  label="Rumah Sakit yang Ditangani"
                  required={true}
                />
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

              {/* Seksi 3: Plotting Rumah Sakit yang Ditangani */}
              <div className="space-y-3">
                <HospitalSearchSelect
                  selectedHospitals={editForm.plottingRs}
                  onChange={(nextList) => setEditForm((prev) => ({ ...prev, plottingRs: nextList }))}
                  availableHospitals={availableHospitals}
                  label="Rumah Sakit yang Ditangani"
                  required={true}
                />
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
      {/* 9. MODAL: KELOLA PENUGASAN RUMAH SAKIT                                    */}
      {/* ========================================================================= */}
      {isHospitalAssignmentModalOpen && assignmentOfficer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8 animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-blue-900 via-[#0A3981] to-[#145DA0] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
                  <Sliders className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black">
                    Kelola Penugasan Rumah Sakit
                  </h3>
                  <p className="text-xs text-blue-100 font-medium">
                    {assignmentOfficer.nama} (NIP: {assignmentOfficer.nip || assignmentOfficer.id}) • {assignmentOfficer.wilayah}
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
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>Keterhubungan Rumah Sakit & Beban Kasus Korban:</span>
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Pilih rumah sakit yang menjadi tanggung jawab <strong>{assignmentOfficer.nama}</strong>. Setiap korban baru yang masuk di rumah sakit terpilih akan otomatis terhubung ke petugas ini untuk dipantau kunjungannya sesuai SLA.
                </p>
              </div>

              {/* Status Bar */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-slate-700">
                  Daftar Rumah Sakit Tersedia:
                </span>
                <span className="text-xs font-bold text-[#145DA0] bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                  {assignmentSelectedHospitalIds.size} RS Terpilih
                </span>
              </div>

              {/* Hospital Selection Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                {masterHospitals.map((rs) => {
                  const isSelected = assignmentSelectedHospitalIds.has(rs.id) || assignmentSelectedHospitalIds.has(Number(rs.id));
                  const assignedOff = getHospitalAssignedOfficer(rs.id, rs.nama_rs);
                  const isOtherOfficer = assignedOff && String(assignedOff.id) !== String(assignmentOfficer.id);

                  return (
                    <button
                      key={rs.id}
                      type="button"
                      onClick={() => handleToggleAssignmentHospitalId(rs.id)}
                      className={`flex flex-col p-2.5 rounded-xl text-xs text-left border transition-all cursor-pointer ${isSelected
                        ? 'bg-blue-50 text-blue-900 border-blue-400 font-semibold shadow-2xs ring-1 ring-blue-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Building2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#145DA0]' : 'text-slate-400'}`} />
                          <span className="font-bold text-xs line-clamp-1">{rs.nama_rs}</span>
                        </div>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-[#145DA0] border-[#145DA0] text-white' : 'border-slate-300 bg-white'
                          }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>

                      {rs.alamat && (
                        <span className="text-[10px] text-slate-400 line-clamp-1 mt-1 pl-5">
                          {rs.alamat}
                        </span>
                      )}

                      {/* Status Petugas Penanggung Jawab RS */}
                      <div className="mt-1.5 pl-5 flex items-center gap-1 text-[10px]">
                        {isOtherOfficer ? (
                          <span className="text-amber-700 font-medium truncate flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            Saat ini: {assignedOff.nama} (akan dialihkan)
                          </span>
                        ) : isSelected ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            Ditugaskan ke {assignmentOfficer.nama}
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                            Belum ada Petugas
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Add Custom Hospital */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Tambah nama rumah sakit baru..."
                  value={newAssignmentRsInput}
                  onChange={(e) => setNewAssignmentRsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomAssignmentHospital();
                    }
                  }}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#145DA0] focus:border-[#145DA0]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomAssignmentHospital}
                  className="px-3.5 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  + Tambah RS
                </button>
              </div>

              {/* Footer Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isSavingAssignment}
                  onClick={() => setIsHospitalAssignmentModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSavingAssignment}
                  onClick={handleSaveHospitalAssignment}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-2xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {isSavingAssignment ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan ke Database...</span>
                    </>
                  ) : (
                    <span>Simpan Penugasan RS</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DAFTAR LENGKAP RUMAH SAKIT (+N LAINNYA)                            */}
      {/* ========================================================================= */}
      {showAllHospitalsOfficer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="p-5 bg-gradient-to-r from-[#0A3981] to-[#145DA0] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Daftar Rumah Sakit Penugasan</h3>
                  <p className="text-xs text-blue-100">{showAllHospitalsOfficer.nama} ({(showAllHospitalsOfficer.hospitals || []).length || (showAllHospitalsOfficer.plottingRs || []).length} RS)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllHospitalsOfficer(null)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-72 overflow-y-auto divide-y divide-slate-100">
              {((showAllHospitalsOfficer.hospitals && showAllHospitalsOfficer.hospitals.length > 0)
                ? showAllHospitalsOfficer.hospitals
                : (showAllHospitalsOfficer.plottingRs || []).map((name, i) => ({ hospital_id: i, nama_rs: name }))
              ).map((hosp, idx) => (
                <div key={hosp.hospital_id || idx} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-800">{hosp.nama_rs}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">{hosp.alamat || 'Riau'}</span>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const off = showAllHospitalsOfficer;
                  setShowAllHospitalsOfficer(null);
                  handleOpenHospitalAssignmentModal(off);
                }}
                className="text-xs font-bold text-[#145DA0] hover:underline flex items-center gap-1"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Kelola Penugasan RS</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAllHospitalsOfficer(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ATUR PETUGAS UNTUK SATU RUMAH SAKIT (POV DATA RUMAH SAKIT)        */}
      {/* ========================================================================= */}
      {singleAssignHospital && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-up">
            <div className="p-5 bg-gradient-to-r from-[#0A3981] to-[#145DA0] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Atur Petugas Penanggung Jawab</h3>
                  <p className="text-xs text-blue-100 line-clamp-1">{singleAssignHospital.nama_rs}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSingleAssignHospital(null)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Status Penugasan Saat Ini */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Penugasan Saat Ini
                </span>
                {(() => {
                  const assigned = getHospitalAssignedOfficer(singleAssignHospital.id, singleAssignHospital.nama_rs);
                  if (assigned) {
                    return (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#0A3981] font-bold text-xs flex items-center justify-center">
                            {assigned.nama.charAt(0)}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800">{assigned.nama}</div>
                            <div className="text-[10px] text-slate-500">NIP/ID: {assigned.nip || assigned.id}</div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Aktif
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-bold">Belum ada Petugas</span>
                    </div>
                  );
                })()}
              </div>

              {/* Pilih Petugas Baru */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Pilih Petugas Penanggung Jawab Baru:
                </label>
                <select
                  value={singleAssignOfficerId}
                  onChange={(e) => setSingleAssignOfficerId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#0A3981]"
                >
                  <option value="NONE">Lepas Penugasan (Jadikan: Belum ada Petugas)</option>
                  {officers.map((off) => {
                    const rsCount = (off.hospitals || []).length || (off.plottingRs || []).length;
                    return (
                      <option key={off.id} value={off.id}>
                        {off.nama} — ({rsCount} RS aktif)
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-slate-500">
                  Satu petugas dapat mengelola beberapa rumah sakit sekaligus.
                </p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Perubahan penugasan tidak akan menghapus riwayat pemantauan korban dan riwayat kunjungan yang sebelumnya telah ditangani petugas.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSingleAssignHospital(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingSingleAssign}
                onClick={handleSaveSingleAssign}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0A3981] text-white hover:bg-blue-900 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingSingleAssign ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan Perubahan</span>
                  </>
                )}
              </button>
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
