import { db, normalizePaymentRecord } from '../db/db';
import { apiUrl } from '../config/api';

const BACKEND_URL = apiUrl('/api/sync');

export const sincronizarConServidor = async () => {
  if (!navigator.onLine) {
    console.log('Sin conexion. La sincronizacion queda en pausa.');
    return;
  }

  try {
    const asistenciasPendientes = await db.attendance.where('synced').equals(0).toArray();
    const ventasPendientes = await db.sales.where('synced').equals(0).toArray();
    const pagosPendientes = (await db.payments.where('synced').equals(0).toArray()).map(normalizePaymentRecord);

    if (asistenciasPendientes.length === 0 && ventasPendientes.length === 0 && pagosPendientes.length === 0) {
      console.log('No hay cambios pendientes.');
      return;
    }

    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attendance: asistenciasPendientes,
        sales: ventasPendientes,
        payments: pagosPendientes
      })
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || 'El servidor rechazo la sincronizacion.');
    }

    if (asistenciasPendientes.length > 0) {
      await db.attendance.bulkUpdate(asistenciasPendientes.map((item) => ({ key: item.id, changes: { synced: 1 } })));
    }
    if (ventasPendientes.length > 0) {
      await db.sales.bulkUpdate(ventasPendientes.map((item) => ({ key: item.id, changes: { synced: 1 } })));
    }
    if (pagosPendientes.length > 0) {
      await db.payments.bulkUpdate(pagosPendientes.map((item) => ({ key: item.id, changes: { synced: 1 } })));
    }

    console.log('Sincronizacion completada.');
  } catch (error) {
    console.error('No pude sincronizar con el servidor:', error);
  }
};
