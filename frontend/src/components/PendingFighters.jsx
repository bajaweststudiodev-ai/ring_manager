import React, { useEffect, useMemo, useState } from 'react';
import { FiCheckCircle, FiClock, FiDollarSign, FiRefreshCw, FiSearch } from 'react-icons/fi';
import { fetchApi } from '../config/api';
import {
  addFighterFull,
  addPayment,
  db,
  getFighterDisplayName,
  normalizeFighterRecord,
} from '../db/db';

const TARIFAS = {
  MENSUALIDAD: 650,
  INSCRIPCION: 150,
  PROPORCIONAL: 350,
  DOS_SEMANAS: 500,
  SEMANA: 250,
  VISITA: 100,
};

const PALETTE = {
  orange: '#FF7F27',
  white: '#fff',
  dark: '#2d2e30',
  grayBg: '#fafafa',
  grayBorder: '#e5e7eb',
  grayText: '#667085',
  green: '#16a34a',
  red: '#b42318',
};

export function PendingFighters() {
  const [fighters, setFighters] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [paymentModal, setPaymentModal] = useState({ isOpen: false, fighter: null, saving: false });
  const [pagoForm, setPagoForm] = useState({ tipo_pago: 'MENSUALIDAD + INSCRIPCION', monto: 800, metodo_pago: 'EFECTIVO' });

  useEffect(() => {
    cargarPendientes();
  }, []);

  const fightersFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return fighters;
    }

    return fighters.filter((fighter) => {
      const nombre = getFighterDisplayName(fighter).toLowerCase();
      const matricula = (fighter.matricula || '').toLowerCase();
      return nombre.includes(term) || matricula.includes(term);
    });
  }, [fighters, search]);

  const cargarPendientes = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await fetchApi('/api/peleadores/pendientes');
      const result = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(result.message || 'No pude obtener los registros pendientes.');
      }

      const normalized = Array.isArray(result)
        ? result.map((fighter) => normalizeFighterRecord({ ...fighter, estado: fighter.estado || 'PENDIENTE' }))
        : [];

      setFighters(normalized);
    } catch (error) {
      console.error('No pude cargar los pendientes:', error);
      setErrorMessage(error.message || 'No pude cargar los pendientes.');
    } finally {
      setIsLoading(false);
    }
  };

  const abrirModalCobro = (fighter) => {
    const tipoSugerido = fighter.tipo_pago_sugerido || fighter.tipoMembresia || 'MENSUALIDAD + INSCRIPCION';
    let monto = TARIFAS.MENSUALIDAD;

    switch (tipoSugerido) {
      case 'MENSUALIDAD + INSCRIPCION':
        monto = TARIFAS.MENSUALIDAD + TARIFAS.INSCRIPCION;
        break;
      case 'PROPORCIONAL + INSCRIPCION':
        monto = TARIFAS.PROPORCIONAL + TARIFAS.INSCRIPCION;
        break;
      case 'DOS SEMANAS':
        monto = TARIFAS.DOS_SEMANAS;
        break;
      case 'SEMANA':
        monto = TARIFAS.SEMANA;
        break;
      case 'VISITA':
        monto = TARIFAS.VISITA;
        break;
      default:
        monto = TARIFAS.MENSUALIDAD;
        break;
    }

    setPagoForm({
      tipo_pago: tipoSugerido,
      monto,
      metodo_pago: 'EFECTIVO',
    });
    setPaymentModal({ isOpen: true, fighter, saving: false });
  };

  const handleCambioConcepto = (event) => {
    const tipo_pago = event.target.value;
    let monto = TARIFAS.MENSUALIDAD;

    switch (tipo_pago) {
      case 'MENSUALIDAD + INSCRIPCION':
        monto = TARIFAS.MENSUALIDAD + TARIFAS.INSCRIPCION;
        break;
      case 'PROPORCIONAL + INSCRIPCION':
        monto = TARIFAS.PROPORCIONAL + TARIFAS.INSCRIPCION;
        break;
      case 'DOS SEMANAS':
        monto = TARIFAS.DOS_SEMANAS;
        break;
      case 'SEMANA':
        monto = TARIFAS.SEMANA;
        break;
      case 'VISITA':
        monto = TARIFAS.VISITA;
        break;
      default:
        monto = TARIFAS.MENSUALIDAD;
        break;
    }

    setPagoForm((prev) => ({ ...prev, tipo_pago, monto }));
  };

  const guardarPeleadorLocal = async (fighter) => {
    const normalized = normalizeFighterRecord({ ...fighter, estado: 'ACTIVO' });
    const existente = await db.fighters.where('matricula').equals(normalized.matricula).first();

    if (existente?.id) {
      await db.fighters.update(existente.id, {
        ...normalized,
        estado: 'ACTIVO',
        synced: 1,
      });
      return;
    }

    await addFighterFull({
      ...normalized,
      estado: 'ACTIVO',
      synced: 1,
    });
  };

  const handleAprobarYCobrar = async () => {
    if (!paymentModal.fighter?.matricula) {
      return;
    }

    if (!pagoForm.monto || Number.isNaN(Number(pagoForm.monto))) {
      alert('Ingresa un monto valido.');
      return;
    }

    setPaymentModal((prev) => ({ ...prev, saving: true }));
    setFeedbackMessage('');

    try {
      const matricula = paymentModal.fighter.matricula;

      const aprobarResponse = await fetchApi(`/api/peleadores/aprobar/${encodeURIComponent(matricula)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      });
      const aprobarResult = await aprobarResponse.json().catch(() => ({}));

      if (!aprobarResponse.ok) {
        throw new Error(aprobarResult.message || 'No pude aprobar el registro.');
      }

      const fighterAprobado = normalizeFighterRecord({
        ...paymentModal.fighter,
        ...(aprobarResult.peleador || {}),
        estado: 'ACTIVO',
      });

      const payloadPago = {
        peleador_matricula: matricula,
        tipo_pago: pagoForm.tipo_pago,
        monto: parseFloat(pagoForm.monto),
        metodo_pago: pagoForm.metodo_pago,
      };

      const pagoResponse = await fetchApi('/api/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadPago),
      });
      const pagoResult = await pagoResponse.json().catch(() => ({}));

      if (!pagoResponse.ok) {
        throw new Error(pagoResult.message || 'No pude registrar el pago.');
      }

      await guardarPeleadorLocal(fighterAprobado);
      await addPayment(fighterAprobado, pagoForm.tipo_pago, parseFloat(pagoForm.monto), pagoForm.metodo_pago);

      setFighters((prev) => prev.filter((fighter) => fighter.matricula !== matricula));
      setPaymentModal({ isOpen: false, fighter: null, saving: false });
      setFeedbackMessage(`Registro aprobado y cobrado para ${getFighterDisplayName(fighterAprobado)}.`);
    } catch (error) {
      console.error('No pude aprobar y cobrar:', error);
      alert(error.message || 'Ocurrio un error al aprobar y cobrar.');
      setPaymentModal((prev) => ({ ...prev, saving: false }));
    }
  };

  return (
    <div style={{ padding: '2vh 2vw', backgroundColor: PALETTE.grayBg, minHeight: '80vh', color: PALETTE.dark }}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>REGISTROS PENDIENTES</h2>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.84rem', color: PALETTE.grayText }}>
              Revisa solicitudes desde QR y activa al peleador cuando quede cobrado.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <FiSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: PALETTE.grayText, fontSize: '0.85rem' }} />
              <input
                type="text"
                placeholder="Buscar"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={searchInputStyle}
              />
            </div>
            <button onClick={cargarPendientes} style={ghostButtonStyle}>
              <FiRefreshCw size={14} /> Actualizar
            </button>
          </div>
        </div>

        {feedbackMessage && <div style={successBoxStyle}>{feedbackMessage}</div>}
        {isLoading && <p style={helperTextStyle}>Cargando registros pendientes...</p>}
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
                      <img src={fighter.foto_path} alt={getFighterDisplayName(fighter)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                  <button onClick={() => abrirModalCobro(fighter)} style={primaryButtonStyle}>
                    <FiDollarSign size={14} /> Aprobar y cobrar
                  </button>
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
              <option value="MENSUALIDAD">MENSUALIDAD</option>
              <option value="MENSUALIDAD + INSCRIPCION">MENSUALIDAD + INSCRIPCION</option>
              <option value="PROPORCIONAL + INSCRIPCION">PROPORCIONAL + INSCRIPCION</option>
              <option value="DOS SEMANAS">DOS SEMANAS</option>
              <option value="SEMANA">SEMANA</option>
              <option value="VISITA">VISITA</option>
            </select>

            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Metodo</label>
                <select
                  value={pagoForm.metodo_pago}
                  onChange={(event) => setPagoForm((prev) => ({ ...prev, metodo_pago: event.target.value }))}
                  style={inputStyle}
                >
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="TARJETA">TARJETA</option>
                  <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Monto</label>
                <input
                  type="number"
                  value={pagoForm.monto}
                  onChange={(event) => setPagoForm((prev) => ({ ...prev, monto: event.target.value }))}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={modalActionsStyle}>
              <button
                onClick={() => setPaymentModal({ isOpen: false, fighter: null, saving: false })}
                style={secondaryButtonStyle}
              >
                Cancelar
              </button>
              <button onClick={handleAprobarYCobrar} disabled={paymentModal.saving} style={primaryButtonStyle}>
                {paymentModal.saving ? 'Guardando...' : 'Confirmar'}
              </button>
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

const cardStyle = {
  maxWidth: '980px',
  margin: '0 auto',
  backgroundColor: PALETTE.white,
  padding: '18px',
  borderRadius: '12px',
  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)',
  border: `1px solid ${PALETTE.grayBorder}`,
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
  marginBottom: '16px',
};

const rowCardStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  padding: '14px',
  borderRadius: '10px',
  border: `1px solid ${PALETTE.grayBorder}`,
  backgroundColor: '#fcfcfd',
  flexWrap: 'wrap',
};

const avatarStyle = {
  width: '42px',
  height: '42px',
  borderRadius: '10px',
  backgroundColor: '#f4f4f5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
};

const badgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: '999px',
  border: '1px solid #fed7aa',
  backgroundColor: '#fff7ed',
  color: '#9a3412',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.3px',
};

const searchInputStyle = {
  padding: '8px 10px 8px 30px',
  width: '200px',
  borderRadius: '8px',
  border: `1px solid ${PALETTE.grayBorder}`,
  outline: 'none',
  fontSize: '0.84rem',
  backgroundColor: '#fff',
};

const helperTextStyle = {
  fontSize: '0.9rem',
  color: PALETTE.grayText,
  padding: '10px 0',
};

const successBoxStyle = {
  padding: '12px 14px',
  borderRadius: '8px',
  marginBottom: '16px',
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
  color: '#166534',
  fontSize: '0.86rem',
};

const emptyStateStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '18px 0 6px 0',
  color: PALETTE.grayText,
  fontSize: '0.9rem',
};

const ghostButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderRadius: '8px',
  border: `1px solid ${PALETTE.grayBorder}`,
  backgroundColor: '#fff',
  color: PALETTE.dark,
  fontSize: '0.84rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: PALETTE.dark,
  color: '#fff',
  fontSize: '0.84rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: `1px solid ${PALETTE.grayBorder}`,
  backgroundColor: '#fff',
  color: PALETTE.dark,
  fontSize: '0.84rem',
  fontWeight: 600,
  cursor: 'pointer',
  flex: 1,
};

const modalBoxStyle = {
  backgroundColor: '#fff',
  width: '100%',
  maxWidth: '360px',
  borderRadius: '12px',
  padding: '18px',
  border: `1px solid ${PALETTE.grayBorder}`,
  boxShadow: '0 18px 36px rgba(15, 23, 42, 0.16)',
};

const modalTitleStyle = {
  margin: '0 0 14px 0',
  fontSize: '1rem',
  color: PALETTE.dark,
};

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  marginTop: '10px',
  fontSize: '0.74rem',
  fontWeight: 700,
  color: PALETTE.dark,
  textTransform: 'uppercase',
};

const inputStyle = {
  width: '100%',
  padding: '9px 10px',
  borderRadius: '8px',
  border: `1px solid ${PALETTE.grayBorder}`,
  backgroundColor: '#fff',
  fontSize: '0.85rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const modalActionsStyle = {
  display: 'flex',
  gap: '8px',
  marginTop: '18px',
};
