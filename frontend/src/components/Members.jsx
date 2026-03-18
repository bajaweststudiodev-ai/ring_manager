import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addPayment } from '../db/db';
// Agrega esta línea debajo de tus otros imports
import { checkAccess } from '../logic/rules';
export function Members() {
  const [searchTerm, setSearchTerm] = useState('');
// --- NUEVO: ESTADOS PARA EDICIÓN ---
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ nombres: '', apellidos: '', telefono: '' });

  // Función para abrir la ventanita con los datos precargados
  const handleEditClick = (fighter) => {
    setEditingId(fighter.id);
    setEditData({
      nombres: fighter.nombres || '',
      apellidos: fighter.apellidos || '',
      telefono: fighter.telefono || ''
    });
  };

  // Función para guardar los cambios en Dexie
  const handleGuardarEdicion = async () => {
    try {
      await db.fighters.update(editingId, {
        nombres: editData.nombres,
        apellidos: editData.apellidos,
        telefono: editData.telefono,
        // Actualizamos el nombre completo para que el buscador siga funcionando
        name: `${editData.nombres} ${editData.apellidos}`.trim()
      });
      alert("✅ DATOS ACTUALIZADOS CORRECTAMENTE");
      setEditingId(null); // Cerramos la ventana
    } catch (error) {
      console.error(error);
      alert("❌ ERROR AL ACTUALIZAR");
    }
  };
  // Traemos a todos los peleadores
  // REEMPLAZA TU useLiveQuery POR ESTO:
  const fighters = useLiveQuery(async () => {
    const allFighters = await db.fighters.toArray();
    
    // Mapeamos cada peleador para adjuntarle su estado de pago actual
    return Promise.all(allFighters.map(async (fighter) => {
      const lastPayment = await db.payments.where('fighter_id').equals(fighter.id).last();
      const access = checkAccess(lastPayment);
      return { ...fighter, statusAccess: access }; // Combinamos los datos
    }));
  });

  const handlePayMonth = async (fighterId, name) => {
    const confirmacion = window.confirm(`¿Registrar mensualidad para ${name}?`);
    if (!confirmacion) return;

    try {
      await addPayment(fighterId, 30); // 30 días de vigencia
      alert(`PAGO REGISTRADO PARA ${name}`);
    } catch (error) {
      console.error(error);
      alert("ERROR AL REGISTRAR PAGO");
    }
  };

  if (!fighters) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#1F2A44' }}>CARGANDO DATOS...</div>;

  const filteredFighters = fighters.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.matricula.includes(searchTerm)
  );

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0', backgroundColor: '#fafafa' }}>
      <div style={{ 
        width: '900px', backgroundColor: '#ffffff', borderRadius: '15px',
        padding: '40px', border: '1px solid #e0e0e0',
        minHeight: '60vh'
      }}>
        
        {/* CABECERA (Paleta Cota's) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '35px' }}>
          <div>
            {/* Usamos el Azul Marino Oscuro (#1F2A44) para el título */}
            <h2 style={{ fontSize: '1.85rem', letterSpacing: '-1.5px', margin: '0 0 10px 0', fontWeight: '900', color: '#1F2A44' }}>
              DIRECTORIO DE MIEMBROS
            </h2>
            <p style={{ margin: 0, color: '#FF7F27', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
              TOTAL GUERREROS: {fighters.length}
            </p>
          </div>
          
          <input 
            style={{ 
              padding: '12px 25px', width: '250px', borderRadius: '50px', 
              border: '1px solid #1F2A44', fontSize: '0.85rem', outline: 'none',
              backgroundColor: '#fafafa', color: '#1F2A44'
            }} 
            placeholder=" Buscar por nombre o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* TABLA DE MIEMBROS (Limpia, Minimalista) */}
        <div style={{ border: '1px solid #1F2A44', borderRadius: '8px', overflow: 'hidden' }}>
          {filteredFighters.map((fighter, index) => (
            <div key={fighter.id} style={{ 
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', alignItems: 'center',
              padding: '18px 25px', borderBottom: index === filteredFighters.length - 1 ? 'none' : '1px solid #eee',
              backgroundColor: index % 2 === 0 ? '#ffffff' : '#fafafa'
            }}>
              
              {/* COLUMNA 1: INFO PERSONAL */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ width: '45px', height: '45px', borderRadius: '5px', backgroundColor: '#fafafa', border: '1px solid #1F2A44', overflow: 'hidden' }}>
                  {/* Foto real o placeholder limpio */}
                  <img src={fighter.photo_url || '/avatar.png'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar" />
                </div>
                <div>
                  {/* Nombre en mayúsculas para lectura rápida */}
                  <div style={{ fontWeight: '900', fontSize: '1rem', color: '#1F2A44' }}>
                    {fighter.name.toUpperCase()}
                  </div>
                  <div style={{ color: '#888', fontSize: '0.75rem', letterSpacing: '1px' }}>
                    ID: {fighter.matricula}
                  </div>
                </div>
              </div>

              {/* REEMPLAZA EL "--" DENTRO DE LA COLUMNA 2 POR ESTO: */}
              <div style={{ fontSize: '0.75rem', fontWeight: '900', letterSpacing: '0.5px' }}>
                {fighter.statusAccess?.canEnter ? (
                  <span style={{ color: '#155724', backgroundColor: '#d4edda', padding: '6px 12px', borderRadius: '50px' }}>
                    🟢 VIGENTE
                  </span>
                ) : (
                  <span style={{ color: '#721c24', backgroundColor: '#f8d7da', padding: '6px 12px', borderRadius: '50px' }}>
                    🔴 VENCIDO
                  </span>
                )}
              </div>

              {/* COLUMNA 3: ACCIONES */}
             {/* COLUMNA 3: ACCIONES */}
              <div style={{ textAlign: 'right', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => handleEditClick(fighter)}
                  style={{ 
                    padding: '8px 12px', backgroundColor: '#1F2A44', color: '#ffffff', 
                    border: 'none', borderRadius: '4px', cursor: 'pointer', 
                    fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase'
                  }}
                >
                  ✏️ Editar
                </button>
                <button 
                  onClick={() => handlePayMonth(fighter.id, fighter.name)}
                  style={{ 
                    padding: '8px 12px', backgroundColor: '#FF7F27', color: '#ffffff', 
                    border: 'none', borderRadius: '4px', cursor: 'pointer', 
                    fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase'
                  }}
                >
                  ➕ Renovar
                </button>
              </div>

            </div>
          ))}

          {filteredFighters.length === 0 && (
            <div style={{ padding: '60px', textAlign: 'center', color: '#aaa', fontSize: '0.9rem', fontWeight: 'bold' }}>
              NO SE ENCONTRARON PELEADORES CON ESE CRITERIO.
            </div>
          )}
        </div>

      </div>
      {/* --- MODAL FLOTANTE DE EDICIÓN --- */}
        {editingId && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
          }}>
            <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
              <h3 style={{ marginTop: 0, color: '#1F2A44', borderBottom: '2px solid #FF7F27', paddingBottom: '10px' }}>✏️ EDITAR ALUMNO</h3>
              
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '5px' }}>NOMBRES</label>
              <input 
                style={{ width: '100%', padding: '10px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }}
                value={editData.nombres} onChange={e => setEditData({...editData, nombres: e.target.value.toUpperCase()})}
              />

              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '5px' }}>APELLIDOS</label>
              <input 
                style={{ width: '100%', padding: '10px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }}
                value={editData.apellidos} onChange={e => setEditData({...editData, apellidos: e.target.value.toUpperCase()})}
              />

              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '5px' }}>TELÉFONO</label>
              <input 
                type="number" style={{ width: '100%', padding: '10px', marginBottom: '25px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }}
                value={editData.telefono} onChange={e => setEditData({...editData, telefono: e.target.value})}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>CANCELAR</button>
                <button onClick={handleGuardarEdicion} style={{ flex: 1, padding: '10px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>✅ GUARDAR</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}