import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FiCheckCircle, FiCopy, FiExternalLink, FiLink2, FiRefreshCw } from 'react-icons/fi';
import { apiUrl, fetchApi } from '../config/api';

const GIMNASIOS_API_URL = apiUrl('/api/gimnasios');

export function PublicRegistrationQr() {
  const [gyms, setGyms] = useState([]);
  const [selectedGymId, setSelectedGymId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    cargarGimnasios();
  }, []);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const registrationUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const params = new URLSearchParams({
      public: '1',
      view: 'register',
    });

    if (selectedGymId) {
      params.set('gym_id', selectedGymId);
    }

    return `${baseUrl}?${params.toString()}`;
  }, [selectedGymId]);

  const gymSelected = useMemo(
    () => gyms.find((gym) => String(gym.id) === String(selectedGymId)) || null,
    [gyms, selectedGymId],
  );

  const cargarGimnasios = async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetchApi('/api/gimnasios');
      const result = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(`No pude obtener los gimnasios desde ${response.apiResolvedUrl || GIMNASIOS_API_URL}.`);
      }

      const list = Array.isArray(result) ? result : [];
      setGyms(list);
      setSelectedGymId((prev) => prev || (list[0] ? String(list[0].id) : ''));
    } catch (error) {
      console.error('No pude cargar los gimnasios:', error);
      setErrorMessage(error.message || `No pude cargar los gimnasios desde ${GIMNASIOS_API_URL}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const copiarEnlace = async () => {
    if (!registrationUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopied(true);
    } catch (error) {
      console.error('No pude copiar el enlace:', error);
      alert('No pude copiar el enlace.');
    }
  };

  const abrirRegistro = () => {
    if (!registrationUrl) {
      return;
    }

    window.open(registrationUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#2d2e30' }}>QR publico de registro</h3>
          <p style={{ margin: '6px 0 0 0', fontSize: '0.84rem', color: '#667085' }}>
            Genera un QR para que el peleador abra el formulario desde su celular con el gimnasio precargado.
          </p>
        </div>
        <button onClick={cargarGimnasios} style={ghostButtonStyle}>
          <FiRefreshCw size={14} /> Actualizar
        </button>
      </div>

      {isLoading && <p style={helperTextStyle}>Cargando gimnasios...</p>}
      {errorMessage && <p style={{ ...helperTextStyle, color: '#b42318' }}>{errorMessage}</p>}

      {!isLoading && !errorMessage && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: '18px', alignItems: 'start' }}>
            <div>
              <label style={labelStyle}>Gimnasio</label>
              <select
                value={selectedGymId}
                onChange={(event) => setSelectedGymId(event.target.value)}
                style={inputStyle}
              >
                {gyms.length === 0 && <option value="">Sin gimnasios</option>}
                {gyms.map((gym) => (
                  <option key={gym.id} value={gym.id}>
                    {gym.nombre}
                  </option>
                ))}
              </select>

              <label style={labelStyle}>Enlace publico</label>
              <div style={urlBoxStyle}>
                <FiLink2 size={14} color="#667085" />
                <span style={{ overflowWrap: 'anywhere' }}>{registrationUrl || 'Sin enlace disponible'}</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                <button onClick={copiarEnlace} disabled={!registrationUrl} style={primaryButtonStyle}>
                  <FiCopy size={14} /> Copiar enlace
                </button>
                <button onClick={abrirRegistro} disabled={!registrationUrl} style={secondaryButtonStyle}>
                  <FiExternalLink size={14} /> Abrir
                </button>
              </div>

              {copied && (
                <div style={copiedStyle}>
                  <FiCheckCircle size={14} />
                  <span>Enlace copiado</span>
                </div>
              )}
            </div>

            <div style={qrPanelStyle}>
              <div style={qrCardStyle}>
                {registrationUrl ? (
                  <QRCodeSVG value={registrationUrl} size={220} includeMargin />
                ) : (
                  <div style={{ color: '#667085', fontSize: '0.84rem' }}>No hay datos para generar el QR.</div>
                )}
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: '#2d2e30', fontSize: '0.92rem' }}>
                  {gymSelected?.nombre || 'Registro publico'}
                </div>
                <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#667085' }}>
                  El QR abre el formulario listo para alta desde movil.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const cardStyle = {
  backgroundColor: '#fff',
  padding: '22px',
  borderRadius: '12px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
  marginBottom: '30px',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
  marginBottom: '18px',
};

const helperTextStyle = {
  fontSize: '0.86rem',
  color: '#667085',
  margin: 0,
};

const labelStyle = {
  display: 'block',
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#344054',
  marginBottom: '6px',
  marginTop: '12px',
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fff',
  boxSizing: 'border-box',
  fontSize: '0.85rem',
  outline: 'none',
};

const urlBoxStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#f8fafc',
  fontSize: '0.8rem',
  color: '#475467',
  minHeight: '64px',
};

const qrPanelStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
};

const qrCardStyle = {
  minHeight: '260px',
  width: '100%',
  maxWidth: '280px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#fcfcfd',
  borderRadius: '12px',
  border: '1px solid #e4e7ec',
  padding: '18px',
  boxSizing: 'border-box',
};

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: '#2d2e30',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '0.82rem',
};

const secondaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fff',
  color: '#2d2e30',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.82rem',
};

const ghostButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fff',
  color: '#2d2e30',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.82rem',
};

const copiedStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  marginTop: '10px',
  color: '#166534',
  fontSize: '0.82rem',
  fontWeight: 700,
};
