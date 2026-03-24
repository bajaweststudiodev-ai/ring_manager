import React, { useEffect, useState } from 'react';
import { FiClipboard, FiPlus, FiShield, FiTrash2, FiUser } from 'react-icons/fi';
import { db } from '../db/db';

const PALETTE = {
  orange: '#FF7F27',
  white: '#fff',
  dark: '#2d2e30',
  green: '#00bb2d',
  red: '#e74c3c',
  grayBg: '#fafafa',
  grayBorder: '#eee',
  grayText: '#888'
};

export function StaffManager() {
  const [staff, setStaff] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', usuario: '', pin: '', role: 'asistente' });

  useEffect(() => {
    loadStaff();
  }, []);

  const handleNameChange = (e) => {
    const nuevoNombre = e.target.value;
    const autoUsuario = nuevoNombre.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    setFormData({ ...formData, nombre: nuevoNombre, usuario: autoUsuario });
  };

  const loadStaff = async () => {
    const allStaff = await db.staff.toArray();
    setStaff(allStaff);
  };

  const handleGuardar = async () => {
    if (!formData.nombre || !formData.pin) {
      alert('Llena todos los campos.');
      return;
    }
    if (formData.pin.length < 4) {
      alert('El PIN debe tener 4 numeros.');
      return;
    }

    try {
      const existeUsuario = await db.staff.where('usuario').equals(formData.usuario).first();
      if (existeUsuario) {
        alert('Ese nombre de usuario ya existe. Agrega un apellido.');
        return;
      }

      await db.staff.add({
        nombre: formData.nombre,
        usuario: formData.usuario,
        pin: formData.pin,
        role: formData.role
      });

      setModalOpen(false);
      setFormData({ nombre: '', usuario: '', pin: '', role: 'asistente' });
      loadStaff();
    } catch (error) {
      console.error(error);
    }
  };

  const handleBorrar = async (id, role, nombre) => {
    if (role === 'admin' && staff.filter((item) => item.role === 'admin').length === 1) {
      alert('No puedes borrar al unico administrador del sistema.');
      return;
    }

    if (window.confirm(`Quitar acceso a ${nombre}?`)) {
      await db.staff.delete(id);
      loadStaff();
    }
  };

  const getRoleIcon = (role) => {
    if (role === 'admin') return <FiShield size={20} />;
    if (role === 'asistente') return <FiClipboard size={20} />;
    return <FiUser size={20} />;
  };

  const getRoleColors = (role) => {
    if (role === 'admin') return { bg: PALETTE.orange, iconColor: '#fff' };
    if (role === 'asistente') return { bg: '#e8f4fd', iconColor: '#007bff' };
    return { bg: '#eef2f5', iconColor: PALETTE.dark };
  };

  return (
    <div style={{ padding: '3vh 3vw', backgroundColor: PALETTE.grayBg, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', backgroundColor: PALETTE.white, padding: '25px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `2px solid ${PALETTE.orange}`, paddingBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
          <h2 style={{ color: PALETTE.dark, margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>
            <FiShield style={{ marginRight: '10px', verticalAlign: 'middle', color: PALETTE.orange }} />
            EQUIPO Y PERMISOS
          </h2>
          <button onClick={() => setModalOpen(true)} style={{ backgroundColor: PALETTE.dark, color: PALETTE.white, border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiPlus /> NUEVO USUARIO
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {staff.map((user) => {
            const colors = getRoleColors(user.role);
            return (
              <div key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', border: `1px solid ${PALETTE.grayBorder}`, borderRadius: '8px', backgroundColor: user.role === 'admin' ? '#fdf8f5' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ padding: '12px', backgroundColor: colors.bg, borderRadius: '50%', color: colors.iconColor }}>
                    {getRoleIcon(user.role)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: PALETTE.dark, fontSize: '1.1rem' }}>{user.nombre.toUpperCase()}</div>
                    <div style={{ fontSize: '0.8rem', color: PALETTE.grayText, fontWeight: 700, letterSpacing: '1px' }}>
                      PIN: **** | ROL: {user.role.toUpperCase()}
                    </div>
                  </div>
                </div>

                <button onClick={() => handleBorrar(user.id, user.role, user.nombre)} style={{ backgroundColor: 'transparent', color: PALETTE.red, border: 'none', cursor: 'pointer', padding: '10px' }} title="Quitar acceso">
                  <FiTrash2 size={20} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: PALETTE.white, padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '350px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: PALETTE.dark, borderBottom: `2px solid ${PALETTE.orange}`, paddingBottom: '10px' }}>Nuevo usuario</h3>

            <label style={labelStyle}>NOMBRE COMPLETO</label>
            <input type="text" placeholder="Ej. Coach Juan" value={formData.nombre} onChange={handleNameChange} style={inputStyle} />
            {formData.usuario && (
              <p style={{ margin: '5px 0 15px 0', fontSize: '0.8rem', color: PALETTE.green, fontWeight: 700 }}>
                Usuario generado: @{formData.usuario}
              </p>
            )}

            <label style={labelStyle}>PIN DE ACCESO (4 DIGITOS)</label>
            <input type="password" placeholder="Ej. 1111" value={formData.pin} onChange={(e) => setFormData({ ...formData, pin: e.target.value })} style={{ ...inputStyle, letterSpacing: '5px', fontWeight: 700 }} maxLength={4} />

            <label style={labelStyle}>NIVEL DE PERMISOS</label>
            <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} style={inputStyle}>
              <option value="asistente">ASISTENTE</option>
              <option value="entrenador">ENTRENADOR</option>
              <option value="admin">ADMINISTRADOR</option>
            </select>

            <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
              <button onClick={() => setModalOpen(false)} style={{ ...btnModalStyle, backgroundColor: '#eee', color: PALETTE.dark }}>CANCELAR</button>
              <button onClick={handleGuardar} style={{ ...btnModalStyle, backgroundColor: PALETTE.dark, color: PALETTE.white }}>GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: PALETTE.dark, marginBottom: '5px', marginTop: '15px' };
const inputStyle = { width: '100%', padding: '10px', border: `1px solid ${PALETTE.grayBorder}`, borderRadius: '6px', fontSize: '1rem', outline: 'none', backgroundColor: '#fcfcfc', boxSizing: 'border-box' };
const btnModalStyle = { padding: '12px', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', flex: 1 };
