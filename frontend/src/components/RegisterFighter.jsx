import React, { useState, useRef, useCallback, useMemo } from 'react';
import Webcam from 'react-webcam';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';
import { addFighterFull, db } from '../db/db';

export function RegisterFighter() {
  const [step, setStep] = useState(1);
  const [matriculaGenerada, setMatriculaGenerada] = useState(null);

  const webcamRef = useRef(null);
  const sigPad = useRef(null);

  const [formData, setFormData] = useState({
    // Personales
    nombres: '', apellidos: '', fechaNacimiento: '', 
    direccion: '', numeroCasa: '', codigoPostal: '', ciudad: '', 
    telefono: '', email: '', emergNombre: '', emergTelefono: '',
    // Tutor (Para menores)
    tutorNombre: '', tutorTelefono: '', tutorCorreo: '', tutorFechaNacimiento: '',
    // Médico
    sistemaSalud: 'NO TENGO', consultorio: '', alergias: '', 
    padecimientos: '', tratamientos: '', grupoSanguineo: 'NO SABE',
    // Membresía
    tipoMembresia: 'MENSUALIDAD', firmaDigital: null, fotoPerfil: null,
    aceptoTerminos: false
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
  };

  // --- LÓGICA DE EDAD (MENOR DE EDAD) ---
  const esMenorDeEdad = useMemo(() => {
    if (!formData.fechaNacimiento) return false;
    const birthDate = new Date(formData.fechaNacimiento);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age < 18;
  }, [formData.fechaNacimiento]);

  // --- ARQUITECTURA DE PASOS DINÁMICOS ---
  const formSteps = [
    { id: 'personal', title: 'PERSONALES' }
  ];
  if (esMenorDeEdad) {
    formSteps.push({ id: 'tutor', title: 'TUTOR' });
  }
  formSteps.push({ id: 'medico', title: 'MÉDICO' });
  formSteps.push({ id: 'contrato', title: 'CONTRATO' });

  // --- VALIDACIONES ---
  const validarPasoActual = () => {
    const currentStepId = formSteps[step - 1].id;

    if (currentStepId === 'personal') {
      if (!formData.nombres || !formData.apellidos || !formData.fechaNacimiento || !formData.telefono || !formData.direccion || !formData.numeroCasa || !formData.codigoPostal || !formData.ciudad) {
        alert("⚠️ POR FAVOR, LLENA TODOS LOS CAMPOS OBLIGATORIOS DEL PASO 1.");
        return false;
      }
    }
    if (currentStepId === 'tutor') {
      if (!formData.tutorNombre || !formData.tutorTelefono || !formData.tutorFechaNacimiento) {
        alert("⚠️ AL SER MENOR DE EDAD, LOS DATOS DEL TUTOR SON OBLIGATORIOS.");
        return false;
      }
    }
    if (currentStepId === 'medico') {
      if (formData.sistemaSalud !== 'NO TENGO' && !formData.consultorio) {
        alert("⚠️ DEBES ESPECIFICAR LA CLÍNICA DE TU SISTEMA DE SALUD.");
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (!validarPasoActual()) return;
    setStep(prev => prev + 1);
  };

  const prevStep = () => setStep(prev => prev - 1);

  // --- HARDWARE ---
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
    if (!sigPad.current || sigPad.current.isEmpty()) return alert("⚠️ SE REQUIERE LA FIRMA DEL ACUERDO.");

    try {
      const firmaData = sigPad.current.getCanvas().toDataURL('image/png');
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
      setStep(formSteps.length + 1); // Pasamos al paso de éxito

    } catch (error) {
      console.error("❌ ERROR CRÍTICO EN GUARDADO:", error);
      alert("❌ OCURRIÓ UN ERROR AL GUARDAR. ABRE LA CONSOLA PARA VER DETALLES.");
    }
  };

  const generarPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const nombreCompleto = `${formData.nombres} ${formData.apellidos}`;
    
    doc.setFontSize(22);
    doc.setTextColor(31, 42, 68);
    doc.text("TEAM COTA'S MUAY THAI", 105, 20, null, null, "center");
    doc.setFontSize(14);
    doc.text("FICHA DE INSCRIPCIÓN Y EXPEDIENTE MÉDICO", 105, 30, null, null, "center");

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Matrícula: ${matriculaGenerada}`, 20, 50);
    doc.text(`Nombre: ${nombreCompleto}`, 20, 58);
    doc.text(`Fecha Nacimiento: ${formData.fechaNacimiento}`, 20, 66);
    doc.text(`Membresía: ${formData.tipoMembresia}`, 20, 74);
    doc.text(`Teléfono: ${formData.telefono}`, 20, 82);
    doc.text(`Ciudad: ${formData.ciudad} (CP: ${formData.codigoPostal})`, 20, 90);
    doc.text(`Emergencia: ${formData.emergNombre} (${formData.emergTelefono})`, 20, 98);

    if (esMenorDeEdad) {
      doc.setTextColor(220, 53, 69); // Rojo para destacar al tutor
      doc.text(`TUTOR: ${formData.tutorNombre} (Tel: ${formData.tutorTelefono})`, 20, 106);
      doc.setTextColor(0, 0, 0);
    }

    if (formData.fotoPerfil) {
      doc.addImage(formData.fotoPerfil, 'JPEG', 150, 45, 40, 40);
    }

    doc.setFillColor(230, 230, 230);
    doc.rect(20, 115, 170, 7, 'F');
    doc.setFont(undefined, 'bold');
    doc.text("EXPEDIENTE MÉDICO", 25, 120);
    
    doc.setFont(undefined, 'normal');
    doc.text(`Tipo de Sangre: ${formData.grupoSanguineo}`, 20, 132);
    doc.text(`Sistema de Salud: ${formData.sistemaSalud} - ${formData.consultorio}`, 20, 140);
    doc.text(`Alergias: ${formData.alergias || 'Ninguna'}`, 20, 148);
    doc.text(`Padecimientos: ${formData.padecimientos || 'Ninguno'}`, 20, 156);

    doc.setFillColor(230, 230, 230);
    doc.rect(20, 168, 170, 7, 'F');
    doc.setFont(undefined, 'bold');
    doc.text("ACUERDO Y FIRMA", 25, 173);
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    const contratoLineas = doc.splitTextToSize(getContratoLegal(), 170);
    doc.text(contratoLineas, 20, 182);

    if (formData.firmaDigital) {
      doc.addImage(formData.firmaDigital, 'PNG', 70, 240, 70, 25);
      doc.line(70, 265, 140, 265);
      doc.setFontSize(10);
      doc.text(esMenorDeEdad ? "FIRMA DEL TUTOR" : "FIRMA DE CONFORMIDAD", 105, 270, null, null, "center");
    }

    doc.save(`Contrato_${matriculaGenerada}_${formData.nombres}.pdf`);
  };

  const getContratoLegal = () => {
    let base = `LIBERACIÓN DE RESPONSABILIDAD\n\n`;
    
    if (esMenorDeEdad) {
      base += `Yo, ${formData.tutorNombre || '_________________'}, en mi carácter de padre, madre o tutor legal de ${formData.nombres || '_________________'}, soy mayor de 18 años y he leído, comprendido y doy mi consentimiento a lo siguiente.\n\n`;
    } else {
      base += `Soy mayor de 18 años y he leído, comprendido y doy consentimiento a lo siguiente.\n\n`;
    }

    base += `El participante entiende que está haciendo parte en un deporte que tiene contacto corporal y el cual requerirá que el participante haga parte en ejercicios de acondicionamiento y otras actividades que implican riesgo. Asumimos la plena responsabilidad de todas las acciones durante las actividades.\n\nLiberamos a Team Cota's Muay Thai y a todos los empleados, de cualquier lesión física leve o grave, la muerte o daños materiales sufridos durante la participación en el entrenamiento.\n\nDoy consentimiento para que puedan subir fotos y vídeos a redes sociales donde aparezca durante los entrenamientos para publicidad del gimnasio.`;
    
    if (formData.tipoMembresia === 'VISITA / EVENTUAL' || formData.tipoMembresia === 'SEMANA') {
      return `${base}\n\nCLÁUSULA EVENTUAL:\nAl ser un miembro eventual sin pago de inscripción, acepto seguir todas las normas y reglas del gimnasio. Entiendo que el gimnasio no se hace cargo de accidentes y que, después de un periodo de inactividad, el registro podrá ser dado de baja del sistema sin previo aviso.`;
    } else {
      return `${base}\n\nCLÁUSULA DE MENSUALIDAD:\nMe comprometo a realizar los pagos de mensualidad a tiempo. Entiendo que después de cuatro (4) meses de no estar pagando a tiempo, el registro será dado de baja del sistema automáticamente y se deberá cubrir nuevamente la inscripción.`;
    }
  };

  // --- RENDERIZADO DE LOS PASOS ---

  const renderStep1 = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>PASO 1: DATOS PERSONALES</h3>
      <div style={gridResponsive}>
        <Input label="NOMBRES *" name="nombres" val={formData.nombres} onChange={handleChange} />
        <Input label="APELLIDOS *" name="apellidos" val={formData.apellidos} onChange={handleChange} />
        <Input label="FECHA DE NACIMIENTO *" name="fechaNacimiento" type="date" val={formData.fechaNacimiento} onChange={handleChange} />
        <Input label="TELÉFONO MÓVIL *" name="telefono" type="number" val={formData.telefono} onChange={handleChange} ph="10 dígitos" />
      </div>
      <h4 style={sectionSubtitleStyle}>DOMICILIO</h4>
      <div style={gridResponsive}>
        <Input label="CALLE / AVENIDA *" name="direccion" val={formData.direccion} onChange={handleChange} />
        <Input label="NÚMERO *" name="numeroCasa" val={formData.numeroCasa} onChange={handleChange} />
        <Input label="CIUDAD *" name="ciudad" val={formData.ciudad} onChange={handleChange} />
        <Input label="C.P. *" name="codigoPostal" type="number" val={formData.codigoPostal} onChange={handleChange} />
      </div>
      <div style={gridResponsive}>
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
      <h4 style={sectionSubtitleStyle}>CONTACTO DE EMERGENCIA</h4>
      <div style={gridResponsive}>
        <Input label="NOMBRE COMPLETO" name="emergNombre" val={formData.emergNombre} onChange={handleChange} />
        <Input label="TELÉFONO" name="emergTelefono" type="number" val={formData.emergTelefono} onChange={handleChange} />
      </div>
    </div>
  );

  const renderStepTutor = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>PASO 2: DATOS DEL TUTOR LEGAL</h3>
      <div style={{ padding: '15px', backgroundColor: '#fff3cd', borderLeft: '5px solid #ffc107', borderRadius: '4px', marginBottom: '25px' }}>
        <p style={{ margin: 0, color: '#856404', fontWeight: 'bold', fontSize: '0.9rem' }}>⚠️ Atención: El peleador es menor de edad. Se requiere la información de un padre o tutor legal para el contrato.</p>
      </div>
      <div style={gridResponsive}>
        <Input label="NOMBRE DEL TUTOR *" name="tutorNombre" val={formData.tutorNombre} onChange={handleChange} />
        <Input label="TELÉFONO DEL TUTOR *" name="tutorTelefono" type="number" val={formData.tutorTelefono} onChange={handleChange} />
        <Input label="CORREO DEL TUTOR" name="tutorCorreo" type="email" val={formData.tutorCorreo} onChange={(e) => setFormData({...formData, tutorCorreo: e.target.value.toLowerCase()})} />
        <Input label="FECHA NACIMIENTO TUTOR *" name="tutorFechaNacimiento" type="date" val={formData.tutorFechaNacimiento} onChange={handleChange} />
      </div>
    </div>
  );

  const renderStepMedico = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>EXPEDIENTE MÉDICO</h3>
      <div style={gridResponsive}>
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

  const renderStepContrato = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>FOTO Y CONTRATO</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '40px' }}>
        <div>
          <label style={labelStyle}>FOTO DEL PELEADOR *</label>
          <div style={{ border: '2px solid #1F2A44', borderRadius: '8px', overflow: 'hidden', height: '260px', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {formData.fotoPerfil ? (
              <img src={formData.fotoPerfil} alt="Perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: "user" }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
          <button onClick={formData.fotoPerfil ? () => setFormData({...formData, fotoPerfil: null}) : capturarFoto} style={{ width: '100%', padding: '12px', marginTop: '10px', backgroundColor: '#1F2A44', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {formData.fotoPerfil ? '🔄 RETOMAR FOTO' : '📷 CAPTURAR FOTO'}
          </button>
          <div style={{ marginTop: '20px' }}>
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
          <div style={{ height: '180px', overflowY: 'scroll', backgroundColor: '#f0f0f0', padding: '15px', borderRadius: '8px', fontSize: '0.75rem', color: '#333', border: '1px solid #ccc', marginBottom: '15px', whiteSpace: 'pre-wrap' }}>
            {getContratoLegal()}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: '25px', height: '25px', cursor: 'pointer' }} checked={formData.aceptoTerminos} onChange={(e) => setFormData({...formData, aceptoTerminos: e.target.checked})} />
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: formData.aceptoTerminos ? '#28a745' : '#dc3545' }}>HE LEÍDO Y DOY MI CONSENTIMIENTO *</span>
          </label>
          <label style={{...labelStyle, opacity: formData.aceptoTerminos ? 1 : 0.5 }}>{esMenorDeEdad ? 'FIRMA DIGITAL DEL TUTOR *' : 'FIRMA DIGITAL DEL PELEADOR *'}</label>
          <div style={{ border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: '#fff', pointerEvents: formData.aceptoTerminos ? 'auto' : 'none', opacity: formData.aceptoTerminos ? 1 : 0.5, touchAction: 'none' }}>
            <SignatureCanvas ref={sigPad} penColor="black" canvasProps={{ width: 450, height: 160, className: 'sigCanvas', style: { width: '100%', height: '100%' } }} />
          </div>
          <button onClick={limpiarFirma} style={{ background: 'none', border: 'none', color: '#888', textDecoration: 'underline', marginTop: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>Borrar firma</button>
        </div>
      </div>
    </div>
  );

  const renderStepSuccess = () => (
    <div className="fade-in" style={{ textAlign: 'center', padding: '20px 0' }}>
      <h2 style={{ color: '#28a745', fontSize: '2.5rem', marginBottom: '10px', marginTop: 0 }}>¡REGISTRO EXITOSO!</h2>
      <h3 style={{ color: '#1F2A44', fontSize: '1.8rem', marginBottom: '30px' }}>MATRÍCULA: {matriculaGenerada}</h3>
      <p style={{ fontWeight: '900', color: '#1F2A44', marginBottom: '20px', fontSize: '1.1rem' }}>
        📲 PIDE AL PELEADOR QUE TOME FOTO A ESTE QR PARA SU ACCESO RÁPIDO:
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
        <div style={{ padding: '20px', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '15px' }}>
          <QRCodeSVG value={matriculaGenerada} size={250} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <button onClick={generarPDF} style={{ padding: '15px 30px', backgroundColor: '#FF7F27', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
          📄 DESCARGAR CONTRATO PDF
        </button>
        <button onClick={() => window.location.reload()} style={{ padding: '15px 30px', backgroundColor: '#1F2A44', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
          ➕ FINALIZAR Y NUEVO REGISTRO
        </button>
      </div>
    </div>
  );

// REEMPLAZA EL CONTENEDOR PRINCIPAL POR ESTE:
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3vh 2vw', backgroundColor: '#fafafa', minHeight: '80vh' }}>
      <div style={{ width: '95vw', maxWidth: '1200px', backgroundColor: '#ffffff', borderRadius: '15px', padding: '4vw', border: '1px solid #e0e0e0', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
        {/* Aquí adentro sigue tu código de indicadores y pasos (NO lo borres) */}
        {/* INDICADORES DINÁMICOS */}
        {step <= formSteps.length && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '10px' }}>
            {formSteps.map((s, index) => {
              const num = index + 1;
              return (
                <div key={s.id} style={{ flex: '1 1 auto', textAlign: 'center', padding: '10px', fontWeight: '900', borderBottom: step >= num ? '4px solid #FF7F27' : '4px solid #eee', color: step >= num ? '#1F2A44' : '#ccc', transition: '0.3s', fontSize: '0.85rem' }}>
                  {num}. {s.title}
                </div>
              );
            })}
          </div>
        )}

        {/* MOTOR DE RENDERIZADO DE PASOS */}
        <div style={{ minHeight: '40vh' }}>
          {step <= formSteps.length ? (
            <>
              {formSteps[step - 1].id === 'personal' && renderStep1()}
              {formSteps[step - 1].id === 'tutor' && renderStepTutor()}
              {formSteps[step - 1].id === 'medico' && renderStepMedico()}
              {formSteps[step - 1].id === 'contrato' && renderStepContrato()}
            </>
          ) : (
            renderStepSuccess()
          )}
        </div>

        {/* NAVEGACIÓN */}
        {step <= formSteps.length && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '30px' }}>
            <button onClick={prevStep} disabled={step === 1} style={{ ...btnStyle, backgroundColor: step === 1 ? '#eee' : '#1F2A44', color: step === 1 ? '#aaa' : '#fff', cursor: step === 1 ? 'not-allowed' : 'pointer' }}>
              ⬅ REGRESAR
            </button>
            {step < formSteps.length ? (
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

// --- REEMPLAZA ESTOS ESTILOS AL FINAL DE TU ARCHIVO ---
const gridResponsive = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '25px' };
const stepTitleStyle = { color: '#1F2A44', borderBottom: '2px solid #FF7F27', paddingBottom: '10px', marginBottom: '20px', fontSize: '1.3rem' };
const sectionSubtitleStyle = { color: '#1F2A44', marginBottom: '15px', fontSize: '1.1rem', fontWeight: 'bold' };
const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: '900', color: '#1F2A44', marginBottom: '8px', letterSpacing: '0.5px' };
const inputStyle = { width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '1rem', outline: 'none', backgroundColor: '#fafafa', boxSizing: 'border-box' };
const btnStyle = { padding: '15px 25px', border: 'none', borderRadius: '8px', fontWeight: '900', fontSize: '0.9rem', letterSpacing: '1px', cursor: 'pointer', transition: '0.2s', flex: '1 1 auto', textAlign: 'center' };

const Input = ({ label, name, type = 'text', val, onChange, ph }) => (
  <div style={{ width: '100%' }}><label style={labelStyle}>{label}</label><input type={type} name={name} value={val} onChange={onChange} placeholder={ph} style={inputStyle} /></div>
);
const TextArea = ({ label, name, val, onChange, ph }) => (
  <div style={{ marginBottom: '25px', width: '100%' }}><label style={labelStyle}>{label}</label><textarea name={name} value={val} onChange={onChange} placeholder={ph} rows="3" style={{ ...inputStyle, resize: 'vertical' }} /></div>
);