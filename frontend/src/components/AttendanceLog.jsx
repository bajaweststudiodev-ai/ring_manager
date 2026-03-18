import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export function AttendanceLog() {
  // 1. Traemos las asistencias de HOY y las cruzamos con los datos del peleador
  const logs = useLiveQuery(async () => {
    const today = new Date().toISOString().split('T')[0]; // Ej: "2026-03-18"
    
    const allAttendance = await db.attendance.toArray();
    // Filtramos solo las de hoy y las ordenamos de la más reciente a la más vieja
    const todaysAttendance = allAttendance
      .filter(record => record.date.startsWith(today))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Le "pegamos" el nombre y la foto del peleador a cada registro
    return Promise.all(todaysAttendance.map(async (record) => {
      const fighter = await db.fighters.get(record.fighter_id);
      return { ...record, fighter };
    }));
  });

  if (!logs) return <div style={{ textAlign: 'center', padding: '50px', color: '#1F2A44' }}>CARGANDO REGISTROS...</div>;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px', backgroundColor: '#fafafa', minHeight: '80vh' }}>
      <div style={{ width: '100%', maxWidth: '900px', backgroundColor: '#ffffff', borderRadius: '15px', padding: '40px', border: '1px solid #e0e0e0', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '2px solid #FF7F27', paddingBottom: '15px' }}>
          <h2 style={{ fontSize: '1.8rem', margin: 0, fontWeight: '900', color: '#1F2A44' }}>
            REGISTRO DE ASISTENCIAS
          </h2>
          <div style={{ backgroundColor: '#1F2A44', color: '#fff', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold' }}>
            HOY: {logs.length} INGRESOS
          </div>
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
          {logs.map((log, index) => {
            // Formateamos la hora (Ej: "12:04 PM")
            const horaHora = new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={log.id} style={{ 
                display: 'grid', gridTemplateColumns: '80px 1fr 150px', alignItems: 'center',
                padding: '15px 20px', borderBottom: index === logs.length - 1 ? 'none' : '1px solid #eee',
                backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa'
              }}>
                {/* HORA */}
                <div style={{ fontWeight: '900', color: '#FF7F27', fontSize: '1.1rem' }}>
                  {horaHora}
                </div>

                {/* INFO PELEADOR */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '5px', backgroundColor: '#eee', overflow: 'hidden' }}>
                    <img src={log.fighter?.photo_url || '/avatar.png'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar" />
                  </div>
                  <div>
                    <div style={{ fontWeight: '900', color: '#1F2A44' }}>{log.fighter?.name || 'DESCONOCIDO'}</div>
                    <div style={{ color: '#888', fontSize: '0.75rem', letterSpacing: '0.5px' }}>ID: {log.fighter?.matricula}</div>
                  </div>
                </div>

                {/* ESTADO DE ENTRADA */}
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: '#155724', backgroundColor: '#d4edda', padding: '5px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                    ✅ ACCESO OK
                  </span>
                </div>
              </div>
            );
          })}

          {logs.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontWeight: 'bold' }}>
              AÚN NO HAY INGRESOS EL DÍA DE HOY
            </div>
          )}
        </div>

      </div>
    </div>
  );
}