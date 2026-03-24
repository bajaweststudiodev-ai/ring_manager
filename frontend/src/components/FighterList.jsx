import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
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
import {
  addPayment,
  db,
  getFighterDisplayName,
  normalizeFighterRecord,
  normalizePaymentRecord,
} from '../db/db';
import { apiUrl } from '../config/api';
import { checkAccess } from '../logic/rules';

const API_URL = apiUrl('/api/pagos');

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

const TARIFAS = {
  MENSUALIDAD: 650,
  INSCRIPCION: 150,
  PROPORCIONAL: 350,
  DOS_SEMANAS: 500,
  SEMANA: 250,
  VISITA: 100,
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
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, nombre: '' });
  const [paymentModal, setPaymentModal] = useState({ isOpen: false, fighter: null, saving: false });
  const [pagoForm, setPagoForm] = useState({ tipo_pago: 'MENSUALIDAD', monto: 650, metodo_pago: 'EFECTIVO' });
  const [qrModal, setQrModal] = useState({ isOpen: false, matricula: '', nombre: '' });
  const itemsPerPage = 12;

  useEffect(() => {
    loadFighters();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const loadFighters = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const allFighters = (await db.fighters.toArray())
        .map(normalizeFighterRecord)
        .sort((a, b) => getFighterDisplayName(a).localeCompare(getFighterDisplayName(b)));

      const fightersConEstado = await Promise.all(allFighters.map(async (fighter) => {
        const lastPayment = normalizePaymentRecord(
          await db.payments.where('peleador_matricula').equals(fighter.matricula).last()
          || await db.payments.where('matricula').equals(fighter.matricula).last()
        );
        const result = checkAccess(lastPayment.tipo_pago ? {
          date: lastPayment.fecha_pago,
          type: lastPayment.tipo_pago,
          amount: lastPayment.monto,
          method: lastPayment.metodo_pago,
        } : null);
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
    const payment = normalizePaymentRecord(
      await db.payments.where('peleador_matricula').equals(matricula).last()
      || await db.payments.where('matricula').equals(matricula).last()
    );
    const result = payment.tipo_pago ? checkAccess({
      date: payment.fecha_pago,
      type: payment.tipo_pago,
      amount: payment.monto,
      method: payment.metodo_pago,
    }) : null;
    setMembresiaStatus(result);
  };

  const abrirModalPago = (fighter) => {
    const tipoSugerido = fighter.tipo_pago_sugerido || fighter.tipoMembresia || 'MENSUALIDAD + INSCRIPCION';
    let montoSugerido = TARIFAS.MENSUALIDAD;

    switch (tipoSugerido) {
      case 'MENSUALIDAD':
        montoSugerido = TARIFAS.MENSUALIDAD;
        break;
      case 'MENSUALIDAD + INSCRIPCION':
        montoSugerido = TARIFAS.MENSUALIDAD + TARIFAS.INSCRIPCION;
        break;
      case 'PROPORCIONAL + INSCRIPCION':
        montoSugerido = TARIFAS.PROPORCIONAL + TARIFAS.INSCRIPCION;
        break;
      case 'DOS SEMANAS':
        montoSugerido = TARIFAS.DOS_SEMANAS;
        break;
      case 'SEMANA':
        montoSugerido = TARIFAS.SEMANA;
        break;
      case 'VISITA':
        montoSugerido = TARIFAS.VISITA;
        break;
    }

    setPaymentModal({ isOpen: true, fighter, saving: false });
    setPagoForm({ tipo_pago: tipoSugerido, monto: montoSugerido, metodo_pago: 'EFECTIVO' });
  };

  const handleCambioConcepto = (e) => {
    const tipo_pago = e.target.value;
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
    }

    setPagoForm((prev) => ({ ...prev, tipo_pago, monto }));
  };

  const handleGuardarPago = async () => {
    if (!paymentModal.fighter?.matricula) return;
    if (!pagoForm.monto || Number.isNaN(Number(pagoForm.monto))) {
      alert('Ingresa un monto valido.');
      return;
    }

    setPaymentModal((prev) => ({ ...prev, saving: true }));
    try {
      const payloadPago = {
        peleador_matricula: paymentModal.fighter.matricula,
        tipo_pago: pagoForm.tipo_pago,
        monto: parseFloat(pagoForm.monto),
        metodo_pago: pagoForm.metodo_pago,
      };

      let pagoSincronizado = 0;
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadPago),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.message || 'No pude registrar el pago en el servidor.');
        }
        pagoSincronizado = 1;
      } catch (error) {
        console.warn('No pude sincronizar el pago con Flask.', error);
      }

      await addPayment(paymentModal.fighter, pagoForm.tipo_pago, parseFloat(pagoForm.monto), pagoForm.metodo_pago);

      const ultimoPago = await db.payments.orderBy('id').last();
      if (ultimoPago) {
        await db.payments.update(ultimoPago.id, { synced: pagoSincronizado });
      }

      setPaymentModal({ isOpen: false, fighter: null, saving: false });
      await loadFighters();

      if (expandedId === paymentModal.fighter.matricula) {
        setMembresiaStatus(checkAccess({
          date: new Date().toISOString(),
          type: pagoForm.tipo_pago,
          amount: parseFloat(pagoForm.monto),
          method: pagoForm.metodo_pago,
        }));
      }
    } catch (error) {
      console.error('No pude guardar el pago:', error);
      alert(error.message || 'Ocurrio un error al registrar el pago.');
      setPaymentModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const pedirConfirmacionBorrado = (id, nombre) => {
    setDeleteModal({ isOpen: true, id, nombre });
  };

  const ejecutarBorrado = async () => {
    try {
      await db.fighters.delete(deleteModal.id);
      setExpandedId(null);
      setDeleteModal({ isOpen: false, id: null, nombre: '' });
      await loadFighters();
    } catch (error) {
      console.error('No pude borrar el peleador:', error);
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
    try {
      await db.fighters.update(editModal.fighter.id, {
        nombre: editForm.nombre,
        apellido_paterno: editForm.apellido_paterno,
        apellido_materno: editForm.apellido_materno,
        telefono: editForm.telefono,
      });
      setEditModal({ isOpen: false, fighter: null });
      await loadFighters();
    } catch (error) {
      alert('No pude editar el registro.');
    }
  };

  const filteredFighters = fighters.filter((fighter) => {
    const nombre = getFighterDisplayName(fighter).toLowerCase();
    return nombre.includes(search.toLowerCase()) || fighter.matricula.toLowerCase().includes(search.toLowerCase());
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredFighters.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredFighters.length / itemsPerPage);

  return (
    <div style={{ padding: '2vh 2vw', backgroundColor: PALETTE.grayBg, minHeight: '80vh', color: PALETTE.dark }}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h2 style={{ color: PALETTE.dark, margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>PELEADORES ({fighters.length})</h2>
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

        {isLoading && <p style={helperTextStyle}>Cargando peleadores...</p>}
        {errorMessage && <p style={{ ...helperTextStyle, color: PALETTE.red }}>{errorMessage}</p>}

        {!isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {currentItems.map((fighter) => {
              const nombreCompleto = getFighterDisplayName(fighter);
              return (
                <div key={fighter.matricula} style={{ borderBottom: `1px solid ${PALETTE.grayBorder}` }}>
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
                          {fighter.foto_path ? <img src={fighter.foto_path} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={nombreCompleto} /> : <div style={avatarPlaceholderStyle}>?</div>}
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
                        <button onClick={() => pedirConfirmacionBorrado(fighter.id, nombreCompleto)} style={{ ...rowButtonStyle, backgroundColor: '#fef2f2', color: PALETTE.red }} title="Borrar">
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <p style={{ margin: 0, fontWeight: 700, color: PALETTE.dark, textTransform: 'uppercase', fontSize: '0.72rem' }}>Detalle de membresia</p>
                          {fighter.hasAccess && (
                            <button onClick={() => setQrModal({ isOpen: true, matricula: fighter.matricula, nombre: nombreCompleto })} style={smallButtonStyle}>
                              <FiMaximize size={13} /> Ver QR
                            </button>
                          )}
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
                                <span style={{ color: PALETTE.grayText }}>Vencimiento:</span> {new Date(membresiaStatus.expiration).toLocaleDateString()}
                              </p>
                            )}
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
            <input type="text" value={editForm.telefono} onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })} style={inputStyle} />
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
              <option value="MENSUALIDAD">MENSUALIDAD</option>
              <option value="MENSUALIDAD + INSCRIPCION">MENSUALIDAD + INSCRIPCION</option>
              <option value="PROPORCIONAL + INSCRIPCION">PROPORCIONAL + INSCRIPCION</option>
              <option value="DOS SEMANAS">DOS SEMANAS</option>
              <option value="SEMANA">SEMANA</option>
              <option value="VISITA">VISITA</option>
            </select>

            <div style={{ display: 'flex', gap: '12px', marginTop: '14px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Metodo</label>
                <select value={pagoForm.metodo_pago} onChange={(e) => setPagoForm({ ...pagoForm, metodo_pago: e.target.value })} style={inputStyle}>
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="TARJETA">TARJETA</option>
                  <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Monto</label>
                <input type="number" value={pagoForm.monto} onChange={(e) => setPagoForm({ ...pagoForm, monto: e.target.value })} style={inputStyle} />
              </div>
            </div>

            <div style={modalActionsStyle}>
              <button onClick={() => setPaymentModal({ isOpen: false, fighter: null, saving: false })} style={secondaryModalButtonStyle}>Cancelar</button>
              <button onClick={handleGuardarPago} disabled={paymentModal.saving} style={primaryModalButtonStyle}>
                {paymentModal.saving ? 'Guardando...' : 'Guardar pago'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteModal.isOpen && (
        <Modal>
          <div style={{ ...modalBoxStyle, textAlign: 'center' }}>
            <FiAlertTriangle size={40} color={PALETTE.red} style={{ marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 10px 0', color: PALETTE.dark, fontSize: '1.1rem' }}>Confirmar eliminacion</h3>
            <p style={{ margin: '0 0 18px 0', color: PALETTE.grayText, fontSize: '0.9rem', lineHeight: 1.4 }}>
              Vas a eliminar permanentemente a <strong style={{ color: PALETTE.dark }}>{deleteModal.nombre}</strong>.
            </p>
            <div style={modalActionsStyle}>
              <button onClick={() => setDeleteModal({ isOpen: false, id: null, nombre: '' })} style={secondaryModalButtonStyle}>Cancelar</button>
              <button onClick={ejecutarBorrado} style={{ ...primaryModalButtonStyle, backgroundColor: PALETTE.red }}>Eliminar</button>
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
const detailPanelStyle = { padding: '10px 10px 14px 43px', backgroundColor: '#fdfdfd', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px', borderLeft: `2px solid ${PALETTE.orange}`, animation: 'slideDown 0.15s', fontSize: '0.8rem' };
const detailStyle = { margin: '0 0 4px 0', color: '#555', lineHeight: 1.35 };
const membershipBoxStyle = { backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: `1px solid ${PALETTE.grayBorder}` };
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
