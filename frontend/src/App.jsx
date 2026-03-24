import React, { useEffect, useState } from 'react';
import { FiActivity, FiCalendar, FiCamera, FiClock, FiLock, FiRefreshCw, FiSettings, FiShield, FiShoppingCart, FiUnlock, FiUserPlus, FiUsers, FiWifi, FiWifiOff } from 'react-icons/fi';
import { AttendanceLog } from './components/AttendanceLog';
import { CheckIn } from './components/CheckIn';
import { Dashboard } from './components/Dashboard';
import { FightersList } from './components/FighterList';
import { PendingFighters } from './components/PendingFighters';
import { ProShop } from './components/ProShop';
import { RegisterFighter } from './components/RegisterFighter';
import { Settings } from './components/Settings';
import { StaffManager } from './components/StaffManager';
import { apiAssetUrl, fetchApi } from './config/api';
import { db } from './db/db';
import { sincronizarConServidor } from './services/syncService';

function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const publicMode = queryParams.get('public') === '1';
  const publicView = queryParams.get('view');
  const publicGymId = queryParams.get('gym_id');
  const [activePage, setActivePage] = useState('checkin');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [userName, setUserName] = useState('');
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [selectedUsuario, setSelectedUsuario] = useState('');
  const [publicGymContext, setPublicGymContext] = useState(null);
  const [appSettings, setAppSettings] = useState({
    nombre_gym: 'Ring Manager',
    color_primary: '#1F2A44',
    color_secondary: '#FF7F27',
    logo_path: '',
  });

  const sidebarWidth = isSidebarOpen ? 'clamp(200px, 20vw, 280px)' : 'clamp(70px, 8vw, 90px)';
  const logoSrc = appSettings.logo_path
    ? apiAssetUrl(`/${String(appSettings.logo_path).replace(/^\/+/, '')}`)
    : '/logo.png';

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetchApi('/api/settings');
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.data) {
        return;
      }

      const nextSettings = {
        nombre_gym: result.data.nombre_gym || 'Ring Manager',
        color_primary: result.data.color_primary || '#1F2A44',
        color_secondary: result.data.color_secondary || '#FF7F27',
        logo_path: result.data.logo_path || '',
      };
      setAppSettings(nextSettings);
    } catch (error) {
      console.error('No pude cargar los settings:', error);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary-color', appSettings.color_primary || '#1F2A44');
    document.documentElement.style.setProperty('--secondary-color', appSettings.color_secondary || '#FF7F27');
  }, [appSettings]);

  useEffect(() => {
    if (!publicMode) {
      return;
    }

    if (publicView === 'register') {
      setActivePage('register');
    }
    setIsSidebarOpen(false);
  }, [publicMode, publicView]);

  useEffect(() => {
    if (!publicMode || !publicGymId) {
      setPublicGymContext(null);
      return;
    }

    let cancelled = false;

    const cargarGimnasio = async () => {
      try {
        const response = await fetchApi(`/api/gimnasios/${encodeURIComponent(publicGymId)}`);
        const result = await response.json().catch(() => null);

        if (!response.ok || !result || cancelled) {
          return;
        }

        setPublicGymContext(result);
      } catch (error) {
        console.error('No pude cargar el gimnasio del enlace publico:', error);
      }
    };

    cargarGimnasio();

    return () => {
      cancelled = true;
    };
  }, [publicGymId, publicMode]);

  const navBtnStyle = (page) => ({
    width: '100%',
    padding: '11px 10px',
    marginBottom: '8px',
    cursor: 'pointer',
    border: 'none',
    backgroundColor: activePage === page ? 'var(--secondary-color)' : 'transparent',
    color: activePage === page ? '#fff' : '#2d2e30',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: isSidebarOpen ? '0.88rem' : '1.25rem',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: isSidebarOpen ? 'flex-start' : 'center',
    gap: isSidebarOpen ? '14px' : '0'
  });

  const handleAdminToggle = async () => {
    if (userRole) {
      setUserRole(null);
      setActivePage('checkin');
      return;
    }

    setAdminModalOpen(true);
    setSelectedUsuario('');
    setPinInput('');
    setPinError(false);
  };

  const validarPin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetchApi('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: selectedUsuario,
          password: pinInput,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.data) {
        setUserRole(result.data.rol);
        setUserName(result.data.nombre);
        setAdminModalOpen(false);
        return;
      }
    } catch (error) {
      console.error('No pude autenticar con el backend:', error);
    }

    const usuarioDb = await db.staff.where('usuario').equals(selectedUsuario).first();
    if (usuarioDb && usuarioDb.pin === pinInput) {
      setUserRole(usuarioDb.role === 'asistente' ? 'staff' : usuarioDb.role);
      setUserName(usuarioDb.nombre);
      setAdminModalOpen(false);
      return;
    }

    setPinError(true);
    setPinInput('');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', backgroundColor: '#fafafa', fontFamily: 'sans-serif', fontSize: 'clamp(14px, 1.2vw, 18px)', overflow: 'hidden' }}>
      {!publicMode && (
      <div style={{ width: sidebarWidth, backgroundColor: '#fff', borderRight: '1px solid #eee', padding: isSidebarOpen ? '36px 18px' : '36px 10px', transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ position: 'absolute', top: '15px', right: isSidebarOpen ? '15px' : 'auto', left: isSidebarOpen ? 'auto' : '50%', transform: isSidebarOpen ? 'none' : 'translateX(-50%)', background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--secondary-color)' }}>
          {isSidebarOpen ? '<' : '='}
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: isSidebarOpen ? '30px 0' : '20px 0', flexShrink: 0 }}>
          {isSidebarOpen ? (
            <img src={logoSrc} style={{ width: '100%', maxWidth: '120px', maxHeight: '120px', objectFit: 'contain' }} alt="Logo" />
          ) : (
            <img src={logoSrc} style={{ width: '40px', height: 'auto', objectFit: 'contain' }} alt="Logo" />
          )}
        </div>

        <button onClick={() => setActivePage('checkin')} style={navBtnStyle('checkin')}>
          <FiCamera size={20} /> {isSidebarOpen && <span>Acceso</span>}
        </button>
        <button onClick={() => setActivePage('register')} style={navBtnStyle('register')}>
          <FiUserPlus size={20} /> {isSidebarOpen && <span>Registro</span>}
        </button>
        <button onClick={() => setActivePage('shop')} style={navBtnStyle('shop')}>
          <FiShoppingCart size={20} /> {isSidebarOpen && <span>Tienda</span>}
        </button>

        {userRole && (
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
            <p style={{ fontSize: '0.72rem', color: '#888', fontWeight: 700, marginBottom: '10px', textAlign: isSidebarOpen ? 'left' : 'center' }}>
              HOLA, {userName.toUpperCase()}
            </p>
            <button onClick={() => setActivePage('dashboard')} style={navBtnStyle('dashboard')}>
              <FiActivity size={20} /> {isSidebarOpen && <span>Dashboard</span>}
            </button>
            <button onClick={() => setActivePage('members')} style={navBtnStyle('members')}>
              <FiUsers size={20} /> {isSidebarOpen && <span>Peleadores</span>}
            </button>
            <button onClick={() => setActivePage('pending')} style={navBtnStyle('pending')}>
              <FiClock size={20} /> {isSidebarOpen && <span>Pendientes</span>}
            </button>
            <button onClick={() => setActivePage('attendance')} style={navBtnStyle('attendance')}>
              <FiCalendar size={20} /> {isSidebarOpen && <span>Asistencias</span>}
            </button>

            {userRole === 'admin' && (
              <>
                <button onClick={() => setActivePage('staff')} style={navBtnStyle('staff')}>
                  <FiShield size={20} /> {isSidebarOpen && <span>Equipo</span>}
                </button>
                <button onClick={() => setActivePage('settings')} style={navBtnStyle('settings')}>
                  <FiSettings size={20} /> {isSidebarOpen && <span>Ajustes</span>}
                </button>
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'flex-start' : 'center', gap: '10px', color: isOnline ? '#00bb2d' : '#e74c3c' }}>
            {isOnline ? <FiWifi size={20} /> : <FiWifiOff size={20} />}
            {isSidebarOpen && <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>}
          </div>

          <button onClick={() => sincronizarConServidor()} style={{ ...navBtnStyle('sync'), color: '#007bff', backgroundColor: '#e8f4fd', padding: '10px' }}>
            <FiRefreshCw size={20} />
            {isSidebarOpen && <span>Sincronizar DB</span>}
          </button>

          <button onClick={handleAdminToggle} style={{ ...navBtnStyle('admin'), color: userRole ? '#e74c3c' : '#888', backgroundColor: 'transparent', padding: '5px 0' }}>
            {userRole ? <FiUnlock size={22} /> : <FiLock size={22} />}
            {isSidebarOpen && <span>{userRole ? 'Cerrar sesion' : 'Admin'}</span>}
          </button>
        </div>
      </div>
      )}

      <div style={{ flex: 1, minHeight: '100dvh', overflowY: 'auto', transition: 'all 0.3s ease', position: 'relative' }}>
        {activePage === 'dashboard' && <Dashboard />}
        {activePage === 'checkin' && <CheckIn />}
        {activePage === 'register' && <RegisterFighter gymContext={publicGymContext} publicMode={publicMode} />}
        {activePage === 'members' && <FightersList userRole={userRole} />}
        {activePage === 'pending' && <PendingFighters />}
        {activePage === 'attendance' && <AttendanceLog />}
        {activePage === 'shop' && <ProShop userRole={userRole} />}
        {activePage === 'staff' && <StaffManager />}
        {activePage === 'settings' && <Settings themeSettings={appSettings} onSettingsChanged={loadSettings} />}
      </div>

      {adminModalOpen && !publicMode && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(3px)' }}>
          <div style={{ backgroundColor: '#fff', padding: '28px', borderRadius: '15px', width: '90%', maxWidth: '320px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ backgroundColor: '#FF7F27', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 15px auto', color: '#fff' }}>
              <FiLock size={28} />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: '#2d2e30', fontSize: '1.15rem' }}>Acceso restringido</h3>
            <p style={{ margin: '0 0 20px 0', color: '#888', fontSize: '0.9rem' }}>Ingresa tus credenciales de acceso.</p>
            <form onSubmit={validarPin}>
              <label style={{ display: 'block', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#888', marginBottom: '5px' }}>USUARIO</label>
              <input
                type="text"
                value={selectedUsuario}
                onChange={(e) => setSelectedUsuario(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #eee', fontSize: '1rem', outline: 'none', backgroundColor: '#fafafa', color: '#2d2e30', fontWeight: 700, boxSizing: 'border-box' }}
              />

              <label style={{ display: 'block', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#888', marginBottom: '5px' }}>PASSWORD</label>
              <input
                type="password"
                autoFocus
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
                style={{ width: '100%', padding: '12px', fontSize: '1rem', borderRadius: '8px', border: `2px solid ${pinError ? '#e74c3c' : '#eee'}`, outline: 'none', backgroundColor: '#fff', marginBottom: '10px', boxSizing: 'border-box' }}
              />

              {pinError && <p style={{ color: '#e74c3c', margin: '0 0 15px 0', fontSize: '0.8rem', fontWeight: 700 }}>CREDENCIALES INCORRECTAS</p>}

              <div style={{ display: 'flex', gap: '10px', marginTop: pinError ? 0 : '20px' }}>
                <button type="button" onClick={() => setAdminModalOpen(false)} style={{ padding: '10px', flex: 1, backgroundColor: '#eee', color: '#333', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '10px', flex: 1, backgroundColor: '#2d2e30', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Entrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
