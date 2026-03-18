import React, { useState } from 'react';
import { CheckIn } from './components/CheckIn';
import { RegisterFighter } from './components/RegisterFighter';
import { Members } from './components/Members';
import { AttendanceLog } from './components/AttendanceLog';
import { Dashboard } from './components/Dashboard'; // 👇 NUEVO

function App() {
  const [activePage, setActivePage] = useState('dashboard');
  
  // 1. NUEVO ESTADO: Controla si el menú está abierto o cerrado
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 2. ESTILOS DINÁMICOS: El ancho cambia dependiendo del estado
  const sidebarWidth = isSidebarOpen ? '250px' : '75px';

  // Estilo inteligente para los botones del menú
  const navBtnStyle = (page) => ({
    width: '100%', 
    padding: '15px 10px', 
    marginBottom: '10px', 
    cursor: 'pointer', 
    border: 'none', 
    backgroundColor: activePage === page ? '#FF7F27' : 'transparent', 
    color: activePage === page ? '#fff' : '#666',
    borderRadius: '8px', 
    fontWeight: '900', 
    fontSize: isSidebarOpen ? '0.9rem' : '1.3rem', // Icono más grande si está cerrado
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: isSidebarOpen ? 'flex-start' : 'center', // Centra el icono al cerrar
    gap: isSidebarOpen ? '15px' : '0'
  });

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#fafafa', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* SIDEBAR (MENÚ LATERAL) */}
      <div style={{ 
        width: sidebarWidth, 
        backgroundColor: '#fff', 
        borderRight: '1px solid #eee', 
        padding: isSidebarOpen ? '40px 20px' : '40px 10px',
        transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)', // Animación suave
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
        
        {/* BOTÓN DE HAMBURGUESA / COLAPSAR */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{
            position: 'absolute',
            top: '15px',
            right: isSidebarOpen ? '15px' : 'auto',
            left: isSidebarOpen ? 'auto' : '50%',
            transform: isSidebarOpen ? 'none' : 'translateX(-50%)',
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#FF7F27',
            transition: '0.3s'
          }}
          title={isSidebarOpen ? "Minimizar Menú" : "Expandir Menú"}
        >
          {isSidebarOpen ? '◀' : '☰'}
        </button>

        {/* LOGO DINÁMICO */}
        <div style={{ height: 'auto', marginBottom: '40px', marginTop: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
          {isSidebarOpen ? (
             // Logo completo
             <img src="/logo.png" style={{ width: '100%', maxWidth: '100px', objectFit: 'contain' }} alt="Cota's Muay Thai" />
          ) : (
             // Si quieres, aquí puedes poner una versión "mini" del logo, o dejar el mismo ajustado
             <img src="/logo.png" style={{ width: '50px', height: '80px', objectFit: 'cover' }} alt="Logo" /> 
          )}
        </div>
        
        {/* BOTONES DE NAVEGACIÓN */}
        {/* Usamos el atributo "title" para que al pasar el mouse por el icono cerrado, diga para qué sirve */}
        {/* 👇 NUEVO BOTÓN DE INICIO 👇 */}
        <button onClick={() => setActivePage('dashboard')} style={navBtnStyle('dashboard')} title="Panel Central">
          <span>📊</span> {isSidebarOpen && <span>Inicio</span>}
        </button>
        
        {/* TUS OTROS BOTONES (Control de acceso, Registro, etc...) */}
        <button onClick={() => setActivePage('checkin')} style={navBtnStyle('checkin')} title="Control de Acceso">
          <span>📷</span> {isSidebarOpen && <span>Acceso</span>}
        </button>
        
        <button onClick={() => setActivePage('register')} style={navBtnStyle('register')} title="Nuevo Registro">
          <span>➕</span> {isSidebarOpen && <span>Registro</span>}
        </button>
        
        <button onClick={() => setActivePage('members')} style={navBtnStyle('members')} title="Miembros y Pagos">
          <span>👥</span> {isSidebarOpen && <span>Miembros</span>}
        </button>
        
        {/* 👇 NUEVO BOTÓN 👇 */}
        <button onClick={() => setActivePage('attendance')} style={navBtnStyle('attendance')} title="Asistencias de Hoy">
          <span>📅</span> {isSidebarOpen && <span>Asistencias</span>}
        </button>

      </div>

    {/* CONTENIDO PRINCIPAL */}
      <div style={{ flex: 1, height: '100vh', overflowY: 'auto', transition: 'all 0.3s ease', position: 'relative' }}>
        {activePage === 'dashboard' && <Dashboard />} {/* 👇 NUEVO */}
        {activePage === 'checkin' && <CheckIn />}
        {activePage === 'register' && <RegisterFighter />}
        {activePage === 'members' && <Members />}
        {activePage === 'attendance' && <AttendanceLog />}
      </div>
      
    </div>
  );
}

export default App;