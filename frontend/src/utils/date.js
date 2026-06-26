// src/utils/date.js
// Solución centralizada al bug UTC de new Date('YYYY-MM-DD').
// JS interpreta las fechas cortas como UTC medianoche; en Tijuana (UTC-7/8)
// eso hace que "2026-05-10" se muestre como "9/5/2026".
// La solución: si el string es solo fecha, le clavamos T12:00:00 para que JS
// lo lea como hora LOCAL en lugar de UTC.

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convierte un string de fecha al objeto Date correcto en hora local.
 * - "YYYY-MM-DD"          → parseado como local (añade T12:00:00)
 * - "YYYY-MM-DD HH:MM:SS" → reemplaza espacio con T, sin zona → local
 * - ISO con offset/Z      → JS lo interpreta correctamente
 */
export const parseDateLocal = (value) => {
  if (!value) return new Date(NaN);
  const str = String(value).trim();
  if (DATE_ONLY_RE.test(str)) return new Date(`${str}T12:00:00`);
  return new Date(str.replace(' ', 'T'));
};

/**
 * Formatea cualquier string de fecha para mostrar en UI (sin hora).
 * Maneja tanto "YYYY-MM-DD" como ISO completos sin desfase de zona horaria.
 */
export const formatDateLocal = (value, locale = 'es-MX') => {
  if (!value) return '';
  const d = parseDateLocal(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
};

/**
 * Formatea un string de fecha+hora completo (created_at, hora_entrada, etc.).
 * Para full ISO strings con offset (Z o +/-HH:MM) los deja que JS convierta a local.
 * Para datetimes sin offset reemplaza el espacio con T (SQLite format → local).
 */
export const formatDateTimeLocal = (value, locale = 'es-MX') => {
  if (!value) return '';
  const d = parseDateLocal(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};
