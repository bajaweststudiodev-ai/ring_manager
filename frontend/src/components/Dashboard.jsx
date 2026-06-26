import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FiActivity, FiAlertTriangle, FiDollarSign, FiUsers, FiPackage, FiCalendar } from 'react-icons/fi';
import { fetchApi } from '../config/api';
import { db } from '../db/db';

const EMPTY_KPIS = {
  ingresos_hoy: 0,
  ingresos_mes: 0,
  alumnos_activos: 0,
  alumnos_deudores: 0,
};

const EMPTY_GRAFICAS = {
  ventas_semana: [],
  asistencia_hora: [],
  alertas_caja: [],
  stock_critico: [],
};

const buildHttpError = (label, response, body) => {
  const error = new Error(body?.message || `No pude cargar ${label}.`);
  error.status = response.status;
  error.statusText = response.statusText;
  error.url = response.apiResolvedUrl || response.url;
  error.apiBaseUrl = response.apiBaseUrl || '';
  error.responseBody = body;
  return error;
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

// Computa KPIs y gráficas desde IndexedDB — no requiere red.
// Fuente de verdad offline: sales, payments, fighters, products, attendance.
async function computeLocalStats() {
  const today = new Date().toISOString().slice(0, 10);     // 'YYYY-MM-DD'
  const monthStart = today.slice(0, 7);                     // 'YYYY-MM'

  const [fighters, payments, sales, products, attendance] = await Promise.all([
    db.fighters.toArray(),
    db.payments.toArray(),
    db.sales.toArray(),
    db.products.toArray(),
    db.attendance.toArray(),
  ]);

  const ingresosHoy = sales
    .filter((s) => (s.fecha || s.date || '').startsWith(today))
    .reduce((sum, s) => sum + Number(s.total || 0), 0);

  const ingresosMes = payments
    .filter((p) => (p.fecha_pago || p.date || '').startsWith(monthStart) && !Number(p.cancelado))
    .reduce((sum, p) => sum + Number(p.monto || p.amount || 0), 0);

  const activos = fighters.filter(
    (f) => (f.estado || 'ACTIVO').toUpperCase() === 'ACTIVO'
  ).length;

  // Deudores: alumnos activos sin pago registrado en el mes actual
  const pagoEsteMes = new Set(
    payments
      .filter((p) => (p.fecha_pago || p.date || '').startsWith(monthStart) && !Number(p.cancelado))
      .map((p) => p.peleador_matricula || p.matricula)
  );
  const deudores = fighters.filter(
    (f) => (f.estado || 'ACTIVO').toUpperCase() === 'ACTIVO' && !pagoEsteMes.has(f.matricula)
  ).length;

  // Ventas de los últimos 7 días agrupadas por día
  const ventas_semana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toISOString().slice(0, 10);
    return {
      fecha: dayStr,
      dia: d.toLocaleDateString('es-MX', { weekday: 'short' }),
      total: sales
        .filter((s) => (s.fecha || s.date || '').startsWith(dayStr))
        .reduce((sum, s) => sum + Number(s.total || 0), 0),
    };
  });

  // Asistencia agrupada por hora del día
  const hourMap = {};
  attendance.forEach((a) => {
    const ts = a.fecha || a.date || '';
    if (!ts) return;
    try { hourMap[new Date(ts).getHours()] = (hourMap[new Date(ts).getHours()] || 0) + 1; } catch {}
  });
  const asistencia_hora = Object.entries(hourMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([h, total]) => ({ hora: `${h}:00`, total }));

  // Productos con stock crítico (≤ 5 unidades)
  const stock_critico = products
    .filter((p) => Number(p.stock || 0) <= 5)
    .map((p) => ({ nombre: p.nombre || p.name || '', stock: Number(p.stock || 0) }));

  return {
    kpis: { ingresos_hoy: ingresosHoy, ingresos_mes: ingresosMes, alumnos_activos: activos, alumnos_deudores: deudores },
    graficas: { ventas_semana, asistencia_hora, alertas_caja: [], stock_critico },
  };
}

const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sanitizeKpisPayload = (payload = {}) => ({
  ingresos_hoy: toSafeNumber(payload.ingresos_hoy),
  ingresos_mes: toSafeNumber(payload.ingresos_mes),
  alumnos_activos: Math.max(0, toSafeNumber(payload.alumnos_activos)),
  alumnos_deudores: Math.max(0, toSafeNumber(payload.alumnos_deudores ?? payload.alumnos_morosos)),
});

const sanitizeGraficasPayload = (payload = {}) => ({
  ventas_semana: ensureArray(payload.ventas_semana).map((item, index) => ({
    fecha: item?.fecha || `dia-${index}`,
    dia: item?.dia || '',
    total: toSafeNumber(item?.total),
  })),
  asistencia_hora: ensureArray(payload.asistencia_hora).map((item, index) => ({
    hora: item?.hora || `hora-${index}`,
    total: Math.max(0, toSafeNumber(item?.total)),
  })),
  alertas_caja: ensureArray(payload.alertas_caja).map((item, index) => ({
    id: item?.id ?? `alerta-${index}`,
    fecha: item?.fecha || '',
    usuario: item?.usuario || 'Sin usuario',
    diferencia: toSafeNumber(item?.diferencia),
  })),
  stock_critico: ensureArray(payload.stock_critico).map((item, index) => ({
    nombre: item?.nombre || `Producto ${index + 1}`,
    stock: Math.max(0, toSafeNumber(item?.stock)),
  })),
});

export function Dashboard() {
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [graficas, setGraficas] = useState(EMPTY_GRAFICAS);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadAnalytics = async () => {
      setLoading(true);
      setErrorMessage('');

      // ── REGLA 1: LECTURA LOCAL INMEDIATA ──────────────────────────────────
      // Computa KPIs desde Dexie antes de intentar la red.
      // Si Dexie tarda > 5 s (primer arranque, Safari lento), libera el spinner
      // con zeros en lugar de bloquear la UI indefinidamente.
      try {
        const local = await Promise.race([
          computeLocalStats(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('local stats timeout 5s')), 5000)
          ),
        ]);
        if (!cancelled) {
          setKpis({ ...EMPTY_KPIS, ...sanitizeKpisPayload(local.kpis) });
          setGraficas({ ...EMPTY_GRAFICAS, ...sanitizeGraficasPayload(local.graficas) });
          setLoading(false);  // Liberar spinner con datos locales ya visibles
        }
      } catch (localErr) {
        console.warn('[Dashboard] Datos locales no disponibles:', localErr.message);
        if (!cancelled) setLoading(false);
      }

      // ── REGLA 2: RED BEST-EFFORT (silenciada en fallo) ────────────────────
      // Si el servidor responde, actualiza los KPIs con datos calculados server-side
      // (más precisos que la estimación local). Si no responde, la UI ya tiene datos.
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        let kpisResponse, graficasResponse;
        try {
          [kpisResponse, graficasResponse] = await Promise.all([
            fetchApi('/api/analytics/kpis', { signal: controller.signal }),
            fetchApi('/api/analytics/graficas', { signal: controller.signal }),
          ]);
        } finally {
          clearTimeout(tid);
        }

        const kpisResult = await kpisResponse.json().catch(() => ({}));
        const graficasResult = await graficasResponse.json().catch(() => ({}));

        if (!kpisResponse.ok) throw buildHttpError('las métricas', kpisResponse, kpisResult);
        if (!graficasResponse.ok) throw buildHttpError('las gráficas', graficasResponse, graficasResult);

        if (!cancelled) {
          setKpis({ ...EMPTY_KPIS, ...sanitizeKpisPayload(kpisResult.data || {}) });
          setGraficas({ ...EMPTY_GRAFICAS, ...sanitizeGraficasPayload(graficasResult.data || {}) });
          setErrorMessage('');
        }
      } catch (serverError) {
        console.warn('[Dashboard] Sin servidor, mostrando datos locales:', serverError.message);
        // Activar el banner "sin conexión" — los KPIs locales ya están visibles,
        // pero el usuario debe saber que los números pueden estar desactualizados.
        if (!cancelled) setErrorMessage('offline');
      }
    };

    loadAnalytics();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <p style={helperTextStyle}>Cargando métricas de negocio...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <div style={headerStyle}>
          <div>
            <h2 style={titleStyle}>Panel de Control</h2>
            <p style={subtitleStyle}>Visión financiera y operativa en tiempo real del gimnasio.</p>
          </div>
        </div>
        {/* Banner offline suave — no bloquea el dashboard, los datos locales ya se muestran */}
        {errorMessage && (
          <div style={{ padding: '10px 14px', borderRadius: '10px', backgroundColor: '#fefce8', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.84rem', fontWeight: 600 }}>
            ⚠ Sin conexión al servidor — mostrando datos locales (pueden estar desactualizados).
          </div>
        )}

        <div style={kpiGridStyle}>
          <KpiCard
            icon={<FiDollarSign size={20} />}
            label="Ingresos de Hoy"
            value={`$${formatCurrency(kpis.ingresos_hoy)}`}
            iconBg="rgba(22, 163, 74, 0.1)"
            iconColor="#16a34a"
          />
          <KpiCard
            icon={<FiCalendar size={20} />}
            label="Ingresos del Mes"
            value={`$${formatCurrency(kpis.ingresos_mes)}`}
          />
          <KpiCard
            icon={<FiUsers size={20} />}
            label="Alumnos Activos"
            value={String(kpis.alumnos_activos || 0)}
          />
          <KpiCard
            icon={<FiActivity size={20} />}
            label="Vencidos / Deudores"
            value={String(kpis.alumnos_deudores || 0)}
            valueColor={kpis.alumnos_deudores > 0 ? '#ef4444' : 'var(--primary-color)'}
            iconBg={kpis.alumnos_deudores > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 127, 39, 0.1)'}
            iconColor={kpis.alumnos_deudores > 0 ? '#ef4444' : 'var(--secondary-color)'}
          />
        </div>

        <div style={chartsGridStyle}>
          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <h3 style={panelTitleStyle}>Ingresos de los últimos 7 días</h3>
            </div>
            <div style={chartWrapStyle}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={graficas.ventas_semana} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="4 4" />
                  <XAxis dataKey="dia" stroke="#64748b" tickLine={false} axisLine={false} fontSize={12} tickMargin={12} />
                  <YAxis stroke="#64748b" tickLine={false} axisLine={false} fontSize={12} tickFormatter={(value) => `$${value}`} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f8fafc' }} formatter={(value) => [`$${formatCurrency(value)}`, 'Total']} />
                  <Bar dataKey="total" fill="var(--secondary-color)" radius={[4, 4, 0, 0]} maxBarSize={45} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <h3 style={panelTitleStyle}>Horas Pico de Asistencia</h3>
            </div>
            <div style={chartWrapStyle}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={graficas.asistencia_hora} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="4 4" />
                  <XAxis dataKey="hora" stroke="#64748b" tickLine={false} axisLine={false} fontSize={12} tickMargin={12} />
                  <YAxis stroke="#64748b" tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }} formatter={(value) => [value, 'Personas']} />
                  <Line type="monotone" dataKey="total" stroke="var(--primary-color)" strokeWidth={3} dot={{ fill: 'var(--primary-color)', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: 'var(--secondary-color)', stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <div style={chartsGridStyle}>
          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <h3 style={panelTitleStyle}>Alerta de Inventario Crítico</h3>
              <div style={{ ...alertChipStyle, backgroundColor: '#fff7ed', color: '#c2410c' }}>
                <FiPackage size={14} />
                {graficas.stock_critico?.length || 0} productos
              </div>
            </div>

            {!graficas.stock_critico || graficas.stock_critico.length === 0 ? (
              <div style={emptyStateStyle}>Tu tienda tiene stock suficiente.</div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Producto</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Stock Restante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {graficas.stock_critico.map((item, idx) => (
                      <tr key={idx} style={rowStyle}>
                        <td style={tdStyle}>{item.nombre}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#ef4444', fontWeight: 800 }}>
                          {item.stock}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <h3 style={panelTitleStyle}>Descuadres de Caja (Últimos 7 días)</h3>
              <div style={{ ...alertChipStyle, backgroundColor: '#fef2f2', color: '#dc2626' }}>
                <FiAlertTriangle size={14} />
                {graficas.alertas_caja?.length || 0} alertas
              </div>
            </div>

            {!graficas.alertas_caja || graficas.alertas_caja.length === 0 ? (
              <div style={emptyStateStyle}>Cortes de caja perfectos. No hay descuadres.</div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Fecha</th>
                      <th style={thStyle}>Usuario</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {graficas.alertas_caja.map((alerta) => (
                      <tr key={alerta.id} style={rowStyle}>
                        <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{formatDateTime(alerta.fecha)}</td>
                        <td style={tdStyle}>{alerta.usuario}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: Number(alerta.diferencia || 0) < 0 ? '#ef4444' : '#16a34a', fontWeight: 800 }}>
                          {Number(alerta.diferencia || 0) > 0 ? '+' : ''}${formatCurrency(alerta.diferencia)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  valueColor = 'var(--primary-color)',
  iconBg = 'rgba(255, 127, 39, 0.1)',
  iconColor = 'var(--secondary-color)',
}) {
  return (
    <div style={kpiCardStyle}>
      <div style={{ ...kpiIconStyle, backgroundColor: iconBg, color: iconColor }}>{icon}</div>
      <div>
        <div style={kpiLabelStyle}>{label}</div>
        <div style={{ ...kpiValueStyle, color: valueColor }}>{value}</div>
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }
  return `${date.toLocaleDateString('es-MX')} ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
}

// --- ESTILOS CON TIPOGRAFÍA UNIFICADA ---
// Se ha añadido la familia tipográfica 'Inter' al contenedor principal (pageStyle)
const pageStyle = { 
  padding: '3vh 2vw', 
  backgroundColor: '#f8fafc', 
  minHeight: '85vh',
  fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" 
};

const shellStyle = { maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' };
const titleStyle = { margin: 0, color: 'var(--primary-color)', fontSize: '1.7rem', fontWeight: 900, letterSpacing: '-0.5px' };
const subtitleStyle = { margin: '6px 0 0 0', color: '#64748b', fontSize: '0.95rem' };
const helperTextStyle = { margin: 0, color: '#64748b', fontSize: '0.95rem' };

const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' };
const kpiCardStyle = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '22px', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)', display: 'flex', alignItems: 'center', gap: '16px' };
const kpiIconStyle = { width: '54px', height: '54px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const kpiLabelStyle = { color: '#64748b', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' };
const kpiValueStyle = { fontSize: '1.6rem', fontWeight: 800, lineHeight: 1 };

const chartsGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' };
const panelStyle = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)', display: 'flex', flexDirection: 'column' };
const panelHeaderStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' };
const panelTitleStyle = { margin: 0, color: 'var(--primary-color)', fontSize: '1.1rem', fontWeight: 800 };
const chartWrapStyle = { width: '100%', height: '280px', minHeight: '280px', flex: 1 };
const tooltipStyle = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: 'var(--primary-color)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)', fontWeight: 600 };
const alertChipStyle = { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, padding: '6px 12px', borderRadius: '999px' };
const tableWrapStyle = { overflowX: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const thStyle = { textAlign: 'left', padding: '12px 10px', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f1f5f9', fontWeight: 700 };
const rowStyle = { borderBottom: '1px solid #f8fafc', transition: 'background-color 0.15s', ':hover': { backgroundColor: '#f8fafc' } };
const tdStyle = { padding: '14px 10px', color: 'var(--primary-color)', fontSize: '0.95rem', fontWeight: 600 };
const emptyStateStyle = { padding: '30px 0', textAlign: 'center', color: '#94a3b8', fontSize: '0.95rem', fontStyle: 'italic' };