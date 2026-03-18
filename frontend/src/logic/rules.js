export const checkAccess = (lastPayment) => {
  if (!lastPayment) return { canEnter: false, reason: "Sin pagos registrados" };

  const hoy = new Date();
  const fechaVencimiento = new Date(lastPayment.valid_until);

  if (hoy > fechaVencimiento) {
    return { canEnter: false, reason: "Pago vencido" };
  }

  return { canEnter: true, reason: "¡Bienvenido!" };
};