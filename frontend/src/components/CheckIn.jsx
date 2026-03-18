import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode'; 
import { db } from '../db/db';
import { checkAccess } from '../logic/rules';

export function CheckIn() {
  const [matricula, setMatricula] = useState('');
  const [status, setStatus] = useState({ 
    bg: '#ffffff', 
    msg: 'ESPERANDO', 
    fighter: null,
    border: '#e0e0e0' 
  });

  // UNIFICADO: Usamos solo "scannerRef"
  const scannerRef = useRef(null);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("reader");
    scannerRef.current = html5QrCode;

    const startScanner = async () => {
      try {
        if (document.getElementById("reader")) {
          await html5QrCode.start(
            { facingMode: "user" },
            {
              fps: 20,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
            },
            (decodedText) => handleCheckIn(decodedText),
            () => { /* Escaneo silencioso */ }
          );
        }
      } catch (err) {
        console.warn("Cámara ya iniciada o error de acceso:", err);
      }
    };

    startScanner();

    return () => {
      // Corregido para usar scannerRef
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop()
          .then(() => {
             if(scannerRef.current) scannerRef.current.clear();
          })
          .catch(err => console.warn("Error al detener scanner:", err));
      }
    };
  }, []);

  const handleCheckIn = async (idManual) => {
    const id = idManual || matricula;
    if (!id) return;

    try {
      const fighter = await db.fighters.where('matricula').equals(id).first();

      if (!fighter) {
        setStatus({ bg: '#fff', border: '#ffc107', msg: 'NO REGISTRADO', fighter: null });
        return;
      }

      const lastPayment = await db.payments.where('fighter_id').equals(fighter.id).last();
      const result = checkAccess(lastPayment);

      if (result.canEnter) {
        new Audio('/beep-success.mp3').play().catch(() => {});
        setStatus({ bg: '#f0fff4', border: '#28a745', msg: 'AUTORIZADO', fighter });

        // 👇 NUEVO: Registramos la asistencia silenciosamente en Dexie 👇
        db.attendance.add({
          fighter_id: fighter.id,
          date: new Date().toISOString(), // Guarda la fecha y hora exacta
          synced: 0 // Bandera para cuando lo subamos a la nube de Vercel/Flask
        }).catch(err => console.error("Error guardando asistencia:", err));
        // 👆 FIN DE LO NUEVO 👆

      } else {
        setStatus({ bg: '#fff5f5', border: '#dc3545', msg: result.reason.toUpperCase(), fighter });
      }
    } catch (error) {
      console.error("Error en el proceso de check-in:", error);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
      <div style={{ 
        width: '850px', backgroundColor: status.bg, borderRadius: '12px',
        padding: '40px', border: `1px solid ${status.border}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '50px',
        transition: '0.3s ease'
      }}>
        
        {/* ESCÁNER */}
        <div style={{ textAlign: 'center' }}>
          <div id="reader" style={{ 
            border: '1px solid #000', borderRadius: '8px', overflow: 'hidden',
            width: '100%', aspectRatio: '1/1', backgroundColor: '#000'
          }}></div>
          
          <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <input 
              style={{ padding: '10px', width: '140px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '0.9rem', outline: 'none' }} 
              placeholder="ID MANUAL"
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
            />
            <button 
              onClick={() => handleCheckIn()}
              style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
            >
              VALIDAR
            </button>
          </div>
        </div>

        {/* PERFIL */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderLeft: '1px solid #eee', paddingLeft: '50px' }}>
          <div style={{ width: '160px', height: '160px', borderRadius: '8px', backgroundColor: '#fafafa', border: '1px solid #eee', overflow: 'hidden', marginBottom: '20px' }}>
            {status.fighter ? (
              <img src={status.fighter.photo_url || '/perfil.jpg'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="fighter" />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: '0.8rem' }}>SIN FOTO</div>
            )}
          </div>

          <h3 style={{ margin: '0', fontSize: '1.4rem', letterSpacing: '-0.5px' }}>{status.fighter?.name || 'SISTEMA'}</h3>
          <p style={{ margin: '5px 0 20px 0', color: '#888', fontSize: '0.8rem' }}>
            {status.fighter ? `ID: ${status.fighter.matricula}` : 'CONTROL DE ACCESO'}
          </p>

          <div style={{ fontWeight: '900', color: status.border === '#e0e0e0' ? '#000' : status.border, fontSize: '1.1rem', letterSpacing: '1px' }}>
            {status.msg}
          </div>
        </div>

      </div>
    </div>
  );
}