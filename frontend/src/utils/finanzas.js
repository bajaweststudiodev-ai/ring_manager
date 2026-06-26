// src/utils/finanzas.js

export const TARIFAS = {
  MENSUALIDAD: 650,
  INSCRIPCION: 150,
  DOS_SEMANAS: 500,
  SEMANA: 250,
  VISITA: 100,
};

// 1. EL ALGORITMO DEL DÍA HÁBIL
export const calcularProximoVencimiento = () => {
  const hoy = new Date();
  
  // Siempre saltamos al día 1 del próximo mes
  const vencimiento = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);

  // Verificamos si ese día 1 cae en fin de semana
  const diaSemana = vencimiento.getDay(); // 0 = Domingo, 1 = Lunes ... 6 = Sábado
  
  if (diaSemana === 6) {
    // Si es Sábado, le sumamos 2 días para que sea Lunes 3
    vencimiento.setDate(vencimiento.getDate() + 2);
  } else if (diaSemana === 0) {
    // Si es Domingo, le sumamos 1 día para que sea Lunes 2
    vencimiento.setDate(vencimiento.getDate() + 1);
  }

  // Devolvemos la fecha en formato YYYY-MM-DD para guardarla en la base de datos
  const pad = (n) => String(n).padStart(2, '0');
  return `${vencimiento.getFullYear()}-${pad(vencimiento.getMonth() + 1)}-${pad(vencimiento.getDate())}`;
};

// 1b. FECHA FIN SUGERIDA SEGÚN TIPO DE PAGO
export const resolveFechaFinSugerida = (tipoPago = 'MENSUALIDAD') => {
  const tipo = String(tipoPago).toUpperCase();
  const pad = (n) => String(n).padStart(2, '0');

  if (tipo.includes('MENSUALIDAD') || tipo.includes('PROPORCIONAL')) {
    return calcularProximoVencimiento(); // día 1 mes siguiente + ajuste fin de semana
  }

  const fecha = new Date();
  if (tipo.includes('DOS SEMANAS')) fecha.setDate(fecha.getDate() + 14);
  else if (tipo.includes('SEMANA')) fecha.setDate(fecha.getDate() + 7);
  // VISITA / INSCRIPCION sola → mismo día

  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
};

// 2. EL ALGORITMO DEL PROPORCIONAL EXACTO
export const calcularMontoProporcional = () => {
  const hoy = new Date();
  const mes = hoy.getMonth();
  const anio = hoy.getFullYear();
  
  // ¿Cuántos días tiene este mes? (28, 30 o 31)
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  const diaActual = hoy.getDate();
  
  // Días que va a entrenar este mes
  const diasRestantes = (diasDelMes - diaActual) + 1; 
  
  // Costo por día
  const costoPorDia = TARIFAS.MENSUALIDAD / diasDelMes;
  const costoTotal = costoPorDia * diasRestantes;
  
  // Redondeamos a múltiplos de $5 para no cobrar centavos
  return Math.ceil(costoTotal / 5) * 5; 
};

// 3. EL CANDADO INTELIGENTE DE PLANES
// esPagoTardio: true solo cuando el alumno YA tenía un pago previo que ya venció
export const obtenerPlanesPermitidos = (esNuevoIngreso = true, esPagoTardio = false) => {
  const diaActual = new Date().getDate();
  const esPrimeraSemana = diaActual <= 7;

  let opcionesPermitidas = [];

  if (esPrimeraSemana) {
    if (esNuevoIngreso) {
      opcionesPermitidas.push({ id: "MENSUALIDAD + INSCRIPCION", nombre: "Mensualidad + Inscripción" });
    } else {
      opcionesPermitidas.push({ id: "MENSUALIDAD", nombre: "Mensualidad Normal" });
    }
  } else {
    // Si ya pasó el día 7, el candado se activa
    if (esNuevoIngreso) {
      opcionesPermitidas.push({ id: "PROPORCIONAL + INSCRIPCION", nombre: "Proporcional + Inscripción" });
    } else {
      const labelProporcional = esPagoTardio
        ? "Mensualidad Proporcional (Pago Tardío)"
        : "Mensualidad Proporcional";
      opcionesPermitidas.push({ id: "PROPORCIONAL", nombre: labelProporcional });
    }
  }

  // Las rentas cortas siempre están disponibles
  opcionesPermitidas.push(
    { id: "DOS SEMANAS", nombre: "Dos Semanas" },
    { id: "SEMANA", nombre: "Una Semana" },
    { id: "VISITA", nombre: "Clase Suelta / Visita" }
  );

  return opcionesPermitidas;
};