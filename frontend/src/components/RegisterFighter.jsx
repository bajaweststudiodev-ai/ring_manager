import React, { useEffect, useMemo, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import { FiMapPin, FiSmartphone } from 'react-icons/fi';
import { fetchApi } from '../config/api';
import { getFighterDisplayName, normalizeFighterRecord } from '../db/db';

export function RegisterFighter({ gymContext = null, publicMode = false }) {
  const [step, setStep] = useState(1);
  const [matriculaGenerada, setMatriculaGenerada] = useState(null);
  const [coloniasDisponibles, setColoniasDisponibles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverMessage, setServerMessage] = useState('');
  const webcamRef = useRef(null);
  const sigPad = useRef(null);

  const [formData, setFormData] = useState({
    nombres: '',
    apellidoPaterno: '',
    apellidoMaterno: '',
    fechaNacimiento: '',
    direccion: '',
    numeroCasa: '',
    colonia: '',
    codigoPostal: '',
    ciudad: '',
    telefono: '',
    email: '',
    emergNombre: '',
    emergTelefono: '',
    tutorNombres: '',
    tutorApellidoPaterno: '',
    tutorApellidoMaterno: '',
    tutorTelefono: '',
    tutorCorreo: '',
    tutorFechaNacimiento: '',
    sistemaSalud: 'NO TENGO',
    consultorio: '',
    alergias: '',
    lesiones: '',
    tratamientos: '',
    grupoSanguineo: 'NO SABE',
    tipoMembresia: 'MENSUALIDAD + INSCRIPCION',
    fotoPerfil: null,
    aceptoTerminos: false
  });

  useEffect(() => {
    if (!publicMode) {
      document.title = "Ring Manager";
      return;
    }

    const gymName = gymContext?.nombre?.trim();
    document.title = gymName ? `Registro | ${gymName}` : 'Registro publico';
  }, [gymContext, publicMode]);

  const generarMatriculaUnica = () => {
    const randomHex = Math.random().toString(16).substring(2, 6).toUpperCase();
    const tiempo = Date.now().toString().slice(-3);
    return `CT-${randomHex}-${tiempo}`;
  };

  const handleChange = async (e) => {
    const { name, value } = e.target;

    if (name === 'telefono' || name === 'emergTelefono' || name === 'tutorTelefono') {
      const soloNumeros = value.replace(/\D/g, '');
      if (soloNumeros.length > 10) return;
      setFormData((prev) => ({ ...prev, [name]: soloNumeros }));
      return;
    }

    if (name === 'email' || name === 'tutorCorreo') {
      setFormData((prev) => ({ ...prev, [name]: value.toLowerCase() }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value.toUpperCase() }));
    }

    if (name === 'codigoPostal' && value.length === 5) {
      try {
        const response = await fetch(`https://api.zippopotam.us/mx/${value}`);
        if (!response.ok) {
          setColoniasDisponibles([]);
          return;
        }
        const data = await response.json();
        const listaColonias = data.places.map((place) => place['place name'].toUpperCase());

        let ciudadDetectada = '';
        if (value.startsWith('228') || value.startsWith('227')) {
          ciudadDetectada = 'ENSENADA';
        } else if (value.startsWith('22') && !value.startsWith('228') && !value.startsWith('227')) {
          ciudadDetectada = 'TIJUANA / ROSARITO';
        } else if (value.startsWith('21')) {
          ciudadDetectada = 'MEXICALI / TECATE';
        } else {
          ciudadDetectada = data.places[0]?.state?.toUpperCase() || '';
        }

        setColoniasDisponibles(listaColonias);
        setFormData((prev) => ({
          ...prev,
          codigoPostal: value,
          ciudad: ciudadDetectada,
          colonia: listaColonias[0] || '',
        }));
      } catch (error) {
        console.warn('No pude autocompletar el codigo postal.', error);
        setColoniasDisponibles([]);
      }
    }
  };

  const esMenorDeEdad = useMemo(() => {
    if (!formData.fechaNacimiento) return false;
    const birthDate = new Date(formData.fechaNacimiento);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }
    return age < 18;
  }, [formData.fechaNacimiento]);

  const formSteps = useMemo(() => {
    const steps = [{ id: 'personal', title: 'PERSONALES' }];
    if (esMenorDeEdad) {
      steps.push({ id: 'tutor', title: 'TUTOR' });
    }
    steps.push({ id: 'medico', title: 'MEDICO' });
    steps.push({ id: 'contrato', title: 'CONTRATO' });
    return steps;
  }, [esMenorDeEdad]);

  const validarPasoActual = () => {
    const currentStepId = formSteps[step - 1].id;

    if (currentStepId === 'personal') {
      const faltanDatos = [
        formData.nombres,
        formData.apellidoPaterno,
        formData.fechaNacimiento,
        formData.telefono,
        formData.direccion,
        formData.numeroCasa,
        formData.codigoPostal,
        formData.ciudad,
      ].some((field) => !field);
      if (faltanDatos) {
        alert('Llena todos los campos obligatorios del paso 1.');
        return false;
      }
    }

    if (currentStepId === 'tutor') {
      const faltanDatosTutor = [
        formData.tutorNombres,
        formData.tutorApellidoPaterno,
        formData.tutorTelefono,
        formData.tutorFechaNacimiento,
      ].some((field) => !field);
      if (faltanDatosTutor) {
        alert('Como el peleador es menor de edad, necesito los datos del tutor.');
        return false;
      }
    }

    return true;
  };

  const capturarFoto = () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    setFormData((prev) => ({ ...prev, fotoPerfil: imageSrc }));
  };

  const limpiarFirma = () => {
    if (sigPad.current) {
      sigPad.current.clear();
    }
  };

  const construirPayload = (matricula, firmaData) => {
    return {
      matricula,
      nombre: formData.nombres.trim(),
      apellido_paterno: formData.apellidoPaterno.trim(),
      apellido_materno: formData.apellidoMaterno.trim(),
      fecha_nacimiento: formData.fechaNacimiento,
      colonia: formData.colonia.trim(),
      calle: formData.direccion.trim(),
      numero_exterior: formData.numeroCasa.trim(),
      codigo_postal: formData.codigoPostal.trim(),
      ciudad: formData.ciudad.trim(),
      telefono: formData.telefono.trim(),
      correo: formData.email.trim(),
      tipo_sangre: formData.grupoSanguineo,
      contacto_emergencia: formData.emergNombre.trim(),
      telefono_emergencia: formData.emergTelefono.trim(),
      seguro_medico: formData.sistemaSalud,
      consultorio: formData.consultorio.trim(),
      alergias: formData.alergias.trim(),
      lesiones: formData.lesiones.trim() || formData.tratamientos.trim(),
      tutor_nombre: formData.tutorNombres.trim(),
      tutor_apellido_paterno: formData.tutorApellidoPaterno.trim(),
      tutor_apellido_materno: formData.tutorApellidoMaterno.trim(),
      tutor_telefono: formData.tutorTelefono.trim(),
      tutor_correo: formData.tutorCorreo.trim(),
      tutor_fecha_nacimiento: formData.tutorFechaNacimiento,
      gimnasio_id: gymContext?.id || null,
      tipo_pago_sugerido: formData.tipoMembresia,
      foto_data_url: formData.fotoPerfil,
      firma_data_url: firmaData,
    };
  };

  const handleGuardarFinal = async () => {
    if (!formData.fotoPerfil) {
      alert('Debes tomar la foto de perfil.');
      return;
    }
    if (!formData.aceptoTerminos) {
      alert('Debes aceptar el acuerdo.');
      return;
    }
    if (!sigPad.current || sigPad.current.isEmpty()) {
      alert('Necesito la firma para continuar.');
      return;
    }

    setIsSubmitting(true);
    setServerMessage('');

    try {
      const firmaData = sigPad.current.getCanvas().toDataURL('image/png');
      const nuevaMatricula = generarMatriculaUnica();
      const payload = construirPayload(nuevaMatricula, firmaData);

      try {
        const response = await fetchApi('/api/registro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const responseText = await response.text();
        let result = {};
        try {
          result = responseText ? JSON.parse(responseText) : {};
        } catch {
          result = {};
        }

        if (!response.ok) {
          throw new Error(
            result.message
            || responseText
            || `No pude guardar el registro en el servidor. Codigo ${response.status}.`
          );
        }
        setServerMessage('Solicitud enviada correctamente. El entrenador la guardara en el sistema al confirmar el pago.');
      } catch (error) {
        console.warn('No pude enviar la solicitud a Flask.', error);
        throw error;
      }

      setMatriculaGenerada(nuevaMatricula);
      setStep(formSteps.length + 1);
    } catch (error) {
      console.error('Error al guardar el registro:', error);
      alert(error.message || 'Ocurrio un error al guardar el registro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTutorNombreCompleto = () => {
    return [
      formData.tutorNombres,
      formData.tutorApellidoPaterno,
      formData.tutorApellidoMaterno,
    ].filter(Boolean).join(' ');
  };

  const generarPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const nombreCompleto = getFighterDisplayName(normalizeFighterRecord({
      nombre: formData.nombres,
      apellido_paterno: formData.apellidoPaterno,
      apellido_materno: formData.apellidoMaterno,
    }));

    doc.setFontSize(22);
    doc.setTextColor(31, 42, 68);
    doc.text("TEAM COTA'S MUAY THAI", 105, 20, null, null, 'center');
    doc.setFontSize(14);
    doc.text('FICHA DE INSCRIPCION Y EXPEDIENTE MEDICO', 105, 30, null, null, 'center');

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Matricula: ${matriculaGenerada}`, 20, 50);
    doc.text(`Nombre: ${nombreCompleto}`, 20, 58);
    doc.text(`Fecha nacimiento: ${formData.fechaNacimiento}`, 20, 66);
    doc.text(`Membresia: ${formData.tipoMembresia}`, 20, 74);
    doc.text(`Telefono: ${formData.telefono}`, 20, 82);
    doc.text(`Ciudad: ${formData.ciudad} (CP: ${formData.codigoPostal})`, 20, 90);
    doc.text(`Emergencia: ${formData.emergNombre} (${formData.emergTelefono})`, 20, 98);

    if (esMenorDeEdad) {
      doc.setTextColor(220, 53, 69);
      doc.text(`Tutor: ${getTutorNombreCompleto()} (Tel: ${formData.tutorTelefono})`, 20, 106);
      doc.setTextColor(0, 0, 0);
    }

    if (formData.fotoPerfil) {
      doc.addImage(formData.fotoPerfil, 'JPEG', 150, 45, 40, 40);
    }

    doc.setFillColor(230, 230, 230);
    doc.rect(20, 115, 170, 7, 'F');
    doc.setFont(undefined, 'bold');
    doc.text('EXPEDIENTE MEDICO', 25, 120);

    doc.setFont(undefined, 'normal');
    doc.text(`Tipo de sangre: ${formData.grupoSanguineo}`, 20, 132);
    doc.text(`Sistema de salud: ${formData.sistemaSalud} - ${formData.consultorio}`, 20, 140);
    doc.text(`Alergias: ${formData.alergias || 'Ninguna'}`, 20, 148);
    doc.text(`Lesiones: ${formData.lesiones || 'Ninguna'}`, 20, 156);

    doc.setFillColor(230, 230, 230);
    doc.rect(20, 168, 170, 7, 'F');
    doc.setFont(undefined, 'bold');
    doc.text('ACUERDO Y FIRMA', 25, 173);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    const contratoLineas = doc.splitTextToSize(getContratoLegal(), 170);
    doc.text(contratoLineas, 20, 182);

    if (!sigPad.current?.isEmpty()) {
      const firmaData = sigPad.current.getCanvas().toDataURL('image/png');
      doc.addImage(firmaData, 'PNG', 70, 240, 70, 25);
      doc.line(70, 265, 140, 265);
      doc.setFontSize(10);
      doc.text(esMenorDeEdad ? 'FIRMA DEL TUTOR' : 'FIRMA DE CONFORMIDAD', 105, 270, null, null, 'center');
    }

    doc.save(`Contrato_${matriculaGenerada}_${formData.nombres}.pdf`);
  };

  const getContratoLegal = () => {
    let base = 'LIBERACION DE RESPONSABILIDAD\n\n';

    if (esMenorDeEdad) {
      base += `Yo, ${getTutorNombreCompleto() || '_________________'}, en mi caracter de padre, madre o tutor legal de ${formData.nombres || '_________________'}, he leido, comprendido y doy mi consentimiento a lo siguiente.\n\n`;
    } else {
      base += 'Soy mayor de edad y he leido, comprendido y doy consentimiento a lo siguiente.\n\n';
    }

    base += "El participante entiende que esta haciendo parte en un deporte con contacto corporal y actividades que implican riesgo. Asumo la responsabilidad de las acciones durante las actividades.\n\nLibero a Team Cota's Muay Thai y a su personal de cualquier lesion fisica, muerte o danos materiales sufridos durante la participacion en el entrenamiento.\n\nDoy consentimiento para el uso de imagen en fotos y videos de publicidad del gimnasio.";

    const tiposEventuales = ['VISITA', 'SEMANA', 'DOS SEMANAS'];
    if (tiposEventuales.includes(formData.tipoMembresia)) {
      return `${base}\n\nCLAUSULA EVENTUAL:\nAcepto seguir todas las reglas del gimnasio. Entiendo que el gimnasio no se hace cargo de accidentes y que, despues de un periodo de inactividad, mi registro puede darse de baja sin previo aviso.`;
    }

    return `${base}\n\nCLAUSULA DE MENSUALIDAD:\nMe comprometo a realizar mis pagos a tiempo. Entiendo que, despues de cuatro meses sin pagar, el registro puede darse de baja y sera necesario cubrir nuevamente la inscripcion.`;
  };

  const handleNextStep = () => {
    if (!validarPasoActual()) return;
    setStep((prev) => prev + 1);
  };

  const prevStep = () => setStep((prev) => prev - 1);

  const renderStep1 = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>PASO 1: DATOS PERSONALES</h3>
      <div style={{ ...gridResponsive, gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Input label="NOMBRE(S) *" name="nombres" val={formData.nombres} onChange={handleChange} />
        <Input label="APELLIDO PATERNO *" name="apellidoPaterno" val={formData.apellidoPaterno} onChange={handleChange} />
        <Input label="APELLIDO MATERNO" name="apellidoMaterno" val={formData.apellidoMaterno} onChange={handleChange} />
      </div>

      <div style={{ ...gridResponsive, gridTemplateColumns: '1fr 1fr' }}>
        <Input label="FECHA DE NACIMIENTO *" name="fechaNacimiento" type="date" val={formData.fechaNacimiento} onChange={handleChange} />
        <Input label="TELEFONO MOVIL *" name="telefono" type="number" val={formData.telefono} onChange={handleChange} ph="10 digitos" />
      </div>

      <h4 style={sectionSubtitleStyle}>DOMICILIO</h4>
      <div style={gridResponsive}>
        <Input label="C.P. *" name="codigoPostal" type="number" val={formData.codigoPostal} onChange={handleChange} ph="Ej. 22800" />
        <div>
          <label style={labelStyle}>COLONIA *</label>
          {coloniasDisponibles.length > 0 ? (
            <select name="colonia" value={formData.colonia} onChange={handleChange} style={inputStyle}>
              {coloniasDisponibles.map((colonia, index) => (
                <option key={index} value={colonia}>{colonia}</option>
              ))}
            </select>
          ) : (
            <input name="colonia" value={formData.colonia} onChange={handleChange} style={inputStyle} placeholder="Escribe tu colonia" />
          )}
        </div>
      </div>

      <div style={{ ...gridResponsive, gridTemplateColumns: '2fr 1fr 1fr' }}>
        <Input label="CALLE *" name="direccion" val={formData.direccion} onChange={handleChange} />
        <Input label="NUMERO *" name="numeroCasa" val={formData.numeroCasa} onChange={handleChange} />
        <Input label="CIUDAD *" name="ciudad" val={formData.ciudad} onChange={handleChange} />
      </div>

      <div style={gridResponsive}>
        <Input label="CORREO" name="email" type="email" val={formData.email} onChange={handleChange} />
        <div>
          <label style={labelStyle}>GRUPO SANGUINEO</label>
          <select name="grupoSanguineo" value={formData.grupoSanguineo} onChange={handleChange} style={inputStyle}>
            <option value="NO SABE">NO SABE</option>
            <option value="O+">O+</option>
            <option value="O-">O-</option>
            <option value="A+">A+</option>
            <option value="A-">A-</option>
            <option value="B+">B+</option>
            <option value="B-">B-</option>
            <option value="AB+">AB+</option>
            <option value="AB-">AB-</option>
          </select>
        </div>
      </div>

      <h4 style={sectionSubtitleStyle}>CONTACTO DE EMERGENCIA</h4>
      <div style={gridResponsive}>
        <Input label="NOMBRE COMPLETO" name="emergNombre" val={formData.emergNombre} onChange={handleChange} />
        <Input label="TELEFONO" name="emergTelefono" type="number" val={formData.emergTelefono} onChange={handleChange} />
      </div>
    </div>
  );

  const renderStepTutor = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>PASO 2: DATOS DEL TUTOR</h3>
      <div style={warningBoxStyle}>
        Necesito la informacion del tutor porque el peleador es menor de edad.
      </div>
      <div style={{ ...gridResponsive, gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Input label="NOMBRE(S) *" name="tutorNombres" val={formData.tutorNombres} onChange={handleChange} />
        <Input label="APELLIDO PATERNO *" name="tutorApellidoPaterno" val={formData.tutorApellidoPaterno} onChange={handleChange} />
        <Input label="APELLIDO MATERNO" name="tutorApellidoMaterno" val={formData.tutorApellidoMaterno} onChange={handleChange} />
      </div>
      <div style={{ ...gridResponsive, gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Input label="TELEFONO *" name="tutorTelefono" type="number" val={formData.tutorTelefono} onChange={handleChange} />
        <Input label="CORREO" name="tutorCorreo" type="email" val={formData.tutorCorreo} onChange={handleChange} />
        <Input label="FECHA DE NACIMIENTO *" name="tutorFechaNacimiento" type="date" val={formData.tutorFechaNacimiento} onChange={handleChange} />
      </div>
    </div>
  );

  const renderStepMedico = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>EXPEDIENTE MEDICO</h3>
      <div style={gridResponsive}>
        <div>
          <label style={labelStyle}>SISTEMA DE SALUD</label>
          <select name="sistemaSalud" value={formData.sistemaSalud} onChange={handleChange} style={inputStyle}>
            <option value="NO TENGO">NO TENGO</option>
            <option value="IMSS">IMSS</option>
            <option value="ISSSTECALI">ISSSTECALI</option>
            <option value="ISSSTE">ISSSTE</option>
            <option value="SEGURO PRIVADO">SEGURO PRIVADO</option>
          </select>
        </div>
        {formData.sistemaSalud !== 'NO TENGO' && (
          <Input label="CLINICA / CONSULTORIO" name="consultorio" val={formData.consultorio} onChange={handleChange} />
        )}
      </div>
      <TextArea label="ALERGIAS" name="alergias" val={formData.alergias} onChange={handleChange} />
      <TextArea label="LESIONES" name="lesiones" val={formData.lesiones} onChange={handleChange} />
      <TextArea label="TRATAMIENTOS" name="tratamientos" val={formData.tratamientos} onChange={handleChange} />
    </div>
  );

  const renderStepContrato = () => (
    <div className="fade-in">
      <h3 style={stepTitleStyle}>FOTO Y CONTRATO</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px' }}>
        <div>
          <label style={labelStyle}>FOTO DEL PELEADOR *</label>
          <div style={cameraBoxStyle}>
            {formData.fotoPerfil ? (
              <img src={formData.fotoPerfil} alt="Perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: 'user' }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
          <button onClick={formData.fotoPerfil ? () => setFormData((prev) => ({ ...prev, fotoPerfil: null })) : capturarFoto} style={secondaryButtonStyle}>
            {formData.fotoPerfil ? 'Tomar otra foto' : 'Capturar foto'}
          </button>

          <div style={{ marginTop: '16px' }}>
            <label style={labelStyle}>TIPO DE MEMBRESIA *</label>
            <select name="tipoMembresia" value={formData.tipoMembresia} onChange={handleChange} style={inputStyle}>
              <option value="MENSUALIDAD + INSCRIPCION">MENSUALIDAD + INSCRIPCION</option>
              <option value="PROPORCIONAL + INSCRIPCION">PROPORCIONAL + INSCRIPCION</option>
              <option value="MENSUALIDAD">MENSUALIDAD</option>
              <option value="DOS SEMANAS">DOS SEMANAS</option>
              <option value="SEMANA">SEMANA</option>
              <option value="VISITA">VISITA</option>
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>ACUERDO</label>
          <div style={contractBoxStyle}>{getContratoLegal()}</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', cursor: 'pointer' }}>
            <input type="checkbox" checked={formData.aceptoTerminos} onChange={(e) => setFormData((prev) => ({ ...prev, aceptoTerminos: e.target.checked }))} />
            <span style={{ fontSize: '0.85rem', color: formData.aceptoTerminos ? '#2d2e30' : '#b42318' }}>He leido y acepto el acuerdo</span>
          </label>
          <label style={{ ...labelStyle, opacity: formData.aceptoTerminos ? 1 : 0.5 }}>
            {esMenorDeEdad ? 'FIRMA DEL TUTOR *' : 'FIRMA DEL PELEADOR *'}
          </label>
          <div style={{ ...signatureBoxStyle, opacity: formData.aceptoTerminos ? 1 : 0.5, pointerEvents: formData.aceptoTerminos ? 'auto' : 'none' }}>
            <SignatureCanvas
              ref={sigPad}
              penColor="black"
              backgroundColor="white"
              clearOnResize={false}
              canvasProps={{
                width: Math.min(window.innerWidth * 0.55, 380),
                height: 170,
              }}
            />
          </div>
          <button onClick={limpiarFirma} style={linkButtonStyle}>Borrar firma</button>
        </div>
      </div>
    </div>
  );

  const renderStepSuccess = () => (
    <div className="fade-in" style={{ textAlign: 'center', padding: '18px 0' }}>
      <h2 style={{ color: '#1F2A44', fontSize: '2rem', marginBottom: '8px', marginTop: 0 }}>REGISTRO COMPLETADO</h2>
      <h3 style={{ color: '#FF7F27', fontSize: '1.4rem', marginBottom: '18px' }}>MATRICULA: {matriculaGenerada}</h3>
      <div style={warningBoxStyle}>
        El registro quedo pendiente de aprobacion. El entrenador activara tu acceso cuando apruebe y cobre tu alta.
      </div>
      {serverMessage && <p style={{ color: '#555', fontSize: '0.9rem', marginTop: '16px' }}>{serverMessage}</p>}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '18px' }}>
        <button onClick={generarPDF} style={secondaryButtonStyle}>Descargar contrato PDF</button>
        <button onClick={() => window.location.reload()} style={primaryButtonStyle}>Nuevo registro</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3vh 2vw', backgroundColor: '#fafafa', minHeight: '80vh' }}>
      <div style={containerStyle}>
        {publicMode && (
          <div style={publicBannerStyle}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <FiSmartphone size={16} />
                <strong style={{ fontSize: '0.9rem' }}>Registro desde celular</strong>
              </div>
              <div style={{ fontSize: '0.84rem', lineHeight: 1.45 }}>
                Completa tu alta y envia tu solicitud. El entrenador revisara el registro antes de activarte.
              </div>
            </div>
            {gymContext?.nombre && (
              <div style={gymChipStyle}>
                <FiMapPin size={14} />
                <span>{gymContext.nombre}</span>
              </div>
            )}
          </div>
        )}

        {step <= formSteps.length && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '10px' }}>
            {formSteps.map((item, index) => {
              const num = index + 1;
              return (
                <div key={item.id} style={{ flex: '1 1 auto', textAlign: 'center', padding: '8px', fontWeight: 700, borderBottom: step >= num ? '3px solid #FF7F27' : '3px solid #eee', color: step >= num ? '#1F2A44' : '#999', fontSize: '0.82rem' }}>
                  {num}. {item.title}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ minHeight: '40vh' }}>
          {step <= formSteps.length ? (
            <>
              {formSteps[step - 1].id === 'personal' && renderStep1()}
              {formSteps[step - 1].id === 'tutor' && renderStepTutor()}
              {formSteps[step - 1].id === 'medico' && renderStepMedico()}
              {formSteps[step - 1].id === 'contrato' && renderStepContrato()}
            </>
          ) : renderStepSuccess()}
        </div>

        {step <= formSteps.length && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px', gap: '12px' }}>
            <button onClick={prevStep} disabled={step === 1 || isSubmitting} style={{ ...secondaryButtonStyle, opacity: step === 1 || isSubmitting ? 0.6 : 1, cursor: step === 1 || isSubmitting ? 'not-allowed' : 'pointer' }}>
              Regresar
            </button>
            {step < formSteps.length ? (
              <button onClick={handleNextStep} style={primaryButtonStyle}>Siguiente</button>
            ) : (
              <button onClick={handleGuardarFinal} disabled={isSubmitting} style={{ ...primaryButtonStyle, opacity: isSubmitting ? 0.7 : 1 }}>
                {isSubmitting ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const containerStyle = {
  width: 'min(95vw, 1320px)',
  backgroundColor: '#ffffff',
  borderRadius: '14px',
  padding: 'clamp(20px, 3vw, 42px)',
  border: '1px solid #e0e0e0',
  boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
};

const gridResponsive = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(clamp(220px, 25vw, 300px), 1fr))', gap: '18px', marginBottom: '22px' };
const stepTitleStyle = { color: '#1F2A44', borderBottom: '2px solid #FF7F27', paddingBottom: '10px', marginBottom: '18px', fontSize: '1.2rem' };
const sectionSubtitleStyle = { color: '#1F2A44', marginBottom: '14px', fontSize: '1rem', fontWeight: 700 };
const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1F2A44', marginBottom: '8px', letterSpacing: '0.3px' };
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.92rem', outline: 'none', backgroundColor: '#fafafa', boxSizing: 'border-box' };
const primaryButtonStyle = { padding: '10px 16px', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', backgroundColor: '#1F2A44', color: '#fff' };
const secondaryButtonStyle = { padding: '10px 14px', border: '1px solid #d0d5dd', borderRadius: '8px', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', backgroundColor: '#fff', color: '#1F2A44', width: '100%', marginTop: '10px' };
const linkButtonStyle = { background: 'none', border: 'none', color: '#667085', textDecoration: 'underline', marginTop: '6px', cursor: 'pointer', fontSize: '0.76rem' };
const cameraBoxStyle = { border: '1px solid #d0d5dd', borderRadius: '8px', overflow: 'hidden', height: 'clamp(220px, 30vh, 320px)', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' };
const contractBoxStyle = { height: '180px', overflowY: 'scroll', backgroundColor: '#f7f7f7', padding: '14px', borderRadius: '8px', fontSize: '0.76rem', color: '#333', border: '1px solid #ddd', marginBottom: '14px', whiteSpace: 'pre-wrap' };
const signatureBoxStyle = { border: '1px dashed #c8c8c8', borderRadius: '8px', backgroundColor: '#fff', touchAction: 'none', display: 'flex', justifyContent: 'center', overflow: 'hidden' };
const warningBoxStyle = { padding: '14px', backgroundColor: '#fff7ed', borderLeft: '4px solid #f59e0b', borderRadius: '6px', marginBottom: '22px', color: '#92400e', fontSize: '0.9rem' };
const publicBannerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '14px 16px', marginBottom: '18px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', color: '#1e293b' };
const gymChipStyle = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 10px', borderRadius: '999px', backgroundColor: '#fff', border: '1px solid #d0d5dd', fontSize: '0.8rem', fontWeight: 700, color: '#1F2A44' };

const Input = ({ label, name, type = 'text', val, onChange, ph }) => (
  <div style={{ width: '100%' }}>
    <label style={labelStyle}>{label}</label>
    <input type={type} name={name} value={val} onChange={onChange} placeholder={ph} style={inputStyle} />
  </div>
);

const TextArea = ({ label, name, val, onChange, ph }) => (
  <div style={{ marginBottom: '22px', width: '100%' }}>
    <label style={labelStyle}>{label}</label>
    <textarea name={name} value={val} onChange={onChange} placeholder={ph} rows="3" style={{ ...inputStyle, resize: 'vertical' }} />
  </div>
);
