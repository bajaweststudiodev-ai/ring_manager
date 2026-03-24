import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db, getFighterDisplayName, normalizeFighterRecord, normalizePaymentRecord } from '../db/db';
import { checkAccess } from '../logic/rules';

export function CheckIn() {
  const [matricula, setMatricula] = useState('');
  const [status, setStatus] = useState({
    bg: '#ffffff',
    msg: 'ESPERANDO',
    fighter: null,
    border: '#e0e0e0'
  });
  const scannerRef = useRef(null);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode('reader');
    scannerRef.current = html5QrCode;

    const startScanner = async () => {
      try {
        if (!document.getElementById('reader')) return;
        await html5QrCode.start(
          { facingMode: 'user' },
          { fps: 20, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
          (decodedText) => handleCheckIn(decodedText),
          () => {}
        );
      } catch (err) {
        console.warn('No pude iniciar la camara:', err);
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop()
          .then(() => scannerRef.current?.clear())
          .catch((err) => console.warn('No pude detener el escaner:', err));
      }
    };
  }, []);

  const handleCheckIn = async (scannedText) => {
    const id = scannedText || matricula;
    const metodoRegistro = scannedText ? 'QR' : 'TECLADO';
    if (!id) return;

    try {
      const fighter = normalizeFighterRecord(await db.fighters.where('matricula').equals(id).first());
      if (!fighter?.matricula) {
        setStatus({ bg: '#fff', border: '#ffc107', msg: 'NO REGISTRADO', fighter: null });
        return;
      }

      const ahora = new Date();
      const hoyStr = ahora.toLocaleDateString();
      const ultimoRegistro = await db.attendance.where('peleador_matricula').equals(fighter.matricula).last()
        || await db.attendance.where('matricula').equals(fighter.matricula).last();
      const fechaUltimoRegistro = ultimoRegistro?.fecha || ultimoRegistro?.date;
      const horaSalida = ultimoRegistro?.hora_salida || ultimoRegistro?.checkOut;
      const esDeHoy = fechaUltimoRegistro && new Date(fechaUltimoRegistro).toLocaleDateString() === hoyStr;

      if (esDeHoy && !horaSalida) {
        const tiempoEntrada = new Date(fechaUltimoRegistro);
        const minutosTranscurridos = (ahora - tiempoEntrada) / (1000 * 60);
        if (minutosTranscurridos < 15) {
          setStatus({ bg: '#fffbeb', border: '#ffc107', msg: 'ENTRADA RECIENTE', fighter });
          return;
        }

        await db.attendance.update(ultimoRegistro.id, { hora_salida: ahora.toISOString(), checkOut: ahora.toISOString() });
        new Audio('/beep-success.mp3').play().catch(() => {});
        setStatus({ bg: '#eef2f5', border: '#17a2b8', msg: 'SALIDA REGISTRADA', fighter });
        setMatricula('CT-');
        return;
      }

      const lastPayment = normalizePaymentRecord(
        await db.payments.where('peleador_matricula').equals(fighter.matricula).last()
        || await db.payments.where('matricula').equals(fighter.matricula).last()
      );
      const result = lastPayment.tipo_pago ? checkAccess({
        date: lastPayment.fecha_pago,
        type: lastPayment.tipo_pago,
        amount: lastPayment.monto,
        method: lastPayment.metodo_pago,
      }) : checkAccess(null);

      if (result.canEnter) {
        new Audio('/beep-success.mp3').play().catch(() => {});
        setStatus({ bg: '#f0fff4', border: '#00bb2d', msg: 'ACCESO AUTORIZADO', fighter });
        await db.attendance.add({
          peleador_matricula: fighter.matricula,
          matricula: fighter.matricula,
          fecha: ahora.toISOString(),
          date: ahora.toISOString(),
          hora_salida: null,
          checkOut: null,
          medio_registro: metodoRegistro,
          method: metodoRegistro,
          synced: 0
        });
      } else {
        setStatus({ bg: '#fff5f5', border: '#e74c3c', msg: result.reason.toUpperCase(), fighter });
      }

      setMatricula('CT-');
    } catch (error) {
      console.error('Error en check-in:', error);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
      <div style={{ width: '850px', backgroundColor: status.bg, borderRadius: '12px', padding: '40px', border: `1px solid ${status.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '50px', transition: '0.3s ease' }}>
        <div style={{ textAlign: 'center' }}>
          <div id="reader" style={{ border: '1px solid #000', borderRadius: '8px', overflow: 'hidden', width: '100%', aspectRatio: '1/1', backgroundColor: '#000' }} />

          <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', border: `1px solid ${status.border}`, borderRadius: '6px', overflow: 'hidden', flex: 1, backgroundColor: '#fff' }}>
              <span style={{ backgroundColor: '#f5f5f5', padding: '10px 15px', fontWeight: 800, color: '#555', borderRight: '1px solid #ddd', fontSize: '1rem', display: 'flex', alignItems: 'center' }}>
                CT-
              </span>
              <input
                type="text"
                style={{ padding: '10px 15px', width: '100%', border: 'none', outline: 'none', fontSize: '1.05rem', fontWeight: 700, color: '#2d2e30', letterSpacing: '1px', textTransform: 'uppercase' }}
                placeholder="A1B2-345"
                maxLength="8"
                value={matricula.replace('CT-', '')}
                onChange={(e) => {
                  let valorLimpio = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                  if (valorLimpio.length > 4) {
                    valorLimpio = `${valorLimpio.slice(0, 4)}-${valorLimpio.slice(4, 7)}`;
                  }
                  setMatricula(`CT-${valorLimpio}`);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleCheckIn()}
              />
            </div>
            <button onClick={() => handleCheckIn()} style={{ padding: '0 22px', backgroundColor: '#1F2A44', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700 }}>
              ACCESO
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderLeft: '1px solid #eee', paddingLeft: '50px' }}>
          <div style={{ width: '160px', height: '160px', borderRadius: '8px', backgroundColor: '#fafafa', border: '1px solid #eee', overflow: 'hidden', marginBottom: '20px' }}>
            {status.fighter ? (
              <img src={status.fighter.foto_path || '/perfil.jpg'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="fighter" />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: '0.8rem' }}>SIN FOTO</div>
            )}
          </div>

          <h3 style={{ margin: 0, fontSize: '1.3rem', letterSpacing: '-0.5px' }}>{status.fighter ? getFighterDisplayName(status.fighter) : 'SISTEMA'}</h3>
          <p style={{ margin: '5px 0 20px 0', color: '#888', fontSize: '0.8rem' }}>
            {status.fighter ? `ID: ${status.fighter.matricula}` : 'CONTROL DE ACCESO'}
          </p>

          <div style={{ fontWeight: 800, color: status.border === '#e0e0e0' ? '#000' : status.border, fontSize: '1.05rem', letterSpacing: '1px' }}>
            {status.msg}
          </div>
        </div>
      </div>
    </div>
  );
}
