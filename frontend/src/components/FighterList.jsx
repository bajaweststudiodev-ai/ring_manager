import { useLiveQuery } from 'dexie-react-hooks';
import { db, addPayment } from '../db/db'; // Asegúrate de exportar addPayment en db.js

export function FighterList() {
  const fighters = useLiveQuery(() => db.fighters.toArray());

  if (!fighters) return <p>Cargando gimnasio...</p>;

  const handlePay = async (id) => {
    // Registramos 30 días de acceso
    await addPayment(id, 30);
    alert("¡Pago registrado! Ahora intenta el Check-in.");
  };

  return (
    <div style={{ marginTop: '20px', border: '1px solid #444', padding: '10px' }}>
      <h4>Lista de Miembros</h4>
      {fighters.map(f => (
        <div key={f.id} style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span><strong>{f.name}</strong> ({f.matricula})</span>
          <button onClick={() => handlePay(f.id)}>💳 Pagar Mes</button>
        </div>
      ))}
    </div>
  );
}