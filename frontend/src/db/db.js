import Dexie from 'dexie';

export const db = new Dexie('GymDatabase');

// ¡AUMENTAMOS LA VERSIÓN A 2 PORQUE CAMBIÓ LA ESTRUCTURA!
db.version(2).stores({
  // Solo ponemos los campos por los que vamos a BUSCAR (filtrar)
  fighters: '++id, uuid, matricula, name, phone, membership_type, status', 
  attendance: '++id, fighter_id, date, synced',
  payments: '++id, fighter_id, valid_until, type'
});

// Actualizamos nuestra función de guardado
export const addFighterFull = async (fighterData) => {
  try {
    const id = await db.fighters.add({
      uuid: crypto.randomUUID(),
      status: 'active',
      created_at: new Date().toISOString(),
      ...fighterData // Aquí entrarán la foto, firma, datos médicos, etc.
    });
    return id;
  } catch (error) {
    console.error("Error al guardar guerrero:", error);
    throw error;
  }
};
// 3. Función Helper para agregar (Lógica de Negocio)
export const addFighter = async (name, matricula) => {
  try {
    const id = await db.fighters.add({
      uuid: crypto.randomUUID(), // ID universal para el servidor
      name: name,
      matricula: matricula,
      status: 'active',
      created_at: new Date().toISOString()
    });
    return id;
  } catch (error) {
    console.error("Error al guardar en IndexedDB:", error);
    throw error;
  }
};

// Agrega esta función al final de tu src/db/db.js

export const addPayment = async (fighterId, daysToAdd) => {
  const hoy = new Date();
  const vencimiento = new Date();
  vencimiento.setDate(hoy.getDate() + daysToAdd);

  return await db.payments.add({
    fighter_id: fighterId,
    fecha_pago: hoy.toISOString(),
    valid_until: vencimiento.toISOString(), // Esta es la fecha clave
    synced: 0
  });
};

// Agrega esto a tu archivo db.js

export const recordAttendance = async (fighterId) => {
  return await db.attendance.add({
    fighter_id: fighterId,
    timestamp: new Date().toISOString(),
    synced: 0 // Importante para cuando conectemos Flask
  });
};