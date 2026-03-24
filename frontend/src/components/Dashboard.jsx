import React, { useEffect, useState } from 'react';
import { FiActivity, FiCalendar, FiCheckCircle, FiCreditCard, FiList, FiShoppingCart, FiTrendingUp, FiUserCheck, FiUsers, FiWifi, FiWifiOff } from 'react-icons/fi';
import { db, getFighterDisplayName, normalizeFighterRecord, normalizePaymentRecord } from '../db/db';

const PALETTE = {
  orange: '#FF7F27',
  white: '#fff',
  dark: '#2d2e30',
  green: '#00bb2d',
  red: '#e74c3c',
  grayBg: '#fafafa',
  grayBorder: '#eee',
  grayText: '#888'
};

export function Dashboard() {
  const [finanzas, setFinanzas] = useState({ hoy: 0, semana: 0, mes: 0, detalleHoyMembresias: 0, detalleHoyTienda: 0 });
  const [totalAlumnos, setTotalAlumnos] = useState(0);
  const [asistenciasHoy, setAsistenciasHoy] = useState(0);
  const [transacciones, setTransacciones] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    calcularMetricas();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const calcularMetricas = async () => {
    const pagosMensualidades = (await db.payments.toArray()).map(normalizePaymentRecord);
    const ventasTienda = await db.sales.toArray();
    const totalPeleadores = await db.fighters.count();
    const asistencias = await db.attendance.toArray();

    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const inicioSemana = new Date(inicioDia);
    const diaSemana = inicioSemana.getDay() || 7;
    inicioSemana.setDate(inicioSemana.getDate() - diaSemana + 1);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    let sumHoy = 0;
    let sumSemana = 0;
    let sumMes = 0;
    let ingresosMembresiaHoy = 0;
    let ingresosTiendaHoy = 0;

    pagosMensualidades.forEach((pago) => {
      const fechaPago = new Date(pago.fecha_pago);
      if (fechaPago >= inicioDia) {
        sumHoy += pago.monto;
        ingresosMembresiaHoy += pago.monto;
      }
      if (fechaPago >= inicioSemana) sumSemana += pago.monto;
      if (fechaPago >= inicioMes) sumMes += pago.monto;
    });

    ventasTienda.forEach((venta) => {
      const fechaVenta = new Date(venta.fecha || venta.date);
      if (fechaVenta >= inicioDia) {
        sumHoy += venta.total;
        ingresosTiendaHoy += venta.total;
      }
      if (fechaVenta >= inicioSemana) sumSemana += venta.total;
      if (fechaVenta >= inicioMes) sumMes += venta.total;
    });

    const hoyStr = hoy.toLocaleDateString();
    const cuentaAsistencias = asistencias.filter((asistencia) => new Date(asistencia.fecha || asistencia.date).toLocaleDateString() === hoyStr).length;

    const listaPagos = await Promise.all(pagosMensualidades.map(async (pago) => {
      const fighter = normalizeFighterRecord(await db.fighters.where('matricula').equals(pago.peleador_matricula).first());
      return {
        id: `p_${pago.id}`,
        categoria: 'MEMBRESIA',
        concepto: pago.tipo_pago,
        monto: pago.monto,
        fecha: pago.fecha_pago,
        metodo: pago.metodo_pago,
        cliente: fighter?.matricula ? getFighterDisplayName(fighter) : 'Desconocido'
      };
    }));

    const listaVentas = ventasTienda.map((venta) => ({
      id: `s_${venta.id}`,
      categoria: 'TIENDA / RENTA',
      concepto: (venta.items || []).map((item) => `${item.nombre || item.name} (x${item.cantidad})`).join(', '),
      monto: venta.total,
      fecha: venta.fecha || venta.date,
      metodo: venta.metodo_pago || venta.method,
      cliente: venta.fighter_name || 'Venta general'
    }));

    const historialUnificado = [...listaPagos, ...listaVentas]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 15);

    setTransacciones(historialUnificado);
    setFinanzas({
      hoy: sumHoy,
      semana: sumSemana,
      mes: sumMes,
      detalleHoyMembresias: ingresosMembresiaHoy,
      detalleHoyTienda: ingresosTiendaHoy
    });
    setTotalAlumnos(totalPeleadores);
    setAsistenciasHoy(cuentaAsistencias);
  };

  const formatoFechaHora = (isoString) => {
    const fecha = new Date(isoString);
    return `${fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} - ${fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <div style={headerStyle}>
          <div>
            <h2 style={titleStyle}>Resumen General</h2>
            <p style={subtitleStyle}>Vista rapida de ingresos, actividad y movimiento reciente.</p>
          </div>
          <div style={statusBadgeStyle}>
            <span style={statusDotStyle(isOnline ? PALETTE.green : PALETTE.red)} />
            {isOnline ? <FiWifi color={PALETTE.green} size={16} /> : <FiWifiOff color={PALETTE.red} size={16} />}
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isOnline ? PALETTE.green : PALETTE.red }}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        <div style={summaryGridStyle}>
          <div style={{ ...summaryCardStyle, gridColumn: 'span 2' }}>
            <div style={summaryCardHeaderStyle}>
              <div style={iconBoxStyle('rgba(255,127,39,0.12)', PALETTE.orange)}>
                <FiActivity size={18} />
              </div>
              <div>
                <p style={cardLabelStyle}>Ingresos de hoy</p>
                <p style={amountStyle}>${finanzas.hoy.toLocaleString('en-US')}</p>
              </div>
            </div>

            <div style={splitStatRowStyle}>
              <div style={miniStatStyle}>
                <span style={miniStatLabelStyle}>Membresias</span>
                <strong style={miniStatValueStyle}>${finanzas.detalleHoyMembresias.toLocaleString('en-US')}</strong>
              </div>
              <div style={miniStatStyle}>
                <span style={miniStatLabelStyle}>Tienda</span>
                <strong style={miniStatValueStyle}>${finanzas.detalleHoyTienda.toLocaleString('en-US')}</strong>
              </div>
            </div>
          </div>

          <div style={summaryCardStyle}>
            <div style={summaryCardHeaderStyle}>
              <div style={iconBoxStyle('rgba(31,42,68,0.08)', PALETTE.dark)}>
                <FiCalendar size={18} />
              </div>
              <div>
                <p style={cardLabelStyle}>Esta semana</p>
                <p style={compactAmountStyle}>${finanzas.semana.toLocaleString('en-US')}</p>
              </div>
            </div>
          </div>

          <div style={summaryCardStyle}>
            <div style={summaryCardHeaderStyle}>
              <div style={iconBoxStyle('rgba(0,187,45,0.1)', PALETTE.green)}>
                <FiTrendingUp size={18} />
              </div>
              <div>
                <p style={cardLabelStyle}>Este mes</p>
                <p style={{ ...compactAmountStyle, color: PALETTE.green }}>${finanzas.mes.toLocaleString('en-US')}</p>
              </div>
            </div>
          </div>
        </div>

        <div style={detailGridStyle}>
          <div style={sectionCardStyle}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>Actividad</h3>
              <span style={sectionHintStyle}>Resumen del dia</span>
            </div>

            <div style={metricStackStyle}>
              <div style={metricCardStyle}>
                <div style={metricIconWrapStyle('#eef2f5')}>
                  <FiUsers size={18} color={PALETTE.dark} />
                </div>
                <div>
                  <p style={metricTitleStyle}>Total peleadores</p>
                  <p style={metricValueStyle}>{totalAlumnos}</p>
                </div>
              </div>

              <div style={metricCardStyle}>
                <div style={metricIconWrapStyle('#eafaf1')}>
                  <FiCheckCircle size={18} color={PALETTE.green} />
                </div>
                <div>
                  <p style={metricTitleStyle}>Asistencias hoy</p>
                  <p style={metricValueStyle}>{asistenciasHoy}</p>
                </div>
              </div>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>Ultimos ingresos</h3>
              <span style={sectionHintStyle}>{transacciones.length} movimientos</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {transacciones.length === 0 ? (
                <p style={emptyTextStyle}>Aun no hay ingresos registrados.</p>
              ) : (
                transacciones.map((tx, index) => (
                  <div key={tx.id} style={{ ...transactionRowStyle, borderBottom: index === transacciones.length - 1 ? 'none' : `1px solid ${PALETTE.grayBorder}` }}>
                    <div style={transactionLeadStyle}>
                      <div style={transactionIconStyle(tx.categoria === 'MEMBRESIA')}>
                        {tx.categoria === 'MEMBRESIA' ? <FiUserCheck size={15} /> : <FiShoppingCart size={15} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={transactionTitleStyle}>{tx.concepto}</div>
                        <div style={transactionSubtitleStyle}>{tx.cliente}</div>
                      </div>
                    </div>

                    <div style={transactionMetaStyle}>
                      <div style={transactionDateStyle}>{formatoFechaHora(tx.fecha)}</div>
                      <div style={methodPillStyle}>
                        <FiCreditCard size={10} />
                        {tx.metodo}
                      </div>
                    </div>

                    <div style={transactionAmountStyle}>+${Number(tx.monto || 0).toLocaleString('en-US')}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const pageStyle = { padding: '3vh 3vw', backgroundColor: PALETTE.grayBg, minHeight: '100vh', fontFamily: 'sans-serif' };
const shellStyle = { maxWidth: '1120px', margin: '0 auto' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px', flexWrap: 'wrap', gap: '12px' };
const titleStyle = { color: PALETTE.dark, fontSize: '1.5rem', fontWeight: 700, margin: 0 };
const subtitleStyle = { margin: '6px 0 0 0', color: '#667085', fontSize: '0.92rem' };
const statusBadgeStyle = { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 12px', backgroundColor: PALETTE.white, borderRadius: '999px', border: `1px solid ${PALETTE.grayBorder}` };
const statusDotStyle = (color) => ({ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color });
const summaryGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '18px' };
const summaryCardStyle = { backgroundColor: PALETTE.white, borderRadius: '14px', border: `1px solid ${PALETTE.grayBorder}`, padding: '18px', boxShadow: '0 3px 12px rgba(15,23,42,0.03)' };
const summaryCardHeaderStyle = { display: 'flex', alignItems: 'center', gap: '12px' };
const iconBoxStyle = (bgColor, color) => ({ backgroundColor: bgColor, color, width: '42px', height: '42px', borderRadius: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 });
const cardLabelStyle = { margin: 0, fontSize: '0.8rem', color: '#667085', fontWeight: 700 };
const amountStyle = { margin: '4px 0 0 0', fontSize: '2rem', fontWeight: 800, color: PALETTE.dark, letterSpacing: '-0.5px' };
const compactAmountStyle = { margin: '4px 0 0 0', fontSize: '1.35rem', fontWeight: 800, color: PALETTE.dark };
const splitStatRowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px' };
const miniStatStyle = { padding: '10px 12px', borderRadius: '10px', backgroundColor: '#f8fafc', border: `1px solid ${PALETTE.grayBorder}` };
const miniStatLabelStyle = { display: 'block', fontSize: '0.74rem', color: '#667085', marginBottom: '4px' };
const miniStatValueStyle = { fontSize: '0.95rem', color: PALETTE.dark };
const detailGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' };
const sectionCardStyle = { backgroundColor: PALETTE.white, borderRadius: '14px', border: `1px solid ${PALETTE.grayBorder}`, padding: '18px', boxShadow: '0 3px 12px rgba(15,23,42,0.03)' };
const sectionHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '12px', borderBottom: `1px solid ${PALETTE.grayBorder}` };
const sectionTitleStyle = { margin: 0, fontSize: '1rem', color: PALETTE.dark, fontWeight: 700 };
const sectionHintStyle = { fontSize: '0.76rem', color: '#667085', fontWeight: 700 };
const metricStackStyle = { display: 'grid', gap: '12px' };
const metricCardStyle = { display: 'flex', alignItems: 'center', gap: '14px', backgroundColor: '#fcfcfd', padding: '14px', borderRadius: '12px', border: `1px solid ${PALETTE.grayBorder}` };
const metricIconWrapStyle = (bgColor) => ({ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 });
const metricTitleStyle = { margin: 0, color: '#667085', fontSize: '0.8rem', fontWeight: 700 };
const metricValueStyle = { margin: '3px 0 0 0', fontSize: '1.5rem', fontWeight: 800, color: PALETTE.dark };
const emptyTextStyle = { textAlign: 'center', color: '#667085', padding: '18px 0', margin: 0 };
const transactionRowStyle = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) auto auto', alignItems: 'center', gap: '14px', padding: '12px 4px' };
const transactionLeadStyle = { display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 };
const transactionIconStyle = (isMembership) => ({ width: '34px', height: '34px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: isMembership ? '#eafaf1' : '#fff7ed', color: isMembership ? PALETTE.green : '#d97706', flexShrink: 0 });
const transactionTitleStyle = { fontWeight: 700, color: PALETTE.dark, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const transactionSubtitleStyle = { fontSize: '0.78rem', color: '#667085', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const transactionMetaStyle = { textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' };
const transactionDateStyle = { fontSize: '0.76rem', color: '#667085', fontWeight: 700 };
const methodPillStyle = { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', backgroundColor: '#f4f4f5', padding: '3px 8px', borderRadius: '999px', fontWeight: 700, color: PALETTE.dark };
const transactionAmountStyle = { fontSize: '1rem', fontWeight: 800, color: PALETTE.dark, textAlign: 'right', minWidth: '86px' };
