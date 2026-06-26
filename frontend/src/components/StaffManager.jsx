import React, { useEffect, useRef, useState } from 'react';
import {
  FiCamera,
  FiCheckCircle,
  FiEdit2,
  FiExternalLink,
  FiPlus,
  FiRefreshCw,
  FiShield,
  FiTrash2,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { apiAssetUrl, fetchApi } from '../config/api';
import { db } from '../db/db';
import {
  averageDescriptors,
  deleteDescriptor,
  extractDescriptor,
  initFaceApi,
  listEnrolledMatriculas,
  saveDescriptor,
} from '../services/faceService';

// Timeout configurable para operaciones IDB — por defecto 5000 ms.
// 1500 ms era demasiado corto: en primer arranque, Dexie ejecuta el handler
// 'ready' (semillas de productos) antes de que cualquier tx externa pueda correr.
// Si el ready handler tarda > 1500 ms en iPad (muy posible), el timeout
// disparaba un falso positivo que bloqueaba TODA la sección de Equipo.
const withIdbTimeout = (promise, label, ms = 5000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        const e = new Error(`IDB timeout en "${label}" (${ms}ms)`);
        e.name = 'TimeoutError';
        reject(e);
      }, ms)
    ),
  ]);

// ─── Diagnóstico IDB — usado como pre-check en handleSave ────────────────────
// NO se usa como gate en loadStaff (ver comentario en loadStaff).
async function checkDexieHealth() {
  if (typeof indexedDB === 'undefined' || indexedDB === null) {
    const e = new Error('window.indexedDB no existe — Modo Privado o sin soporte');
    e.name = 'MissingAPI';
    throw e;
  }
  // SIEMPRE await db.open() — nunca usar db.isOpen() para saltarlo.
  // db.isOpen() devuelve true en cuanto el IDB abre la conexión, ANTES de que
  // el handler 'ready' de Dexie termine. Si el ready sigue corriendo (bulkPut
  // de productos, navigator.storage.persist...), cualquier tx que abramos aquí
  // se cola detrás y puede tardar segundos — causando el TimeoutError de antes.
  // db.open() sí espera hasta que ready completa, y si ya está listo, resuelve
  // instantáneamente. Usarlo garantiza que las tx son seguras.
  try {
    await withIdbTimeout(db.open(), 'db.open()', 6000);
  } catch (openErr) {
    const e = new Error(`db.open() falló: ${openErr.message}`);
    e.name = openErr.name || 'OpenError';
    throw e;
  }
  try {
    await withIdbTimeout(
      db.transaction('r', db.staff, async () => { await db.staff.count(); }),
      'db.transaction(r, staff)',
      5000
    );
  } catch (txErr) {
    const e = new Error(`Test de transacción IDB falló: ${txErr.message}`);
    e.name = txErr.name || 'TransactionError';
    throw e;
  }
}

const EMPTY_FORM = {
  id: null,
  matricula: '',
  nombre: '',
  apellido_paterno: '',
  apellido_materno: '',
  usuario: '',
  password: '',
  rol: 'recepcion',
  telefono: '',
  correo: '',
  estado: 'ACTIVO',
  foto_path: '',
  foto_data_url: '',
};

const ROLE_OPTIONS = [
  { value: 'admin', label: 'admin' },
  { value: 'entrenador', label: 'entrenador' },
  { value: 'recepcion', label: 'recepcion' },
];

const normalizeRoleForForm = (role = '') => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'recepcion') return 'recepcion';
  if (['entrenador', 'instructor', 'coach', 'staff'].includes(normalized)) return 'entrenador';
  return 'recepcion';
};

const PALETTE = {
  orange: 'var(--secondary-color)',
  white: '#fff',
  dark: 'var(--primary-color)',
  green: '#16a34a',
  red: '#b42318',
  grayBg: '#f8fafc',
  grayBorder: '#e2e8f0',
  grayText: '#667085',
};

const CAPTURE_STEPS = [
  { key: 'front', label: '1/3 — Mira directamente a la cámara' },
  { key: 'left',  label: '2/3 — Gira ligeramente hacia tu IZQUIERDA' },
  { key: 'right', label: '3/3 — Gira ligeramente hacia tu DERECHA' },
];

const EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com', 'live.com', 'hotmail.com', 'ite.edu.mx', 'uabc.edu.mx'];

const parseEmail = (email = '') => {
  const at = email.indexOf('@');
  if (at <= 0) return { user: email, domain: 'gmail.com', custom: '' };
  const u = email.slice(0, at);
  const d = email.slice(at + 1);
  const known = EMAIL_DOMAINS.includes(d);
  return { user: u, domain: known ? d : 'otro', custom: known ? '' : d };
};

export function StaffManager() {
  const [staff, setStaff] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [enrolledSet, setEnrolledSet] = useState(new Set());
  const [enrollModal, setEnrollModal] = useState({ isOpen: false, user: null, step: 'capturing', captureStep: 'front', tempDescriptors: [], message: '' });
  const [emailParts, setEmailParts] = useState({ user: '', domain: 'gmail.com', custom: '' });
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    loadStaff();
    loadEnrolled();
  }, []);

  // Start camera when enrollment modal opens; stop when it closes.
  useEffect(() => {
    if (!enrollModal.isOpen) return;
    startCamera();
    return () => stopCamera();
  }, [enrollModal.isOpen]);


  const loadStaff = async () => {
    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`TIMEOUT ${label} (${ms}ms)`)), ms)
        ),
      ]);

    setIsLoading(true);
    setErrorMessage('');
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      let response;
      try {
        response = await fetchApi('/api/usuarios', { signal: controller.signal });
      } finally {
        clearTimeout(tid);
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'No pude cargar el staff.');
      setStaff(Array.isArray(result.data) ? result.data : []);
    } catch (networkError) {
      console.warn('[StaffManager] Sin red — leyendo db.staff local:', networkError.message);
      // No usar checkDexieHealth() como gate aquí.
      // checkDexieHealth añade una tx extra ANTES de la lectura real. Si Dexie está
      // ocupado con el ready handler (semilla de productos en primer arranque), esa
      // tx extra es la que expira — bloqueando la carga aunque IDB esté perfectamente
      // funcional. Dexie cola db.staff.toArray() automáticamente detrás del ready,
      // así que simplemente hacer la lectura directa es más robusto.
      try {
        const staffLocal = await withTimeout(db.staff.toArray(), 7000, 'db.staff.toArray');
        setStaff(staffLocal);
      } catch (dbError) {
        const diagnostico = `[${dbError.name || 'Error'}] ${dbError.message}`;
        console.error('[StaffManager] db.staff.toArray falló:', diagnostico);
        alert(
          `⚠ IDB — lectura de db.staff falló:\n\n${diagnostico}\n\n` +
          `• TimeoutError   → Reinicia la app y espera 10 s antes de entrar a Equipo\n` +
          `• SecurityError  → Modo Privado: cambia a navegación normal\n` +
          `• UnknownError   → Settings → Safari → Borrar historial y datos`
        );
        setErrorMessage(`IDB: ${diagnostico}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadEnrolled = async () => {
    try {
      const matriculas = await listEnrolledMatriculas();
      setEnrolledSet(new Set(matriculas));
    } catch (_) { /* IndexedDB not ready */ }
  };

  const startCamera = async () => {
    // Cargar modelos en paralelo con la cámara para no esperar dos veces.
    initFaceApi().catch((err) => console.warn('[StaffManager] initFaceApi:', err));
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia no disponible (¿contexto inseguro o navegador antiguo?)');
      }
      // 320×240: suficiente para TinyFaceDetector con inputSize 160.
      // 640×480 colapsa la CPU del iPad cuando WebGL no está disponible
      // porque face-api procesa ~4× más píxeles por frame sin beneficio real.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Garantizar reproducción en iOS/Safari
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error('[StaffManager] Error de cámara:', err.name, err.message);
      const detail = err.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Ve a Configuración → Safari → Cámara y permite el acceso.'
        : err.name === 'NotFoundError'
        ? 'No se encontró ninguna cámara en el dispositivo.'
        : `No se pudo acceder a la cámara: ${err.message}`;
      setEnrollModal((prev) => ({ ...prev, message: detail }));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const openEnrollModal = (user) => {
    setEnrollModal({ isOpen: true, user, step: 'capturing', captureStep: 'front', tempDescriptors: [], capturedPhoto: '', message: '' });
  };

  const closeEnrollModal = () => {
    setEnrollModal({ isOpen: false, user: null, step: 'capturing', captureStep: 'front', tempDescriptors: [], capturedPhoto: '', message: '' });
  };

  const handleEnrollCapture = async () => {
    const { user, captureStep, tempDescriptors } = enrollModal;
    if (!videoRef.current || !user?.matricula) return;

    // Guard: el video debe tener stream activo y datos de frame disponibles.
    if (!videoRef.current.srcObject || videoRef.current.readyState < 2) {
      setEnrollModal((prev) => ({
        ...prev,
        step: 'capturing',
        message: 'La cámara aún no está lista. Espera un momento e intenta de nuevo.',
      }));
      return;
    }

    setEnrollModal((prev) => ({ ...prev, step: 'processing', message: 'Analizando...' }));
    try {
      // initFaceApi es idempotente: si los modelos ya están en memoria, regresa inmediatamente.
      await initFaceApi();
      const descriptor = await extractDescriptor(videoRef.current);

      if (!descriptor) {
        setEnrollModal((prev) => ({
          ...prev,
          step: 'capturing',
          message: 'Rostro no detectado. Asegúrate de tener buena iluminación y mirar de frente.',
        }));
        return;
      }

      // Acumular descriptor como Float32Array en estado temporal.
      const newDescriptors = [...tempDescriptors, descriptor];

      if (captureStep === 'front') {
        // Capturar frame frontal en base64 para foto de perfil offline (TAREA 4)
        const photoDataUrl = (() => {
          const v = videoRef.current;
          if (!v || !v.videoWidth) return '';
          const c = document.createElement('canvas');
          c.width = v.videoWidth; c.height = v.videoHeight;
          c.getContext('2d').drawImage(v, 0, 0);
          return c.toDataURL('image/jpeg', 0.8);
        })();
        setEnrollModal((prev) => ({ ...prev, step: 'capturing', captureStep: 'left', tempDescriptors: newDescriptors, capturedPhoto: photoDataUrl, message: '' }));
      } else if (captureStep === 'left') {
        setEnrollModal((prev) => ({ ...prev, step: 'capturing', captureStep: 'right', tempDescriptors: newDescriptors, message: '' }));
      } else {
        const averaged = averageDescriptors(newDescriptors);
        await saveDescriptor(user.matricula, averaged);

        // Guardar foto frontal como referencia de enrollment — campo separado para no
        // sobreescribir la foto de perfil que el operador subió manualmente (foto_data_url).
        const { capturedPhoto } = enrollModal;
        if (capturedPhoto) {
          try {
            const staffRec = await db.staff.filter((r) => r.matricula === user.matricula).first();
            if (staffRec) {
              await db.staff.update(staffRec.id, { foto_enrollment_url: capturedPhoto });
            }
          } catch (e) {}
        }

        await loadEnrolled();
        stopCamera();
        setEnrollModal((prev) => ({
          ...prev,
          step: 'done',
          message: `Rostro de ${getStaffName(user)} registrado (3 ángulos promediados).`,
        }));
      }
    } catch (err) {
      console.error('[StaffManager] ERROR en enrolamiento:', err.name, err.message, err);
      const isModelFetchError =
        err.message?.toLowerCase().includes('fetch') ||
        err.message?.includes('503') ||
        err.message?.includes('404');
      setEnrollModal((prev) => ({
        ...prev,
        step: 'capturing',
        message: isModelFetchError
          ? 'Los modelos de reconocimiento facial no se pudieron cargar. ' +
            'Usa cloudflared en vez de localhost.run, o conéctate en la misma red WiFi del servidor.'
          : `Error: ${err.message || 'Intenta de nuevo.'}`,
      }));
    }
  };

  const handleDeleteDescriptor = async (user) => {
    if (!window.confirm(`Eliminar rostro registrado de ${getStaffName(user)}?`)) return;
    await deleteDescriptor(user.matricula);
    await loadEnrolled();
    setFeedbackMessage(`Rostro de ${getStaffName(user)} eliminado.`);
  };

  const buildUsername = (payload) => {
    const cleanDiacritics = (s = '') =>
      String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const alphanumOnly = (s = '') => s.replace(/[^a-z0-9]/g, '');
    const firstName = alphanumOnly(cleanDiacritics(payload.nombre).split(/\s+/)[0]);
    const lastInitial = alphanumOnly(cleanDiacritics(payload.apellido_paterno))[0] || '';
    const base = lastInitial ? `${firstName}_${lastInitial}` : firstName;
    return base || payload.usuario || '';
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (['nombre', 'apellido_paterno', 'apellido_materno'].includes(field)) {
        return { ...next, usuario: buildUsername(next) };
      }
      return next;
    });
  };

  const handlePhotoSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = await fileToDataUrl(file);
      // Comprimir a 400×400 JPEG 75 % antes de guardar en IDB.
      // Una foto de iPad sin comprimir puede pesar 13 MB en base64;
      // esto la baja a ~25 KB, haciendo la escritura en Dexie instantánea.
      const compressed = await compressImage(raw, 400, 400, 0.75);
      setFormData((prev) => ({ ...prev, foto_data_url: compressed, foto_path: '' }));
    } catch (e) {
      // Surfacea el error exacto del navegador — en iOS puede ser límite de canvas
      // o memoria de GPU. No ignorar silenciosamente: necesitamos el diagnóstico.
      const diagnostico = `[${e.name || 'Error'}] ${e.message}`;
      console.error('[StaffManager] compressImage falló:', diagnostico);
      alert(
        `⚠ Diagnóstico iOS — compressImage falló:\n\n${diagnostico}\n\n` +
        `Se usará la foto sin comprimir. Si el guardado falla después, ` +
        `el problema puede ser el tamaño de la imagen en IDB.`
      );
      const raw = await fileToDataUrl(file).catch(() => '');
      setFormData((prev) => ({ ...prev, foto_data_url: raw, foto_path: '' }));
    }
    event.target.value = '';
  };

  const openCreateModal = () => {
    setFormData({ ...EMPTY_FORM });
    setEmailParts({ user: '', domain: 'gmail.com', custom: '' });
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    setFormData({
      id: user.id,
      matricula: user.matricula || '',
      nombre: user.nombre || '',
      apellido_paterno: user.apellido_paterno || '',
      apellido_materno: user.apellido_materno || '',
      usuario: user.usuario || '',
      password: '',
      rol: normalizeRoleForForm(user.rol),
      telefono: user.telefono || '',
      correo: user.correo || '',
      estado: user.estado || 'ACTIVO',
      foto_path: user.foto_path || '',
      foto_data_url: user.foto_data_url || '', // preservar foto de perfil existente
    });
    setEmailParts(parseEmail(user.correo || ''));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nombre.trim() || !formData.apellido_paterno.trim()) {
      return alert('Nombre y apellido paterno son obligatorios.');
    }
    if (!formData.usuario.trim()) return alert('Necesito un usuario valido.');
    if (!formData.id && !formData.password.trim()) {
      return alert('La password es obligatoria para crear el usuario.');
    }

    // ─── Diagnóstico iOS: verificar IDB ANTES de mostrar spinner ──────────────
    // Si IDB no está disponible (Modo Privado, cuota, corrupción), alertamos con
    // el error exacto del navegador antes de que el botón quede bloqueado.
    try {
      await checkDexieHealth();
    } catch (idbErr) {
      alert(
        `⚠ Diagnóstico iOS — no se puede guardar, IDB inaccesible:\n\n` +
        `[${idbErr.name}] ${idbErr.message}\n\n` +
        `• SecurityError → Safari en Modo Privado: cambia a navegación normal\n` +
        `• VersionError  → migración en curso: recarga la app\n` +
        `• UnknownError  → posible corrupción o cuota excedida`
      );
      return;
    }

    setSaving(true);
    try {
      const correoDomain = emailParts.domain === 'otro' ? emailParts.custom.trim() : emailParts.domain;
      const correo = emailParts.user.trim() && correoDomain ? `${emailParts.user.trim()}@${correoDomain}` : '';

      const payload = {
        nombre: formData.nombre.trim(),
        apellido_paterno: formData.apellido_paterno.trim(),
        apellido_materno: formData.apellido_materno.trim(),
        usuario: formData.usuario.trim(),
        password: formData.password.trim(),
        rol: formData.rol,
        role: formData.rol,
        pin: formData.password.trim(),
        telefono: formData.telefono.trim(),
        correo,
        estado: formData.estado,
        foto_path: formData.foto_path,
        foto_data_url: formData.foto_data_url,
      };

      // 1. GUARDAR EN DEXIE — transacción explícita 'rw' con put() (upsert).
      //
      // Problema anterior con Promise.race: cuando el timer ganaba la carrera y
      // el catch corría, db.staff.add() seguía vivo en background como "promesa
      // huérfana". Si el usuario reintentaba, dos transacciones readwrite en el
      // mismo object store competían en Safari → segundo deadlock garantizado.
      //
      // db.transaction('rw', db.staff, ...) le dice a Dexie exactamente qué tabla
      // necesita el lock exclusivo. Dexie serializa en cola; si ya hay una
      // transacción activa espera en lugar de competir, y libera el lock de forma
      // atómica al salir del callback. put() es upsert: no falla si la clave ya existe.
      let localId = formData.id || null;
      if (!formData.id) {
        const randomHex = Math.random().toString(16).substring(2, 6).toUpperCase();
        const matriculaLocal = `ST-${randomHex}-${Date.now().toString().slice(-3)}`;
        await db.transaction('rw', db.staff, async () => {
          localId = await db.staff.put({ ...payload, matricula: matriculaLocal, synced: 0 });
        });
      } else {
        await db.transaction('rw', db.staff, async () => {
          await db.staff.update(formData.id, { ...payload, synced: 0 });
        });
      }

      // 2. INTENTAR SERVIDOR (best-effort) — AbortController 4 s + catch silencioso
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        let serverResponse;
        try {
          serverResponse = await fetchApi(
            formData.id ? `/api/usuarios/${formData.id}` : '/api/usuarios',
            {
              method: formData.id ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: controller.signal,
            }
          );
        } finally {
          clearTimeout(tid);
        }
        if (serverResponse?.ok) {
          const result = await serverResponse.json().catch(() => ({}));
          if (localId) {
            await db.transaction('rw', db.staff, async () => {
              await db.staff.update(localId, { ...(result?.data || {}), synced: 1 });
            });
          }
        }
      } catch (serverError) {
        console.warn('[StaffManager] Servidor no disponible — registro queda en Dexie synced:0:', serverError.message);
      }

      // 3. Cerrar modal y dar feedback ANTES de recargar la lista
      setModalOpen(false);
      setFormData({ ...EMPTY_FORM });
      setFeedbackMessage(formData.id ? 'Empleado actualizado.' : 'Empleado creado (pendiente de sync con servidor).');

      // 4. Recargar lista sin bloquear — si loadStaff cuelga el modal ya cerró
      loadStaff().catch((e) => console.warn('[StaffManager] No pude recargar la lista tras guardar:', e.message));

    } catch (error) {
      console.error('[StaffManager] Error al guardar:', error);
      alert(`Error al guardar:\n${error.message || String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Eliminar a ${getStaffName(user)}?`)) return;
    try {
      const response = await fetchApi(`/api/usuarios/${user.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No pude eliminar el usuario.');
      setFeedbackMessage('Empleado eliminado correctamente.');
      await loadStaff();
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={wrapperStyle}>
        <div style={headerStyle}>
          <div>
            <h2 style={titleStyle}>Staff y Asistencias</h2>
            <p style={subtitleStyle}>Gestiona empleados, sus roles, matriculas y acceso por QR desde el panel.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={loadStaff} style={ghostButtonStyle}>
              <FiRefreshCw size={14} /> Actualizar
            </button>
            <button onClick={openCreateModal} style={primaryButtonStyle}>
              <FiPlus size={14} /> Nuevo empleado
            </button>
          </div>
        </div>

        {feedbackMessage && <div style={successBoxStyle}>{feedbackMessage}</div>}
        {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

        <section style={cardStyle}>
          <div style={sectionTopStyle}>
            <div>
              <h3 style={sectionTitleStyle}>
                <FiShield size={18} /> Personal registrado
              </h3>
              <p style={sectionDescriptionStyle}>Usuarios del sistema con sus roles, matriculas y QR.</p>
            </div>
          </div>

          {isLoading ? (
            <p style={helperTextStyle}>Cargando personal...</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {staff.map((user) => (
                <div key={user.id} style={rowCardStyle}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
                    <div style={avatarStyle}>
                      {(user.foto_data_url || user.foto_path) ? (
                        <img
                          src={user.foto_data_url || apiAssetUrl(`/${String(user.foto_path).replace(/^\/+/, '')}`)}
                          alt={getStaffName(user)}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <FiUser size={18} color={PALETTE.grayText} />
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: PALETTE.dark }}>{getStaffName(user)}</div>
                      <div style={{ fontSize: '0.8rem', color: PALETTE.grayText }}>
                        @{user.usuario} · {String(user.rol || 'staff').toUpperCase()} · {String(user.estado || 'ACTIVO').toUpperCase()}
                      </div>
                      {user.matricula && (
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--secondary-color)', marginTop: '4px' }}>
                          ID: {user.matricula}
                        </div>
                      )}
                      {user.matricula && enrolledSet.has(user.matricula) && (
                        <div style={enrolledBadgeStyle}>
                          <FiCheckCircle size={12} /> Rostro Registrado
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {user.qr_path && (
                      <button
                        onClick={() => window.open(apiAssetUrl(`/${String(user.qr_path).replace(/^\/+/, '')}`), '_blank')}
                        style={iconButtonStyle}
                        title="Ver Codigo QR"
                      >
                        <FiExternalLink size={14} />
                      </button>
                    )}
                    {user.matricula && (
                      <button
                        onClick={() => enrolledSet.has(user.matricula) ? handleDeleteDescriptor(user) : openEnrollModal(user)}
                        style={{ ...iconButtonStyle, color: enrolledSet.has(user.matricula) ? PALETTE.green : PALETTE.grayText }}
                        title={enrolledSet.has(user.matricula) ? 'Eliminar rostro registrado' : 'Registrar rostro'}
                      >
                        <FiCamera size={14} />
                      </button>
                    )}
                    <button onClick={() => openEditModal(user)} style={iconButtonStyle} title="Editar">
                      <FiEdit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(user)} style={{ ...iconButtonStyle, color: PALETTE.red }} title="Eliminar">
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {!staff.length && <p style={helperTextStyle}>No hay empleados registrados.</p>}
            </div>
          )}
        </section>
      </div>

      {/* Edit / Create staff modal */}
      {modalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h3 style={{ margin: '0 0 14px 0', color: PALETTE.dark }}>
              {formData.id ? 'Editar empleado' : 'Nuevo empleado'}
            </h3>

            <div style={photoLayoutStyle}>
              <div style={photoPreviewStyle}>
                {formData.foto_data_url || formData.foto_path ? (
                  <img src={formData.foto_data_url || apiAssetUrl(`/${String(formData.foto_path).replace(/^\/+/, '')}`)} alt="Staff" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <FiCamera size={18} color={PALETTE.grayText} />
                )}
              </div>
              <label style={secondaryButtonStyle}>
                <FiCamera size={14} /> Subir foto
                <input type="file" accept="image/*" onChange={handlePhotoSelected} hidden />
              </label>
            </div>

            <div style={formGridStyle}>
              <Field label="Nombre">
                <input type="text" value={formData.nombre} onChange={(e) => handleChange('nombre', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Apellido paterno">
                <input type="text" value={formData.apellido_paterno} onChange={(e) => handleChange('apellido_paterno', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Apellido materno">
                <input type="text" value={formData.apellido_materno} onChange={(e) => handleChange('apellido_materno', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Usuario">
                <input type="text" value={formData.usuario} onChange={(e) => handleChange('usuario', e.target.value)} style={inputStyle} />
              </Field>
              <Field label={formData.id ? 'Nueva password' : 'Password'}>
                <input type="password" value={formData.password} onChange={(e) => handleChange('password', e.target.value)} style={inputStyle} placeholder={formData.id ? 'Dejar vacia para conservarla' : ''} />
              </Field>
              <Field label="Rol">
                <select value={formData.rol} onChange={(e) => handleChange('rol', e.target.value)} style={inputStyle}>
                  {ROLE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </Field>
              <Field label="Telefono">
                <input
                  type="tel"
                  value={formData.telefono}
                  onChange={(e) => handleChange('telefono', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  style={inputStyle}
                  maxLength={10}
                  placeholder="10 dígitos"
                />
              </Field>
              <Field label="Correo">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="text"
                    value={emailParts.user}
                    onChange={(e) => setEmailParts((p) => ({ ...p, user: e.target.value.replace(/\s/g, '') }))}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    placeholder="usuario"
                  />
                  <span style={{ color: '#6b7280', fontWeight: 700, flexShrink: 0, userSelect: 'none' }}>@</span>
                  <select
                    value={emailParts.domain}
                    onChange={(e) => setEmailParts((p) => ({ ...p, domain: e.target.value, custom: '' }))}
                    style={{ ...inputStyle, flex: '0 0 auto', maxWidth: '150px' }}
                  >
                    {EMAIL_DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
                    <option value="otro">Otro...</option>
                  </select>
                </div>
                {emailParts.domain === 'otro' && (
                  <input
                    type="text"
                    value={emailParts.custom}
                    onChange={(e) => setEmailParts((p) => ({ ...p, custom: e.target.value.replace(/\s/g, '') }))}
                    style={{ ...inputStyle, marginTop: '4px' }}
                    placeholder="dominio.com"
                  />
                )}
              </Field>
              <Field label="Estado">
                <select value={formData.estado} onChange={(e) => handleChange('estado', e.target.value)} style={inputStyle}>
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </Field>
            </div>

            <div style={modalActionsStyle}>
              <button onClick={() => setModalOpen(false)} style={ghostButtonStyle}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={primaryButtonStyle}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Face enrollment modal */}
      {enrollModal.isOpen && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalCardStyle, maxWidth: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: PALETTE.dark, fontSize: '1rem' }}>
                {enrollModal.step === 'done'
                  ? 'Rostro Registrado'
                  : `Registrar Rostro — ${getStaffName(enrollModal.user)}`}
              </h3>
              <button onClick={closeEnrollModal} style={{ ...iconButtonStyle, border: 'none' }}>
                <FiX size={16} />
              </button>
            </div>

            {enrollModal.step !== 'done' ? (
              <>
                {/* Indicador de progreso */}
                <div style={stepDotsRowStyle}>
                  {CAPTURE_STEPS.map((s, i) => {
                    const currentIdx = CAPTURE_STEPS.findIndex((x) => x.key === enrollModal.captureStep);
                    return (
                      <div key={s.key} style={{
                        ...dotBaseStyle,
                        backgroundColor: i < currentIdx ? PALETTE.green : i === currentIdx ? 'var(--secondary-color)' : PALETTE.grayBorder,
                      }} />
                    );
                  })}
                </div>
                <p style={stepLabelStyle}>
                  {CAPTURE_STEPS.find((s) => s.key === enrollModal.captureStep)?.label ?? ''}
                </p>

                <div style={videoContainerStyle}>
                  <video ref={videoRef} autoPlay playsInline muted style={videoStyle} />
                  {enrollModal.step === 'processing' && (
                    <div style={videoOverlayStyle}>Analizando...</div>
                  )}
                </div>

                {enrollModal.message && (
                  <p style={{ color: PALETTE.red, fontSize: '0.82rem', margin: '8px 0 0', textAlign: 'center' }}>
                    {enrollModal.message}
                  </p>
                )}
                <div style={modalActionsStyle}>
                  <button onClick={closeEnrollModal} style={ghostButtonStyle}>Cancelar</button>
                  <button
                    onClick={handleEnrollCapture}
                    disabled={enrollModal.step === 'processing'}
                    style={primaryButtonStyle}
                  >
                    <FiCamera size={14} />
                    {enrollModal.step === 'processing'
                      ? 'Analizando...'
                      : enrollModal.captureStep === 'right'
                        ? 'Capturar y Finalizar'
                        : 'Capturar y Continuar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <FiCheckCircle size={52} color={PALETTE.green} />
                  <p style={{ color: PALETTE.green, fontWeight: 700, marginTop: '14px', fontSize: '0.95rem' }}>
                    {enrollModal.message}
                  </p>
                </div>
                <div style={modalActionsStyle}>
                  <button onClick={closeEnrollModal} style={primaryButtonStyle}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

function getStaffName(user = {}) {
  return [user.nombre, user.apellido_paterno, user.apellido_materno].filter(Boolean).join(' ').trim() || user.usuario || 'Staff';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl, maxW, maxH, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        // Clamp a mínimo 1px para evitar canvas de tamaño 0 en imágenes degeneradas
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        // getContext devuelve null en iOS cuando el dispositivo supera el límite de
        // canvas simultáneos (~16 MB total en iPads con poca RAM)
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error(
            `getContext("2d") devolvió null — ` +
            `límite de canvas iOS alcanzado (${w}×${h}px, ${Math.round(w * h * 4 / 1024)} KB)`
          );
        }
        ctx.drawImage(img, 0, 0, w, h);
        const result = canvas.toDataURL('image/jpeg', quality);
        // Safari devuelve 'data:,' (6 chars) cuando se queda sin memoria de GPU
        if (!result || result.length < 50) {
          throw new Error(
            `toDataURL devolvió vacío (${result?.length ?? 0} chars) — ` +
            `memoria de GPU insuficiente en este dispositivo`
          );
        }
        resolve(result);
      } catch (canvasErr) {
        reject(canvasErr);
      }
    };
    img.onerror = (evt) => {
      reject(new Error(
        `Image.onload falló al decodificar la imagen: ` +
        `${evt?.message || evt?.type || 'evento desconocido'}`
      ));
    };
    img.src = dataUrl;
  });
}

// ESTILOS
const pageStyle = { padding: '30px', backgroundColor: PALETTE.grayBg, minHeight: '100vh', boxSizing: 'border-box' };
const wrapperStyle = { maxWidth: '1080px', margin: '0 auto' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' };
const titleStyle = { margin: '0 0 8px 0', fontSize: '1.6rem', color: PALETTE.dark };
const subtitleStyle = { margin: 0, color: PALETTE.grayText, fontSize: '0.94rem' };
const cardStyle = { backgroundColor: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)', border: `1px solid ${PALETTE.grayBorder}`, marginBottom: '22px' };
const sectionTopStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' };
const sectionTitleStyle = { display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 6px 0', color: PALETTE.dark, fontSize: '1.02rem' };
const sectionDescriptionStyle = { margin: 0, color: PALETTE.grayText, fontSize: '0.85rem' };
const rowCardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '10px', border: `1px solid ${PALETTE.grayBorder}`, backgroundColor: '#fcfcfd' };
const avatarStyle = { width: '52px', height: '52px', borderRadius: '12px', backgroundColor: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 };
const helperTextStyle = { color: PALETTE.grayText, fontSize: '0.86rem', margin: 0 };
const successBoxStyle = { padding: '12px 14px', borderRadius: '10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', marginBottom: '16px', fontSize: '0.86rem' };
const errorBoxStyle = { padding: '12px 14px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: PALETTE.red, marginBottom: '16px', fontSize: '0.86rem' };
const primaryButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px 13px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--secondary-color)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem' };
const secondaryButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px 13px', borderRadius: '8px', border: '1px solid var(--secondary-color)', backgroundColor: '#fff', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 600, fontSize: '0.84rem' };
const ghostButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px 13px', borderRadius: '8px', border: `1px solid ${PALETTE.grayBorder}`, backgroundColor: '#fff', color: PALETTE.dark, cursor: 'pointer', fontWeight: 600, fontSize: '0.84rem' };
const iconButtonStyle = { width: '34px', height: '34px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: `1px solid ${PALETTE.grayBorder}`, backgroundColor: '#fff', color: 'var(--secondary-color)', cursor: 'pointer' };
const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 1000 };
const modalCardStyle = { width: '100%', maxWidth: '720px', backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${PALETTE.grayBorder}`, boxShadow: '0 18px 36px rgba(15, 23, 42, 0.16)', padding: '20px' };
const photoLayoutStyle = { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' };
const photoPreviewStyle = { width: '82px', height: '82px', borderRadius: '14px', border: `1px solid ${PALETTE.grayBorder}`, backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 };
const formGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' };
const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '0.76rem', fontWeight: 700, color: '#344054' };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${PALETTE.grayBorder}`, backgroundColor: '#fff', boxSizing: 'border-box', fontSize: '0.86rem', outline: 'none' };
const modalActionsStyle = { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' };
const enrolledBadgeStyle = { display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '0.72rem', fontWeight: 700, color: PALETTE.green, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '2px 7px' };
const videoContainerStyle = { position: 'relative', width: '100%', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#000', aspectRatio: '4/3' };
const videoStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
const videoOverlayStyle = { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1rem' };
const stepDotsRowStyle = { display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '10px' };
const dotBaseStyle = { width: '11px', height: '11px', borderRadius: '50%', transition: 'background-color 0.25s' };
const stepLabelStyle = { textAlign: 'center', fontWeight: 700, color: PALETTE.dark, fontSize: '0.86rem', margin: '0 0 12px' };
