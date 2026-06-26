/**
 * cajaService — deduplicación de GET /api/caja/estado/:id
 *
 * Problema que resuelve:
 *   React 18 StrictMode monta efectos dos veces en dev.
 *   Además, si currentUser cambia de null → objeto en el primer render,
 *   el useEffect [currentUser?.id] puede dispararse en rápida sucesión
 *   generando N peticiones simultáneas al mismo endpoint.
 *
 * Solución:
 *   Mientras haya una petición en vuelo para un userId dado, cualquier
 *   llamada adicional reutiliza la misma Promise en lugar de abrir una
 *   nueva conexión. La Promise se libera al terminar (ok o error).
 *   Llamadas con `force: true` ignoran el caché (ej. después de una venta).
 */

import { fetchApi } from '../config/api';

const inFlight = new Map();  // userId → Promise<json>

/**
 * @param {number|string} userId
 * @param {{ force?: boolean }} opciones
 *   force = true  → ignora el caché, siempre hace un fetch fresco
 *                   (usar después de abrir/cerrar caja o registrar venta)
 */
export async function getCajaEstado(userId, { force = false } = {}) {
  const key = String(userId);

  if (!force && inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = fetchApi(`/api/caja/estado/${key}`)
    .then((res) => res.json().catch(() => ({})))
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}
