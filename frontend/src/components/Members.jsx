import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addPayment, db, getFighterDisplayName, normalizeFighterRecord, normalizePaymentRecord } from '../db/db';
import { checkAccess } from '../logic/rules';

export function Members() {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ nombre: '', apellidos: '', telefono: '' });

  const handleEditClick = (fighter) => {
    setEditingId(fighter.id);
    setEditData({
      nombre: fighter.nombre || '',
      apellidos: `${fighter.apellido_paterno || ''} ${fighter.apellido_materno || ''}`.trim(),
      telefono: fighter.telefono || ''
    });
  };

  const handleGuardarEdicion = async () => {
    try {
      const [apellido_paterno = '', ...restoApellidos] = editData.apellidos.trim().split(' ');
      await db.fighters.update(editingId, {
        nombre: editData.nombre,
        apellido_paterno,
        apellido_materno: restoApellidos.join(' '),
        telefono: editData.telefono,
        name: `${editData.nombre} ${editData.apellidos}`.trim()
      });
      alert('DATOS ACTUALIZADOS CORRECTAMENTE');
      setEditingId(null);
    } catch (error) {
      console.error(error);
      alert('ERROR AL ACTUALIZAR');
    }
  };

  const fighters = useLiveQuery(async () => {
    const allFighters = (await db.fighters.toArray()).map(normalizeFighterRecord);
    return Promise.all(allFighters.map(async (fighter) => {
      const lastPayment = normalizePaymentRecord(await db.payments.where('peleador_matricula').equals(fighter.matricula).last());
      const access = checkAccess(lastPayment.tipo_pago ? {
        date: lastPayment.fecha_pago,
        type: lastPayment.tipo_pago,
        amount: lastPayment.monto,
        method: lastPayment.metodo_pago
      } : null);
      return { ...fighter, statusAccess: access };
    }));
  });

  const handlePayMonth = async (fighter) => {
    const nombre = getFighterDisplayName(fighter);
    const confirmacion = window.confirm(`Registrar mensualidad para ${nombre}?`);
    if (!confirmacion) return;

    try {
      await addPayment(fighter, 'MENSUALIDAD', 650, 'EFECTIVO');
      alert(`PAGO REGISTRADO PARA ${nombre}`);
    } catch (error) {
      console.error(error);
      alert('ERROR AL REGISTRAR PAGO');
    }
  };

  if (!fighters) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#1F2A44' }}>CARGANDO DATOS...</div>;

  const filteredFighters = fighters.filter((fighter) =>
    getFighterDisplayName(fighter).toLowerCase().includes(searchTerm.toLowerCase())
    || fighter.matricula.includes(searchTerm)
  );

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0', backgroundColor: '#fafafa' }}>
      <div style={{ width: '900px', backgroundColor: '#ffffff', borderRadius: '15px', padding: '40px', border: '1px solid #e0e0e0', minHeight: '60vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '35px' }}>
          <div>
            <h2 style={{ fontSize: '1.85rem', letterSpacing: '-1.5px', margin: '0 0 10px 0', fontWeight: 900, color: '#1F2A44' }}>
              DIRECTORIO DE MIEMBROS
            </h2>
            <p style={{ margin: 0, color: '#FF7F27', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
              TOTAL GUERREROS: {fighters.length}
            </p>
          </div>

          <input
            style={{ padding: '12px 25px', width: '250px', borderRadius: '50px', border: '1px solid #1F2A44', fontSize: '0.85rem', outline: 'none', backgroundColor: '#fafafa', color: '#1F2A44' }}
            placeholder="Buscar por nombre o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ border: '1px solid #1F2A44', borderRadius: '8px', overflow: 'hidden' }}>
          {filteredFighters.map((fighter, index) => (
            <div key={fighter.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', alignItems: 'center', padding: '18px 25px', borderBottom: index === filteredFighters.length - 1 ? 'none' : '1px solid #eee', backgroundColor: index % 2 === 0 ? '#ffffff' : '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ width: '45px', height: '45px', borderRadius: '5px', backgroundColor: '#fafafa', border: '1px solid #1F2A44', overflow: 'hidden' }}>
                  <img src={fighter.foto_path || '/avatar.png'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar" />
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '1rem', color: '#1F2A44' }}>
                    {getFighterDisplayName(fighter).toUpperCase()}
                  </div>
                  <div style={{ color: '#888', fontSize: '0.75rem', letterSpacing: '1px' }}>
                    ID: {fighter.matricula}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.5px' }}>
                {fighter.statusAccess?.canEnter ? (
                  <span style={{ color: '#155724', backgroundColor: '#d4edda', padding: '6px 12px', borderRadius: '50px' }}>
                    VIGENTE
                  </span>
                ) : (
                  <span style={{ color: '#721c24', backgroundColor: '#f8d7da', padding: '6px 12px', borderRadius: '50px' }}>
                    VENCIDO
                  </span>
                )}
              </div>

              <div style={{ textAlign: 'right', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => handleEditClick(fighter)} style={{ padding: '8px 12px', backgroundColor: '#1F2A44', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase' }}>
                  Editar
                </button>
                <button onClick={() => handlePayMonth(fighter)} style={{ padding: '8px 12px', backgroundColor: '#FF7F27', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase' }}>
                  Renovar
                </button>
              </div>
            </div>
          ))}

          {filteredFighters.length === 0 && (
            <div style={{ padding: '60px', textAlign: 'center', color: '#aaa', fontSize: '0.9rem', fontWeight: 700 }}>
              NO SE ENCONTRARON PELEADORES CON ESE CRITERIO.
            </div>
          )}
        </div>
      </div>

      {editingId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, color: '#1F2A44', borderBottom: '2px solid #FF7F27', paddingBottom: '10px' }}>EDITAR ALUMNO</h3>

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px' }}>NOMBRE</label>
            <input style={{ width: '100%', padding: '10px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }} value={editData.nombre} onChange={(e) => setEditData({ ...editData, nombre: e.target.value.toUpperCase() })} />

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px' }}>APELLIDOS</label>
            <input style={{ width: '100%', padding: '10px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }} value={editData.apellidos} onChange={(e) => setEditData({ ...editData, apellidos: e.target.value.toUpperCase() })} />

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px' }}>TELEFONO</label>
            <input type="number" style={{ width: '100%', padding: '10px', marginBottom: '25px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }} value={editData.telefono} onChange={(e) => setEditData({ ...editData, telefono: e.target.value })} />

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
              <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>CANCELAR</button>
              <button onClick={handleGuardarEdicion} style={{ flex: 1, padding: '10px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
