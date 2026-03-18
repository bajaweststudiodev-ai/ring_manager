import React, { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf'; // <-- Librería de PDF
import { QRCodeSVG } from 'qrcode.react'; // <-- Librería de QR
import { addFighterFull, db } from '../db/db';

export function RegisterFighter() {
  const [step, setStep] = useState(1);
  const [matriculaGenerada, setMatriculaGenerada] = useState(null); // <-- Estado para el Paso 4

  const webcamRef = useRef(null);
  const sigPad = useRef(null);

  const [formData, setFormData] = useState({
    nombres: '', apellidos: '', fechaNacimiento: '', 
    direccion: '', numeroCasa: '', codigoPostal: '', 
    telefono: '', email: '', emergNombre: '', emergTelefono: '',
    sistemaSalud: 'NO TENGO', consultorio: '', alergias: '', 
    padecimientos: '', tratamientos: '', grupoSanguineo: 'NO SABE',
    tipoMembresia: 'MENSUALIDAD', firmaDigital: null, fotoPerfil: null,
    aceptoTerminos: false
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
  };

  const validarPaso1 = () => {
    if (!formData.nombres || !formData.apellidos || !formData.fechaNacimiento || !formData.telefono || !formData.direccion || !formData.numeroCasa || !formData.codigoPostal) {
      alert("⚠️ POR FAVOR, LLENA TODOS LOS CAMPOS OBLIGATORIOS DEL PASO 1.");
      return false;
    }
    return true;
  };

  const validarPaso2 = () => {
    if (formData.sistemaSalud !== 'NO TENGO' && !formData.consultorio) {
      alert("⚠️ DEBES ESPECIFICAR EL CONSULTORIO/CLÍNICA DE TU SISTEMA DE SALUD.");
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (step === 1 && !validarPaso1()) return;
    if (step === 2 && !validarPaso2()) return;
    setStep(prev => prev + 1);
  };

  const prevStep = () => setStep(prev => prev - 1);

  const capturarFoto = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setFormData(prev => ({ ...prev, fotoPerfil: imageSrc }));
    }
  }, [webcamRef]);

  const limpiarFirma = () => {
    if (sigPad.current) sigPad.current.clear();
  };

  const handleGuardarFinal = async () => {
    if (!formData.fotoPerfil) return alert("⚠️ DEBES TOMAR LA FOTO DE PERFIL.");
    if (!formData.aceptoTerminos) return alert("⚠️ DEBES MARCAR LA CASILLA DE ACEPTAR LOS TÉRMINOS.");
    if (!sigPad.current || sigPad.current.isEmpty()) return alert("⚠️ EL PELEADOR DEBE FIRMAR EL ACUERDO.");

    try {
      const firmaData = sigPad.current.getCanvas().toDataURL('image/png');
      
      // 🚨 FIX: Guardamos la firma en la memoria de React ANTES de destruir el Paso 3
      setFormData(prev => ({ ...prev, firmaDigital: firmaData }));
      
      const ultimoPeleador = await db.fighters.orderBy('id').last();
      let nuevaMatricula = "CT-26000"; 
      
      if (ultimoPeleador && ultimoPeleador.matricula && ultimoPeleador.matricula.startsWith("CT-26")) {
        const numeroActual = parseInt(ultimoPeleador.matricula.replace("CT-26", ""));
        if (!isNaN(numeroActual)) {
          const nuevoNumero = (numeroActual + 1).toString().padStart(3, '0');
          nuevaMatricula = `CT-26${nuevoNumero}`;
        }
      }

      const fighterDataCompleto = {
        ...formData,
        firmaDigital: firmaData,
        matricula: nuevaMatricula,
        name: `${formData.nombres} ${formData.apellidos}`.trim()
      };

      await addFighterFull(fighterDataCompleto);
      
      setMatriculaGenerada(nuevaMatricula);
      setStep(4); 

    } catch (error) {
      console.error("❌ ERROR CRÍTICO EN GUARDADO:", error);
      alert("❌ OCURRIÓ UN ERROR AL GUARDAR. ABRE LA CONSOLA PARA VER DETALLES.");
    }
  };

  const generarPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const nombreCompleto = `${formData.nombres} ${formData.apellidos}`;
    
    // Título
    doc.setFontSize(22);
    doc.setTextColor(31, 42, 68);
    doc.text("TEAM COTA'S MUAY THAI", 105, 20, null, null, "center");
    doc.setFontSize(14);
    doc.text("FICHA DE INSCRIPCIÓN Y EXPEDIENTE MÉDICO", 105, 30, null, null, "center");

    // Datos del Peleador
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`Matrícula: ${matriculaGenerada}`, 20, 50);
    doc.text(`Nombre: ${nombreCompleto}`, 20, 60);
    doc.text(`Membresía: ${formData.tipoMembresia}`, 20, 70);
    doc.text(`Teléfono: ${formData.telefono}`, 20, 80);
    doc.text(`Emergencia: ${formData.emergNombre} (${formData.emergTelefono})`, 20, 90);

    // Foto
    if (formData.fotoPerfil) {
      doc.addImage(formData.fotoPerfil, 'JPEG', 140, 45, 45, 45);
    }

    // Datos Médicos
    doc.setFillColor(230, 230, 230);
    doc.rect(20, 105, 170, 8, 'F');
    doc.setFont(undefined, 'bold');
    doc.text("EXPEDIENTE MÉDICO", 25, 110);
    
    doc.setFont(undefined, 'normal');
    doc.text(`Tipo de Sangre: ${formData.grupoSanguineo}`, 20, 125);
    doc.text(`Sistema de Salud: ${formData.sistemaSalud} - ${formData.consultorio}`, 20, 135);
    doc.text(`Alergias: ${formData.alergias || 'Ninguna'}`, 20, 145);
    doc.text(`Padecimientos: ${formData.padecimientos || 'Ninguno'}`, 20, 155);

    // 🚨 FIX: Subimos un poco el texto del contrato para que no se salga de la hoja
    doc.setFillColor(230, 230, 230);
    doc.rect(20, 165, 170, 8, 'F');
    doc.setFont(undefined, 'bold');
    doc.text("ACUERDO Y FIRMA", 25, 170);
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    const contratoLineas = doc.splitTextToSize(getContratoLegal(), 170);
    doc.text(contratoLineas, 20, 180);

    // 🚨 FIX: Usamos la firma que guardamos en formData, no el Canvas destruido
    if (formData.firmaDigital) {
      doc.addImage(formData.firmaDigital, 'PNG', 70, 235, 70, 25);
      doc.line(70, 260, 140, 260);
      doc.setFontSize(10);
      doc.text("FIRMA DE CONFORMIDAD", 105, 265, null, null, "center");
    }

    doc.save(`Contrato_${matriculaGenerada}_${formData.nombres}.pdf`);
  };

  // --- TEXTOS LEGALES ---
  const getContratoLegal = () => {
    const base = `LIBERACIÓN DE RESPONSABILIDAD\n\nSoy mayor de 18 años y he leído, comprendido y doy consentimiento a lo siguiente.\n\nEl participante entiende que está haciendo parte en un deporte que tiene contacto corporal y el cual requerirá que el participante haga parte en ejercicios de acondicionamiento y otras actividades que implican riesgo. El participante estará sujeto y asumirá la plena responsabilidad de todas sus acciones durante las actividades.\n\nEl participante entiende el riesgo de entrenar Boxeo / Artes Marciales y por tanto, libera a Team Cota's Muay Thai y a todos los empleados, de cualquier lesión física leve o grave, la muerte o daños materiales sufridos durante su participación en el entrenamiento.\n\nDoy consentimiento para que puedan subir fotos y vídeos a redes sociales donde aparezca durante los entrenamientos para publicidad del gimnasio.`;
    
    if (formData.tipoMembresia === 'VISITA / EVENTUAL' || formData.tipoMembresia === 'SEMANA') {
      return `${base}\n\nCLÁUSULA EVENTUAL:\nAl ser un miembro eventual sin pago de inscripción, acepto seguir todas las normas y reglas del gimnasio. Entiendo que el gimnasio no se hace cargo de accidentes y que, después de un periodo de inactividad, podré ser dado de baja del sistema sin previo aviso.`;
    } else {
      return `${base}\n\nCLÁUSULA DE MENSUALIDAD:\nMe comprometo a realizar mis pagos de mensualidad a tiempo. Entiendo que después de cuatro (4) meses de no estar pagando a tiempo, mi registro será dado de baja del sistema automáticamente y deberé cubrir nuevamente la inscripción.`;
    }
  };

  // --- RENDERIZADO DE LOS 4 PASOS ---

  const renderStep1 = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>PASO 1: DATOS PERSONALES</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', marginBottom: '30px' }}>
        <Input label="NOMBRES *" name="nombres" val={formData.nombres} onChange={handleChange} />
        <Input label="APELLIDOS *" name="apellidos" val={formData.apellidos} onChange={handleChange} />
        <Input label="FECHA DE NACIMIENTO *" name="fechaNacimiento" type="date" val={formData.fechaNacimiento} onChange={handleChange} />
        <Input label="TELÉFONO MÓVIL *" name="telefono" type="number" val={formData.telefono} onChange={handleChange} ph="10 dígitos" />
      </div>
      <h4 style={{ color: '#1F2A44', marginBottom: '15px' }}>DOMICILIO</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '25px', marginBottom: '30px' }}>
        <Input label="CALLE / AVENIDA *" name="direccion" val={formData.direccion} onChange={handleChange} />
        <Input label="NÚMERO *" name="numeroCasa" val={formData.numeroCasa} onChange={handleChange} />
        <Input label="C.P. *" name="codigoPostal" type="number" val={formData.codigoPostal} onChange={handleChange} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', marginBottom: '30px' }}>
        <Input label="CORREO ELECTRÓNICO" name="email" type="email" val={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value.toLowerCase()})} />
        <div>
          <label style={labelStyle}>GRUPO SANGUÍNEO *</label>
          <select name="grupoSanguineo" value={formData.grupoSanguineo} onChange={handleChange} style={inputStyle}>
            <option value="NO SABE">NO SABE</option><option value="O+">O+</option><option value="O-">O-</option>
            <option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option>
            <option value="AB+">AB+</option><option value="AB-">AB-</option>
          </select>
        </div>
      </div>
      <h4 style={{ color: '#1F2A44', marginBottom: '15px' }}>CONTACTO DE EMERGENCIA</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
        <Input label="NOMBRE COMPLETO" name="emergNombre" val={formData.emergNombre} onChange={handleChange} />
        <Input label="TELÉFONO" name="emergTelefono" type="number" val={formData.emergTelefono} onChange={handleChange} />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>PASO 2: EXPEDIENTE MÉDICO</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', marginBottom: '25px' }}>
        <div>
          <label style={labelStyle}>SISTEMA DE SALUD *</label>
          <select name="sistemaSalud" value={formData.sistemaSalud} onChange={handleChange} style={inputStyle}>
            <option value="NO TENGO">NO TENGO</option><option value="IMSS">IMSS</option>
            <option value="ISSSTECALI">ISSSTECALI</option><option value="ISSSTE">ISSSTE</option>
            <option value="SEGURO PRIVADO">SEGURO PRIVADO</option>
          </select>
        </div>
        {formData.sistemaSalud !== 'NO TENGO' && (
          <Input label="CLÍNICA / CONSULTORIO *" name="consultorio" val={formData.consultorio} onChange={handleChange} />
        )}
      </div>
      <TextArea label="ALERGIAS" name="alergias" val={formData.alergias} onChange={handleChange} ph="Ej. Penicilina, polvo (Dejar en blanco si no tiene)" />
      <TextArea label="¿PADECIMIENTOS, CIRUGÍAS O MEDICAMENTOS DE RELEVANCIA?" name="padecimientos" val={formData.padecimientos} onChange={handleChange} ph="Especifique detalles..." />
      <TextArea label="¿TRATAMIENTO MÉDICO QUE REQUIERA CUIDADOS?" name="tratamientos" val={formData.tratamientos} onChange={handleChange} ph="Especifique detalles..." />
    </div>
  );

  const renderStep3 = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>PASO 3: FOTO Y CONTRATO</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '40px' }}>
        <div>
          <label style={labelStyle}>FOTO DEL PELEADOR *</label>
          <div style={{ border: '2px solid #1F2A44', borderRadius: '8px', overflow: 'hidden', height: '240px', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {formData.fotoPerfil ? (
              <img src={formData.fotoPerfil} alt="Perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: "user" }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
          <button onClick={formData.fotoPerfil ? () => setFormData({...formData, fotoPerfil: null}) : capturarFoto} style={{ width: '100%', padding: '12px', marginTop: '10px', backgroundColor: '#1F2A44', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {formData.fotoPerfil ? '🔄 RETOMAR FOTO' : '📷 CAPTURAR FOTO'}
          </button>
          <div style={{ marginTop: '30px' }}>
            <label style={labelStyle}>TIPO DE MEMBRESÍA *</label>
            <select name="tipoMembresia" value={formData.tipoMembresia} onChange={handleChange} style={inputStyle}>
              <option value="VISITA / EVENTUAL">VISITA / EVENTUAL (Sin inscripción)</option>
              <option value="SEMANA">SEMANA (Sin inscripción)</option>
              <option value="MENSUALIDAD">MENSUALIDAD REGULAR</option>
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>ACUERDO DE LIBERACIÓN Y NORMAS</label>
          <div style={{ height: '160px', overflowY: 'scroll', backgroundColor: '#f0f0f0', padding: '15px', borderRadius: '8px', fontSize: '0.75rem', color: '#333', border: '1px solid #ccc', marginBottom: '15px', whiteSpace: 'pre-wrap' }}>
            {getContratoLegal()}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: '20px', height: '20px', cursor: 'pointer' }} checked={formData.aceptoTerminos} onChange={(e) => setFormData({...formData, aceptoTerminos: e.target.checked})} />
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: formData.aceptoTerminos ? '#28a745' : '#dc3545' }}>HE LEÍDO, COMPRENDIDO Y DOY MI CONSENTIMIENTO *</span>
          </label>
          <label style={{...labelStyle, opacity: formData.aceptoTerminos ? 1 : 0.5 }}>FIRMA DIGITAL DEL PELEADOR (O TUTOR) *</label>
          <div style={{ border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: '#fff', pointerEvents: formData.aceptoTerminos ? 'auto' : 'none', opacity: formData.aceptoTerminos ? 1 : 0.5 }}>
            <SignatureCanvas ref={sigPad} penColor="black" canvasProps={{ width: 500, height: 150, className: 'sigCanvas' }} />
          </div>
          <button onClick={limpiarFirma} style={{ background: 'none', border: 'none', color: '#888', textDecoration: 'underline', marginTop: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>Borrar firma</button>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="fade-in" style={{ textAlign: 'center', padding: '20px 0' }}>
      <h2 style={{ color: '#28a745', fontSize: '2.5rem', marginBottom: '10px', marginTop: 0 }}>¡REGISTRO EXITOSO!</h2>
      <h3 style={{ color: '#1F2A44', fontSize: '1.8rem', marginBottom: '30px' }}>MATRÍCULA: {matriculaGenerada}</h3>
      
      <p style={{ fontWeight: '900', color: '#1F2A44', marginBottom: '20px', fontSize: '1.1rem' }}>
        📲 PIDE AL PELEADOR QUE TOME FOTO A ESTE QR PARA SU ACCESO RÁPIDO:
      </p>
      
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
        <div style={{ padding: '20px', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '15px' }}>
          {/* Mostramos el QR con la matrícula generada */}
          <QRCodeSVG value={matriculaGenerada} size={250} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
        <button 
          onClick={generarPDF}
          style={{ padding: '15px 30px', backgroundColor: '#FF7F27', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
        >
          📄 DESCARGAR CONTRATO PDF
        </button>
        <button 
          onClick={() => window.location.reload()}
          style={{ padding: '15px 30px', backgroundColor: '#1F2A44', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
        >
          ➕ FINALIZAR Y NUEVO REGISTRO
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0', backgroundColor: '#fafafa', minHeight: '80vh' }}>
      <div style={{ width: '1050px', backgroundColor: '#ffffff', borderRadius: '15px', padding: '50px', border: '1px solid #e0e0e0', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
        
        {/* INDICADORES (Ocultos en Paso 4) */}
        {step < 4 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '50px' }}>
            {[1, 2, 3].map(num => (
              <div key={num} style={{ flex: 1, textAlign: 'center', padding: '15px', fontWeight: '900', borderBottom: step >= num ? '4px solid #FF7F27' : '4px solid #eee', color: step >= num ? '#1F2A44' : '#ccc', transition: '0.3s' }}>
                PASO {num}
              </div>
            ))}
          </div>
        )}

        <div style={{ minHeight: '450px' }}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* NAVEGACIÓN (Oculta en Paso 4) */}
        {step < 4 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '30px' }}>
            <button onClick={prevStep} disabled={step === 1} style={{ ...btnStyle, backgroundColor: step === 1 ? '#eee' : '#1F2A44', color: step === 1 ? '#aaa' : '#fff', cursor: step === 1 ? 'not-allowed' : 'pointer' }}>
              ⬅ REGRESAR
            </button>
            {step < 3 ? (
              <button onClick={handleNextStep} style={{ ...btnStyle, backgroundColor: '#FF7F27', color: '#fff' }}>
                SIGUIENTE PASO ➡
              </button>
            ) : (
              <button onClick={handleGuardarFinal} style={{ ...btnStyle, backgroundColor: '#28a745', color: '#fff' }}>
                ✅ GUARDAR EN SISTEMA
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- ESTILOS COMPARTIDOS ---
const stepTitleStyle = { color: '#1F2A44', borderBottom: '2px solid #FF7F27', paddingBottom: '10px', marginBottom: '30px', fontSize: '1.4rem' };
const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: '900', color: '#1F2A44', marginBottom: '8px', letterSpacing: '0.5px' };
const inputStyle = { width: '100%', padding: '14px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '1rem', outline: 'none', backgroundColor: '#fafafa' };
const btnStyle = { padding: '15px 35px', border: 'none', borderRadius: '8px', fontWeight: '900', fontSize: '0.9rem', letterSpacing: '1px', cursor: 'pointer', transition: '0.2s' };

const Input = ({ label, name, type = 'text', val, onChange, ph }) => (
  <div><label style={labelStyle}>{label}</label><input type={type} name={name} value={val} onChange={onChange} placeholder={ph} style={inputStyle} /></div>
);
const TextArea = ({ label, name, val, onChange, ph }) => (
  <div style={{ marginBottom: '25px' }}><label style={labelStyle}>{label}</label><textarea name={name} value={val} onChange={onChange} placeholder={ph} rows="3" style={{ ...inputStyle, resize: 'vertical' }} /></div>
);