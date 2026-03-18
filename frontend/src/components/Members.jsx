import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addPayment } from '../db/db';

export function Members() {
  const [searchTerm, setSearchTerm] = useState('');

  // Traemos a todos los peleadores
  const fighters = useLiveQuery(() => db.fighters.toArray());

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

              {/* COLUMNA 2: ESTADO (Placeholder para lógica de vigencia) */}
              <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'bold', textTransform: 'uppercase' }}>
                {/* En la siguiente fase, aquí calcularemos VIGENTE (Verde) / VENCIDO (Gris) */}
                --
              </div>

              {/* COLUMNA 3: ACCIONES */}
              <div style={{ textAlign: 'right' }}>
                <button 
                  onClick={() => handlePayMonth(fighter.id, fighter.name)}
                  style={{ 
                    padding: '10px 20px', backgroundColor: '#FF7F27', color: '#000000', 
                    border: 'none', borderRadius: '4px', cursor: 'pointer', 
                    fontSize: '0.7rem', fontWeight: '900', letterSpacing: '0.5px', textTransform: 'uppercase'
                  }}
                >
                   Renovar Mes
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
    </div>
  );
}