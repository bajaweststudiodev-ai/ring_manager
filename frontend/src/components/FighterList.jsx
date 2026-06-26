import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  FiAward,
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiDollarSign,
  FiEdit2,
  FiMaximize,
  FiSearch,
  FiTrash2,
  FiXCircle,
} from 'react-icons/fi';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { FighterProfile } from './FighterProfile';
import {
  addPayment,
  db,
  getLatestActivePaymentForFighter,
  getFighterDisplayName,
  logLocalActivity,
  normalizeFighterRecord,
  normalizePaymentRecord,
} from '../db/db';
import { fetchApi, resolveAssetUrl } from '../config/api';
import { checkAccess } from '../logic/rules';
import { bootstrapCacheFromServer } from '../services/bootstrapSyncService';
import { obtenerPlanesPermitidos, TARIFAS, calcularMontoProporcional, resolveFechaFinSugerida } from '../utils/finanzas';
import { formatDateLocal } from '../utils/date';

const PALETTE = {
  orange: '#FF7F27',
  white: '#fff',
  dark: '#2d2e30',
  green: '#00bb2d',
  red: '#e74c3c',
  grayBg: '#fafafa',
  grayBorder: '#eee',
  grayText: '#888',
};

const resolveMontoByTipoPago = (tipoPago = 'MENSUALIDAD') => {
  if (tipoPago === 'MENSUALIDAD + INSCRIPCION') return TARIFAS.MENSUALIDAD + TARIFAS.INSCRIPCION;
  if (tipoPago === 'PROPORCIONAL + INSCRIPCION') return calcularMontoProporcional() + TARIFAS.INSCRIPCION;
  if (tipoPago === 'MENSUALIDAD') return TARIFAS.MENSUALIDAD;
  if (tipoPago === 'PROPORCIONAL') return calcularMontoProporcional();
  if (tipoPago === 'DOS SEMANAS') return TARIFAS.DOS_SEMANAS;
  if (tipoPago === 'SEMANA') return TARIFAS.SEMANA;
  if (tipoPago === 'VISITA') return TARIFAS.VISITA;
  return TARIFAS.MENSUALIDAD;
};


export function FightersList({ userRole }) {
  const [fighters, setFighters] = useState([]);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [membresiaStatus, setMembresiaStatus] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [editModal, setEditModal] = useState({ isOpen: false, fighter: null });
  const [editForm, setEditForm] = useState({ nombre: '', apellido_paterno: '', apellido_materno: '', telefono: '' });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, nombre: '', matricula: '', motivo: '' });
  const [paymentModal, setPaymentModal] = useState({ isOpen: false, fighter: null, saving: false });
  const [pagoForm, setPagoForm] = useState({ tipo_pago: 'MENSUALIDAD', monto: 650, metodo_pago: 'EFECTIVO', notas: '' });
  const [qrModal, setQrModal] = useState({ isOpen: false, matricula: '', nombre: '' });
  const [recordModal, setRecordModal] = useState({ isOpen: false, fighter: null });
  const [cancelPaymentModal, setCancelPaymentModal] = useState({ isOpen: false, fighter: null, payment: null, motivo: '', saving: false });
  const [showInactive, setShowInactive] = useState(false);
  const itemsPerPage = 12;

  useEffect(() => {
  let cancelled = false;

  const refreshAndLoad = async () => {
    try {
      await bootstrapCacheFromServer();
    } catch (error) {
      console.warn('No pude refrescar el cache.', error);
    }
    if (!cancelled) await loadFighters();
  };

  refreshAndLoad();
  return () => { cancelled = true; };
}, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const buildMembershipStatus = async (matricula, fighterCandidate = null) => {
    const fighterRecord = normalizeFighterRecord(
      fighterCandidate || await db.fighters.where('matricula').equals(matricula).first() || {},
    );
    const fighterState = String(fighterRecord.estado || 'ACTIVO').toUpperCase();
    const lastPayment = normalizePaymentRecord(await getLatestActivePaymentForFighter(matricula) || {});
    const result = lastPayment.tipo_pago ? checkAccess({
      date: lastPayment.fecha_pago,
      type: lastPayment.tipo_pago,
      amount: lastPayment.monto,
      method: lastPayment.metodo_pago,
      fecha_fin: lastPayment.fecha_fin,
      }) : checkAccess(null);

    if (fighterState === 'BAJA') {
      return {
        ...result,
        canEnter: false,
        reason: 'Peleador dado de baja',
        payment: lastPayment.tipo_pago ? lastPayment : null,
        fighter_state: fighterState,
        motivo_baja: fighterRecord.motivo_baja || '',
      };
    }

    return {
      ...result,
      payment: lastPayment.tipo_pago ? lastPayment : null,
      fighter_state: fighterState,
      motivo_baja: fighterRecord.motivo_baja || '',
    };
  };

  const loadFighters = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const allFighters = (await db.fighters.toArray())
        .map(normalizeFighterRecord)
        .sort((a, b) => getFighterDisplayName(a).localeCompare(getFighterDisplayName(b)));

      const fightersConEstado = await Promise.all(allFighters.map(async (fighter) => {
        const result = await buildMembershipStatus(fighter.matricula, fighter);
        return { ...fighter, hasAccess: result.canEnter };
      }));

      setFighters(fightersConEstado);
    } catch (error) {
      console.error('No pude cargar la lista de peleadores:', error);
      setErrorMessage('No pude cargar la lista de peleadores.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpandRaw = async (matricula) => {
    if (expandedId === matricula) {
      setExpandedId(null);
      setMembresiaStatus(null);
      return;
    }

    setExpandedId(matricula);
    setMembresiaStatus('loading');
    const result = await buildMembershipStatus(matricula);
    setMembresiaStatus(result);
  };

  const abrirModalPago = async (fighter) => {
    // Si su registro sugiere inscripción, lo tratamos como nuevo/evolución
    const normalizedFighter = normalizeFighterRecord(fighter || {});
    const lastPayment = normalizePaymentRecord(await getLatestActivePaymentForFighter(normalizedFighter.matricula) || {});
    const yaPagoInscripcion = Boolean(Number(normalizedFighter.inscripcion_pagada || 0))
      || String(lastPayment.tipo_pago || '').toUpperCase().includes('INSCRIPCION');
    const requiereInscripcion = !yaPagoInscripcion;

    // Pago tardío: solo cuando existe un pago previo cuya fecha_fin ya venció
    const hoy = new Date().toISOString().slice(0, 10);
    const esPagoTardio = Boolean(lastPayment.fecha_fin && lastPayment.fecha_fin < hoy);

    const planesPermitidos = obtenerPlanesPermitidos(requiereInscripcion, esPagoTardio);

    const sugerencias = [
      normalizedFighter.tipo_pago_sugerido,
      normalizedFighter.tipoMembresia,
      lastPayment.tipo_pago,
      planesPermitidos[0]?.id,
      'MENSUALIDAD',
    ].filter(Boolean);

    let tipoSugerido = sugerencias.find((candidate) => planesPermitidos.some((plan) => plan.id === candidate));

    // MAGIA: Si el sistema detecta que el plan ya expiró por fecha, le asigna el proporcional
    const esValido = planesPermitidos.some((p) => p.id === tipoSugerido);
    if (!esValido) {
      tipoSugerido = planesPermitidos[0]?.id || 'MENSUALIDAD';
    }

    let monto = TARIFAS.MENSUALIDAD;
    if (tipoSugerido === 'MENSUALIDAD + INSCRIPCION') monto = TARIFAS.MENSUALIDAD + TARIFAS.INSCRIPCION;
    else if (tipoSugerido === 'PROPORCIONAL + INSCRIPCION') monto = calcularMontoProporcional() + TARIFAS.INSCRIPCION;
    else if (tipoSugerido === 'MENSUALIDAD') monto = TARIFAS.MENSUALIDAD;
    else if (tipoSugerido === 'PROPORCIONAL') monto = calcularMontoProporcional();
    else if (tipoSugerido === 'DOS SEMANAS') monto = TARIFAS.DOS_SEMANAS;
    else if (tipoSugerido === 'SEMANA') monto = TARIFAS.SEMANA;
    else if (tipoSugerido === 'VISITA') monto = TARIFAS.VISITA;

    // Guardamos en el modal si requiere inscripción para construir el select
    setPaymentModal({
      isOpen: true,
      fighter: normalizedFighter,
      saving: false,
      requiereInscripcion,
      planesPermitidos,
    });
    setPagoForm({ tipo_pago: tipoSugerido, monto, metodo_pago: 'EFECTIVO', notas: '', fecha_fin: resolveFechaFinSugerida(tipoSugerido) });
  };

  const handleCambioConcepto = (e) => {
    const tipo_pago = e.target.value;
    setPagoForm((prev) => ({ ...prev, tipo_pago, monto: resolveMontoByTipoPago(tipo_pago), fecha_fin: resolveFechaFinSugerida(tipo_pago) }));
  };

  const handleGuardarPago = async () => {
    if (!paymentModal.fighter?.matricula) return;
    if (!pagoForm.monto || Number.isNaN(Number(pagoForm.monto)) || Number(pagoForm.monto) <= 0) {
      alert('Ingresa un monto valido.');
      return;
    }

    setPaymentModal((prev) => ({ ...prev, saving: true }));

    const fighter = paymentModal.fighter;
    const payloadPago = {
      peleador_matricula: fighter.matricula,
      tipo_pago: pagoForm.tipo_pago,
      monto: parseFloat(pagoForm.monto),
      metodo_pago: pagoForm.metodo_pago,
      notas: pagoForm.notas,
      fecha_fin: pagoForm.fecha_fin || undefined,
    };

    // PASO 1: DEXIE PRIMERO — el pago queda registrado y el estado de membresía
    // se actualiza en la UI antes de intentar la red. synced:0 marca que falta
    // confirmación del servidor.
    let localPaymentId = null;
    try {
      localPaymentId = await addPayment(
        fighter,
        pagoForm.tipo_pago,
        parseFloat(pagoForm.monto),
        pagoForm.metodo_pago,
        { notas: pagoForm.notas, fecha_fin: pagoForm.fecha_fin ?? '' },
      );
    } catch (dexieErr) {
      console.warn('[FighterList] addPayment local falló:', dexieErr.message);
    }

    // PASO 2: UI liberada inmediatamente
    setPaymentModal({ isOpen: false, fighter: null, saving: false });
    await loadFighters();
    if (expandedId === fighter.matricula) {
      setMembresiaStatus(await buildMembershipStatus(fighter.matricula));
    }

    // PASO 3: SERVIDOR BEST-EFFORT en background
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      let response;
      try {
        response = await fetchApi('/api/pagos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadPago),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(tid);
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Error del servidor.');

      // Servidor confirmó → marcar synced:1 y refrescar con datos canónicos
      if (localPaymentId) {
        await db.payments.update(localPaymentId, {
          synced: 1,
          fecha_fin: result.pago?.fecha_fin ?? payloadPago.fecha_fin ?? '',
          usuario_id: result.pago?.usuario_id ?? null,
        }).catch(() => {});
      }
      await bootstrapCacheFromServer().catch(() => {});
      await loadFighters();
      if (expandedId === fighter.matricula) {
        setMembresiaStatus(await buildMembershipStatus(fighter.matricula));
      }
    } catch (serverError) {
      console.warn('[FighterList] Pago guardado offline synced:0:', serverError.message);
    }
  };

  const abrirModalCancelarPago = (fighter, payment) => {
    setCancelPaymentModal({
      isOpen: true,
      fighter,
      payment,
      motivo: '',
      saving: false,
    });
  };

  const handleCancelarPago = async () => {
    if (!cancelPaymentModal.payment?.id) {
      return;
    }

    if (!cancelPaymentModal.motivo.trim()) {
      alert('Escribe el motivo de cancelacion.');
      return;
    }

    setCancelPaymentModal((prev) => ({ ...prev, saving: true }));
    try {
      const response = await fetchApi(`/api/pagos/${cancelPaymentModal.payment.id}/cancelar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo_cancelacion: cancelPaymentModal.motivo.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'No pude cancelar el pago.');
      }

      await bootstrapCacheFromServer();
      await loadFighters();

      if (expandedId === cancelPaymentModal.fighter?.matricula) {
        setMembresiaStatus(await buildMembershipStatus(cancelPaymentModal.fighter.matricula));
      }

      setCancelPaymentModal({ isOpen: false, fighter: null, payment: null, motivo: '', saving: false });
    } catch (error) {
      console.error('No pude cancelar el pago:', error);
      alert(error.message || 'No pude cancelar el pago.');
      setCancelPaymentModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const pedirConfirmacionBorrado = (id, nombre, matricula) => {
    setDeleteModal({ isOpen: true, id, nombre, matricula, motivo: '' });
  };

  const ejecutarBorrado = async () => {
    const { id, nombre, matricula, motivo } = deleteModal;
    if (!motivo.trim()) {
      alert('Escribe el motivo de baja.');
      return;
    }

    // PASO 1: DEXIE PRIMERO — baja visible de inmediato sin red
    try {
      await db.fighters.update(id, { estado: 'BAJA', activo: 0, motivo_baja: motivo, synced: 0 });
    } catch (dexieErr) {
      alert('No pude registrar la baja localmente.');
      return;
    }

    setExpandedId(null);
    setDeleteModal({ isOpen: false, id: null, nombre: '', matricula: '', motivo: '' });
    await loadFighters();
    logLocalActivity('Alumnos', 'Baja', `Baja de ${nombre || matricula}: ${motivo}`, 'Staff').catch(() => {});

    // PASO 2: SERVIDOR BEST-EFFORT en background
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      let response;
      try {
        response = await fetchApi(`/api/peleadores/${matricula}/baja`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo_baja: motivo }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(tid);
      }
      if (response.ok) {
        await db.fighters.update(id, { synced: 1 });
      }
    } catch (serverError) {
      console.warn('[FighterList] Baja guardada offline synced:0:', serverError.message);
    }
  };

  const abrirModalEditar = (fighter) => {
    setEditModal({ isOpen: true, fighter });
    setEditForm({
      nombre: fighter.nombre || '',
      apellido_paterno: fighter.apellido_paterno || '',
      apellido_materno: fighter.apellido_materno || '',
      telefono: fighter.telefono || '',
    });
  };

  const handleGuardarEdicion = async () => {
    if (!editForm.nombre.trim()) {
      alert('El nombre es obligatorio.');
      return;
    }
    if (!editForm.apellido_paterno.trim()) {
      alert('El apellido paterno es obligatorio.');
      return;
    }

    const { id, matricula } = editModal.fighter;
    const campos = {
      nombre: editForm.nombre.trim(),
      apellido_paterno: editForm.apellido_paterno.trim(),
      apellido_materno: editForm.apellido_materno.trim(),
      telefono: editForm.telefono.trim(),
    };

    // PASO 1: DEXIE PRIMERO con synced:0 — el cambio es visible offline de inmediato.
    // Sin este flag el SyncManager no sabe que existe un cambio pendiente de enviar.
    try {
      await db.fighters.update(id, { ...campos, synced: 0 });
    } catch (dexieErr) {
      alert('No pude editar el registro.');
      return;
    }

    setEditModal({ isOpen: false, fighter: null });
    await loadFighters();

    // PASO 2: SERVIDOR BEST-EFFORT en background
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      let response;
      try {
        response = await fetchApi(`/api/peleadores/${encodeURIComponent(matricula)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(campos),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(tid);
      }
      if (response.ok) {
        await db.fighters.update(id, { synced: 1 });
      }
    } catch (serverError) {
      console.warn('[FighterList] Edición guardada offline synced:0:', serverError.message);
    }
  };

  const handleFighterUpdated = async (updatedFighter) => {
    const normalized = normalizeFighterRecord(updatedFighter || {});
    if (!normalized.matricula) {
      return;
    }

    setRecordModal((prev) => (
      prev.isOpen && prev.fighter?.matricula === normalized.matricula
        ? { ...prev, fighter: { ...prev.fighter, ...normalized } }
        : prev
    ));

    await loadFighters();

    if (expandedId === normalized.matricula) {
      setMembresiaStatus(await buildMembershipStatus(normalized.matricula, normalized));
    }
  };

  const filteredFighters = fighters.filter((fighter) => {
    const nombre = getFighterDisplayName(fighter).toLowerCase();
    const matchesSearch = nombre.includes(search.toLowerCase()) || fighter.matricula.toLowerCase().includes(search.toLowerCase());
    const estado = String(fighter.estado || 'ACTIVO').toUpperCase();
    const isInactive = estado === 'BAJA' || estado === 'SUSPENDIDO';
    return matchesSearch && (showInactive || !isInactive);
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredFighters.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredFighters.length / itemsPerPage);

  return (
    <div style={{ padding: '2vh 2vw', backgroundColor: PALETTE.grayBg, minHeight: '80vh', color: PALETTE.dark }}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h2 style={{ color: PALETTE.dark, margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>PELEADORES ({filteredFighters.length})</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowInactive((prev) => !prev)}
              style={{ padding: '5px 10px', fontSize: '0.75rem', fontWeight: 600, borderRadius: '6px', border: `1px solid ${showInactive ? PALETTE.orange : PALETTE.grayBorder}`, backgroundColor: showInactive ? 'rgba(255,127,39,0.1)' : PALETTE.white, color: showInactive ? PALETTE.orange : PALETTE.grayText, cursor: 'pointer', whiteSpace: 'nowrap' }}
              title={showInactive ? 'Ocultar dados de baja' : 'Mostrar dados de baja'}
            >
              {showInactive ? 'Ocultar bajas' : 'Ver bajas'}
            </button>
            <div style={{ position: 'relative' }}>
              <FiSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: PALETTE.grayText, fontSize: '0.85rem' }} />
              <input
                type="text"
                placeholder="Buscar"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={searchInputStyle}
              />
            </div>
          </div>
        </div>

        {isLoading && <p style={helperTextStyle}>Cargando peleadores...</p>}
        {errorMessage && <p style={{ ...helperTextStyle, color: PALETTE.red }}>{errorMessage}</p>}

        {!isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {currentItems.map((fighter) => {
              const nombreCompleto = getFighterDisplayName(fighter);
              return (
                <div key={fighter.id || fighter.matricula} style={{ borderBottom: `1px solid ${PALETTE.grayBorder}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', minHeight: '48px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '10px', cursor: 'pointer', minWidth: 0, padding: '10px 0' }}>
                      <input
                        type="checkbox"
                        checked={expandedId === fighter.matricula}
                        onChange={() => toggleExpandRaw(fighter.matricula)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: PALETTE.orange, flexShrink: 0 }}
                      />
                      <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={avatarStyle}>
                          {fighter.foto_path ? <img src={resolveAssetUrl(fighter.foto_path)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={nombreCompleto} /> : <div style={avatarPlaceholderStyle}>?</div>}
                        </div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 700, color: PALETTE.dark, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombreCompleto}</div>
                          <div style={{ fontSize: '0.75rem', color: PALETTE.grayText }}>{fighter.matricula}</div>
                        </div>
                      </div>
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, paddingLeft: '10px' }}>
                      <button onClick={() => abrirModalPago(fighter)} style={{ ...rowButtonStyle, backgroundColor: '#e8f4fd', color: PALETTE.dark }} title="Cobrar">
                        <FiDollarSign size={14} />
                      </button>
                      <button onClick={() => abrirModalEditar(fighter)} style={{ ...rowButtonStyle, backgroundColor: '#f4f4f5', color: PALETTE.dark }} title="Editar">
                        <FiEdit2 size={14} />
                      </button>
                      {userRole === 'admin' && (
                        <button onClick={() => pedirConfirmacionBorrado(fighter.id, nombreCompleto, fighter.matricula)} style={{ ...rowButtonStyle, backgroundColor: '#fef2f2', color: PALETTE.red }} title="Dar de baja">
                          <FiTrash2 size={14} />
                        </button>
                      )}
                      <div style={{ width: '22px', display: 'flex', justifyContent: 'center' }}>
                        {fighter.hasAccess ? <FiCheckCircle style={{ color: PALETTE.green }} title="Autorizado" /> : <FiXCircle style={{ color: PALETTE.red }} title="Denegado" />}
                      </div>
                    </div>
                  </div>

                  {expandedId === fighter.matricula && (
                    <div style={detailPanelStyle}>
                      <div>
                        <p style={detailStyle}><strong>Telefono:</strong> {fighter.telefono || 'N/A'}</p>
                        <p style={detailStyle}><strong>Salud:</strong> {fighter.seguro_medico || 'N/A'} {fighter.consultorio ? `- ${fighter.consultorio}` : ''}</p>
                        <p style={detailStyle}><strong>Alergias / Lesiones:</strong> {fighter.alergias || 'Ninguna'} / {fighter.lesiones || 'Ninguna'}</p>
                      </div>

                      <div style={membershipBoxStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
                          <p style={{ margin: 0, fontWeight: 700, color: PALETTE.dark, textTransform: 'uppercase', fontSize: '0.72rem' }}>Detalle de membresia</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => setRecordModal({ isOpen: true, fighter })}
                              style={{ ...rowButtonStyle, width: '34px', height: '34px', borderRadius: '999px', backgroundColor: 'rgba(255, 127, 39, 0.12)', color: 'var(--secondary-color)' }}
                              title="Ver perfil de combate"
                            >
                              <FiAward size={15} />
                            </button>
                            {fighter.hasAccess && (
                              <button onClick={() => setQrModal({ isOpen: true, matricula: fighter.matricula, nombre: nombreCompleto })} style={smallButtonStyle}>
                                <FiMaximize size={13} /> Ver QR
                              </button>
                            )}
                          </div>
                        </div>

                        {membresiaStatus === 'loading' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: PALETTE.grayText, fontSize: '0.75rem' }}>
                            <AiOutlineLoading3Quarters className="spin" /> Consultando...
                          </div>
                        ) : membresiaStatus ? (
                          <>
                            <p style={{ margin: '0 0 3px 0', color: '#555' }}>
                              <span style={{ color: PALETTE.grayText }}>Estatus:</span>{' '}
                              <strong style={{ color: membresiaStatus.canEnter ? PALETTE.green : PALETTE.red }}>{membresiaStatus.reason}</strong>
                            </p>
                            {membresiaStatus.expiration && (
                              <p style={{ margin: 0, color: '#555' }}>
                                <span style={{ color: PALETTE.grayText }}>Vencimiento:</span> {formatDateLocal(membresiaStatus.expiration)}
                              </p>
                            )}
                            {membresiaStatus.payment && (
                              <>
                                <p style={{ margin: '6px 0 0 0', color: '#555' }}>
                                  <span style={{ color: PALETTE.grayText }}>Ultimo pago:</span> {membresiaStatus.payment.tipo_pago} ({membresiaStatus.payment.metodo_pago})
                                </p>
                                <p style={{ margin: '2px 0 0 0', color: '#555' }}>
                                  <span style={{ color: PALETTE.grayText }}>Fecha:</span> {formatDateLocal(membresiaStatus.payment.fecha_pago)}
                                </p>
                                {membresiaStatus.payment.notas ? (
                                  <p style={{ margin: '2px 0 0 0', color: '#555' }}>
                                    <span style={{ color: PALETTE.grayText }}>Notas:</span> {membresiaStatus.payment.notas}
                                  </p>
                                ) : null}
                                {userRole === 'admin' && (
                                  <div style={{ marginTop: '10px' }}>
                                    <button
                                      onClick={() => abrirModalCancelarPago(fighter, membresiaStatus.payment)}
                                      style={{ ...smallButtonStyle, color: PALETTE.red, borderColor: '#fecaca', backgroundColor: '#fff5f5' }}
                                    >
                                      <FiXCircle size={13} /> Cancelar pago
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                            {membresiaStatus.motivo_baja ? (
                              <p style={{ margin: '6px 0 0 0', color: '#555' }}>
                                <span style={{ color: PALETTE.grayText }}>Motivo de baja:</span> {membresiaStatus.motivo_baja}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <p style={{ margin: 0, color: PALETTE.grayText }}>Sin historial de pagos.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div style={paginationStyle}>
            <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} style={paginationBtnStyle(currentPage === 1)}>
              <FiChevronLeft />
            </button>
            <span style={{ fontSize: '0.8rem', color: PALETTE.dark }}>{currentPage} / {totalPages}</span>
            <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} style={paginationBtnStyle(currentPage === totalPages)}>
              <FiChevronRight />
            </button>
          </div>
        )}
      </div>

      {editModal.isOpen && (
        <Modal>
          <div style={modalBoxStyle}>
            <h3 style={modalTitleStyle}>Editar peleador</h3>
            <label style={labelStyle}>Nombre</label>
            <input type="text" value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} style={inputStyle} />
            <label style={labelStyle}>Apellido paterno</label>
            <input type="text" value={editForm.apellido_paterno} onChange={(e) => setEditForm({ ...editForm, apellido_paterno: e.target.value })} style={inputStyle} />
            <label style={labelStyle}>Apellido materno</label>
            <input type="text" value={editForm.apellido_materno} onChange={(e) => setEditForm({ ...editForm, apellido_materno: e.target.value })} style={inputStyle} />
            <label style={labelStyle}>Telefono</label>
            <input type="tel" inputMode="numeric" pattern="[0-9]*" value={editForm.telefono} onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })} style={inputStyle} />
            <div style={modalActionsStyle}>
              <button onClick={() => setEditModal({ isOpen: false, fighter: null })} style={secondaryModalButtonStyle}>Cancelar</button>
              <button onClick={handleGuardarEdicion} style={primaryModalButtonStyle}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}

      {paymentModal.isOpen && (
        <Modal>
          <div style={modalBoxStyle}>
            <h3 style={modalTitleStyle}>Registrar pago</h3>
            <p style={{ fontWeight: 700, marginBottom: '14px', fontSize: '0.95rem', color: PALETTE.orange }}>{getFighterDisplayName(paymentModal.fighter)}</p>
            <label style={labelStyle}>Concepto</label>
            <select value={pagoForm.tipo_pago} onChange={handleCambioConcepto} style={inputStyle}>
              {/* 🔥 EL MENÚ AHORA ESTÁ CONTROLADO POR EL CANDADO */}
              {(paymentModal.planesPermitidos || obtenerPlanesPermitidos(paymentModal.requiereInscripcion)).map(plan => (
                <option key={plan.id} value={plan.id}>{plan.nombre}</option>
              ))}
            </select>
            
            {/* EL PRECIO DISCRETO (Ocultamos el input de monto y mostramos el calculado) */}
            <div style={{ textAlign: 'right', marginTop: '6px', fontSize: '0.8rem', color: '#667085', fontWeight: 600 }}>
              Monto a cobrar: <span style={{ color: PALETTE.orange, fontSize: '1rem', fontWeight: 800 }}>${pagoForm.monto} MXN</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' }}>
              <div>
                <label style={labelStyle}>Metodo</label>
                <select value={pagoForm.metodo_pago} onChange={(e) => setPagoForm({ ...pagoForm, metodo_pago: e.target.value })} style={inputStyle}>
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="TARJETA">TARJETA</option>
                  <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Ajuste (opcional)</label>
                <input type="number" inputMode="decimal" value={pagoForm.monto} onChange={(e) => setPagoForm({ ...pagoForm, monto: e.target.value })} style={inputStyle} />
              </div>
            </div>

            <label style={labelStyle}>Vencimiento</label>
            <input
              type="date"
              value={pagoForm.fecha_fin}
              onChange={(e) => setPagoForm((prev) => ({ ...prev, fecha_fin: e.target.value }))}
              style={inputStyle}
            />
            <p style={{ margin: '2px 0 12px 0', fontSize: '0.72rem', color: '#9ca3af' }}>
              Sugerido por la Regla del Dia 1. Editable para festivos.
            </p>

            <label style={labelStyle}>Notas</label>
            <textarea
              value={pagoForm.notas}
              onChange={(e) => setPagoForm({ ...pagoForm, notas: e.target.value })}
              placeholder="Observaciones del cobro"
              style={{ ...inputStyle, minHeight: '88px', resize: 'vertical' }}
            />

            <div style={modalActionsStyle}>
              <button onClick={() => setPaymentModal({ isOpen: false, fighter: null, saving: false })} style={secondaryModalButtonStyle}>Cancelar</button>
              <button onClick={handleGuardarPago} disabled={paymentModal.saving} style={primaryModalButtonStyle}>
                {paymentModal.saving ? 'Guardando...' : 'Guardar pago'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {cancelPaymentModal.isOpen && (
        <Modal>
          <div style={modalBoxStyle}>
            <h3 style={modalTitleStyle}>Cancelar pago</h3>
            <p style={{ margin: '0 0 12px 0', color: PALETTE.grayText, fontSize: '0.88rem' }}>
              Se cancelara el pago de <strong style={{ color: PALETTE.dark }}>{getFighterDisplayName(cancelPaymentModal.fighter || {})}</strong>.
            </p>
            <label style={labelStyle}>Motivo de cancelacion</label>
            <textarea
              value={cancelPaymentModal.motivo}
              onChange={(e) => setCancelPaymentModal((prev) => ({ ...prev, motivo: e.target.value }))}
              placeholder="Ej. cobro duplicado, error de captura, devolucion..."
              style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
            />
            <div style={modalActionsStyle}>
              <button
                onClick={() => setCancelPaymentModal({ isOpen: false, fighter: null, payment: null, motivo: '', saving: false })}
                style={secondaryModalButtonStyle}
              >
                Cerrar
              </button>
              <button
                onClick={handleCancelarPago}
                disabled={cancelPaymentModal.saving}
                style={{ ...primaryModalButtonStyle, backgroundColor: PALETTE.red }}
              >
                {cancelPaymentModal.saving ? 'Cancelando...' : 'Confirmar cancelacion'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteModal.isOpen && (
        <Modal>
          <div style={{ ...modalBoxStyle, textAlign: 'center' }}>
            <FiAlertTriangle size={40} color={PALETTE.red} style={{ marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 10px 0', color: PALETTE.dark, fontSize: '1.1rem' }}>Dar de baja</h3>
            <p style={{ margin: '0 0 14px 0', color: PALETTE.grayText, fontSize: '0.9rem', lineHeight: 1.4 }}>
              Dar de baja a <strong style={{ color: PALETTE.dark }}>{deleteModal.nombre}</strong>. El historial de pagos y asistencias se conserva.
            </p>
            <textarea
              placeholder="Motivo de baja (obligatorio)"
              value={deleteModal.motivo}
              onChange={(e) => setDeleteModal((prev) => ({ ...prev, motivo: e.target.value }))}
              rows={3}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${PALETTE.grayBorder}`, fontSize: '0.86rem', resize: 'vertical', boxSizing: 'border-box', marginBottom: '14px', outline: 'none' }}
            />
            <div style={modalActionsStyle}>
              <button onClick={() => setDeleteModal({ isOpen: false, id: null, nombre: '', matricula: '', motivo: '' })} style={secondaryModalButtonStyle}>Cancelar</button>
              <button onClick={ejecutarBorrado} style={{ ...primaryModalButtonStyle, backgroundColor: PALETTE.red }}>Dar de baja</button>
            </div>
          </div>
        </Modal>
      )}

      {qrModal.isOpen && (
        <div onClick={() => setQrModal({ isOpen: false, matricula: '', nombre: '' })} style={qrOverlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={qrBoxStyle}>
            <h3 style={{ margin: '0 0 5px 0', color: PALETTE.dark, fontSize: '1.1rem' }}>Acceso autorizado</h3>
            <p style={{ margin: '0 0 18px 0', color: PALETTE.orange, fontWeight: 700, fontSize: '0.88rem' }}>{qrModal.nombre}</p>
            <div style={{ padding: '14px', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '10px', display: 'inline-block' }}>
              <QRCodeSVG value={qrModal.matricula} size={220} />
            </div>
            <p style={{ margin: '14px 0 0 0', fontWeight: 800, fontSize: '1.3rem', color: PALETTE.dark, letterSpacing: '1px' }}>{qrModal.matricula}</p>
            <button onClick={() => setQrModal({ isOpen: false, matricula: '', nombre: '' })} style={{ ...primaryModalButtonStyle, width: '100%', marginTop: '18px' }}>Cerrar</button>
          </div>
        </div>
      )}

      {recordModal.isOpen && recordModal.fighter && (
        <FighterProfile
          fighter={recordModal.fighter}
          userRole={userRole}
          onFighterUpdated={handleFighterUpdated}
          onClose={() => setRecordModal({ isOpen: false, fighter: null })}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        .spin { animation: spin 1s linear infinite; color: ${PALETTE.orange}; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function Modal({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      {children}
    </div>
  );
}

const cardStyle = { maxWidth: '1000px', margin: '0 auto', backgroundColor: PALETTE.white, padding: '15px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' };
const searchInputStyle = { padding: '8px 10px 8px 30px', width: '200px', borderRadius: '6px', border: `1px solid ${PALETTE.grayBorder}`, outline: 'none', fontSize: '0.85rem', backgroundColor: '#fcfcfc' };
const helperTextStyle = { fontSize: '0.9rem', color: PALETTE.grayText, padding: '10px 0' };
const avatarStyle = { width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#eee', overflow: 'hidden', flexShrink: 0 };
const avatarPlaceholderStyle = { textAlign: 'center', lineHeight: '30px', color: '#aaa', fontSize: '0.7rem' };
const rowButtonStyle = { width: '30px', height: '30px', border: 'none', borderRadius: '7px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const detailPanelStyle = { padding: '10px 10px 14px 43px', backgroundColor: '#fdfdfd', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px', borderLeft: `2px solid ${PALETTE.orange}`, animation: 'slideDown 0.15s', fontSize: '0.8rem', alignItems: 'start' };
const detailStyle = { margin: '0 0 4px 0', color: '#555', lineHeight: 1.35 };
const membershipBoxStyle = { backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: `1px solid ${PALETTE.grayBorder}` };
const profileColumnStyle = { minWidth: 0 };
const smallButtonStyle = { padding: '4px 8px', backgroundColor: '#f4f4f5', color: PALETTE.dark, border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' };
const paginationStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '15px', paddingTop: '10px', borderTop: `1px solid ${PALETTE.grayBorder}` };
const modalBoxStyle = { backgroundColor: PALETTE.white, padding: '20px', borderRadius: '10px', width: '90%', maxWidth: '360px' };
const modalTitleStyle = { margin: '0 0 15px 0', color: PALETTE.dark, borderBottom: `2px solid ${PALETTE.orange}`, paddingBottom: '8px', fontSize: '1rem' };
const labelStyle = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: PALETTE.dark, marginBottom: '4px', marginTop: '10px', textTransform: 'uppercase' };
const inputStyle = { width: '100%', padding: '9px 10px', border: `1px solid ${PALETTE.grayBorder}`, borderRadius: '6px', fontSize: '0.85rem', outline: 'none', backgroundColor: '#fcfcfc', boxSizing: 'border-box' };
const modalActionsStyle = { display: 'flex', gap: '8px', marginTop: '20px' };
const primaryModalButtonStyle = { padding: '10px 12px', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem', flex: 1, backgroundColor: PALETTE.dark, color: '#fff' };
const secondaryModalButtonStyle = { padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.84rem', flex: 1, backgroundColor: '#fff', color: PALETTE.dark };
const qrOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, animation: 'fadeIn 0.2s', cursor: 'pointer' };
const qrBoxStyle = { backgroundColor: PALETTE.white, padding: '28px', borderRadius: '15px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', width: '90%', maxWidth: '350px' };

const paginationBtnStyle = (disabled) => ({
  padding: '6px 10px',
  backgroundColor: disabled ? '#f5f5f5' : PALETTE.dark,
  color: disabled ? '#ccc' : PALETTE.white,
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '0.9rem',
  display: 'flex',
  alignItems: 'center',
});
