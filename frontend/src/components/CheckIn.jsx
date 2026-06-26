import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { MdFlipCameraIos } from 'react-icons/md';
import { fetchApi, resolveAssetUrl } from '../config/api';
import { db, getFighterDisplayName, normalizeFighterRecord } from '../db/db';
import { formatDateLocal, formatDateTimeLocal } from '../utils/date';
import * as faceapi from 'face-api.js';
import { initFaceApi, verifyFace, areModelsReady, identifyFace } from '../services/faceService';

const formatDateLabel = (value) => formatDateLocal(value);
const formatDateTimeLabel = (value) => formatDateTimeLocal(value);

const buildStatusDetail = (payload = {}, fallbackMessage = '') => {
  if (payload.next_allowed_at) return `Vuelve a intentar despues de ${formatDateTimeLabel(payload.next_allowed_at)}.`;
  if (payload.expiration) return `Vigencia hasta ${formatDateLabel(payload.expiration)}.`;
  return fallbackMessage;
};

const createBaseStatus = () => ({
  bg: '#ffffff',
  border: '#e2e8f0',
  msg: 'ESPERANDO',
  detail: 'Escanea un codigo QR o captura la matricula manualmente.',
  type: 'idle',
  subject: null,
  role: '',
});

const normalizeCheckinType = (rawType) => {
  const normalized = String(rawType || '').trim().toLowerCase();
  if (normalized === 'staff') return 'staff';
  if (normalized === 'alumno' || normalized === 'peleador') return 'alumno';
  return '';
};

// Opciones del detector — objeto único por módulo, sin re-allocar en cada tick.
// inputSize 160 vs 224: la red procesa el 51 % menos de píxeles por inferencia.
const DETECT_OPTS = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 });

export function CheckIn({ currentUser = null }) {
  const [matricula, setMatricula] = useState('');
  const [prefix, setPrefix] = useState('CT');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(createBaseStatus);
  const [cameraFacing, setCameraFacing] = useState('user');
  const [faceState, setFaceState] = useState(null);
  // faceState: null | { step: 'capturing'|'verifying'|'failed', matricula, metodo, message }
  const [faceReady, setFaceReady] = useState(areModelsReady());
  const [faceProgress, setFaceProgress] = useState(0); // 0-3 frames detectados consecutivamente
  const [isFaceScanActive, setIsFaceScanActive] = useState(false);
  const [display, setDisplay] = useState({ photo: null, name: null, id: null, msg: null });

  const scannerRef = useRef(null);
  const handleCheckInRef = useRef(async () => {});
  const handleFaceCaptureRef = useRef(async () => {});
  const faceBufferRef = useRef([]);
  const facePollRef = useRef(null);
  const isFaceTriggeringRef = useRef(false);
  const beepRef = useRef(new Audio('/beep-success.mp3'));

  const isMountedRef = useRef(false);
  const isStartingRef = useRef(false);
  const scanLockRef = useRef(false);
  const canvasRef = useRef(null);
  const clearDisplayRef = useRef(null);
  const doCheckinRef = useRef(null);

  // Ref para leer faceState dentro de setInterval sin closures obsoletas
  const faceStateRef = useRef(null);
  faceStateRef.current = faceState;

  // Mirror de prefix para leer sin closure obsoleto dentro del setInterval
  const prefixRef = useRef('CT');
  prefixRef.current = prefix;

  // Cachea las dimensiones del video — evita llamar matchDimensions en cada tick
  const lastDisplaySizeRef = useRef(null);
  // Mirror de isFaceScanActive para acceso sincrónico en setInterval
  const isFaceScanActiveRef = useRef(false);
  isFaceScanActiveRef.current = isFaceScanActive;

  const actualizarPeleadorLocal = async (fighterPayload = {}) => {
    const fighter = normalizeFighterRecord(fighterPayload || {});
    if (fighter.matricula) {
      const fighterExistente = await db.fighters.where('matricula').equals(fighter.matricula).first();
      const registro = {
        ...(fighterExistente || {}),
        ...fighter,
        name: getFighterDisplayName(fighter),
        fotoPerfil: fighter.foto_path,
        synced: 1,
      };
      if (fighterExistente?.id) {
        await db.fighters.update(fighterExistente.id, registro);
      } else {
        await db.fighters.put(registro);
      }
    }
    return fighter;
  };

  const actualizarAsistenciaLocal = async (payload = {}) => {
    const attendance = payload.attendance;
    const fighter = await actualizarPeleadorLocal(payload.fighter || {});
    if (!attendance?.id) return fighter;

    const existente = await db.attendance.where('id').equals(attendance.id).first();
    const registro = {
      id: attendance.id,
      peleador_matricula: attendance.peleador_matricula,
      matricula: attendance.peleador_matricula,
      fecha: `${attendance.fecha}T${attendance.hora_entrada || '00:00:00'}`,
      date: `${attendance.fecha}T${attendance.hora_entrada || '00:00:00'}`,
      hora_entrada: attendance.hora_entrada,
      hora_salida: attendance.hora_salida,
      medio_registro: attendance.medio_registro,
      method: attendance.medio_registro,
      synced: 1,
    };

    if (existente?.id) {
      await db.attendance.update(existente.id, registro);
      return fighter;
    }

    await db.attendance.put(registro);
    return fighter;
  };

  const captureFrame = () => {
    const video = document.querySelector('#reader video');
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const applyDisplay = (sub, hora) => {
    const h = parseInt(hora.slice(0, 2), 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hh = String(h % 12 || 12).padStart(2, '0');
    setDisplay({
      photo: sub?.foto_data_url || (sub?.foto_path ? resolveAssetUrl(sub.foto_path) : null),
      name: sub ? getFighterDisplayName(sub) : null,
      id: sub?.matricula ? `ID: ${sub.matricula}` : null,
      msg: `Entrada: ${hh}:${hora.slice(3, 5)} ${ampm}`,
    });
    if (clearDisplayRef.current) clearTimeout(clearDisplayRef.current);
    clearDisplayRef.current = setTimeout(() => {
      setDisplay({ photo: null, name: null, id: null, msg: null });
    }, 5000);
  };

  const doCheckin = async (id, metodoRegistro) => {
    setIsLoading(true);

    const ahora = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fecha_local = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
    const hora_local = `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
    const isStaff = id.startsWith('ST-');

    // ── 1. GUARDADO LOCAL INMEDIATO ────────────────────────────────────────────
    // Escribe en IndexedDB con synced:0 antes de cualquier petición HTTP.
    // Si no hay red, el check-in ya está seguro y se sincronizará en background.
    let localId = null;
    try {
      localId = await db.attendance.add({
        peleador_matricula: id,
        matricula: id,
        fecha: `${fecha_local}T${hora_local}`,
        date: `${fecha_local}T${hora_local}`,
        hora_entrada: hora_local,
        medio_registro: metodoRegistro,
        method: metodoRegistro,
        synced: 0,
      });
    } catch (e) {
      console.warn('[CheckIn] db.attendance.add falló:', e);
    }

    // Subject local: muestra foto/nombre incluso sin respuesta del servidor.
    let subject = null;
    try {
      if (isStaff) {
        // db.staff no tiene índice en 'matricula' → usamos filter() (full scan, tabla pequeña)
        const rec = await db.staff.filter((r) => r.matricula === id).first();
        if (rec) subject = {
          nombre: rec.nombre || '', apellido_paterno: rec.apellido_paterno || '',
          apellido_materno: rec.apellido_materno || '', matricula: rec.matricula || '',
          foto_path: rec.foto_path || '', foto_data_url: rec.foto_data_url || '',
          usuario: rec.usuario || '',
        };
      } else {
        const rec = await db.fighters.where('matricula').equals(id).first();
        if (rec) subject = rec;
      }
    } catch (e) {}

    // ── 2. INTENTO DE SINCRONIZACIÓN CON EL SERVIDOR ──────────────────────────
    try {
      const response = await fetchApi('/api/asistencias/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peleador_matricula: id, medio_registro: metodoRegistro, fecha_local, hora_local }),
      });

      const result = await response.json().catch(() => ({}));

      // ── 2a. Error HTTP (409 cooldown, 403 membresía, etc.) ──────────────────
      // El servidor está activo pero rechazó la petición.
      // Borramos el registro local para no envenenar la cola de sync.
      if (!response.ok) {
        if (localId != null) {
          try { await db.attendance.delete(localId); } catch (e) {}
        }
        const fighter = normalizeFighterRecord(result?.data?.fighter || result?.fighter || {});
        if (fighter.matricula) await actualizarPeleadorLocal(fighter).catch(() => {});

        setStatus({
          ...createBaseStatus(),
          bg: response.status === 409 ? '#fffbeb' : '#fff5f5',
          border: response.status === 409 ? '#f59e0b' : '#e74c3c',
          msg: result.message || 'Acceso denegado',
          subject: fighter.matricula ? fighter : null,
          detail: buildStatusDetail(result, response.status === 409
            ? 'El peleador ya registro acceso recientemente.'
            : 'Consulta en recepcion para revisar el estatus de la membresia.'),
        });
        setMatricula('');
        setIsLoading(false);
        return;
      }

      // ── 2b. Éxito del servidor ────────────────────────────────────────────────
      const payload = result.data || {};

      if (isStaff) {
        const staffPayload = payload.staff || result.staff || {};
        subject = {
          nombre: result.nombre || payload.nombre || staffPayload.nombre || subject?.nombre || '',
          apellido_paterno: staffPayload.apellido_paterno || subject?.apellido_paterno || '',
          apellido_materno: staffPayload.apellido_materno || subject?.apellido_materno || '',
          matricula: staffPayload.matricula || id,
          foto_path: staffPayload.foto_path || subject?.foto_path || '',
          usuario: staffPayload.usuario || subject?.usuario || '',
        };
        // Marcar el registro local como sincronizado con el servidor
        if (localId != null) {
          try { await db.attendance.update(localId, { synced: 1 }); } catch (e) {}
        }
      } else {
        // actualizarAsistenciaLocal guarda la versión del servidor (con su propio id).
        // Borramos la nuestra para no dejar un duplicado synced:0 en la cola.
        const fighterActualizado = await actualizarAsistenciaLocal(payload);
        if (localId != null) {
          try { await db.attendance.delete(localId); } catch (e) {}
        }
        const fighter = normalizeFighterRecord(result?.data?.fighter || result?.fighter || {});
        subject = fighterActualizado?.matricula ? fighterActualizado : (fighter.matricula ? fighter : subject);
      }

      beepRef.current.currentTime = 0;
      beepRef.current.play().catch(() => {});

      setStatus({
        ...createBaseStatus(),
        bg: isStaff ? '#ffffff' : '#eef4ff',
        border: isStaff ? '#e2e8f0' : 'var(--primary-color)',
        msg: isStaff ? 'ENTRADA DE STAFF REGISTRADA' : (result.message || 'Acceso autorizado'),
        type: isStaff ? 'staff' : 'alumno',
        role: isStaff ? (result.rol || payload.rol || payload.staff?.rol || '') : '',
        subject,
        detail: isStaff
          ? (result.message || 'Acceso de staff registrado correctamente.')
          : (payload.session_until
            ? `Sesion activa hasta ${formatDateTimeLabel(payload.session_until)}.`
            : 'Check-in registrado correctamente.'),
      });

      applyDisplay(subject, hora_local);
      setMatricula('');
      setIsLoading(false);

    } catch (networkError) {
      // ── 3. SIN RED — el registro local ya está seguro ─────────────────────────
      // No mostramos error. El check-in fue exitoso: IndexedDB tiene el registro.
      console.warn('[CheckIn] Sin conexión — asistencia en IndexedDB (synced:0):', networkError?.message);

      beepRef.current.currentTime = 0;
      beepRef.current.play().catch(() => {});

      setStatus({
        ...createBaseStatus(),
        bg: isStaff ? '#ffffff' : '#eef4ff',
        border: isStaff ? '#e2e8f0' : 'var(--primary-color)',
        msg: isStaff ? 'ENTRADA DE STAFF REGISTRADA' : 'ACCESO AUTORIZADO',
        type: isStaff ? 'staff' : 'alumno',
        subject,
        detail: 'Sin conexión al servidor. Asistencia guardada localmente — se sincronizará automáticamente.',
      });

      applyDisplay(subject, hora_local);
      setMatricula('');
      setIsLoading(false);
    }
  };

  const handleCheckIn = async (scannedText) => {
    const rawInput = (scannedText || matricula || '').trim().toUpperCase();
    const hasPrefix = /^(CT|ST)-/.test(rawInput);
    const id = hasPrefix ? rawInput : (rawInput ? `${prefix}-${rawInput}` : '');
    const metodoRegistro = scannedText ? 'QR' : 'MANUAL';

    if (!id || isLoading) return;

    if (id.startsWith('ST-')) {
      setFaceState({ step: 'capturing', matricula: id, metodo: metodoRegistro, message: '' });
      setMatricula('');
      return;
    }

    await doCheckin(id, metodoRegistro);
  };

  const handleFaceCapture = async () => {
    if (!faceState || faceState.step !== 'capturing') return;
    const { matricula: faceMatricula, metodo } = faceState;

    const video = document.querySelector('#reader video');
    if (!video || !video.videoWidth) {
      setFaceState((s) => ({ ...s, step: 'failed', message: 'Cámara no disponible. Intenta de nuevo.' }));
      return;
    }

    setFaceState((s) => ({ ...s, step: 'verifying' }));

    try {
      // Verificación 100% local: face-api.js procesa el frame del video en el navegador.
      // No hay ninguna llamada de red.
      const result = await verifyFace(video, faceMatricula);

      if (result.reason === 'NO_FACE_DETECTED') {
        setFaceState((s) => ({
          ...s,
          step: 'failed',
          message: 'No se detectó ningún rostro. Centra tu cara frente a la cámara e intenta de nuevo.',
        }));
        return;
      }

      if (result.reason === 'NOT_ENROLLED') {
        // Fail-open: empleado sin rostro registrado → permite el check-in igual.
        setFaceState(null);
        await doCheckin(faceMatricula, metodo);
        return;
      }

      if (!result.verified) {
        const dist = result.distance != null ? ` (dist: ${result.distance})` : '';
        setFaceState((s) => ({
          ...s,
          step: 'failed',
          message: `Identidad no confirmada${dist}. Intenta de nuevo o llama a recepción.`,
        }));
        return;
      }

      // MATCH — verificado localmente, sin red.
      setFaceState(null);
      await doCheckin(faceMatricula, metodo);
    } catch (err) {
      console.error('[CheckIn] Error en verificación facial:', err);
      // Error inesperado → fail-open para no bloquear el acceso.
      setFaceState(null);
      await doCheckin(faceMatricula, metodo);
    }
  };

  useEffect(() => {
    handleCheckInRef.current = handleCheckIn;
  });

  useEffect(() => {
    handleFaceCaptureRef.current = handleFaceCapture;
  });

  useEffect(() => {
    doCheckinRef.current = doCheckin;
  });

const startCamera = async (facing) => {
    const qr = scannerRef.current;
    if (!qr || isStartingRef.current) return;
    if (qr.getState && qr.getState() === 2) return; // 2 = STARTING

    isStartingRef.current = true;

    // onScan definido UNA vez — se reutiliza en el intento primario y en el fallback por deviceId.
    const onScan = (text) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      handleCheckInRef.current(text);
      setTimeout(() => { scanLockRef.current = false; }, 1200);
    };

    const config = {
      fps: 15,
      qrbox: (w, h) => { const e = Math.min(w, h); return { width: e * 0.8, height: e * 0.8 }; },
      disableFlip: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    };

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('CAMERA_NOT_SUPPORTED');

      if (qr.getState && qr.getState() === 3) {
        try { await qr.stop(); await new Promise(r => setTimeout(r, 100)); } catch (_) {}
      }

      await new Promise(r => setTimeout(r, 150));

      try {
        // Intento 1: facingMode constraint (falla en iOS con cámaras múltiples o permisos estrictos).
        await qr.start({ facingMode: facing }, config, onScan, () => {});
      } catch (primaryErr) {
        console.warn('[CheckIn] facingMode falló — limpiando y usando deviceId...', primaryErr);

        // iOS deja el scanner en estado corrupto (SCANNING con pantalla negra) tras un fallo.
        // Parar todas las tracks ANTES del fallback para que getUserMedia pueda reusar el hardware.
        document.querySelectorAll('video').forEach((v) => {
          if (v.srcObject) {
            v.srcObject.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
            v.srcObject = null;
          }
        });
        if (qr.getState && (qr.getState() === 2 || qr.getState() === 3)) {
          try { await Promise.race([qr.stop(), new Promise(r => setTimeout(r, 800))]); } catch (_) {}
        }
        await new Promise(r => setTimeout(r, 300));

        // Intento 2: deviceId explícito — más confiable en iOS y Android con cámaras múltiples.
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        if (!cameras.length) throw new Error('NO_CAMERAS');

        const cam = cameras.find(d =>
          facing === 'environment'
            ? /back|rear|trasera|environment/i.test(d.label)
            : /front|frontal|selfie|user/i.test(d.label)
        ) || (facing === 'environment' ? cameras[cameras.length - 1] : cameras[0]);

        await qr.start(cam.deviceId, config, onScan, () => {});
      }
    } catch (err) {
      console.error('[CheckIn] Fallo total de cámara:', err);
      if (isMountedRef.current) {
        setStatus({
          ...createBaseStatus(),
          bg: '#fff5f5',
          border: '#e74c3c',
          msg: 'CAMARA NO DISPONIBLE',
          detail: 'Asegúrate de haber dado permisos a la cámara o recarga la página.',
        });
      }
      // Reset total del scanner para que el siguiente intento parta de cero.
      try {
        qr.clear();
        await new Promise(r => setTimeout(r, 200));
        if (isMountedRef.current) scannerRef.current = new Html5Qrcode('reader');
      } catch (_) {}
    }

    isStartingRef.current = false;
  };

  // Detiene el scanner Y libera el hardware de cámara explícitamente.
  // Versión agresiva: maneja estado STARTING (2) y SCANNING (3), timeout anti-hang de iOS,
  // y para tracks en TODOS los elementos <video> del DOM para no dejar streams huérfanos.
  const stopCamera = async () => {
    const qr = scannerRef.current;
    if (qr) {
      const state = qr.getState ? qr.getState() : -1;
      if (state === 2 || state === 3) {
        try {
          // Timeout de 1 500 ms: en iOS qr.stop() puede colgar si el hardware no responde.
          await Promise.race([
            qr.stop(),
            new Promise((res) => setTimeout(res, 1500)),
          ]);
        } catch (_) {
          // Si stop() explota, limpiar el DOM manualmente.
          try { qr.clear(); } catch (_2) {}
        }
      }
    }
    // Forzar liberación en TODOS los <video> activos — iOS a veces crea elementos extra.
    document.querySelectorAll('video').forEach((v) => {
      if (v.srcObject) {
        v.srcObject.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
        v.srcObject = null;
      }
    });
  };

  const handleFlipCamera = async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true; // bloqueo inmediato — sin esto, 2do press durante stopCamera pasa la guardia
    const next = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(next);
    try {
      await stopCamera();
      // 500 ms: iOS necesita más tiempo que Android para liberar el sensor de hardware.
      await new Promise((res) => setTimeout(res, 500));
      isStartingRef.current = false; // liberar antes de startCamera (que pone su propio bloqueo)
      await startCamera(next);
    } catch (_) {
      // Garantizar que el bloqueo siempre se libere aunque stopCamera o startCamera fallen.
      isStartingRef.current = false;
    }
  };

  // Carga los modelos de face-api.js en segundo plano al montar el componente.
  // En modo offline estarán en caché del SW; la primera carga descarga ~6 MB.
  useEffect(() => {
    if (!areModelsReady()) {
      initFaceApi()
        .then(() => setFaceReady(true))
        .catch((err) => console.warn('[CheckIn] Modelos faciales no disponibles:', err));
    }
  }, []);

  // ── LOOP MAESTRO FACIAL ──────────────────────────────────────────────────────
  // Tick: 700 ms. Cada tick:
  //   1. detectSingleFace (sin landmarks) → dibuja caja en canvas — rápido
  //   2. Modo A: faceState 'capturing' → buffer 3 frames → verifyFace (QR flow)
  //   3. Modo B: faceState null + pestaña ST → identifyFace (auto-checkin)
  // verifyFace/identifyFace usan el modelo pesado SSD+landmarks pero solo se llaman
  // al completar el buffer de 3 frames — nunca en cada tick.
  useEffect(() => {
    if (!faceReady) return;

    facePollRef.current = setInterval(async () => {
      const video = document.querySelector('#reader video');
      if (!video || !video.videoWidth) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Salida temprana en pestaña CT sin faceState: cero inferencias, canvas limpio.
      const currentFaceState = faceStateRef.current;
      if (prefixRef.current !== 'ST' && !currentFaceState) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        if (faceBufferRef.current.length > 0) { faceBufferRef.current = []; setFaceProgress(0); }
        return;
      }

      // TAREA 4: escaneo IA desactivado → canvas limpio, cero inferencias.
      if (!isFaceScanActiveRef.current && !currentFaceState) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        if (faceBufferRef.current.length > 0) { faceBufferRef.current = []; setFaceProgress(0); }
        return;
      }

      try {
        // ── Paso 1: Detección ligera + canvas ──────────────────────────────────
        // matchDimensions solo cuando el video cambia de tamaño (escritura DOM cara)
        const w = video.videoWidth, h = video.videoHeight;
        const cached = lastDisplaySizeRef.current;
        if (!cached || cached.width !== w || cached.height !== h) {
          const newSize = { width: w, height: h };
          faceapi.matchDimensions(canvas, newSize);
          lastDisplaySizeRef.current = newSize;
        }
        const displaySize = lastDisplaySizeRef.current;

        // detectSingleFace devuelve FaceDetection | undefined — sin landmarks, mucho más rápido
        const detection = await faceapi.detectSingleFace(video, DETECT_OPTS);

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (detection) {
          faceapi.draw.drawDetections(canvas, faceapi.resizeResults(detection, displaySize));
        }

        // ── Paso 2 / 3: Lógica de identificación ─────────────────────────────
        if (isFaceTriggeringRef.current) return;

        const faceOk = !!detection && detection.score > 0.72;

        if (currentFaceState?.step === 'capturing') {
          // Modo A: verifica contra matrícula conocida (QR escaneado)
          if (faceOk) {
            faceBufferRef.current.push(detection.score);
            setFaceProgress(Math.min(faceBufferRef.current.length, 3));
            if (faceBufferRef.current.length >= 3) {
              isFaceTriggeringRef.current = true;
              faceBufferRef.current = [];
              setFaceProgress(0);
              await handleFaceCaptureRef.current();
              isFaceTriggeringRef.current = false;
            }
          } else {
            if (faceBufferRef.current.length > 0) { faceBufferRef.current = []; setFaceProgress(0); }
          }
          return;
        }

        if (currentFaceState !== null) return; // 'verifying' o 'failed' → esperar

        // Modo B: auto-identificación anónima — solo en pestaña ST
        if (faceOk) {
          faceBufferRef.current.push(detection.score);
          setFaceProgress(Math.min(faceBufferRef.current.length, 3));

          if (faceBufferRef.current.length >= 3) {
            isFaceTriggeringRef.current = true;
            faceBufferRef.current = [];
            setFaceProgress(0);

            const { matricula: matched } = await identifyFace(video);

            if (matched) {
              setPrefix('ST');
              setMatricula(matched.replace(/^ST-/, ''));
              await doCheckinRef.current(matched, 'RECONOCIMIENTO_FACIAL');
              // Auto-off: apagar escaneo tras match exitoso (TAREA 4)
              setIsFaceScanActive(false);
              isFaceScanActiveRef.current = false;
            }

            await new Promise((res) => setTimeout(res, 5000));
            if (matched) { setStatus(createBaseStatus()); setMatricula(''); }
            isFaceTriggeringRef.current = false;
          }
        } else {
          if (faceBufferRef.current.length > 0) { faceBufferRef.current = []; setFaceProgress(0); }
        }
      } catch (_) {}
    }, 700);

    return () => {
      clearInterval(facePollRef.current);
      facePollRef.current = null;
      faceBufferRef.current = [];
      isFaceTriggeringRef.current = false;
      lastDisplaySizeRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [faceReady]);

  useEffect(() => {
    isMountedRef.current = true;

    const initTimer = setTimeout(() => {
      if (isMountedRef.current) {
        scannerRef.current = new Html5Qrcode('reader');
        startCamera('user');
      }
    }, 100);

    return () => {
      isMountedRef.current = false;
      clearTimeout(initTimer);
      clearTimeout(clearDisplayRef.current);

      const qr = scannerRef.current;
      if (qr) {
        try {
          if (qr.getState && qr.getState() === 2) {
            qr.stop().catch(() => {}).finally(() => qr.clear());
          } else {
            qr.clear();
          }
        } catch (e) {}
        scannerRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch', width: '850px' }}>

        {/* ── TAREA 1: Operador actual ──────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', paddingRight: '2px' }}>
          <span style={{ fontSize: '0.69rem', color: '#94a3b8', letterSpacing: '0.4px' }}>Operador:</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: currentUser ? '#64748b' : '#cbd5e1', letterSpacing: '0.3px' }}>
            {currentUser ? (currentUser.nombre || currentUser.usuario || 'Staff') : 'Sin sesión'}
          </span>
          {currentUser?.rol && (
            <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#fff', backgroundColor: 'var(--secondary-color)', borderRadius: '4px', padding: '1px 6px', letterSpacing: '0.5px' }}>
              {String(currentUser.rol).toUpperCase()}
            </span>
          )}
        </div>

        <div
          style={{
            backgroundColor: status.bg,
            borderRadius: '12px',
            padding: '40px',
            borderStyle: 'solid',
            borderWidth: '1px',
            borderColor: status.border,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '50px',
            transition: '0.3s ease'
          }}
        >
        <div style={{ textAlign: 'center' }}>
          {/* ── TAREA 2: Video + Canvas superpuesto ───────────────────────────── */}
          <div style={{ position: 'relative', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #000', backgroundColor: '#111' }}>
            <div id="reader" style={{ width: '100%' }} />
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}
            />
            <button
              onClick={handleFlipCamera}
              title={cameraFacing === 'environment' ? 'Cambiar a cámara frontal' : 'Cambiar a cámara trasera'}
              style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', backdropFilter: 'blur(4px)', zIndex: 10 }}
            >
              <MdFlipCameraIos size={22} />
            </button>
            {/* ── TAREA 4: Botón de escaneo IA — visible solo en pestaña ST ─── */}
            {prefix === 'ST' && faceReady && !faceState && (
              <button
                onClick={() => setIsFaceScanActive((v) => !v)}
                style={{
                  position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 16px',
                  backgroundColor: isFaceScanActive ? 'rgba(239,68,68,0.82)' : 'rgba(249,115,22,0.82)',
                  color: '#fff', border: 'none', borderRadius: '999px',
                  fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.4px',
                  cursor: 'pointer', backdropFilter: 'blur(6px)', zIndex: 10,
                  transition: 'background-color 0.2s ease',
                }}
              >
                {isFaceScanActive ? '⏹ Detener escaneo' : '◉ Escanear Rostro'}
              </button>
            )}
          </div>

          {/* Dots de progreso — solo visibles mientras el escaneo IA está activo */}
          {!faceState && faceReady && isFaceScanActive && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px', minHeight: '18px' }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: i < faceProgress ? '#22c55e' : '#e2e8f0',
                    transition: 'background-color 0.18s ease',
                    boxShadow: i < faceProgress ? '0 0 5px #22c55e99' : 'none',
                  }}
                />
              ))}
              {faceProgress > 0 && (
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '0.3px' }}>
                  {faceProgress >= 2 ? 'Identificando...' : 'Rostro detectado'}
                </span>
              )}
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', justifyContent: 'center' }}>
              {['CT', 'ST'].map((p) => (
                <button
                  key={p}
                  onClick={() => { setPrefix(p); if (p !== 'ST') setIsFaceScanActive(false); }}
                  style={{
                    padding: '4px 18px',
                    borderRadius: '999px',
                    border: `2px solid ${prefix === p ? 'var(--primary-color)' : '#e2e8f0'}`,
                    backgroundColor: prefix === p ? 'var(--primary-color)' : '#fff',
                    color: prefix === p ? '#fff' : '#9ca3af',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    letterSpacing: '0.5px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p}
                </button>
              ))}
              <span style={{ fontSize: '0.73rem', color: '#9ca3af', alignSelf: 'center', marginLeft: '2px' }}>prefijo</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', border: `1px solid ${status.border}`, borderRadius: '6px', overflow: 'hidden', flex: 1, backgroundColor: '#fff' }}>
                <span style={{ padding: '10px 10px 10px 14px', fontWeight: 800, fontSize: '1.05rem', color: 'var(--primary-color)', letterSpacing: '1px', borderRight: '1px solid #e2e8f0', backgroundColor: '#f8fafc', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                  {prefix}-
                </span>
                <input
                  type="text"
                  style={{ padding: '10px 15px', width: '100%', border: 'none', outline: 'none', fontSize: '1.05rem', fontWeight: 700, color: '#2d2e30', letterSpacing: '1px', textTransform: 'uppercase' }}
                  placeholder="AB12-345"
                  value={matricula}
                  onChange={(e) => setMatricula(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleCheckIn()}
                />
              </div>
              <button
                onClick={() => handleCheckIn()}
                disabled={isLoading}
                style={{ padding: '0 22px', backgroundColor: isLoading ? '#94a3b8' : 'var(--secondary-color)', color: '#fff', border: 'none', borderRadius: '6px', cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: '0.88rem', fontWeight: 700, transition: 'background-color 0.15s ease' }}
              >
                {isLoading ? '...' : 'ACCESO'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderLeft: '1px solid #eee', paddingLeft: '50px' }}>
          {faceState ? (
            // --- Panel de verificación facial ---
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', width: '100%' }}>
              <div style={{
                width: '80px', height: '80px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: faceState.step === 'failed' ? '#fee2e2' : faceState.step === 'verifying' ? '#e0f2fe' : '#fef3c7',
                border: `3px solid ${faceState.step === 'failed' ? '#ef4444' : faceState.step === 'verifying' ? '#0ea5e9' : 'var(--secondary-color)'}`,
              }}>
                <span style={{ fontSize: '2rem' }}>
                  {faceState.step === 'verifying' ? '⏳' : faceState.step === 'failed' ? '✗' : '📷'}
                </span>
              </div>

              <div style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '1px', color: '#1f2937', textAlign: 'center' }}>
                {faceState.step === 'capturing' && (faceProgress >= 2 ? 'MANTÉN LA POSICIÓN...' : 'MIRA A LA CÁMARA')}
                {faceState.step === 'verifying' && 'VERIFICANDO IDENTIDAD...'}
                {faceState.step === 'failed' && 'VERIFICACIÓN FALLIDA'}
              </div>

              {/* Buffer de estabilización: 3 dots que se llenan de gris a verde */}
              {faceState.step === 'capturing' && (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: '11px', height: '11px', borderRadius: '50%',
                        backgroundColor: i < faceProgress ? '#22c55e' : '#e5e7eb',
                        transition: 'background-color 0.18s ease',
                        boxShadow: i < faceProgress ? '0 0 6px #22c55e88' : 'none',
                      }}
                    />
                  ))}
                </div>
              )}

              <div style={{ fontSize: '0.76rem', color: '#6b7280', textAlign: 'center', lineHeight: 1.5, maxWidth: '220px' }}>
                {faceState.step === 'capturing' && (
                  <>
                    Matrícula: <strong style={{ color: 'var(--secondary-color)' }}>{faceState.matricula}</strong>
                    <br />
                    {faceProgress === 0 && 'Posiciona tu rostro frente a la cámara.'}
                    {faceProgress === 1 && 'Detectando...'}
                    {faceProgress >= 2 && '¡Perfecto! No te muevas.'}
                  </>
                )}
                {faceState.step === 'verifying' && 'Analizando imagen, espera un momento...'}
                {faceState.step === 'failed' && (faceState.message || 'No se pudo confirmar la identidad.')}
              </div>

              {faceState.step === 'capturing' && (
                <button
                  onClick={handleFaceCapture}
                  disabled={!faceReady}
                  style={{ padding: '10px 28px', backgroundColor: faceReady ? '#64748b' : '#94a3b8', color: '#fff', border: 'none', borderRadius: '8px', cursor: faceReady ? 'pointer' : 'not-allowed', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.5px', opacity: 0.75 }}
                  title="Captura manual (normalmente automático)"
                >
                  {faceReady ? 'CAPTURA MANUAL' : 'CARGANDO MODELOS...'}
                </button>
              )}

              {faceState.step === 'failed' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setFaceState((s) => ({ ...s, step: 'capturing', message: '' }))}
                    style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                  >
                    REINTENTAR
                  </button>
                  <button
                    onClick={() => setFaceState(null)}
                    style={{ padding: '10px 20px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                  >
                    CANCELAR
                  </button>
                </div>
              )}
            </div>
          ) : (
            // --- Panel de estado estático (sin cambio de estructura en ningún estado) ---
            <>
              <div style={{ width: '160px', height: '160px', borderRadius: '8px', backgroundColor: '#fafafa', border: '1px solid #eee', overflow: 'hidden', marginBottom: '20px' }}>
                {(display.photo || status.subject?.foto_data_url || status.subject?.foto_path) ? (
                  <img
                    src={display.photo || status.subject?.foto_data_url || resolveAssetUrl(status.subject?.foto_path, '/perfil.jpg')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    alt="persona"
                  />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: '0.8rem' }}>SIN FOTO</div>
                )}
              </div>

              <h3 style={{ margin: 0, fontSize: '1.3rem', letterSpacing: '-0.5px', color: display.name ? 'var(--secondary-color)' : 'var(--primary-color)' }}>
                {display.name || (status.subject ? getFighterDisplayName(status.subject) : 'SISTEMA')}
              </h3>
              <p style={{ margin: '5px 0 20px 0', color: '#888', fontSize: '0.8rem' }}>
                {display.id || (status.subject?.matricula ? `ID: ${status.subject.matricula}` : 'CONTROL DE ACCESO')}
              </p>

              <div style={{ fontWeight: 800, color: display.msg ? '#16a34a' : (status.border === 'var(--primary-color)' ? 'var(--primary-color)' : status.border), fontSize: '1.05rem', letterSpacing: '1px', textAlign: 'center' }}>
                {display.msg || status.msg}
              </div>
              {!display.msg && (
                <p style={{ margin: '10px 0 0 0', color: '#6b7280', fontSize: '0.88rem', textAlign: 'center', lineHeight: 1.5 }}>
                  {status.detail}
                </p>
              )}
            </>
          )}
        </div>
        </div>{/* cierra grid card */}
      </div>{/* cierra flex-column wrapper */}
    </div>
  );
}