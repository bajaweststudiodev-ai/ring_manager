import React, { useEffect, useMemo, useState } from 'react';
import { FiCheckCircle, FiClock, FiDollarSign, FiRefreshCw, FiSearch, FiXCircle, FiTrash2 } from 'react-icons/fi';
import { fetchApi, resolveAssetUrl } from '../config/api';
import { db, getFighterDisplayName, normalizeFighterRecord } from '../db/db';
import { bootstrapCacheFromServer } from '../services/bootstrapSyncService';
import { obtenerPlanesPermitidos, TARIFAS, calcularMontoProporcional } from '../utils/finanzas';

const PALETTE = {
  orange: '#FF7F27',
  white: '#fff',
  dark: '#2d2e30',
  grayBg: '#fafafa',
  grayBorder: '#e5e7eb',
  grayText: '#667085',
  green: '#16a34a',
  red: '#dc2626', // Rojo más vivo para rechazar
};

export function PendingFighters() {
  const [fighters, setFighters] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [paymentModal, setPaymentModal] = useState({ isOpen: false, fighter: null, saving: false });
  const [pagoForm, setPagoForm] = useState({ tipo_pago: 'MENSUALIDAD + INSCRIPCION', monto: 800, metodo_pago: 'EFECTIVO', notas: '' });

  useEffect(() => {
    cargarPendientes();
  }, []);

  const fightersFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return fighters;
    return fighters.filter((fighter) => {
      const nombre = getFighterDisplayName(fighter).toLowerCase();
      const matricula = (fighter.matricula || '').toLowerCase();
      return nombre.includes(term) || matricula.includes(term);
    });
  }, [fighters, search]);

  const cargarPendientes = async () => {
    setIsLoading(true);
    setErrorMessage('');

    // ── REGLA 1: LECTURA LOCAL INMEDIATA ──────────────────────────────────
    // Lee fighters con estado PENDIENTE desde Dexie. Esto funciona aunque no
    // haya red. Si Dexie también falla (Safari init), libera el spinner con
    // lista vacía en lugar de congelar la UI.
    try {
      const localPendientes = await Promise.race([
        db.fighters
          .filter((f) => (f.estado || '').toUpperCase() === 'PENDIENTE')
          .toArray(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Dexie timeout 5 s')), 5000)
        ),
      ]);
      setFighters(
        localPendientes.map((f) => normalizeFighterRecord({ ...f, estado: f.estado || 'PENDIENTE' }))
      );
      setIsLoading(false);  // Liberar spinner con datos locales
    } catch (dexieErr) {
      console.warn('[PendingFighters] Dexie no disponible:', dexieErr.message);
      setIsLoading(false);
    }

    // ── REGLA 2: RED BEST-EFFORT (silenciada en fallo) ────────────────────
    // Fusiona la lista canónica del servidor con los registros locales synced:0
    // que aún no llegaron al servidor (guardados offline o en otro dispositivo).
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      let response;
      try {
        response = await fetchApi('/api/peleadores/pendientes', { signal: controller.signal });
      } finally {
        clearTimeout(tid);
      }
      const result = await response.json().catch(() => []);
      if (!response.ok) throw new Error(result.message || 'Error del servidor.');
      const serverList = Array.isArray(result)
        ? result.map((f) => normalizeFighterRecord({ ...f, estado: f.estado || 'PENDIENTE' }))
        : [];

      // Merge: los registros locales synced:0 que el servidor aún no conoce
      // (guardados offline) deben seguir visibles aunque el servidor responda.
      const localUnsynced = await db.fighters
        .filter((f) => (f.estado || '').toUpperCase() === 'PENDIENTE' && f.synced === 0)
        .toArray();
      const localNotOnServer = localUnsynced.filter(
        (local) => !serverList.some((sv) => sv.matricula === local.matricula),
      );
      const merged = [
        ...serverList,
        ...localNotOnServer.map((f) => normalizeFighterRecord({ ...f, estado: 'PENDIENTE' })),
      ];

      setFighters(merged);
      setErrorMessage('');
    } catch (networkError) {
      // Red no disponible — la lista local ya está visible, solo console.warn
      console.warn('[PendingFighters] Sin red, mostrando pendientes locales:', networkError.message);
    }
  };

  const abrirModalCobro = (fighter) => {
    const planesPermitidos = obtenerPlanesPermitidos(true);
    let tipoSugerido = fighter.tipo_pago_sugerido || fighter.tipoMembresia || 'MENSUALIDAD + INSCRIPCION';

    // MAGIA: Si el alumno pidió un plan que ya no está permitido por la fecha, lo forzamos al plan correcto
    const esValido = planesPermitidos.some(p => p.id === tipoSugerido);
    if (!esValido) {
      tipoSugerido = planesPermitidos[0].id;
    }

    let monto = TARIFAS.MENSUALIDAD;
    if (tipoSugerido === 'MENSUALIDAD + INSCRIPCION') monto = TARIFAS.MENSUALIDAD + TARIFAS.INSCRIPCION;
    else if (tipoSugerido === 'PROPORCIONAL + INSCRIPCION') monto = calcularMontoProporcional() + TARIFAS.INSCRIPCION;
    else if (tipoSugerido === 'MENSUALIDAD') monto = TARIFAS.MENSUALIDAD;
    else if (tipoSugerido === 'PROPORCIONAL') monto = calcularMontoProporcional();
    else if (tipoSugerido === 'DOS SEMANAS') monto = TARIFAS.DOS_SEMANAS;
    else if (tipoSugerido === 'SEMANA') monto = TARIFAS.SEMANA;
    else if (tipoSugerido === 'VISITA') monto = TARIFAS.VISITA;

    setPagoForm({ tipo_pago: tipoSugerido, monto, metodo_pago: 'EFECTIVO', notas: '' });
    setPaymentModal({ isOpen: true, fighter, saving: false });
  };

  const handleCambioConcepto = (event) => {
    const tipo_pago = event.target.value;
    let monto = TARIFAS.MENSUALIDAD;

    if (tipo_pago === 'MENSUALIDAD + INSCRIPCION') monto = TARIFAS.MENSUALIDAD + TARIFAS.INSCRIPCION;
    else if (tipo_pago === 'PROPORCIONAL + INSCRIPCION') monto = calcularMontoProporcional() + TARIFAS.INSCRIPCION;
    else if (tipo_pago === 'MENSUALIDAD') monto = TARIFAS.MENSUALIDAD;
    else if (tipo_pago === 'PROPORCIONAL') monto = calcularMontoProporcional();
    else if (tipo_pago === 'DOS SEMANAS') monto = TARIFAS.DOS_SEMANAS;
    else if (tipo_pago === 'SEMANA') monto = TARIFAS.SEMANA;
    else if (tipo_pago === 'VISITA') monto = TARIFAS.VISITA;

    setPagoForm((prev) => ({ ...prev, tipo_pago, monto }));
  };


  const handleAprobarYCobrar = async () => {
    if (!paymentModal.fighter?.matricula) return;
    if (!pagoForm.monto || Number.isNaN(Number(pagoForm.monto))) { alert('Ingresa un monto válido.'); return; }

    setPaymentModal((prev) => ({ ...prev, saving: true }));
    setFeedbackMessage('');

    const matricula = paymentModal.fighter.matricula;
    const fighterSnapshot = paymentModal.fighter; // captura antes de cerrar el modal
    const payloadPago = {
      tipo_pago: pagoForm.tipo_pago,
      monto: parseFloat(pagoForm.monto),
      metodo_pago: pagoForm.metodo_pago,
      notas: pagoForm.notas,
    };

    // ── PASO 1: DEXIE PRIMERO ────────────────────────────────────────────
    // Marcar el fighter como ACTIVO y guardar el pago localmente (synced:0)
    // en una sola transacción atómica. Si la red falla, la operación ya quedó
    // registrada y el SyncManager la enviará cuando haya conexión.
    try {
      await db.transaction('rw', db.fighters, db.payments, async () => {
        const existente = await db.fighters.filter((f) => f.matricula === matricula).first();
        if (existente) {
          await db.fighters.update(existente.id, { estado: 'ACTIVO', synced: 0 });
        } else {
          // Fighter solo existía en el servidor — persiste localmente como ACTIVO
          await db.fighters.put({ ...fighterSnapshot, estado: 'ACTIVO', synced: 0 });
        }
        await db.payments.add({
          peleador_matricula: matricula,
          matricula,
          ...payloadPago,
          fecha_pago: new Date().toISOString(),
          date: new Date().toISOString(),
          cancelado: 0,
          synced: 0,
        });
      });
    } catch (dexieErr) {
      // IDB no disponible — continuar de todas formas e intentar servidor
      console.warn('[PendingFighters] Dexie write falló en aprobar:', dexieErr.message);
    }

    // ── PASO 2: UI LIBERADA INMEDIATAMENTE ───────────────────────────────
    // La interfaz se libera antes de intentar la red. El usuario ve el éxito
    // sin importar si hay conexión o no.
    setFighters((prev) => prev.filter((f) => f.matricula !== matricula));
    setPaymentModal({ isOpen: false, fighter: null, saving: false });
    setFeedbackMessage(`Aprobado localmente: ${getFighterDisplayName(fighterSnapshot)}. Se sincronizará con el servidor.`);
    setTimeout(() => setFeedbackMessage(''), 5000);

    // ── PASO 3: SERVIDOR BEST-EFFORT (en background, sin bloquear UI) ───
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      let aprobarResponse;
      try {
        aprobarResponse = await fetchApi(
          `/api/peleadores/aprobar/${encodeURIComponent(matricula)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadPago),
            signal: controller.signal,
          }
        );
      } finally {
        clearTimeout(tid);
      }

      const aprobarResult = await aprobarResponse.json().catch(() => ({}));
      if (!aprobarResponse.ok) throw new Error(aprobarResult.message || 'Error del servidor.');

      // Servidor confirmó → marcar synced:1 en Dexie y refrescar caché completo
      try {
        const localFighter = await db.fighters.filter((f) => f.matricula === matricula).first();
        if (localFighter) await db.fighters.update(localFighter.id, { synced: 1 });
        const pagoLocal = await db.payments
          .filter((p) => (p.peleador_matricula || p.matricula) === matricula && p.synced === 0)
          .last();
        if (pagoLocal) await db.payments.update(pagoLocal.id, { synced: 1 });
      } catch {}

      await bootstrapCacheFromServer().catch(() => {});
      setFeedbackMessage(`Aprobado y sincronizado: ${getFighterDisplayName(fighterSnapshot)}.`);
      setTimeout(() => setFeedbackMessage(''), 4000);
    } catch (serverError) {
      console.warn('[PendingFighters] Sin red — registro queda en Dexie synced:0:', serverError.message);
      // Sin cambio en la UI: el usuario ya vio "Aprobado localmente"
    }
  };

  const handleRechazarRegistro = async (fighter) => {
    const confirmar = window.confirm(
      `¿Estás seguro de que quieres rechazar la solicitud de ${getFighterDisplayName(fighter)}? Esta acción no se puede deshacer.`
    );
    if (!confirmar) return;

    setFeedbackMessage('');
    setIsLoading(true);

    // PASO 1: DEXIE PRIMERO — marcar RECHAZADO sin esperar la red.
    // cargarPendientes filtra por estado === 'PENDIENTE', así que este registro
    // no reaparecerá en la lista aunque el servidor no responda.
    try {
      const local = await db.fighters.filter((f) => f.matricula === fighter.matricula).first();
      if (local) await db.fighters.update(local.id, { estado: 'RECHAZADO', synced: 0 });
    } catch (dexieErr) {
      console.warn('[PendingFighters] Dexie write en rechazar falló:', dexieErr.message);
    }

    // PASO 2: UI liberada inmediatamente
    setFighters((prev) => prev.filter((f) => f.matricula !== fighter.matricula));
    setFeedbackMessage(`Solicitud de ${getFighterDisplayName(fighter)} cancelada.`);
    setTimeout(() => setFeedbackMessage(''), 4000);
    setIsLoading(false);

    // PASO 3: SERVIDOR BEST-EFFORT en background
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      let response;
      try {
        response = await fetchApi(`/api/peleadores/rechazar/${encodeURIComponent(fighter.matricula)}`, {
          method: 'DELETE',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(tid);
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Error del servidor.');
      // Servidor confirmó → eliminar de Dexie completamente
      try {
        const local = await db.fighters.filter((f) => f.matricula === fighter.matricula).first();
        if (local) await db.fighters.delete(local.id);
      } catch {}
    } catch (serverError) {
      console.warn('[PendingFighters] Sin red al rechazar — queda RECHAZADO synced:0:', serverError.message);
    }
  };

  return (
    <div style={{ padding: '2vh 2vw', backgroundColor: PALETTE.grayBg, minHeight: '80vh', color: PALETTE.dark }}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>REGISTROS PENDIENTES</h2>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.84rem', color: PALETTE.grayText }}>
              Revisa solicitudes desde QR. Aprueba y cobra, o rechaza si es necesario.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <FiSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: PALETTE.grayText, fontSize: '0.85rem' }} />
              <input type="text" placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} style={searchInputStyle} />
            </div>
            <button onClick={cargarPendientes} style={ghostButtonStyle}>
              <FiRefreshCw size={14} /> Actualizar
            </button>
          </div>
        </div>

        {feedbackMessage && <div style={successBoxStyle}>{feedbackMessage}</div>}
        {isLoading && <p style={helperTextStyle}>Procesando registros pendientes...</p>}
        {errorMessage && <p style={{ ...helperTextStyle, color: PALETTE.red }}>{errorMessage}</p>}

        {!isLoading && !fightersFiltrados.length && !errorMessage && (
          <div style={emptyStateStyle}>
            <FiCheckCircle size={18} />
            <span>No hay registros pendientes por aprobar.</span>
          </div>
        )}

        {!isLoading && fightersFiltrados.length > 0 && (
          <div style={{ display: 'grid', gap: '12px' }}>
            {fightersFiltrados.map((fighter) => (
              <div key={fighter.matricula} style={rowCardStyle}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
                  <div style={avatarStyle}>
                    {fighter.foto_path ? (
                      <img src={resolveAssetUrl(fighter.foto_path)} alt={getFighterDisplayName(fighter)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <FiClock size={16} color={PALETTE.grayText} />
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{getFighterDisplayName(fighter)}</div>
                    <div style={{ fontSize: '0.78rem', color: PALETTE.grayText }}>{fighter.matricula}</div>
                    <div style={{ fontSize: '0.78rem', color: PALETTE.grayText }}>
                      {fighter.telefono || 'Sin telefono'} {fighter.fecha_ingreso ? `· ${fighter.fecha_ingreso}` : ''}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={badgeStyle}>PENDIENTE</span>
                  
                  {/* BOTONES DE ACCIÓN: APROBAR Y RECHAZAR */}
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => abrirModalCobro(fighter)} style={primaryButtonStyle}>
                      <FiDollarSign size={14} /> Aprobar y cobrar
                    </button>
                    <button 
                      onClick={() => handleRechazarRegistro(fighter)} 
                      style={dangerButtonStyle}
                      title="Rechazar solicitud"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </div>
                  
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {paymentModal.isOpen && (
        <Modal>
          <div style={modalBoxStyle}>
            <h3 style={modalTitleStyle}>Aprobar y cobrar</h3>
            <p style={{ margin: '0 0 14px 0', color: PALETTE.orange, fontWeight: 700, fontSize: '0.92rem' }}>
              {getFighterDisplayName(paymentModal.fighter)}
            </p>

            <label style={labelStyle}>Concepto</label>
            <select value={pagoForm.tipo_pago} onChange={handleCambioConcepto} style={inputStyle}>
              {/* 🔥 EL CANDADO INTELIGENTE CONTROLANDO LA CAJA */}
              {obtenerPlanesPermitidos(true).map(plan => (
                <option key={plan.id} value={plan.id}>{plan.nombre}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Metodo</label>
                <select value={pagoForm.metodo_pago} onChange={(e) => setPagoForm((p) => ({ ...p, metodo_pago: e.target.value }))} style={inputStyle}>
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="TARJETA">TARJETA</option>
                  <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                  <option value="OTRO">OTRO</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Monto</label>
                <input type="number" value={pagoForm.monto} onChange={(e) => setPagoForm((p) => ({ ...p, monto: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <label style={labelStyle}>Notas</label>
            <textarea value={pagoForm.notas} onChange={(e) => setPagoForm((p) => ({ ...p, notas: e.target.value }))} placeholder="Observaciones del cobro inicial" style={{ ...inputStyle, minHeight: '88px', resize: 'vertical', marginTop: '2px' }} />

            <div style={modalActionsStyle}>
              <button onClick={() => setPaymentModal({ isOpen: false, fighter: null, saving: false })} style={secondaryButtonStyle}>Cancelar</button>
              <button onClick={handleAprobarYCobrar} disabled={paymentModal.saving} style={primaryButtonStyle}>{paymentModal.saving ? 'Guardando...' : 'Confirmar'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' }}>
      {children}
    </div>
  );
}

// ESTILOS DE LA VISTA
const cardStyle = { maxWidth: '980px', margin: '0 auto', backgroundColor: PALETTE.white, padding: '18px', borderRadius: '12px', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)', border: `1px solid ${PALETTE.grayBorder}` };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' };
const rowCardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '10px', border: `1px solid ${PALETTE.grayBorder}`, backgroundColor: '#fcfcfd', flexWrap: 'wrap' };
const avatarStyle = { width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 };
const badgeStyle = { display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: '999px', border: '1px solid #fed7aa', backgroundColor: '#fff7ed', color: '#9a3412', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.3px' };
const searchInputStyle = { padding: '8px 10px 8px 30px', width: '200px', borderRadius: '8px', border: `1px solid ${PALETTE.grayBorder}`, outline: 'none', fontSize: '0.84rem', backgroundColor: '#fff' };
const helperTextStyle = { fontSize: '0.9rem', color: PALETTE.grayText, padding: '10px 0' };
const successBoxStyle = { padding: '12px 14px', borderRadius: '8px', marginBottom: '16px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.86rem' };
const emptyStateStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '18px 0 6px 0', color: PALETTE.grayText, fontSize: '0.9rem' };
const ghostButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${PALETTE.grayBorder}`, backgroundColor: '#fff', color: PALETTE.dark, fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' };
const primaryButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: 'none', backgroundColor: PALETTE.dark, color: '#fff', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' };

// ESTILO NUEVO PARA EL BOTÓN DE RECHAZAR
const dangerButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 10px',
  borderRadius: '8px',
  border: `1px solid ${PALETTE.red}`,
  backgroundColor: '#fef2f2',
  color: PALETTE.red,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

const secondaryButtonStyle = { padding: '8px 12px', borderRadius: '8px', border: `1px solid ${PALETTE.grayBorder}`, backgroundColor: '#fff', color: PALETTE.dark, fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', flex: 1 };
const modalBoxStyle = { backgroundColor: '#fff', width: '100%', maxWidth: '360px', borderRadius: '12px', padding: '18px', border: `1px solid ${PALETTE.grayBorder}`, boxShadow: '0 18px 36px rgba(15, 23, 42, 0.16)' };
const modalTitleStyle = { margin: '0 0 14px 0', fontSize: '1rem', color: PALETTE.dark };
const labelStyle = { display: 'block', marginBottom: '6px', marginTop: '10px', fontSize: '0.74rem', fontWeight: 700, color: PALETTE.dark, textTransform: 'uppercase' };
const inputStyle = { width: '100%', padding: '9px 10px', borderRadius: '8px', border: `1px solid ${PALETTE.grayBorder}`, backgroundColor: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };
const modalActionsStyle = { display: 'flex', gap: '8px', marginTop: '18px' };