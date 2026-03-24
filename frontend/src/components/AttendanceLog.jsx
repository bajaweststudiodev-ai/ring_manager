import React, { useEffect, useState } from 'react';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiClock, FiEdit3, FiLogIn, FiLogOut, FiSearch, FiSmartphone } from 'react-icons/fi';
import { db, getFighterDisplayName, normalizeFighterRecord } from '../db/db';

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

const getLocalYYYYMMDD = (date) => {
  const d = new Date(date);
  return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
};

export function AttendanceLog() {
  const [asistencias, setAsistencias] = useState([]);
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState(getLocalYYYYMMDD(new Date()));
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    cargarAsistencias();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterDate]);

  const cargarAsistencias = async () => {
    const records = await db.attendance.reverse().toArray();
    const registrosCompletos = await Promise.all(records.map(async (record) => {
      const fighter = normalizeFighterRecord(
        await db.fighters.where('matricula').equals(record.peleador_matricula || record.matricula).first()
      );
      return {
        ...record,
        fighterName: fighter?.matricula ? getFighterDisplayName(fighter) : 'Desconocido',
        matricula: fighter?.matricula || record.peleador_matricula || '---',
        fotoPerfil: fighter?.foto_path || null,
        fechaRegistro: record.fecha || record.date,
        horaSalida: record.hora_salida || record.checkOut,
        medioRegistro: record.medio_registro || record.method || 'TECLADO'
      };
    }));

    setAsistencias(registrosCompletos);
  };

  const asistenciasFiltradas = asistencias.filter((item) => {
    const coincideFecha = getLocalYYYYMMDD(item.fechaRegistro) === filterDate;
    const coincideBusqueda = item.fighterName.toLowerCase().includes(search.toLowerCase())
      || item.matricula.toLowerCase().includes(search.toLowerCase());
    return coincideFecha && coincideBusqueda;
  });

  const formatoFechaLarga = (isoString) => {
    const opciones = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    return new Date(isoString).toLocaleDateString('es-MX', opciones).toUpperCase();
  };

  const formatoHora = (isoString) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = asistenciasFiltradas.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(asistenciasFiltradas.length / itemsPerPage);

  return (
    <div style={{ padding: '2vh 2vw', backgroundColor: PALETTE.grayBg, minHeight: '100vh' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', backgroundColor: PALETTE.white, padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `2px solid ${PALETTE.orange}`, paddingBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
          <h2 style={{ color: PALETTE.dark, margin: 0, fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FiClock color={PALETTE.orange} />
            BITACORA DE ASISTENCIAS
          </h2>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <FiSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: PALETTE.grayText }} />
              <input type="text" placeholder="Buscar alumno" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
            </div>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ ...inputStyle, paddingLeft: '10px', cursor: 'pointer', fontWeight: 700, color: PALETTE.dark }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {asistenciasFiltradas.length > 0 && (
            <div style={{ marginBottom: '15px', fontSize: '0.85rem', fontWeight: 700, color: PALETTE.grayText, letterSpacing: '0.5px' }}>
              TOTAL DE REGISTROS: <span style={{ color: PALETTE.dark, fontSize: '1rem' }}>{asistenciasFiltradas.length}</span>
            </div>
          )}

          {currentItems.map((registro, index) => (
            <div key={`${registro.matricula}-${index}`} style={{ display: 'flex', alignItems: 'center', padding: '15px 10px', borderBottom: `1px solid ${PALETTE.grayBorder}`, flexWrap: 'wrap', gap: '15px' }}>
              <div style={{ width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#eee', overflow: 'hidden', flexShrink: 0 }}>
                {registro.fotoPerfil ? <img src={registro.fotoPerfil} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="perfil" /> : <div style={{ textAlign: 'center', lineHeight: '45px', color: '#aaa', fontSize: '0.8rem' }}>?</div>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '200px' }}>
                <div style={{ fontWeight: 700, color: PALETTE.dark, fontSize: '1rem' }}>{registro.fighterName}</div>
                <div style={{ fontSize: '0.75rem', color: PALETTE.grayText, fontWeight: 700, marginTop: '2px' }}>
                  {formatoFechaLarga(registro.fechaRegistro)}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.65rem', color: '#fff', backgroundColor: registro.medioRegistro === 'QR' ? PALETTE.dark : PALETTE.grayText, padding: '3px 8px', borderRadius: '4px', width: 'fit-content', marginTop: '6px', fontWeight: 700 }}>
                  {registro.medioRegistro === 'QR' ? <FiSmartphone size={12} /> : <FiEdit3 size={12} />}
                  {registro.medioRegistro === 'QR' ? 'ESCANEO QR' : 'TECLADO'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                <div style={{ backgroundColor: '#f0fff4', border: `1px solid ${PALETTE.green}`, padding: '8px 12px', borderRadius: '8px', minWidth: '80px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: PALETTE.green, fontWeight: 700, marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <FiLogIn /> ENTRADA
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: PALETTE.dark }}>
                    {formatoHora(registro.fechaRegistro)}
                  </div>
                </div>

                <div style={{ backgroundColor: registro.horaSalida ? '#fff5f5' : '#f9f9f9', border: `1px solid ${registro.horaSalida ? PALETTE.red : PALETTE.grayBorder}`, padding: '8px 12px', borderRadius: '8px', minWidth: '80px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: registro.horaSalida ? 1 : 0.6 }}>
                  <div style={{ fontSize: '0.65rem', color: registro.horaSalida ? PALETTE.red : PALETTE.grayText, fontWeight: 700, marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <FiLogOut /> SALIDA
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: registro.horaSalida ? PALETTE.dark : PALETTE.grayText }}>
                    {registro.horaSalida ? formatoHora(registro.horaSalida) : '--:--'}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {asistenciasFiltradas.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: PALETTE.grayText }}>
              <FiCalendar size={40} style={{ color: '#ddd', marginBottom: '15px' }} />
              <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: PALETTE.dark }}>Sin registros</p>
              <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem' }}>No hay asistencias que coincidan con esta fecha o busqueda.</p>
            </div>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px', paddingTop: '15px' }}>
          <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} style={paginationButtonStyle(currentPage === 1)}>
            <FiChevronLeft size={18} />
          </button>
          <span style={{ fontSize: '0.9rem', color: PALETTE.dark, fontWeight: 700 }}>
            Pagina {currentPage} de {totalPages}
          </span>
          <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} style={paginationButtonStyle(currentPage === totalPages)}>
            <FiChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: '8px 10px 8px 32px', width: '180px', borderRadius: '6px', border: `1px solid ${PALETTE.grayBorder}`, outline: 'none', fontSize: '0.85rem', backgroundColor: '#fcfcfc', color: PALETTE.dark };
const paginationButtonStyle = (disabled) => ({
  padding: '8px 12px',
  backgroundColor: disabled ? '#f5f5f5' : PALETTE.dark,
  color: disabled ? '#ccc' : PALETTE.white,
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer'
});
