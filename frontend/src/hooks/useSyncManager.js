import { useEffect, useRef, useState } from 'react';
import { db } from '../db/db';
import { fetchApi } from '../config/api';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos — red-safety net

// Tablas sincronizables. 'key' debe coincidir con lo que /api/sync espera en el payload.
// fighters y staff no tienen endpoint de sync en backend — se excluyen.
const SYNCABLE_TABLES = [
  { table: 'attendance', key: 'attendance' },
  { table: 'sales',      key: 'sales'      },
  { table: 'payments',   key: 'payments'   },
];

export function useSyncManager() {
  const [isSyncing, setIsSyncing]     = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Ref anti-re-entrada: evita dos ejecuciones simultáneas de processSync.
  const isSyncingRef = useRef(false);
  const intervalRef  = useRef(null);

  // ─── Contar pendientes sin intentar envío ────────────────────────────────────
  const countPending = async () => {
    try {
      const counts = await Promise.all(
        SYNCABLE_TABLES.map(({ table }) =>
          db[table].where('synced').equals(0).count()
        )
      );
      setPendingCount(counts.reduce((a, b) => a + b, 0));
    } catch (_) {}
  };

  // ─── Motor principal de sincronización ───────────────────────────────────────
  // MODO AISLAMIENTO LOCAL: solo observa Dexie y actualiza el contador.
  // El bloque de red está desactivado temporalmente para pruebas offline.
  const processSync = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      // Contar pendientes en todas las tablas y actualizar UI.
      const counts = await Promise.all(
        SYNCABLE_TABLES.map(({ table }) =>
          db[table].where('synced').equals(0).count()
        )
      );
      setPendingCount(counts.reduce((a, b) => a + b, 0));
    } catch (_) {
    } finally {
      isSyncingRef.current = false;
    }

    // ── DESACTIVADO: envío al servidor ──────────────────────────────────────
    // Descomentar para reactivar sync cuando el servidor esté listo.
    //
    // if (!navigator.onLine) return;
    // setIsSyncing(true);
    // try {
    //   const rows = await Promise.all(
    //     SYNCABLE_TABLES.map(({ table }) =>
    //       db[table].where('synced').equals(0).toArray()
    //     )
    //   );
    //   const total = rows.reduce((sum, arr) => sum + arr.length, 0);
    //   setPendingCount(total);
    //   if (total === 0) return;
    //   const payload = {};
    //   SYNCABLE_TABLES.forEach(({ key }, idx) => { payload[key] = rows[idx]; });
    //   const response = await fetchApi('/api/sync', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(payload),
    //   });
    //   if (!response.ok && response.status !== 409) {
    //     console.warn('[SyncManager] Servidor rechazó sync, se reintentará en 5 min.', response.status);
    //     return;
    //   }
    //   const bulkUpdates = rows.map((arr, idx) => {
    //     const { table } = SYNCABLE_TABLES[idx];
    //     if (!arr.length) return Promise.resolve();
    //     return db[table].bulkUpdate(arr.map((r) => ({ key: r.id, changes: { synced: 1 } })));
    //   });
    //   await Promise.all(bulkUpdates);
    //   setPendingCount(0);
    //   console.info('[SyncManager] Sincronización completada ✓');
    // } catch (err) {
    //   console.warn('[SyncManager] Red no disponible durante sync:', err.message);
    //   await countPending();
    // } finally {
    //   isSyncingRef.current = false;
    //   setIsSyncing(false);
    // }
  };

  // ─── Disparadores automáticos ─────────────────────────────────────────────────
  useEffect(() => {
    // Al montar: contar pendientes y sincronizar si hay red
    countPending();
    processSync();

    // Al recuperar la red: sincronizar de inmediato
    window.addEventListener('online', processSync);

    // Red-safety net: cada 5 minutos por si hay intermitencias
    intervalRef.current = setInterval(processSync, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', processSync);
      clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isSyncing, pendingCount };
}
