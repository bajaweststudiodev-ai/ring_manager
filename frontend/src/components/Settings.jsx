import React, { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiImage, FiPlus, FiRefreshCw, FiSave, FiSettings, FiTrash2, FiUpload, FiUser } from 'react-icons/fi';
import { apiAssetUrl, fetchApi } from '../config/api';
import { PublicRegistrationQr } from './PublicRegistrationQr';

const DEFAULT_SETTINGS = {
  nombre_gym: 'Ring Manager',
  color_primary: '#1F2A44',
  color_secondary: '#FF7F27',
  logo_path: '',
};

const EMPTY_USER_FORM = {
  id: null,
  nombre: '',
  usuario: '',
  password: '',
  rol: 'staff',
  telefono: '',
  correo: '',
  estado: 'ACTIVO',
};

export function Settings({ themeSettings = DEFAULT_SETTINGS, onSettingsChanged = () => {} }) {
  const [settingsForm, setSettingsForm] = useState(DEFAULT_SETTINGS);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);

  useEffect(() => {
    setSettingsForm({
      nombre_gym: themeSettings.nombre_gym || DEFAULT_SETTINGS.nombre_gym,
      color_primary: themeSettings.color_primary || DEFAULT_SETTINGS.color_primary,
      color_secondary: themeSettings.color_secondary || DEFAULT_SETTINGS.color_secondary,
      logo_path: themeSettings.logo_path || '',
    });
  }, [themeSettings]);

  useEffect(() => {
    loadUsers();
  }, []);

  const logoPreviewUrl = useMemo(() => {
    if (!settingsForm.logo_path) {
      return '';
    }

    if (settingsForm.logo_path.startsWith('http')) {
      return settingsForm.logo_path;
    }

    const normalizedPath = settingsForm.logo_path.startsWith('/')
      ? settingsForm.logo_path
      : `/${settingsForm.logo_path}`;

    return apiAssetUrl(normalizedPath);
  }, [settingsForm.logo_path]);

  const loadUsers = async () => {
    setUsersLoading(true);
    setErrorMessage('');
    try {
      const response = await fetchApi('/api/usuarios');
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'No pude obtener los usuarios.');
      }

      setUsers(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      console.error('No pude cargar usuarios:', error);
      setErrorMessage(error.message || 'No pude cargar los usuarios.');
    } finally {
      setUsersLoading(false);
    }
  };

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

    try {
      await saveSettingValue('nombre_gym', settingsForm.nombre_gym.trim());
      await saveSettingValue('color_primary', settingsForm.color_primary.trim());
      await saveSettingValue('color_secondary', settingsForm.color_secondary.trim());
      await onSettingsChanged();
      setFeedbackMessage('Configuracion actualizada correctamente.');
    } catch (error) {
      console.error('No pude guardar settings:', error);
      setErrorMessage(error.message || 'No pude guardar la configuracion.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleLogoSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingLogo(true);
    setFeedbackMessage('');
    setErrorMessage('');

    try {
      const dataUrl = await fileToDataUrl(file);
      const response = await fetchApi('/api/settings/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_data_url: dataUrl }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'No pude subir el logo.');
      }

      setSettingsForm((prev) => ({
        ...prev,
        logo_path: result.data?.logo_path || prev.logo_path,
        color_primary: result.data?.color_primary || prev.color_primary,
        color_secondary: result.data?.color_secondary || prev.color_secondary,
      }));
      await onSettingsChanged();
      setFeedbackMessage('Logo procesado correctamente.');
    } catch (error) {
      console.error('No pude subir el logo:', error);
      setErrorMessage(error.message || 'No pude subir el logo.');
    } finally {
      event.target.value = '';
      setUploadingLogo(false);
    }
  };

  const openCreateUserModal = () => {
    setUserForm(EMPTY_USER_FORM);
    setUserModalOpen(true);
  };

  const openEditUserModal = (user) => {
    setUserForm({
      id: user.id,
      nombre: user.nombre || '',
      usuario: user.usuario || '',
      password: '',
      rol: user.rol || 'staff',
      telefono: user.telefono || '',
      correo: user.correo || '',
      estado: user.estado || 'ACTIVO',
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!userForm.nombre.trim() || !userForm.usuario.trim()) {
      alert('Nombre y usuario son obligatorios.');
      return;
    }
    if (!userForm.id && !userForm.password.trim()) {
      alert('La password es obligatoria para crear el usuario.');
      return;
    }

    try {
      const payload = {
        nombre: userForm.nombre.trim(),
        usuario: userForm.usuario.trim(),
        password: userForm.password.trim(),
        rol: userForm.rol,
        telefono: userForm.telefono.trim(),
        correo: userForm.correo.trim(),
        estado: userForm.estado,
      };

      const response = await fetchApi(
        userForm.id ? `/api/usuarios/${userForm.id}` : '/api/usuarios',
        {
          method: userForm.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'No pude guardar el usuario.');
      }

      setUserModalOpen(false);
      setUserForm(EMPTY_USER_FORM);
      await loadUsers();
      setFeedbackMessage(userForm.id ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.');
    } catch (error) {
      console.error('No pude guardar usuario:', error);
      alert(error.message || 'No pude guardar el usuario.');
    }
  };

  const handleDeleteUser = async (user) => {
    const confirmation = window.confirm(`Eliminar a ${user.nombre}?`);
    if (!confirmation) {
      return;
    }

    try {
      const response = await fetchApi(`/api/usuarios/${user.id}`, {
        method: 'DELETE',
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'No pude eliminar el usuario.');
      }

      await loadUsers();
      setFeedbackMessage('Usuario eliminado correctamente.');
    } catch (error) {
      console.error('No pude eliminar usuario:', error);
      alert(error.message || 'No pude eliminar el usuario.');
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
            <p style={subtitleStyle}>Gestiona branding, usuarios y configuracion general sin salir del panel.</p>
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

        <SectionCard title="Usuarios" icon={<FiUser size={18} />}>
          <div style={sectionActionsStyle}>
            <p style={sectionDescriptionStyle}>Administra usuarios de `usuarios` con roles `admin` y `staff`.</p>
            <button onClick={openCreateUserModal} style={primaryButtonStyle}>
              <FiPlus size={14} />
              Nuevo usuario
            </button>
          </div>

          {usersLoading ? (
            <p style={helperTextStyle}>Cargando usuarios...</p>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {users.map((user) => (
                <div key={user.id} style={userRowStyle}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1e293b' }}>{user.nombre}</div>
                    <div style={{ fontSize: '0.8rem', color: '#667085' }}>
                      @{user.usuario} · {user.rol} · {user.estado}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#667085' }}>
                      {user.correo || 'Sin correo'} {user.telefono ? `· ${user.telefono}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => openEditUserModal(user)} style={iconButtonStyle}>
                      <FiEdit2 size={14} />
                    </button>
                    <button onClick={() => handleDeleteUser(user)} style={{ ...iconButtonStyle, color: '#b42318' }}>
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {!users.length && <p style={helperTextStyle}>No hay usuarios registrados.</p>}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Configuracion" icon={<FiSettings size={18} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            <div style={configInfoBoxStyle}>
              <strong style={{ display: 'block', marginBottom: '6px', color: '#1e293b' }}>Tema activo</strong>
              <span style={{ color: '#667085', fontSize: '0.84rem' }}>
                Los colores guardados se aplican automaticamente en la app al iniciar.
              </span>
            </div>
            <div style={configInfoBoxStyle}>
              <strong style={{ display: 'block', marginBottom: '6px', color: '#1e293b' }}>Logo y colores</strong>
              <span style={{ color: '#667085', fontSize: '0.84rem' }}>
                Si no hay logo, el sistema conserva colores por default para no romper la interfaz.
              </span>
            </div>
          </div>
        </SectionCard>

        <PublicRegistrationQr />
      </div>

      {userModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h3 style={{ margin: '0 0 14px 0', color: '#1e293b' }}>{userForm.id ? 'Editar usuario' : 'Nuevo usuario'}</h3>

            <label style={labelStyle}>Nombre</label>
            <input
              type="text"
              value={userForm.nombre}
              onChange={(event) => setUserForm((prev) => ({ ...prev, nombre: event.target.value }))}
              style={inputStyle}
            />

            <label style={labelStyle}>Usuario</label>
            <input
              type="text"
              value={userForm.usuario}
              onChange={(event) => setUserForm((prev) => ({ ...prev, usuario: event.target.value }))}
              style={inputStyle}
            />

            <label style={labelStyle}>{userForm.id ? 'Nueva password' : 'Password'}</label>
            <input
              type="password"
              value={userForm.password}
              onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
              style={inputStyle}
              placeholder={userForm.id ? 'Dejar vacia para conservarla' : ''}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Rol</label>
                <select
                  value={userForm.rol}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, rol: event.target.value }))}
                  style={inputStyle}
                >
                  <option value="admin">admin</option>
                  <option value="staff">staff</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Estado</label>
                <select
                  value={userForm.estado}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, estado: event.target.value }))}
                  style={inputStyle}
                >
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>
            </div>

            <label style={labelStyle}>Telefono</label>
            <input
              type="text"
              value={userForm.telefono}
              onChange={(event) => setUserForm((prev) => ({ ...prev, telefono: event.target.value }))}
              style={inputStyle}
            />

            <label style={labelStyle}>Correo</label>
            <input
              type="email"
              value={userForm.correo}
              onChange={(event) => setUserForm((prev) => ({ ...prev, correo: event.target.value }))}
              style={inputStyle}
            />

            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button onClick={() => setUserModalOpen(false)} style={ghostButtonStyle}>
                Cancelar
              </button>
              <button onClick={handleSaveUser} style={primaryButtonStyle}>
                Guardar usuario
              </button>
            </div>
          </div>
        </div>
      )}
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

const sectionActionsStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
  marginBottom: '14px',
};

const sectionDescriptionStyle = {
  margin: 0,
  color: '#667085',
  fontSize: '0.85rem',
};

const userRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  padding: '14px',
  borderRadius: '10px',
  border: '1px solid #e2e8f0',
  backgroundColor: '#fcfcfd',
};

const helperTextStyle = {
  color: '#667085',
  fontSize: '0.86rem',
  margin: 0,
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

const iconButtonStyle = {
  width: '34px',
  height: '34px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '8px',
  border: '1px solid #d0d5dd',
  backgroundColor: '#fff',
  color: '#1e293b',
  cursor: 'pointer',
};

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  zIndex: 1000,
};

const modalCardStyle = {
  width: '100%',
  maxWidth: '420px',
  backgroundColor: '#fff',
  borderRadius: '14px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 18px 36px rgba(15, 23, 42, 0.16)',
  padding: '20px',
};
