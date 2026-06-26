import React, { useEffect, useState } from 'react';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiClock, FiEdit3, FiLogIn, FiLogOut, FiSearch, FiSmartphone, FiBriefcase, FiUsers, FiRefreshCw, FiFilter } from 'react-icons/fi';
import { db, getFighterDisplayName, normalizeFighterRecord } from '../db/db';
import { fetchApi, resolveAssetUrl } from '../config/api';
import { parseDateLocal } from '../utils/date';

const PALETTE = {
  orange: '#FF7F27',
  white: '#fff',
  dark: '#2d2e30',
  green: '#00bb2d',
  red: '#e74c3c',
  grayBg: '#fafafa',
  grayBorder: '#eee',
  grayText: '#888',
  blue: '#3182ce' 
};

// --- UTILIDADES DE TEXTO Y FECHAS BLINDADAS ---
const normalizeText = (value = '') => String(value || '').trim().toLowerCase();

const parseSafeDate = (dateStr) => {
  if (!dateStr) return new Date(NaN);
  const str = String(dateStr).trim().replace('Tundefined', '').replace('Tnull', '');
  return parseDateLocal(str);
};

const getLocalYYYYMMDD = (date = new Date()) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const normalizeAttendanceRow = (record = {}) => {
  const fighter = normalizeFighterRecord(record);
  const fighterName = getFighterDisplayName(fighter) || record.nombre_completo || 'Desconocido';

  // 🕵️‍♂️ TRADUCTOR UNIVERSAL (Caché Local vs Servidor)
  const horaReal = record.hora_entrada || record.horaEntrada || '';
  const medioReal = record.medio_registro || record.medioRegistro || record.method || 'MANUAL';
  
  let fechaFinal = record.fecha_entrada || record.fechaRegistro || record.created_at || record.date || '';

  if (!fechaFinal && record.fecha) {
    fechaFinal = horaReal ? `${record.fecha}T${horaReal}` : record.fecha;
  }

  return {
    ...record,
    fighterName,
    matricula: record.peleador_matricula || record.matricula || '---',
    fotoPerfil: record.foto_path || record.fotoPerfil || null,
    fechaFinal: fechaFinal,
    horaSalida: record.hora_salida || record.horaSalida || record.checkOut,
    medioRegistro: medioReal,
  };
};

const sortAttendanceRows = (left, right) => {
  const dLeft = parseSafeDate(left.fechaFinal).getTime() || 0;
  const dRight = parseSafeDate(right.fechaFinal).getTime() || 0;
  return dRight - dLeft; 
};

const dedupeAttendanceRows = (records = []) => {
  const uniqueRows = new Map();
  records.forEach((record, index) => {
    const normalized = normalizeAttendanceRow(record);
    const uniqueKey = normalized.id ? `id:${normalized.id}` : `${normalized.matricula}:${normalized.fechaFinal}:${index}`;
    uniqueRows.set(uniqueKey, normalized);
  });
  return Array.from(uniqueRows.values()).sort(sortAttendanceRows);
};


export function AttendanceLog() {
  const [asistencias, setAsistencias] = useState([]);
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState(getLocalYYYYMMDD());
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const itemsPerPage = 12;
  
  const [vistaActiva, setVistaActiva] = useState('alumnos'); 
  const [asistenciasStaff, setAsistenciasStaff] = useState([]);

  // --- EFECTOS ---
  const cargarDatos = async () => {
    setIsRefreshing(true);
    await Promise.all([cargarAsistencias(), cargarAsistenciasStaff()]);
    setIsRefreshing(false);
  };

  useEffect(() => { cargarDatos(); }, []);
  useEffect(() => { setCurrentPage(1); }, [search, filterDate, vistaActiva]);
  useEffect(() => { setSearch(''); }, [vistaActiva]); 

  // --- FETCHERS ---
  const cargarAsistenciasStaffLocal = async () => {
    const allStaff = await db.staff.toArray();
    const staffByMatricula = new Map(
      allStaff.filter(s => s.matricula).map(s => [s.matricula, s])
    );
    const records = await db.attendance
      .filter(r => (r.peleador_matricula || r.matricula || '').startsWith('ST-'))
      .reverse()
      .toArray();
    return records.map(record => {
      const mat = record.peleador_matricula || record.matricula || '';
      const s = staffByMatricula.get(mat);
      return normalizeAttendanceRow({
        ...record,
        nombre: s?.nombre || mat,
        apellido_paterno: s?.apellido_paterno || '',
        rol: s?.role || s?.rol || '',
        foto_path: s?.foto_path || '',
      });
    });
  };

  const cargarAsistenciasStaff = async () => {
    // Local primero: muestra check-ins synced:0 sin esperar la red.
    const registrosLocales = await cargarAsistenciasStaffLocal();
    setAsistenciasStaff(dedupeAttendanceRows(registrosLocales));

    // Luego merge con servidor — igual que cargarAsistencias().
    // dedupeAttendanceRows unifica por id (server) o por matricula:fechaFinal (local)
    // así los synced:0 no desaparecen mientras se sincronizan.
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      let res;
      try {
        res = await fetchApi('/api/asistencias/staff', { signal: controller.signal });
      } finally {
        clearTimeout(tid);
      }
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.message || `HTTP ${res.status}`);
      const registrosServidor = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
      setAsistenciasStaff(dedupeAttendanceRows([...registrosServidor, ...registrosLocales]));
    } catch (serverError) {
      console.warn('[AttendanceLog] Sin red para staff — mostrando solo datos locales:', serverError.message);
    }
  };

  const cargarAsistenciasLocal = async () => {
    const records = await db.attendance
      .filter(r => !(r.peleador_matricula || r.matricula || '').startsWith('ST-'))
      .reverse()
      .toArray();
    return Promise.all(records.map(async (record) => {
      const fighter = normalizeFighterRecord(
        await db.fighters.where('matricula').equals(record.peleador_matricula || record.matricula).first()
      );
      return normalizeAttendanceRow({
        ...record,
        nombre: fighter?.nombre || '',
        foto_path: fighter?.foto_path || fighter?.fotoPerfil || '',
      });
    }));
  };

  const cargarAsistencias = async () => {
    try {
      const response = await fetchApi('/api/asistencias');
      const result = await response.json().catch(() => ({}));
      const registrosServidor = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
      const registrosLocales = await cargarAsistenciasLocal();
      setAsistencias(dedupeAttendanceRows([...registrosServidor, ...registrosLocales]));
    } catch (error) {
      console.warn('Usando caché local.', error);
      const registrosLocales = await cargarAsistenciasLocal();
      setAsistencias(dedupeAttendanceRows(registrosLocales));
    }
  };

  // --- FILTROS ---
  const isStaff = vistaActiva === 'staff';

  const filtrarLista = (lista) => {
    return lista.filter((item) => {
      const fechaTxt = item.fechaFinal ? String(item.fechaFinal) : '';
      const coincideFecha = filterDate === '' ? true : fechaTxt.startsWith(filterDate);
      const searchTerm = normalizeText(search);
      const nombreCompleto = isStaff ? `${item.nombre} ${item.apellido_paterno}` : item.fighterName;
      const textoBusqueda = normalizeText(`${nombreCompleto} ${item.matricula} ${item.rol || ''}`);
      return coincideFecha && (searchTerm === '' || textoBusqueda.includes(searchTerm));
    });
  };

  const listaFiltrada = filtrarLista(isStaff ? asistenciasStaff : asistencias);

  // --- FORMATEADORES ---
  const formatoFechaLarga = (isoString) => {
    const d = parseSafeDate(isoString);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  };

  const formatoHora = (isoString) => {
    const d = parseSafeDate(isoString);
    if (Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  // --- PAGINACIÓN ---
  const currentItems = listaFiltrada.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(listaFiltrada.length / itemsPerPage);

  return (
    <div style={{ padding: '2vh 2vw', backgroundColor: PALETTE.grayBg, minHeight: '100vh' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', backgroundColor: PALETTE.white, padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        
        {/* HEADER Y BUSCADOR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `2px solid ${PALETTE.orange}`, paddingBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
          <h2 style={{ color: PALETTE.dark, margin: 0, fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FiClock color={PALETTE.orange} /> BITACORA
          </h2>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={cargarDatos} disabled={isRefreshing} style={btnIconStyle}><FiRefreshCw /></button>
            <div style={{ position: 'relative' }}>
              <FiSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: PALETTE.grayText }} />
              <input type="text" placeholder={`Buscar ${vistaActiva}`} value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
            </div>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ ...inputStyle, paddingLeft: '10px', width: '140px' }} />
            <button onClick={() => setFilterDate('')} style={btnStyle}><FiFilter /> TODOS</button>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button onClick={() => setVistaActiva('alumnos')} style={tabButtonStyle(isStaff === false, PALETTE.orange)}><FiUsers size={18} /> ALUMNOS</button>
          <button onClick={() => setVistaActiva('staff')} style={tabButtonStyle(isStaff === true, PALETTE.blue)}><FiBriefcase size={18} /> STAFF</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {listaFiltrada.length > 0 && (
            <div style={{ marginBottom: '15px', fontSize: '0.85rem', fontWeight: 700, color: PALETTE.grayText }}>
              TOTAL: <span style={{ color: PALETTE.dark }}>{listaFiltrada.length}</span>
            </div>
          )}

          {currentItems.map((reg, index) => (
            <div key={index} style={rowStyle}>
              <div style={avatarContainer}>
                {reg.foto_path || reg.fotoPerfil ? 
                  <img src={resolveAssetUrl(reg.foto_path || reg.fotoPerfil)} style={avatarImg} alt="p" /> : 
                  <div style={{ color: '#aaa' }}>?</div>
                }
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: PALETTE.dark }}>
                  {isStaff ? `${reg.nombre} ${reg.apellido_paterno}` : reg.fighterName}
                </div>
                <div style={{ fontSize: '0.75rem', color: PALETTE.grayText, fontWeight: 700 }}>
                  {formatoFechaLarga(reg.fechaFinal)}
                </div>
                <div style={{ ...badgeStyle, backgroundColor: isStaff ? PALETTE.blue : PALETTE.dark }}>
                  {reg.medioRegistro === 'QR' ? <FiSmartphone size={10}/> : <FiEdit3 size={10}/>} {isStaff ? reg.rol : reg.medioRegistro}
                </div>
              </div>

              <div style={timeBadge}>
                <div style={{ fontSize: '0.65rem', color: PALETTE.green, fontWeight: 700 }}><FiLogIn /> ENTRADA</div>
                <div style={{ fontSize: '1rem', fontWeight: 800 }}>{formatoHora(reg.fechaFinal)}</div>
              </div>
            </div>
          ))}

          {listaFiltrada.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: PALETTE.grayText }}>
              <FiCalendar size={40} style={{ marginBottom: '10px', opacity: 0.2 }} /><br/>
              No hay registros para mostrar.
            </div>
          )}
        </div>
      </div>
      
      {/* PAGINACION */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px' }}>
          <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1} style={btnIconStyle}><FiChevronLeft/></button>
          <span style={{ fontWeight: 700 }}>{currentPage} / {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage === totalPages} style={btnIconStyle}><FiChevronRight/></button>
        </div>
      )}
    </div>
  );
}

// Estilos
const inputStyle = { padding: '8px 10px 8px 32px', borderRadius: '6px', border: `1px solid ${PALETTE.grayBorder}`, fontSize: '0.85rem', outline: 'none' };
const btnStyle = { padding: '8px 12px', borderRadius: '6px', backgroundColor: PALETTE.dark, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' };
const btnIconStyle = { padding: '8px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#fff', cursor: 'pointer' };
const rowStyle = { display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${PALETTE.grayBorder}`, gap: '15px' };
const avatarContainer = { width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#eee', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 };
const avatarImg = { width: '100%', height: '100%', objectFit: 'cover' };
const timeBadge = { backgroundColor: '#f0fff4', border: `1px solid ${PALETTE.green}`, padding: '5px 10px', borderRadius: '8px', textAlign: 'center', minWidth: '80px', flexShrink: 0 };
const badgeStyle = { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.6rem', color: '#fff', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', fontWeight: 700 };
const tabButtonStyle = (isActive, color) => ({ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: isActive ? color : '#eee', color: isActive ? '#fff' : '#888', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' });