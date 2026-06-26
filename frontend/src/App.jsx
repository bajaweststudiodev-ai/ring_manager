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
import { apiAssetUrl, clearAuthSession, fetchApi, getStoredAuth, saveAuthSession } from './config/api';
import { db } from './db/db';
import { useSyncManager } from './hooks/useSyncManager';

function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const publicMode = queryParams.get('public') === '1';
  const publicView = queryParams.get('view');
  const publicGymId = queryParams.get('gym_id');
  const [activePage, setActivePage] = useState('checkin');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [userName, setUserName] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [loginUsers, setLoginUsers] = useState([]);
  const [loginUsersLoading, setLoginUsersLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { isSyncing, pendingCount } = useSyncManager();
  const [selectedUsuario, setSelectedUsuario] = useState(null);
  const [publicGymContext, setPublicGymContext] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attendanceError, setAttendanceError] = useState(false);
  const [checkedInStaff, setCheckedInStaff] = useState(new Set());
  const [appSettings, setAppSettings] = useState({
    nombre_gym: 'Ring Manager',
    color_primary: '#1F2A44',
    color_secondary: '#FF7F27',
    logo_path: '',
  });

  const sidebarWidth = isSidebarOpen ? 'clamp(200px, 20vw, 280px)' : 'clamp(70px, 8vw, 90px)';
  const allowedPagesByRole = {
    admin: ['checkin', 'register', 'shop', 'dashboard', 'members', 'pending', 'attendance', 'staff', 'settings'],
    // recepcion y entrenador comparten el conjunto de páginas operativas.
    // 'pending' incluido: necesitan ver y procesar registros locales (synced:0).
    // 'members' incluido: gestión de peleadores es parte del flujo de trabajo diario.
    staff: ['checkin', 'register', 'shop', 'members', 'pending', 'attendance'],
    guest: ['checkin', 'register', 'shop'],
  };
  // Mapea los roles de la BD ('recepcion', 'entrenador') al grupo de permisos correcto.
  // Sin esto, cualquier rol que no sea exactamente 'admin' o 'staff' caía a 'guest'
  // y perdía acceso a Members, Pendientes y Asistencias.
  const getRoleKey = (role) =>
    role === 'admin' ? 'admin' :
    ['recepcion', 'entrenador', 'staff'].includes(String(role || '').toLowerCase()) ? 'staff' :
    'guest';
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

  const ADMIN_EMERGENCIA = [{ matricula: 'ADMIN-LOCAL', usuario: 'admin', nombre: 'Admin Emergencia', role: 'admin', pin: '1234' }];

const loadPublicUsers = async () => {
    // Promise.race helper — cualquier await que supere su límite lanza un error,
    // forzando la caída al catch y garantizando que el finally siempre corra.
    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`TIMEOUT ${label} (${ms}ms)`)), ms)
        ),
      ]);

    console.log('[Login] 1. loadPublicUsers iniciado');
    setLoginUsersLoading(true);
    let staffLocal = [];

    try {
      // ── PASO 2: Consultar Dexie con timeout de 2 s ──────────────────────────
      // db.staff.toArray() puede colgar indefinidamente en Safari si IndexedDB
      // tiene una transacción atascada. El race lo mata a los 2 s.
      console.log('[Login] 2. Consultando db.staff.toArray()...');
      staffLocal = await withTimeout(db.staff.toArray(), 2000, 'db.staff.toArray');
      console.log(`[Login] 3. Dexie respondió — ${staffLocal.length} registro(s) encontrado(s)`);

      // ── PASO 4: Si Dexie está vacío, intentar servidor ──────────────────────
      if (staffLocal.length === 0) {
        console.log('[Login] 4. Dexie vacío — intentando servidor (timeout 4 s)...');
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        try {
          const response = await withTimeout(
            fetchApi('/api/public/usuarios', { signal: controller.signal }),
            4500,
            'fetchApi /api/public/usuarios',
          );
          console.log('[Login] 5. Servidor respondió — parseando JSON...');
          const result = await withTimeout(response.json().catch(() => ({})), 2000, 'response.json');
          const data = Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : []);
          if (data.length > 0) {
            console.log(`[Login] 6. ${data.length} usuario(s) del servidor — guardando en Dexie...`);
            await withTimeout(db.staff.bulkPut(data), 2000, 'db.staff.bulkPut');
            staffLocal = data;
            console.log('[Login] 7. Guardado en Dexie OK');
          } else {
            console.warn('[Login] 6. Servidor respondió pero devolvió 0 usuarios');
          }
        } catch (fetchError) {
          console.warn('[Login] 5. Sin red, timeout o error de servidor:', fetchError.message);
        } finally {
          clearTimeout(tid);
        }
      }

    } catch (dbError) {
      // Aquí caen: timeout de Dexie, IndexedDB corrupta, o cualquier error inesperado.
      console.error('[Login] ERROR (o timeout) en Dexie:', dbError.message);
    } finally {
      // Este bloque se ejecuta SIEMPRE — con o sin error, con o sin red.
      if (!staffLocal || staffLocal.length === 0) {
        console.warn('[Login] FINAL — sin datos → inyectando ADMIN_EMERGENCIA');
        setLoginUsers(ADMIN_EMERGENCIA);
      } else {
        console.log(`[Login] FINAL — mostrando ${staffLocal.length} usuario(s) en la UI`);
        setLoginUsers(staffLocal);
      }
      console.log('[Login] 8. setLoginUsersLoading(false) — pantalla desbloqueada');
      setLoginUsersLoading(false);
    }
  };

  const loadTodayStaffAttendances = async () => {
    try {
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Tijuana' });
      const registros = await db.attendance
        .filter((r) => (r.fecha || r.date || '').startsWith(hoy))
        .toArray();
      setCheckedInStaff(new Set(
        registros.map((r) => r.peleador_matricula || r.matricula).filter(Boolean)
      ));
    } catch (_) {
      setCheckedInStaff(new Set());
    }
  };

  useEffect(() => {
    if (!publicMode && adminModalOpen) {
      loadPublicUsers();
      loadTodayStaffAttendances();
    }
  }, [adminModalOpen, publicMode]);

  // Auto-selecciona si solo hay un usuario visible en el dropdown
  useEffect(() => {
    if (!adminModalOpen) return;
    const visibles = loginUsers.filter((u) => {
      const esAdmin = String(u.role || u.rol || '').toLowerCase() === 'admin';
      const yaCheco = checkedInStaff.has(u.matricula) || checkedInStaff.has(u.usuario);
      return esAdmin || yaCheco;
    });
    if (visibles.length === 1) {
      setSelectedUsuario(visibles[0]);
    }
  }, [loginUsers, checkedInStaff, adminModalOpen]);

  useEffect(() => {
    const storedAuth = getStoredAuth();
    if (storedAuth?.user) {
      setCurrentUser(storedAuth.user);
      setUserRole(storedAuth.user.rol || null);
      setUserName(storedAuth.user.nombre || '');
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary-color', appSettings.color_primary || '#1F2A44');
    document.documentElement.style.setProperty('--secondary-color', appSettings.color_secondary || '#FF7F27');
  }, [appSettings]);

  useEffect(() => {
    const handleAuthLogout = () => {
      setCurrentUser(null);
      setUserRole(null);
      setUserName('');
      setActivePage('checkin');
      if (!publicMode) {
        setAdminModalOpen(true);
      }
      setPinInput('');
      setPinError(false);
      setSelectedUsuario(null);
    };

    const handleAuthChanged = (event) => {
      const authPayload = event.detail;
      if (!authPayload?.user) {
        return;
      }

      setCurrentUser(authPayload.user);
      setUserRole(authPayload.user.rol || null);
      setUserName(authPayload.user.nombre || '');
      setAdminModalOpen(false);
    };

    window.addEventListener('auth:logout', handleAuthLogout);
    window.addEventListener('auth:changed', handleAuthChanged);

    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout);
      window.removeEventListener('auth:changed', handleAuthChanged);
    };
  }, [publicMode]);

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

  useEffect(() => {
    const allowedPages = allowedPagesByRole[getRoleKey(userRole)];
    if (!allowedPages.includes(activePage)) {
      setActivePage(allowedPages[0]);
    }
  }, [activePage, userRole]);

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
      clearAuthSession();
      return;
    }

    setAdminModalOpen(true);
    setSelectedUsuario(null);
    setPinInput('');
    setPinError(false);
    setAttendanceError(false);
  };

const validarPin = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setPinError(false);
    setIsSubmitting(true);

    if (!selectedUsuario) {
      setPinError(true);
      setIsSubmitting(false);
      return;
    }

    try {
      // 1. LECTURA DIRECTA DE MEMORIA (¡Cero consultas a la base de datos trabada!)
      const empleado = selectedUsuario;
      const pinIngresado = String(pinInput).trim();
      
      // Tomamos el PIN directamente del objeto que ya está cargado
      const pinAlmacenado = String(empleado.pin ?? empleado.password ?? '').trim();

      // 2. VALIDACIÓN DE CREDENCIALES
      if (!pinIngresado || pinIngresado !== pinAlmacenado) {
        setPinError(true);
        setPinInput('');
        return; // El bloque finally se encargará de apagar el botón
      }

      // 3. GATE DE ASISTENCIA (Con Timeout de rescate)
      const esAdmin = String(empleado.role || empleado.rol || '').toLowerCase() === 'admin';

      if (!esAdmin && empleado.matricula) {
        const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Tijuana' });
        let asistenciaHoy = null;
        
        try {
          // Si es Staff, le damos solo 1.5 segundos a la BD para responder
          asistenciaHoy = await Promise.race([
            db.attendance
              .where('peleador_matricula').equals(empleado.matricula)
              .filter((r) => (r.fecha || r.date || '').startsWith(hoy))
              .first(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 1500))
          ]);
        } catch (dbErr) {
          console.warn('[Login] BD trabada al checar asistencia. Permitiendo entrada de emergencia.');
          asistenciaHoy = { id: 'bypass-offline' }; // Fail-open: Si la BD falla, lo dejamos pasar
        }

        if (!asistenciaHoy) {
          setAttendanceError(true);
          setPinInput('');
          return;
        }
      }

      // 4. SESIÓN LOCAL (Guarda directo en el navegador, 100% seguro)
      saveAuthSession({
        token: '',
        expires_at: null,
        user: {
          id: empleado.id || 'admin-emergencia',
          nombre: empleado.nombre,
          rol: empleado.role || empleado.rol || 'staff',
          usuario: empleado.usuario,
          matricula: empleado.matricula || 'ST-0000',
        },
      });

      setAdminModalOpen(false);
      setAttendanceError(false);
      
    } catch (error) {
      console.error('[Login] Error inesperado en validarPin:', error);
      setPinError(true);
      setPinInput('');
    } finally {
      // 5. EL DESBLOQUEO OBLIGATORIO
      setIsSubmitting(false); 
    }
  };

  const canAccess = (page) => allowedPagesByRole[getRoleKey(userRole)].includes(page);

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

        {userRole && (
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
            <p style={{ fontSize: '0.72rem', color: '#888', fontWeight: 700, marginBottom: '10px', textAlign: isSidebarOpen ? 'left' : 'center' }}>
              HOLA, {userName.toUpperCase()}
            </p>
            {/* LA TIENDA AHORA SOLO LA VE EL STAFF O ADMIN */}
            <button onClick={() => setActivePage('shop')} style={navBtnStyle('shop')}>
              <FiShoppingCart size={20} /> {isSidebarOpen && <span>Tienda</span>}
            </button>
            
            {userRole === 'admin' && (
              <button onClick={() => setActivePage('dashboard')} style={navBtnStyle('dashboard')}>
                <FiActivity size={20} /> {isSidebarOpen && <span>Panel de Control</span>}
              </button>
            )}
            <button onClick={() => setActivePage('members')} style={navBtnStyle('members')}>
              <FiUsers size={20} /> {isSidebarOpen && <span>Peleadores</span>}
            </button>
            {/* Pendientes: visible para todo el staff — necesitan ver synced:0 local */}
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
          {/* Indicador de red */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'flex-start' : 'center', gap: '10px', color: isOnline ? '#00bb2d' : '#e74c3c' }}>
            {isOnline ? <FiWifi size={20} /> : <FiWifiOff size={20} />}
            {isSidebarOpen && <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>}
          </div>

          {/* Indicador de sincronización — solo lectura, automático */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: isSidebarOpen ? 'flex-start' : 'center',
            gap: '8px',
            color: isSyncing ? '#d97706' : pendingCount === 0 ? '#16a34a' : '#6b7280',
          }}>
            <FiRefreshCw
              size={16}
              style={{ flexShrink: 0, animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}
            />
            {isSidebarOpen && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                {isSyncing
                  ? 'Sincronizando...'
                  : pendingCount === 0
                    ? 'Sincronizado'
                    : `Pendientes: ${pendingCount}`}
              </span>
            )}
          </div>

          <button onClick={handleAdminToggle} style={{ ...navBtnStyle('admin'), color: userRole ? '#e74c3c' : '#888', backgroundColor: 'transparent', padding: '5px 0' }}>
            {userRole ? <FiUnlock size={22} /> : <FiLock size={22} />}
            {isSidebarOpen && <span>{userRole ? 'Cerrar sesion' : 'Acceso Staff'}</span>}
          </button>
        </div>
      </div>
      )}

      <div style={{ flex: 1, minHeight: '100dvh', overflowY: 'auto', transition: 'all 0.3s ease', position: 'relative' }}>
        {activePage === 'dashboard' && canAccess('dashboard') && <Dashboard />}
        {activePage === 'checkin' && canAccess('checkin') && <CheckIn currentUser={currentUser} />}
        {activePage === 'register' && canAccess('register') && <RegisterFighter gymContext={publicGymContext} publicMode={publicMode} />}
        {activePage === 'members' && canAccess('members') && <FightersList userRole={userRole} />}
        {activePage === 'pending' && canAccess('pending') && <PendingFighters />}
        {activePage === 'attendance' && canAccess('attendance') && <AttendanceLog />}
        {activePage === 'shop' && canAccess('shop') && <ProShop userRole={userRole} currentUser={currentUser} />}
        {activePage === 'staff' && canAccess('staff') && <StaffManager />}
        {activePage === 'settings' && canAccess('settings') && <Settings themeSettings={appSettings} onSettingsChanged={loadSettings} />}
      </div>

      {adminModalOpen && !publicMode && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(3px)' }}>
          <div style={{ backgroundColor: '#fff', padding: '28px', borderRadius: '15px', width: '90%', maxWidth: '460px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ backgroundColor: 'var(--secondary-color)', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 15px auto', color: '#fff' }}>
              <FiLock size={28} />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--primary-color)', fontSize: '1.15rem' }}>Acceso restringido</h3>
            <p style={{ margin: '0 0 20px 0', color: '#888', fontSize: '0.9rem' }}>Ingresa tus credenciales de acceso.</p>
            <form onSubmit={validarPin}>
              <label style={{ display: 'block', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#888', marginBottom: '8px' }}>USUARIO</label>
              {loginUsersLoading ? (
                <div style={{ color: '#888', fontSize: '0.9rem', textAlign: 'left', marginBottom: '15px' }}>Cargando usuarios...</div>
              ) : (
                <select
                  value={selectedUsuario?.usuario || ''}
                  onChange={(event) => {
                    const nextUser = loginUsers.find((user) => user.usuario === event.target.value) || null;
                    setSelectedUsuario(nextUser);
                    setPinError(false);
                    setAttendanceError(false);
                  }}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #eee', outline: 'none', backgroundColor: '#fff', marginBottom: '15px', boxSizing: 'border-box' }}
                >
                  <option value="">Selecciona un usuario</option>
                  {loginUsers
                    .filter((u) => {
                      const esAdmin = String(u.role || u.rol || '').toLowerCase() === 'admin';
                      const yaCheco = checkedInStaff.has(u.matricula) || checkedInStaff.has(u.usuario);
                      return esAdmin || yaCheco;
                    })
                    .map((user) => (
                      <option key={user.usuario || user.matricula} value={user.usuario}>
                        {user.nombre} · {String(user.role || user.rol || 'staff').toUpperCase()}
                      </option>
                    ))}
                </select>
              )}

              {selectedUsuario && (
                <div style={{ marginBottom: '12px', textAlign: 'left', color: '#667085', fontSize: '0.82rem', fontWeight: 700 }}>
                  Usuario seleccionado: <span style={{ color: 'var(--primary-color)' }}>{selectedUsuario.nombre}</span>
                </div>
              )}

              <label style={{ display: 'block', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#888', marginBottom: '5px' }}>PASSWORD</label>
              <input
                type="password"
                autoFocus
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setPinError(false); setAttendanceError(false); }}
                disabled={!selectedUsuario || loginUsersLoading}
                style={{ width: '100%', padding: '12px', fontSize: '1rem', borderRadius: '8px', border: `2px solid ${pinError ? 'var(--secondary-color)' : '#eee'}`, outline: 'none', backgroundColor: (selectedUsuario && !loginUsersLoading) ? '#fff' : '#f3f4f6', marginBottom: '10px', boxSizing: 'border-box' }}
              />

              {pinError && !attendanceError && (
                <p style={{ color: 'var(--secondary-color)', margin: '0 0 10px 0', fontSize: '0.8rem', fontWeight: 700 }}>
                  CREDENCIALES INCORRECTAS
                </p>
              )}
              {attendanceError && (
                <p style={{ color: '#b42318', margin: '0 0 10px 0', fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.45, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', textAlign: 'left' }}>
                  Acceso denegado: Debes registrar tu entrada en el Reloj Checador con reconocimiento facial antes de iniciar sesión.
                </p>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: pinError || attendanceError ? 0 : '20px' }}>
                <button type="button" onClick={() => setAdminModalOpen(false)} style={{ padding: '10px', flex: 1, backgroundColor: '#eee', color: '#333', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                <button
                  type="submit"
                  disabled={!selectedUsuario || isSubmitting}
                  style={{ padding: '10px', flex: 1, backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: (!selectedUsuario || isSubmitting) ? 'not-allowed' : 'pointer', opacity: (!selectedUsuario || isSubmitting) ? 0.6 : 1 }}
                >
                  {isSubmitting ? 'Verificando...' : 'Entrar'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => { setAdminModalOpen(false); setActivePage('checkin'); }}
                style={{ marginTop: '14px', width: '100%', padding: '10px', backgroundColor: 'transparent', color: 'var(--secondary-color)', border: '1px solid var(--secondary-color)', borderRadius: '8px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <FiClock size={15} /> Ir al Reloj Checador / Check-In
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
