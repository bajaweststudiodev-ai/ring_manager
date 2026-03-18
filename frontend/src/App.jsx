import React, { useState } from 'react';
import { CheckIn } from './components/CheckIn';
import { RegisterFighter } from './components/RegisterFighter';
import { Members } from './components/Members'; // <-- No olvides importar

function App() {
  const [activePage, setActivePage] = useState('checkin');

  // Estilo reutilizable para los botones del menú
  const navBtnStyle = (page) => ({
    width: '100%', padding: '15px', marginBottom: '10px', 
    cursor: 'pointer', textAlign: 'left', border: 'none', 
    backgroundColor: activePage === page ? '#FF7F27' : 'transparent', 
    color: activePage === page ? '#fff' : '#666',
    borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem',
    transition: '0.2s'
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#fafafa', fontFamily: 'sans-serif' }}>
      
      {/* SIDEBAR IZQUIERDO */}
      <div style={{ width: '250px', backgroundColor: '#fff', borderRight: '1px solid #eee', padding: '40px 20px' }}>
        <img src="/logo.png" style={{ width: '100%', marginBottom: '50px' }} alt="Logo" />
        
        <button onClick={() => setActivePage('checkin')} style={navBtnStyle('checkin')}>
          Control de Acceso
        </button>
        <button onClick={() => setActivePage('register')} style={navBtnStyle('register')}>
           Nuevo Registro
        </button>
        <button onClick={() => setActivePage('members')} style={navBtnStyle('members')}>
           Miembros y Pagos
        </button>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div style={{ flex: 1 }}>
        {activePage === 'checkin' && <CheckIn />}
        {activePage === 'register' && <RegisterFighter />}
        {activePage === 'members' && <Members />}
      </div>
    </div>
  );
}

export default App;