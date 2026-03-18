import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export function Dashboard() {
  // 1. Consultas reactivas a la base de datos
  const totalFighters = useLiveQuery(() => db.fighters.count()) || 0;
  
  const asistenciasHoy = useLiveQuery(async () => {
    const today = new Date().toISOString().split('T')[0];
    const logs = await db.attendance.toArray();
    return logs.filter(record => record.date.startsWith(today)).length;
  }) || 0;

  // 2. Diseño de Tarjeta de Métrica (Reutilizable)
  const MetricCard = ({ title, value, icon, color, bg }) => (
    <div style={{ 
      backgroundColor: bg, border: `2px solid ${color}`, borderRadius: '15px', 
      padding: '30px', display: 'flex', alignItems: 'center', gap: '20px',
      boxShadow: '0 10px 20px rgba(0,0,0,0.05)', flex: '1 1 250px'
    }}>
      <div style={{ fontSize: '3rem', backgroundColor: color, color: '#fff', width: '80px', height: '80px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '12px' }}>
        {icon}
      </div>
      <div>
        <h4 style={{ margin: '0 0 5px 0', color: '#1F2A44', fontSize: '1rem', letterSpacing: '1px' }}>{title}</h4>
        <div style={{ fontSize: '2.5rem', fontWeight: '900', color: color, lineHeight: '1' }}>
          {value}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in" style={{ padding: '40px 20px', display: 'flex', justifyContent: 'center', backgroundColor: '#fafafa', minHeight: '80vh' }}>
      <div style={{ width: '100%', maxWidth: '1050px' }}>
        
        {/* ENCABEZADO */}
        <div style={{ marginBottom: '40px', borderBottom: '3px solid #FF7F27', paddingBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ color: '#1F2A44', fontSize: '2.5rem', margin: '0 0 10px 0', fontWeight: '900', letterSpacing: '-1px' }}>
              PANEL CENTRAL
            </h1>
            <p style={{ color: '#888', margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>
              Resumen operativo de Team Cota's Muay Thai
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, color: '#1F2A44', fontWeight: '900', fontSize: '1.2rem' }}>
              {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
            </p>
          </div>
        </div>

        {/* TARJETAS DE MÉTRICAS */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', marginBottom: '50px' }}>
          <MetricCard 
            title="TOTAL GUERREROS" 
            value={totalFighters} 
            icon="🥊" 
            color="#1F2A44" 
            bg="#ffffff" 
          />
          <MetricCard 
            title="ASISTENCIAS HOY" 
            value={asistenciasHoy} 
            icon="🔥" 
            color="#FF7F27" 
            bg="#fffaf5" 
          />
          <MetricCard 
            title="SISTEMA" 
            value="ONLINE" 
            icon="🟢" 
            color="#28a745" 
            bg="#f0fff4" 
          />
        </div>

        {/* ÁREA DE ACCESO RÁPIDO O GRÁFICOS (Para el futuro) */}
        <div style={{ backgroundColor: '#fff', borderRadius: '15px', padding: '40px', border: '1px solid #eee', textAlign: 'center', color: '#ccc' }}>
          <h3 style={{ color: '#1F2A44', marginTop: 0 }}>MÓDULO DE GRÁFICOS</h3>
          <p>Aquí pondremos las gráficas de ingresos cuando conectemos el sistema a la nube.</p>
        </div>

      </div>
    </div>
  );
}