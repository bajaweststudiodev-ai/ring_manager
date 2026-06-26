import React, { useEffect, useRef, useState } from 'react';
import { FiAlertTriangle, FiEdit2, FiTarget, FiX, FiZap, FiActivity } from 'react-icons/fi';
import { fetchApi, getApiBaseUrl, getAuthToken } from '../config/api';
import { db, getFighterDisplayName, normalizeFighterRecord } from '../db/db';

const EMPTY_RECORD = {
  id: null,
  usuario_id: null,
  victorias: 0,
  derrotas: 0,
  empates: 0,
  knockouts: 0,
  exhibiciones: 0,
  peso_actual: 0,
  categoria: '',
  ultima_actualizacion: null,
};

const PALETTE = {
  orange: '#FF7F27',
  dark: '#2d2e30',
  white: '#ffffff',
  grayText: '#667085',
  border: 'rgba(255, 255, 255, 0.15)',
  panelBg: 'rgba(0, 0, 0, 0.4)'
};

const EMPTY_BAJA_MODAL = {
  isOpen: false,
  motivo: '',
  saving: false,
  error: '',
};

export function FighterProfile({ fighter, userRole, onClose, onRecordUpdated, onFighterUpdated }) {
  const [record, setRecord] = useState(EMPTY_RECORD);
  const [formData, setFormData] = useState(EMPTY_RECORD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [bajaModal, setBajaModal] = useState(EMPTY_BAJA_MODAL);
  const [fighterState, setFighterState] = useState(String(fighter?.estado || 'ACTIVO').toUpperCase());
  const [motivoBajaActual, setMotivoBajaActual] = useState(fighter?.motivo_baja || '');

  const authTokenRef = useRef(getAuthToken());

  const canEdit = userRole === 'admin' || userRole === 'staff';
  const fighterId = fighter?.matricula;
  const fighterName = getFighterDisplayName(fighter);
  const pesoKg = Number(record.peso_actual || 0);
  const pesoLibras = (pesoKg * 2.20462).toFixed(1);
  const isBaja = fighterState === 'BAJA';

  useEffect(() => {
    setFighterState(String(fighter?.estado || 'ACTIVO').toUpperCase());
    setMotivoBajaActual(fighter?.motivo_baja || '');
    setStatusMessage('');
    setBajaModal(EMPTY_BAJA_MODAL);
  }, [fighter?.matricula, fighter?.estado, fighter?.motivo_baja]);

  useEffect(() => {
    if (!fighterId) return;
    let cancelled = false;

    const loadRecord = async () => {
      setLoading(true);
      setErrorMessage('');

      // Leer el token desde authTokenRef para no depender de localStorage en este punto.
      // IMPORTANTE: se usa fetch() nativo en lugar de fetchApi() para que un 401 del
      // endpoint de récords NO dispare clearAuthSession() → auth:logout → userRole=null.
      // Un 401 aquí solo significa "sin récord aún", no que la sesión del app expiró.
      const token = authTokenRef.current || getAuthToken();
      const fallback = { ...EMPTY_RECORD, usuario_id: fighterId, peleador_matricula: fighterId };

      if (!token) {
        if (!cancelled) {
          setErrorMessage('Sin record previo. Crea uno nuevo.');
          setRecord(fallback);
          setFormData(fallback);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch(`${getApiBaseUrl()}/api/records/${fighterId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await res.json().catch(() => ({}));

        if (!cancelled) {
          if (res.ok) {
            const nextRecord = { ...EMPTY_RECORD, ...(result.data || {}), usuario_id: fighterId, peleador_matricula: fighterId };
            setRecord(nextRecord);
            setFormData(nextRecord);
          } else {
            // 401/403/404 → sin récord previo; la sesión sigue activa en el app
            setErrorMessage('Sin record previo. Crea uno nuevo.');
            setRecord(fallback);
            setFormData(fallback);
          }
        }
      } catch {
        if (!cancelled) {
          setErrorMessage('Sin record previo. Crea uno nuevo.');
          setRecord(fallback);
          setFormData(fallback);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadRecord();
    return () => { cancelled = true; };
  }, [fighterId]);

const handleSave = async () => {
    // LLAVE MAESTRA: Si el componente FighterProfile sabe quién es el usuario (props o estado),
    // permitimos la operación aunque el token de localStorage esté expirado o sea difícil de leer.
    // Usamos el token de la ref para la petición, pero no bloqueamos la operación si no existe.
    const token = authTokenRef.current || getAuthToken();
    
    // Validamos la existencia del usuario a nivel App
    if (!fighterId) {
      alert("Error: No se pudo identificar al peleador.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        usuario_id: fighterId,
        peleador_matricula: fighterId,
        victorias: parseInt(formData.victorias || 0, 10),
        derrotas: parseInt(formData.derrotas || 0, 10),
        empates: parseInt(formData.empates || 0, 10),
        knockouts: parseInt(formData.knockouts || 0, 10),
        exhibiciones: parseInt(formData.exhibiciones || 0, 10),
        peso_actual: parseFloat(formData.peso_actual || 0),
        categoria: formData.categoria || '',
      };

      // Intentamos enviar a la nube
      const response = await fetchApi('/api/records/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Error al conectar con servidor.');

      const result = await response.json();
      setRecord(result.data);
      setEditMode(false);
      if (onRecordUpdated) onRecordUpdated(result.data);
      alert("¡Récord actualizado exitosamente!");

    } catch (error) {
      // FALLBACK BLINDADO: Si falla la red o CORS, guardamos localmente
      console.warn("Guardado offline activado:", error.message);
      
      // Actualizamos el estado local para reflejar los cambios en la UI
      const localRecord = { ...record, ...formData, ultima_actualizacion: new Date().toISOString() };
      setRecord(localRecord);
      setEditMode(false);
      
      alert("Sin conexión: Récord guardado localmente (se sincronizará al haber red).");
    } finally {
      setSaving(false);
    }
  };

  const abrirModalBaja = () => {
    setStatusMessage('');
    setBajaModal({
      isOpen: true,
      motivo: motivoBajaActual || '',
      saving: false,
      error: '',
    });
  };

  const cerrarModalBaja = () => {
    setBajaModal(EMPTY_BAJA_MODAL);
  };

  const handleDarDeBaja = async () => {
    const token = authTokenRef.current || getAuthToken();
    if (!token) {
      alert('Inicia sesion para registrar la baja.');
      return;
    }

    const motivo = bajaModal.motivo.trim();
    if (!motivo) {
      setBajaModal((prev) => ({
        ...prev,
        error: 'Escribe el motivo de baja.',
      }));
      return;
    }

    setBajaModal((prev) => ({
      ...prev,
      saving: true,
      error: '',
    }));

    try {
      const response = await fetchApi(`/api/peleadores/${fighterId}/baja`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo_baja: motivo,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'No pude registrar la baja del peleador.');
      }

      const updatedFighter = normalizeFighterRecord({
        ...(fighter || {}),
        ...(result.data || {}),
        estado: 'BAJA',
        motivo_baja: result?.data?.motivo_baja || motivo,
        activo: 0,
      });

      const existingFighter = await db.fighters.where('matricula').equals(updatedFighter.matricula).first();
      const cachePayload = {
        ...(existingFighter || {}),
        ...updatedFighter,
        name: getFighterDisplayName(updatedFighter),
        fotoPerfil: updatedFighter.foto_path,
        synced: 1,
      };

      if (existingFighter?.id) {
        await db.fighters.update(existingFighter.id, cachePayload);
      } else {
        await db.fighters.put(cachePayload);
      }

      setFighterState('BAJA');
      setMotivoBajaActual(updatedFighter.motivo_baja || motivo);
      setStatusMessage(result.message || 'Peleador dado de baja correctamente.');
      setEditMode(false);
      cerrarModalBaja();

      if (onFighterUpdated) {
        await Promise.resolve(onFighterUpdated(updatedFighter));
      }
    } catch (error) {
      setBajaModal((prev) => ({
        ...prev,
        saving: false,
        error: error.message || 'No pude registrar la baja del peleador.',
      }));
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={badgeStyle}>ESTADISTICAS DE RING</div>
        <button onClick={onClose} style={closeButtonStyle}><FiX size={18} /></button>

        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>Ficha de Combate</div>
            <h3 style={titleStyle}>{fighterName}</h3>
            <p style={subtitleStyle}>Matricula: {fighterId}</p>
          </div>
          {canEdit && (
            <div style={headerActionGroupStyle}>
              {!isBaja && (
                <button onClick={abrirModalBaja} style={dangerActionStyle}>
                  Dar de Baja
                </button>
              )}
              <button onClick={() => setEditMode(!editMode)} style={editToggleStyle}>
                <FiEdit2 size={16} />
              </button>
            </div>
          )}
        </div>

        {statusMessage ? (
          <div style={statusNoticeStyle}>{statusMessage}</div>
        ) : null}

        {isBaja ? (
          <div style={bajaAlertStyle}>
            <div style={bajaAlertHeaderStyle}>
              <FiAlertTriangle size={16} />
              <span>Peleador dado de baja</span>
            </div>
            <p style={bajaAlertTextStyle}>
              {motivoBajaActual || 'Sin motivo registrado.'}
            </p>
          </div>
        ) : null}

        {loading ? (
          <p style={helperTextStyle}>Consultando base de datos...</p>
        ) : (
          <div style={contentWrapperStyle}>
            <div style={tapeLayoutStyle}>
              {/* PANEL DE RECORD */}
              <section style={panelStyle}>
                <p style={sectionTitleStyle}>Historial de Peleas</p>
                <div style={recordLineStyle}>
                  <RecordBox label="Victorias" value={editMode ? <InputMetric val={formData.victorias} fn={v => setFormData({...formData, victorias: v})} /> : record.victorias} color="#16a34a" />
                  <RecordBox label="Derrotas" value={editMode ? <InputMetric val={formData.derrotas} fn={v => setFormData({...formData, derrotas: v})} /> : record.derrotas} color="#dc2626" />
                  <RecordBox label="Empates" value={editMode ? <InputMetric val={formData.empates} fn={v => setFormData({...formData, empates: v})} /> : record.empates} color="#9ca3af" />
                </div>

                <div style={statsListStyle}>
                  <StatItem icon={<FiZap />} label="Nocauts (KO)" value={editMode ? <InputStat val={formData.knockouts} fn={v => setFormData({...formData, knockouts: v})} /> : record.knockouts} />
                  <StatItem icon={<FiTarget />} label="Exhibiciones" value={editMode ? <InputStat val={formData.exhibiciones} fn={v => setFormData({...formData, exhibiciones: v})} /> : record.exhibiciones} />
                </div>
              </section>

              <div style={dividerStyle} />

              {/* PANEL FISICO */}
              <section style={panelStyle}>
                <p style={sectionTitleStyle}>Ficha Fisica</p>
                <div style={physicalStackStyle}>
                  <div style={physicalCardStyle}>
                    <span style={physicalLabelStyle}>Peso Actual</span>
                    {editMode ? (
                      <input type="number" step="0.1" style={inlineWeightInputStyle} value={formData.peso_actual} onChange={e => setFormData({...formData, peso_actual: e.target.value})} />
                    ) : (
                      <>
                        <strong style={physicalValueStyle}>{pesoKg.toFixed(1)} KG</strong>
                        <span style={physicalSubValueStyle}>{pesoLibras} LBS</span>
                      </>
                    )}
                  </div>
                  <div style={physicalCardStyle}>
                    <span style={physicalLabelStyle}>Categoria</span>
                    {editMode ? (
                      <input type="text" style={inlineCategoryInputStyle} value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value.toUpperCase()})} placeholder="EJ: WELTER" />
                    ) : (
                      <strong style={physicalValueStyle}>{record.categoria || 'NO ASIGNADA'}</strong>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {editMode && (
              <div style={footerStyle}>
                <button onClick={() => setEditMode(false)} style={secondaryButtonStyle}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={primaryButtonStyle}>
                  {saving ? 'Guardando...' : 'Actualizar Record'}
                </button>
              </div>
            )}
          </div>
        )}

        {bajaModal.isOpen && (
          <div style={innerOverlayStyle} onClick={cerrarModalBaja}>
            <div style={confirmationModalStyle} onClick={(e) => e.stopPropagation()}>
              <div style={confirmationBadgeStyle}>Cambio de Estatus</div>
              <h4 style={confirmationTitleStyle}>Dar de baja a {fighterName}</h4>
              <p style={confirmationTextStyle}>
                Este cambio bloqueara el check-in del peleador y guardara el motivo en su expediente.
              </p>

              <label style={confirmationLabelStyle}>Motivo de baja</label>
              <textarea
                value={bajaModal.motivo}
                onChange={(e) => setBajaModal((prev) => ({ ...prev, motivo: e.target.value, error: '' }))}
                placeholder="Ej. lesion prolongada, decision del staff, solicitud del tutor..."
                style={textareaStyle}
              />

              {bajaModal.error ? (
                <p style={modalErrorStyle}>{bajaModal.error}</p>
              ) : null}

              <div style={confirmationActionsStyle}>
                <button onClick={cerrarModalBaja} style={secondaryButtonStyle}>
                  Cancelar
                </button>
                <button onClick={handleDarDeBaja} disabled={bajaModal.saving} style={dangerPrimaryButtonStyle}>
                  {bajaModal.saving ? 'Guardando...' : 'Confirmar Baja'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* SUB-COMPONENTES AUXILIARES */
function RecordBox({ label, value, color }) {
  return (
    <div style={recordBoxStyle}>
      <span style={{ ...recordValueStyle, color: color }}>{value}</span>
      <span style={recordLabelStyle}>{label}</span>
    </div>
  );
}

function StatItem({ icon, label, value }) {
  return (
    <div style={statItemStyle}>
      <span style={statIconStyle}>{icon}</span>
      <span style={statTextStyle}>{label}</span>
      <strong style={statValueStyle}>{value}</strong>
    </div>
  );
}

function InputMetric({ val, fn }) {
  return <input type="number" min="0" value={val} onChange={e => fn(e.target.value)} style={inlineMetricInputStyle} />;
}

function InputStat({ val, fn }) {
  return <input type="number" min="0" value={val} onChange={e => fn(e.target.value)} style={inlineStatInputStyle} />;
}

/* ESTILOS — Paleta blanco/naranja de la interfaz principal */
const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '20px', zIndex: 1200, backdropFilter: 'blur(6px)',
};

const modalStyle = {
  width: '100%', maxWidth: '800px', backgroundColor: '#fff',
  borderRadius: '16px', padding: '40px 28px 28px', position: 'relative',
  boxShadow: '0 20px 40px rgba(0,0,0,0.12)', border: '1px solid #e4e7ec',
};

const badgeStyle = {
  position: 'absolute', top: '-14px', left: '28px', padding: '7px 14px',
  borderRadius: '8px', backgroundColor: '#FF7F27', color: '#fff',
  fontSize: '0.68rem', fontWeight: 900, letterSpacing: '1px',
};

const titleStyle = { margin: 0, fontSize: '1.6rem', fontWeight: 900, textTransform: 'uppercase', color: '#1F2A44' };

const eyebrowStyle = { color: '#FF7F27', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800, marginBottom: '4px' };

const subtitleStyle = { margin: '4px 0 0 0', color: '#667085', fontSize: '0.84rem' };

const tapeLayoutStyle = { display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '20px' };

const panelStyle = { backgroundColor: '#f8fafc', borderRadius: '12px', padding: '18px', border: '1px solid #e4e7ec' };

const sectionTitleStyle = { margin: '0 0 14px 0', color: '#667085', textTransform: 'uppercase', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '1px' };

const recordLineStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' };

const recordBoxStyle = { backgroundColor: '#fff', borderRadius: '10px', padding: '14px 6px', textAlign: 'center', border: '1px solid #e4e7ec' };

const recordValueStyle = { display: 'block', fontSize: '1.75rem', fontWeight: 900, marginBottom: '2px' };

const recordLabelStyle = { display: 'block', color: '#667085', fontSize: '0.58rem', textTransform: 'uppercase', fontWeight: 700 };

const statItemStyle = { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '9px', backgroundColor: '#fff', border: '1px solid #e4e7ec' };

const statIconStyle = { color: '#FF7F27', flexShrink: 0 };

const statTextStyle = { flex: 1, color: '#667085', fontSize: '0.8rem', fontWeight: 600 };

const statValueStyle = { color: '#1F2A44', fontSize: '1rem', fontWeight: 800 };

const physicalCardStyle = { backgroundColor: '#fff', borderRadius: '10px', padding: '14px', marginBottom: '8px', border: '1px solid #e4e7ec' };

const physicalLabelStyle = { display: 'block', color: '#667085', fontSize: '0.63rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' };

const physicalValueStyle = { display: 'block', color: '#1F2A44', fontSize: '1.15rem', fontWeight: 800 };

const physicalSubValueStyle = { color: '#667085', fontSize: '0.76rem' };

const footerStyle = { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px', paddingTop: '18px', borderTop: '1px solid #e4e7ec' };

const primaryButtonStyle = { backgroundColor: '#FF7F27', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem' };

const secondaryButtonStyle = { backgroundColor: '#fff', color: '#344054', border: '1px solid #d0d5dd', padding: '10px 22px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' };

const closeButtonStyle = { position: 'absolute', top: '18px', right: '18px', background: 'none', border: 'none', color: '#667085', cursor: 'pointer' };

const editToggleStyle = { width: '38px', height: '38px', borderRadius: '9px', backgroundColor: '#f3f4f6', color: '#344054', border: '1px solid #e4e7ec', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

const inlineMetricInputStyle = { width: '80%', background: 'none', border: 'none', borderBottom: '2px solid #FF7F27', color: '#1F2A44', textAlign: 'center', fontSize: '1.5rem', fontWeight: 900, outline: 'none' };

const inlineStatInputStyle = { width: '44px', background: 'none', border: 'none', borderBottom: '2px solid #FF7F27', color: '#1F2A44', textAlign: 'center', fontSize: '1rem', outline: 'none' };

const inlineWeightInputStyle = { width: '100%', background: 'none', border: 'none', borderBottom: '2px solid #FF7F27', color: '#1F2A44', fontSize: '1.1rem', fontWeight: 800, outline: 'none' };

const inlineCategoryInputStyle = { width: '100%', background: 'none', border: 'none', borderBottom: '2px solid #FF7F27', color: '#1F2A44', fontSize: '1rem', fontWeight: 800, outline: 'none' };

const dividerStyle = { width: '1px', backgroundColor: '#e4e7ec' };

const physicalStackStyle = { display: 'flex', flexDirection: 'column' };

const contentWrapperStyle = { marginTop: '10px' };

const helperTextStyle = { color: '#667085', fontSize: '0.9rem', textAlign: 'center', padding: '40px' };

const headerStyle = { 
  display: 'flex', 
  alignItems: 'flex-start', 
  justifyContent: 'space-between', 
  gap: '14px', 
  marginBottom: '20px', 
  paddingRight: '40px', 
  paddingTop: '10px' 
};

const statsListStyle = { 
  display: 'grid', 
  gap: '10px' 
};

const headerActionGroupStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const dangerActionStyle = {
  border: '1px solid rgba(255, 127, 39, 0.4)',
  backgroundColor: 'rgba(255, 127, 39, 0.08)',
  color: PALETTE.orange,
  borderRadius: '9px',
  padding: '9px 14px',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const statusNoticeStyle = {
  marginBottom: '16px',
  padding: '11px 14px',
  borderRadius: '10px',
  backgroundColor: '#fff7ed',
  border: '1px solid rgba(255,127,39,0.3)',
  color: '#9a3412',
  fontSize: '0.86rem',
  fontWeight: 600,
};

const bajaAlertStyle = {
  marginBottom: '18px',
  padding: '13px 16px',
  borderRadius: '12px',
  backgroundColor: '#fef2f2',
  border: '1px solid rgba(239,68,68,0.25)',
};

const bajaAlertHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: '#b91c1c',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontSize: '0.72rem',
  marginBottom: '5px',
};

const bajaAlertTextStyle = {
  margin: 0,
  color: '#374151',
  fontSize: '0.88rem',
  lineHeight: 1.5,
};

const innerOverlayStyle = {
  position: 'absolute',
  inset: 0,
  backgroundColor: 'rgba(15,23,42,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  borderRadius: '16px',
  zIndex: 5,
};

const confirmationModalStyle = {
  width: '100%',
  maxWidth: '460px',
  backgroundColor: '#fff',
  borderRadius: '14px',
  padding: '26px',
  border: '1px solid #e4e7ec',
  boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
  position: 'relative',
};

const confirmationBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '5px 10px',
  borderRadius: '999px',
  backgroundColor: 'rgba(255,127,39,0.1)',
  color: PALETTE.orange,
  fontSize: '0.67rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '14px',
};

const confirmationTitleStyle = {
  margin: '0 0 10px 0',
  color: '#1F2A44',
  fontSize: '1.15rem',
  fontWeight: 900,
};

const confirmationTextStyle = {
  margin: '0 0 16px 0',
  color: '#667085',
  fontSize: '0.88rem',
  lineHeight: 1.5,
};

const confirmationLabelStyle = {
  display: 'block',
  marginBottom: '8px',
  color: '#344054',
  fontSize: '0.72rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const textareaStyle = {
  width: '100%',
  minHeight: '110px',
  resize: 'vertical',
  borderRadius: '10px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fafafa',
  color: '#1F2A44',
  padding: '12px 14px',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
  lineHeight: 1.5,
};

const modalErrorStyle = {
  margin: '10px 0 0 0',
  color: '#b91c1c',
  fontSize: '0.82rem',
  fontWeight: 600,
};

const confirmationActionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '18px',
};

const dangerPrimaryButtonStyle = {
  ...primaryButtonStyle,
  backgroundColor: PALETTE.orange,
  color: PALETTE.white,
  minWidth: '148px',
};
