export const checkAccess = (lastPayment) => {
  // 1. Si nunca ha pagado nada
  if (!lastPayment) {
    return { canEnter: false, reason: "NO HAY PAGOS REGISTRADOS", expiration: null };
  }

  const today = new Date();
  const paymentDate = new Date(lastPayment.date);
  let expirationDate = new Date(paymentDate);

  const tipo = lastPayment.type.toUpperCase();

  // 2. REGLAS DE TIEMPO SEGÚN EL TIPO DE PAGO
  if (tipo.includes('VISITA')) {
    // La visita vence ese mismo día a las 11:59 PM
    expirationDate.setHours(23, 59, 59, 999);
    
  } else if (tipo.includes('SEMANA') && !tipo.includes('DOS SEMANAS')) {
    // La semana suma 7 días exactos
    expirationDate.setDate(expirationDate.getDate() + 7);
    expirationDate.setHours(23, 59, 59, 999);

  } else if (tipo.includes('DOS SEMANAS')) {
    // Quincena suma 14 días exactos
    expirationDate.setDate(expirationDate.getDate() + 14);
    expirationDate.setHours(23, 59, 59, 999);

  } else if (tipo.includes('MENSUALIDAD') || tipo.includes('PROPORCIONAL')) {
    // 🌟 LA REGLA DE ORO: Todo lo que sea mensualidad vence el DÍA 1 DEL PRÓXIMO MES
    expirationDate.setMonth(expirationDate.getMonth() + 1); // Sumamos un mes
    expirationDate.setDate(1); // Forzamos a que sea el día 1ro
    expirationDate.setHours(23, 59, 59, 999);
    
  } else {
    // Por si acaso entra un tipo de pago raro
    expirationDate.setMonth(expirationDate.getMonth() + 1);
  }

  // 3. VEREDICTO FINAL: ¿Ya se pasó la fecha?
  const isExpired = today > expirationDate;

  if (isExpired) {
    return { 
      canEnter: false, 
      reason: "MEMBRESÍA VENCIDA", 
      expiration: expirationDate.toISOString() 
    };
  } else {
    return { 
      canEnter: true, 
      reason: "AL CORRIENTE", 
      expiration: expirationDate.toISOString() 
    };
  }
};