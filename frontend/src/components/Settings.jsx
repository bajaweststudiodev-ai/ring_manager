import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiActivity, FiAlertTriangle, FiChevronLeft, FiChevronRight, FiDownload, FiFilter, FiImage, FiRefreshCw, FiSave, FiSettings, FiUpload, FiX } from 'react-icons/fi';
import { apiAssetUrl, fetchApi } from '../config/api';
import { db, logLocalActivity } from '../db/db';
import { PublicRegistrationQr } from './PublicRegistrationQr';

const DEFAULT_SETTINGS = {
  nombre_gym: 'Ring Manager',
  color_primary: '#1F2A44',
  color_secondary: '#FF7F27',
  logo_path: '',
};

const SPIN_STYLE = document.createElement('style');
SPIN_STYLE.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
if (!document.head.querySelector('style[data-spin]')) {
  SPIN_STYLE.setAttribute('data-spin', '1');
  document.head.appendChild(SPIN_STYLE);
}

export function Settings({ themeSettings = DEFAULT_SETTINGS, onSettingsChanged = () => {} }) {
  const [settingsForm, setSettingsForm] = useState(DEFAULT_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [bitacora, setBitacora] = useState([]);
  const [bitacoraLoading, setBitacoraLoading] = useState(false);
  const [bitacoraTotal, setBitacoraTotal] = useState(0);
  const [bitacoraPage, setBitacoraPage] = useState(0);
  const [bitacoraTablas, setBitacoraTablas] = useState([]);
  const [bitacoraOps, setBitacoraOps] = useState([]);
  const [bitacoraFiltros, setBitacoraFiltros] = useState({
    tabla: '', operacion: '', fecha_desde: '', fecha_hasta: '', busqueda: '',
  });
  const BITACORA_PAGE_SIZE = 30;
  const bitacoraFiltrosRef = useRef(bitacoraFiltros);
  const bitacoraPageRef = useRef(bitacoraPage);
  const [limpiarConfirm, setLimpiarConfirm] = useState('');
  const [limpiarLoading, setLimpiarLoading] = useState(false);
  const [limpiarResult, setLimpiarResult] = useState('');

  useEffect(() => {
    // Si themeSettings viene del servidor usa esos valores;
    // si el padre llegó offline y pasó DEFAULT_SETTINGS, rescata desde localStorage.
    const cached = (() => {
      try { return JSON.parse(localStorage.getItem('ring_manager_settings') || '{}'); } catch { return {}; }
    })();
    setSettingsForm({
      nombre_gym: themeSettings.nombre_gym || cached.nombre_gym || DEFAULT_SETTINGS.nombre_gym,
      color_primary: themeSettings.color_primary || cached.color_primary || DEFAULT_SETTINGS.color_primary,
      color_secondary: themeSettings.color_secondary || cached.color_secondary || DEFAULT_SETTINGS.color_secondary,
      logo_path: themeSettings.logo_path || cached.logo_path || '',
    });
  }, [themeSettings]);

  useEffect(() => {
    const init = async () => {
      try {
        const count = await db.bitacora.count();
        if (count === 0) {
          await logLocalActivity('Sistema', 'Migración', 'Bitácora inicializada en modo Offline', 'Admin');
        }
      } catch (_) {}
      cargarBitacora({}, 0);
      cargarMetaBitacora();
    };
    init();
  }, []);

  const cargarBitacora = async (filtros, page) => {
    const f = filtros !== undefined ? filtros : bitacoraFiltrosRef.current;
    const p = page   !== undefined ? page   : bitacoraPageRef.current;
    bitacoraFiltrosRef.current = f;
    bitacoraPageRef.current    = p;

    setBitacoraLoading(true);
    try {
      let registros = await db.bitacora.orderBy('fecha').reverse().toArray();

      if (f.tabla)       registros = registros.filter((r) => (r.modulo    || '') === f.tabla);
      if (f.operacion)   registros = registros.filter((r) => (r.operacion || '') === f.operacion);
      if (f.fecha_desde) registros = registros.filter((r) => (r.fecha     || '').slice(0, 10) >= f.fecha_desde);
      if (f.fecha_hasta) registros = registros.filter((r) => (r.fecha     || '').slice(0, 10) <= f.fecha_hasta);
      if (f.busqueda) {
        const q = f.busqueda.toLowerCase();
        registros = registros.filter((r) =>
          (r.descripcion || '').toLowerCase().includes(q) ||
          (r.usuario     || '').toLowerCase().includes(q) ||
          (r.modulo      || '').toLowerCase().includes(q)
        );
      }

      setBitacoraTotal(registros.length);
      setBitacora(registros.slice(p * BITACORA_PAGE_SIZE, (p + 1) * BITACORA_PAGE_SIZE));
      setBitacoraPage(p);
      setBitacoraFiltros(f);
    } catch (e) {
      console.error('[Settings] Error cargando bitácora local:', e);
    } finally {
      setBitacoraLoading(false);
    }
  };

  const cargarMetaBitacora = async () => {
    try {
      const todos = await db.bitacora.toArray();
      setBitacoraTablas([...new Set(todos.map((r) => r.modulo).filter(Boolean))].sort());
      setBitacoraOps([...new Set(todos.map((r) => r.operacion).filter(Boolean))].sort());
    } catch (_) {}
  };

  const aplicarFiltro = (campo, valor) => {
    const nuevos = { ...bitacoraFiltrosRef.current, [campo]: valor };
    cargarBitacora(nuevos, 0);
  };

  const limpiarFiltrosBitacora = () => {
    const vacios = { tabla: '', operacion: '', fecha_desde: '', fecha_hasta: '', busqueda: '' };
    cargarBitacora(vacios, 0);
  };

  const exportarCSVBitacora = () => {
    const headers = ['Fecha', 'Operacion', 'Modulo', 'Descripcion', 'Usuario'];
    const rows    = bitacora.map((item) => [
      item.fecha      || '',
      item.operacion  || '',
      item.modulo     || '',
      (item.descripcion || '').replace(/,/g, ';'),
      item.usuario    || 'Sistema',
    ]);
    const csv  = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `bitacora_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLimpiarDatos = async () => {
    if (limpiarConfirm.trim().toUpperCase() !== 'LIMPIAR DATOS') {
      alert('Escribe exactamente LIMPIAR DATOS para confirmar.');
      return;
    }
    setLimpiarLoading(true);
    setLimpiarResult('');
    try {
      const res = await fetchApi('/api/admin/limpiar-datos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmacion: 'LIMPIAR DATOS' }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        setLimpiarResult(`Base de datos limpiada. Tablas borradas: ${(result.tablas_borradas || []).length}`);
        setLimpiarConfirm('');
      } else {
        setLimpiarResult(`Error: ${result.message || 'No se pudo limpiar.'}`);
      }
    } catch (e) {
      setLimpiarResult(`Error de conexión: ${e.message}`);
    } finally {
      setLimpiarLoading(false);
    }
  };

  const logoPreviewUrl = useMemo(() => {
    if (!settingsForm.logo_path) return '';
    // data URLs del fallback offline — usar directamente
    if (settingsForm.logo_path.startsWith('data:')) return settingsForm.logo_path;
    if (settingsForm.logo_path.startsWith('http')) return settingsForm.logo_path;
    const normalizedPath = settingsForm.logo_path.startsWith('/')
      ? settingsForm.logo_path
      : `/${settingsForm.logo_path}`;
    return apiAssetUrl(normalizedPath);
  }, [settingsForm.logo_path]);

  const saveSettingValue = async (clave, valor) => {
    const response = await fetchApi(`/api/settings/${encodeURIComponent(clave)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || `No pude guardar ${clave}.`);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setFeedbackMessage('');
    setErrorMessage('');

    const toSave = {
      nombre_gym: settingsForm.nombre_gym.trim(),
      color_primary: settingsForm.color_primary.trim(),
      color_secondary: settingsForm.color_secondary.trim(),
    };

    const persistLocal = () => {
      try {
        const prev = JSON.parse(localStorage.getItem('ring_manager_settings') || '{}');
        localStorage.setItem('ring_manager_settings', JSON.stringify({ ...prev, ...toSave }));
      } catch {}
    };

    try {
      await saveSettingValue('nombre_gym', toSave.nombre_gym);
      await saveSettingValue('color_primary', toSave.color_primary);
      await saveSettingValue('color_secondary', toSave.color_secondary);
      persistLocal();
      await onSettingsChanged();
      logLocalActivity('Ajustes', 'Configuración', `Ajustes guardados: gym="${toSave.nombre_gym}"`, 'Admin').catch(() => {});
      setFeedbackMessage('Configuración actualizada correctamente.');
    } catch (error) {
      const isNetworkError = error instanceof TypeError || error.name === 'AbortError';
      if (isNetworkError) {
        persistLocal();
        logLocalActivity('Ajustes', 'Configuración', `Ajustes guardados offline: gym="${toSave.nombre_gym}"`, 'Admin').catch(() => {});
        setFeedbackMessage('Ajuste guardado localmente. Se sincronizará cuando haya conexión.');
        await onSettingsChanged().catch(() => {});
      } else {
        console.error('No pude guardar settings:', error);
        setErrorMessage(error.message || 'No pude guardar la configuración.');
      }
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleLogoSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setFeedbackMessage('');
    setErrorMessage('');

    let dataUrl;
    try {
      dataUrl = await fileToDataUrl(file);
    } catch {
      setErrorMessage('No se pudo leer el archivo.');
      event.target.value = '';
      setUploadingLogo(false);
      return;
    }

    try {
      const response = await fetchApi('/api/settings/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_data_url: dataUrl }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'No pude subir el logo.');

      const newLogoPath = result.data?.logo_path || '';
      setSettingsForm((prev) => ({
        ...prev,
        logo_path: newLogoPath,
        color_primary: result.data?.color_primary || prev.color_primary,
        color_secondary: result.data?.color_secondary || prev.color_secondary,
      }));
      try {
        const prev = JSON.parse(localStorage.getItem('ring_manager_settings') || '{}');
        localStorage.setItem('ring_manager_settings', JSON.stringify({ ...prev, logo_path: newLogoPath }));
      } catch {}
      logLocalActivity('Ajustes', 'Logo', 'Logo subido y procesado correctamente.', 'Admin').catch(() => {});
      await onSettingsChanged();
      setFeedbackMessage('Logo procesado correctamente.');
    } catch (error) {
      const isNetworkError = error instanceof TypeError || error.name === 'AbortError';
      if (isNetworkError) {
        // Aplicar el logo como data URL directamente — visible en esta sesión.
        setSettingsForm((prev) => ({ ...prev, logo_path: dataUrl }));
        try {
          const prev = JSON.parse(localStorage.getItem('ring_manager_settings') || '{}');
          localStorage.setItem('ring_manager_settings', JSON.stringify({ ...prev, logo_path: dataUrl }));
        } catch {}
        logLocalActivity('Ajustes', 'Logo', 'Logo guardado offline como data URL.', 'Admin').catch(() => {});
        setFeedbackMessage('Logo guardado localmente. Se subirá al servidor cuando haya conexión.');
        await onSettingsChanged().catch(() => {});
      } else {
        console.error('No pude subir el logo:', error);
        setErrorMessage(error.message || 'No pude subir el logo.');
      }
    } finally {
      event.target.value = '';
      setUploadingLogo(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={wrapperStyle}>
        <div style={titleRowStyle}>
          <div>
            <h1 style={titleStyle}>
              <FiSettings size={22} style={{ color: 'var(--secondary-color)' }} />
              Ajustes del Sistema
            </h1>
            <p style={subtitleStyle}>Gestiona branding, logo y configuracion general del gimnasio.</p>
          </div>
          <button onClick={onSettingsChanged} style={ghostButtonStyle}>
            <FiRefreshCw size={14} />
            Recargar
          </button>
        </div>

        {feedbackMessage && <div style={successBoxStyle}>{feedbackMessage}</div>}
        {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

        <SectionCard title="Branding" icon={<FiImage size={18} />}>
          <div style={brandingGridStyle}>
            <div>
              <label style={labelStyle}>Nombre del gym</label>
              <input
                type="text"
                value={settingsForm.nombre_gym}
                onChange={(event) => setSettingsForm((prev) => ({ ...prev, nombre_gym: event.target.value }))}
                style={inputStyle}
              />

              <label style={labelStyle}>Color principal</label>
              <div style={colorRowStyle}>
                <input
                  type="color"
                  value={settingsForm.color_primary}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, color_primary: event.target.value.toUpperCase() }))}
                  style={colorInputStyle}
                />
                <input
                  type="text"
                  value={settingsForm.color_primary}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, color_primary: event.target.value }))}
                  style={inputStyle}
                />
              </div>

              <label style={labelStyle}>Color secundario</label>
              <div style={colorRowStyle}>
                <input
                  type="color"
                  value={settingsForm.color_secondary}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, color_secondary: event.target.value.toUpperCase() }))}
                  style={colorInputStyle}
                />
                <input
                  type="text"
                  value={settingsForm.color_secondary}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, color_secondary: event.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px' }}>
                <label style={primaryButtonStyle}>
                  <FiUpload size={14} />
                  {uploadingLogo ? 'Procesando...' : 'Subir logo'}
                  <input type="file" accept="image/*" onChange={handleLogoSelected} hidden disabled={uploadingLogo} />
                </label>
                <button onClick={handleSaveSettings} disabled={settingsSaving} style={secondaryButtonStyle}>
                  <FiSave size={14} />
                  {settingsSaving ? 'Guardando...' : 'Guardar branding'}
                </button>
              </div>
            </div>

            <div style={previewCardStyle}>
              <div style={logoPreviewBoxStyle}>
                {logoPreviewUrl ? (
                  <img src={logoPreviewUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ color: '#667085', fontSize: '0.84rem' }}>Sin logo cargado</span>
                )}
              </div>
              <div style={swatchRowStyle}>
                <ColorSwatch label="Principal" value={settingsForm.color_primary} />
                <ColorSwatch label="Secundario" value={settingsForm.color_secondary} />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Configuracion" icon={<FiSettings size={18} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            <div style={configInfoBoxStyle}>
              <strong style={{ display: 'block', marginBottom: '6px', color: '#1e293b' }}>Tema activo</strong>
              <span style={{ color: '#667085', fontSize: '0.84rem' }}>
                Los colores guardados se aplican automaticamente en toda la app en tiempo real.
              </span>
            </div>
            <div style={configInfoBoxStyle}>
              <strong style={{ display: 'block', marginBottom: '6px', color: '#1e293b' }}>Gestion de personal</strong>
              <span style={{ color: '#667085', fontSize: '0.84rem' }}>
                La creacion y edicion de empleados vive exclusivamente en el modulo Equipo.
              </span>
            </div>
          </div>
        </SectionCard>

        <PublicRegistrationQr />

        {/* BITÁCORA DE ACTIVIDAD */}
        <SectionCard title="Bitácora de actividad" icon={<FiActivity size={18} />}>

          {/* ── Barra de filtros ── */}
          <div style={bFiltrosWrapStyle}>
            {/* Búsqueda libre */}
            <div style={bSearchBoxStyle}>
              <FiFilter size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Buscar descripción, usuario…"
                value={bitacoraFiltros.busqueda}
                onChange={(e) => aplicarFiltro('busqueda', e.target.value)}
                style={bSearchInputStyle}
              />
              {bitacoraFiltros.busqueda && (
                <button onClick={() => aplicarFiltro('busqueda', '')} style={bClearMiniBtn}>
                  <FiX size={12} />
                </button>
              )}
            </div>

            {/* Módulo */}
            <select
              value={bitacoraFiltros.tabla}
              onChange={(e) => aplicarFiltro('tabla', e.target.value)}
              style={bSelectStyle}
            >
              <option value="">Todos los módulos</option>
              {bitacoraTablas.map((t) => (
                <option key={t} value={t}>{TABLA_LABELS[t] || t}</option>
              ))}
            </select>

            {/* Operación */}
            <select
              value={bitacoraFiltros.operacion}
              onChange={(e) => aplicarFiltro('operacion', e.target.value)}
              style={bSelectStyle}
            >
              <option value="">Todas las operaciones</option>
              {bitacoraOps.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>

            {/* Fechas */}
            <input
              type="date"
              value={bitacoraFiltros.fecha_desde}
              onChange={(e) => aplicarFiltro('fecha_desde', e.target.value)}
              style={{ ...bSelectStyle, color: bitacoraFiltros.fecha_desde ? '#1e293b' : '#94a3b8' }}
              title="Desde"
            />
            <input
              type="date"
              value={bitacoraFiltros.fecha_hasta}
              onChange={(e) => aplicarFiltro('fecha_hasta', e.target.value)}
              style={{ ...bSelectStyle, color: bitacoraFiltros.fecha_hasta ? '#1e293b' : '#94a3b8' }}
              title="Hasta"
            />

            {/* Acciones */}
            <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
              {(bitacoraFiltros.tabla || bitacoraFiltros.operacion || bitacoraFiltros.fecha_desde || bitacoraFiltros.fecha_hasta || bitacoraFiltros.busqueda) && (
                <button onClick={limpiarFiltrosBitacora} style={bGhostSmallBtn} title="Limpiar filtros">
                  <FiX size={13} /> Limpiar
                </button>
              )}
              <button onClick={exportarCSVBitacora} style={bGhostSmallBtn} disabled={bitacora.length === 0} title="Exportar CSV">
                <FiDownload size={13} /> CSV
              </button>
              <button onClick={() => cargarBitacora()} style={bGhostSmallBtn} disabled={bitacoraLoading} title="Recargar">
                <FiRefreshCw size={13} style={{ animation: bitacoraLoading ? 'spin 1s linear infinite' : 'none' }} />
                {bitacoraLoading ? 'Cargando…' : 'Recargar'}
              </button>
            </div>
          </div>

          {/* ── Contador ── */}
          <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: '10px' }}>
            {bitacoraLoading
              ? 'Consultando…'
              : `${bitacoraTotal.toLocaleString('es-MX')} registro${bitacoraTotal !== 1 ? 's' : ''} en total`}
          </div>

          {/* ── Tabla ── */}
          <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <table style={bTableStyle}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={bThStyle}>Fecha</th>
                  <th style={bThStyle}>Operación</th>
                  <th style={bThStyle}>Módulo</th>
                  <th style={{ ...bThStyle, flex: 2 }}>Descripción</th>
                  <th style={bThStyle}>Usuario</th>
                  <th style={bThStyle}>IP</th>
                </tr>
              </thead>
              <tbody>
                {!bitacoraLoading && bitacora.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '0.86rem' }}>
                      Sin registros para los filtros seleccionados.
                    </td>
                  </tr>
                )}
                {bitacora.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}
                  >
                    <td style={{ ...bTdStyle, color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                      {item.fecha
                        ? new Date(item.fecha).toLocaleString('es-MX', {
                            day: '2-digit', month: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td style={bTdStyle}>
                      <span style={bitacoraOpBadge(item.operacion)}>{item.operacion || '—'}</span>
                    </td>
                    <td style={{ ...bTdStyle, color: '#475569', fontSize: '0.78rem' }}>
                      {TABLA_LABELS[item.modulo] || item.modulo || '—'}
                    </td>
                    <td style={{ ...bTdStyle, maxWidth: '320px' }}>
                      <span style={{ fontSize: '0.82rem', color: '#1e293b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={item.descripcion || ''}>
                        {item.descripcion || '—'}
                      </span>
                    </td>
                    <td style={{ ...bTdStyle, fontSize: '0.78rem', color: '#475569', whiteSpace: 'nowrap' }}>
                      {item.usuario && item.usuario !== 'Sistema'
                        ? <strong>{item.usuario}</strong>
                        : <span style={{ color: '#94a3b8' }}>Sistema</span>}
                    </td>
                    <td style={{ ...bTdStyle, fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      —
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Paginación ── */}
          {bitacoraTotal > BITACORA_PAGE_SIZE && (
            <div style={bPaginacionStyle}>
              <button
                onClick={() => cargarBitacora(undefined, bitacoraPage - 1)}
                disabled={bitacoraPage === 0 || bitacoraLoading}
                style={bPageBtnStyle(bitacoraPage === 0)}
              >
                <FiChevronLeft size={15} /> Anterior
              </button>
              <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                Página {bitacoraPage + 1} de {Math.ceil(bitacoraTotal / BITACORA_PAGE_SIZE)}
              </span>
              <button
                onClick={() => cargarBitacora(undefined, bitacoraPage + 1)}
                disabled={(bitacoraPage + 1) * BITACORA_PAGE_SIZE >= bitacoraTotal || bitacoraLoading}
                style={bPageBtnStyle((bitacoraPage + 1) * BITACORA_PAGE_SIZE >= bitacoraTotal)}
              >
                Siguiente <FiChevronRight size={15} />
              </button>
            </div>
          )}
        </SectionCard>

        {/* ZONA DE PELIGRO */}
        <section style={{ ...cardStyle, border: '1px solid #fecaca', backgroundColor: '#fff5f5' }}>
          <div style={sectionTitleStyle}>
            <span style={{ color: '#b42318', display: 'inline-flex' }}><FiAlertTriangle size={18} /></span>
            <h2 style={{ margin: 0, fontSize: '1.02rem', color: '#b42318' }}>Zona de peligro</h2>
          </div>
          <p style={{ margin: '0 0 14px 0', fontSize: '0.86rem', color: '#6b7280', lineHeight: 1.5 }}>
            Borra todos los peleadores, pagos, asistencias, ventas y productos. Conserva usuarios, membresías, ajustes y configuración del gimnasio. <strong>Esta acción es irreversible.</strong>
          </p>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder='Escribe: LIMPIAR DATOS'
              value={limpiarConfirm}
              onChange={(e) => setLimpiarConfirm(e.target.value)}
              style={{ ...inputStyle, maxWidth: '240px', borderColor: '#fecaca' }}
            />
            <button
              onClick={handleLimpiarDatos}
              disabled={limpiarLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '8px', border: 'none', backgroundColor: limpiarLoading ? '#94a3b8' : '#b42318', color: '#fff', cursor: limpiarLoading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.84rem' }}
            >
              {limpiarLoading ? 'Limpiando...' : 'Limpiar base de datos'}
            </button>
          </div>
          {limpiarResult && (
            <p style={{ marginTop: '10px', fontSize: '0.84rem', color: limpiarResult.startsWith('Error') ? '#b42318' : '#166534' }}>
              {limpiarResult}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <section style={cardStyle}>
      <div style={sectionTitleStyle}>
        <span style={{ color: 'var(--secondary-color)', display: 'inline-flex' }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: '1.02rem', color: '#1e293b' }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ColorSwatch({ label, value }) {
  return (
    <div style={swatchCardStyle}>
      <div style={{ ...swatchStyle, backgroundColor: value || '#ffffff' }} />
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>{label}</div>
        <div style={{ fontSize: '0.78rem', color: '#667085' }}>{value}</div>
      </div>
    </div>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const pageStyle = {
  padding: '30px',
  backgroundColor: '#f8fafc',
  minHeight: '100vh',
  boxSizing: 'border-box',
};

const wrapperStyle = {
  maxWidth: '1100px',
  margin: '0 auto',
};

const titleRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
  flexWrap: 'wrap',
  marginBottom: '18px',
};

const titleStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  margin: '0 0 8px 0',
  fontSize: '1.7rem',
  color: '#1e293b',
};

const subtitleStyle = {
  margin: 0,
  color: '#64748b',
  fontSize: '0.95rem',
};

const cardStyle = {
  backgroundColor: '#fff',
  borderRadius: '14px',
  padding: '22px',
  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)',
  border: '1px solid #e2e8f0',
  marginBottom: '22px',
};

const sectionTitleStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '18px',
};

const brandingGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(260px, 1fr) minmax(260px, 320px)',
  gap: '18px',
};

const previewCardStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '16px',
  backgroundColor: '#f8fafc',
};

const logoPreviewBoxStyle = {
  minHeight: '210px',
  borderRadius: '12px',
  border: '1px dashed #cbd5e1',
  backgroundColor: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  marginBottom: '14px',
};

const swatchRowStyle = {
  display: 'grid',
  gap: '10px',
};

const swatchCardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const swatchStyle = {
  width: '44px',
  height: '44px',
  borderRadius: '10px',
  border: '1px solid #d0d5dd',
  flexShrink: 0,
};

const colorRowStyle = {
  display: 'grid',
  gridTemplateColumns: '56px 1fr',
  gap: '10px',
};

const colorInputStyle = {
  width: '56px',
  height: '42px',
  padding: '4px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fff',
};

const labelStyle = {
  display: 'block',
  marginTop: '12px',
  marginBottom: '6px',
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#344054',
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fff',
  boxSizing: 'border-box',
  fontSize: '0.86rem',
  outline: 'none',
};

const configInfoBoxStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '14px',
  backgroundColor: '#fcfcfd',
};

const successBoxStyle = {
  padding: '12px 14px',
  borderRadius: '10px',
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
  color: '#166534',
  marginBottom: '16px',
  fontSize: '0.86rem',
};

const errorBoxStyle = {
  padding: '12px 14px',
  borderRadius: '10px',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#b42318',
  marginBottom: '16px',
  fontSize: '0.86rem',
};

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '9px 13px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: 'var(--primary-color)',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '0.84rem',
  textDecoration: 'none',
};

const secondaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '9px 13px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fff',
  color: '#1e293b',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.84rem',
};

const ghostButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '9px 13px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fff',
  color: '#1e293b',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.84rem',
};

/* ── Bitácora: colores por operación ── */
const OP_COLORS = {
  LOGIN:          '#2563eb',
  LOGOUT:         '#7c3aed',
  CHECKIN:        '#0891b2',
  PAGO:           '#b45309',
  VENTA:          '#166534',
  APERTURA_CAJA:  '#0369a1',
  CIERRE_CAJA:    '#1e40af',
  CREATE:         '#047857',
  UPDATE:         '#1d4ed8',
  DELETE:         '#b42318',
  BAJA:           '#b42318',
  APROBADO:       '#166534',
};

const TABLA_LABELS = {
  usuarios:       'Usuarios',
  peleadores:     'Alumnos',
  asistencias:    'Asistencias',
  pagos:          'Pagos',
  ventas_tienda:  'Tienda',
  cortes_caja:    'Caja',
  productos:      'Productos',
  settings:       'Configuración',
};

const bitacoraOpBadge = (op = '') => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '999px',
  fontSize: '0.68rem',
  fontWeight: 800,
  letterSpacing: '0.4px',
  whiteSpace: 'nowrap',
  backgroundColor: `${OP_COLORS[op] || '#475569'}18`,
  color: OP_COLORS[op] || '#475569',
});

/* Filtros */
const bFiltrosWrapStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  alignItems: 'center',
  marginBottom: '12px',
};

const bSearchBoxStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  border: '1px solid #d0d5dd',
  borderRadius: '8px',
  padding: '6px 10px',
  backgroundColor: '#fff',
  flex: '1 1 200px',
  minWidth: '160px',
};

const bSearchInputStyle = {
  border: 'none',
  outline: 'none',
  fontSize: '0.82rem',
  color: '#1e293b',
  backgroundColor: 'transparent',
  width: '100%',
};

const bSelectStyle = {
  padding: '7px 10px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fff',
  fontSize: '0.82rem',
  color: '#1e293b',
  outline: 'none',
  cursor: 'pointer',
  flex: '0 1 auto',
};

const bClearMiniBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#94a3b8',
  padding: '0',
  display: 'flex',
  alignItems: 'center',
};

const bGhostSmallBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 11px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fff',
  color: '#344054',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.78rem',
  whiteSpace: 'nowrap',
};

/* Tabla */
const bTableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.83rem',
};

const bThStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: '#64748b',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
};

const bTdStyle = {
  padding: '9px 12px',
  verticalAlign: 'middle',
};

/* Paginación */
const bPaginacionStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: '14px',
  gap: '10px',
};

const bPageBtnStyle = (disabled) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '7px 13px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: disabled ? '#f8fafc' : '#fff',
  color: disabled ? '#cbd5e1' : '#344054',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 600,
  fontSize: '0.82rem',
});
