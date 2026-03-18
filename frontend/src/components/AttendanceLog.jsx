import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export function AttendanceLog() {
  // Traemos las últimas 10 asistencias, ordenadas de la más reciente a la más vieja
  const logs = useLiveQuery(() => 
    db.attendance.orderBy('id').reverse().limit(10).toArray()
  );

  // Tip de Senior: Como la tabla attendance solo tiene IDs, 
  // en un sistema real haríamos un proceso para mostrar el nombre.
  // Por ahora, veamos los timestamps para confirmar que se guarda.

  if (!logs) return null;

  return (
    <div style={{ marginTop: '20px', fontSize: '0.8rem', color: '#666' }}>
      <h4>Últimos accesos:</h4>
      <ul>
        {logs.map(log => (
          <li key={log.id}>
            ID Peleador: {log.fighter_id} - {new Date(log.timestamp).toLocaleTimeString()}
          </li>
        ))}
      </ul>
    </div>
  );
}