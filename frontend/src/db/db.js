import Dexie from 'dexie';

export const db = new Dexie('RingManagerDB');

db.version(6).stores({
  fighters: '++id, matricula, nombre, apellido_paterno, apellido_materno, name, synced',
  payments: '++id, peleador_matricula, matricula, fecha_pago, date, synced',
  attendance: '++id, peleador_matricula, matricula, fecha, date, synced',
  staff: '++id, nombre, usuario, pin, role, synced',
  products: '++id, nombre, name, precio, price, stock, categoria, category',
  sales: '++id, fecha, date, metodo_pago, method, peleador_matricula, synced'
});

db.on('ready', async () => {
  const countStaff = await db.staff.count();
  if (countStaff === 0) {
    await db.staff.add({ nombre: 'Dueño / Admin', usuario: 'admin', pin: '1234', role: 'admin', synced: 0 });
  }

  const countProducts = await db.products.count();
  const productosBase = [
    { nombre: 'Agua Embotellada', precio: 15, stock: 50, categoria: 'Bebidas' },
    { nombre: 'Gatorade', precio: 30, stock: 30, categoria: 'Bebidas' },
    { nombre: 'Vendas 5m', precio: 150, stock: 20, categoria: 'Equipo' },
    { nombre: 'Bucal Simple', precio: 100, stock: 15, categoria: 'Equipo' },
    { nombre: 'Renta Guantes', precio: 50, stock: 10, categoria: 'Renta' },
    { nombre: 'Renta Espinilleras', precio: 50, stock: 10, categoria: 'Renta' },
    { nombre: 'Renta Short Muay Thai', precio: 50, stock: 10, categoria: 'Renta' }
  ];

  if (countProducts === 0) {
    await db.products.bulkAdd(productosBase);
  } else {
    for (const articulo of productosBase) {
      const existe = await db.products.where('nombre').equals(articulo.nombre).first();
      if (!existe) {
        await db.products.add(articulo);
      }
    }
  }
});

export const getFighterDisplayName = (fighter = {}) => {
  const nombre = fighter.nombre ?? fighter.nombres ?? '';
  const apellidoPaterno = fighter.apellido_paterno ?? fighter.apellidoPaterno ?? '';
  const apellidoMaterno = fighter.apellido_materno ?? fighter.apellidoMaterno ?? '';
  const legacy = fighter.name ?? '';
  return `${nombre} ${apellidoPaterno} ${apellidoMaterno}`.trim() || legacy;
};

export const normalizeFighterRecord = (fighter = {}) => ({
  ...fighter,
  nombre: fighter.nombre ?? fighter.nombres ?? '',
  apellido_paterno: fighter.apellido_paterno ?? fighter.apellidoPaterno ?? '',
  apellido_materno: fighter.apellido_materno ?? fighter.apellidoMaterno ?? '',
  fecha_nacimiento: fighter.fecha_nacimiento ?? fighter.fechaNacimiento ?? '',
  calle: fighter.calle ?? fighter.direccion ?? '',
  numero_exterior: fighter.numero_exterior ?? fighter.numeroCasa ?? '',
  codigo_postal: fighter.codigo_postal ?? fighter.codigoPostal ?? '',
  correo: fighter.correo ?? fighter.email ?? '',
  tipo_sangre: fighter.tipo_sangre ?? fighter.grupoSanguineo ?? '',
  contacto_emergencia: fighter.contacto_emergencia ?? fighter.emergNombre ?? '',
  telefono_emergencia: fighter.telefono_emergencia ?? fighter.emergTelefono ?? '',
  seguro_medico: fighter.seguro_medico ?? fighter.sistemaSalud ?? '',
  lesiones: fighter.lesiones ?? fighter.padecimientos ?? '',
  tutor_nombre: fighter.tutor_nombre ?? fighter.tutorNombres ?? '',
  tutor_apellido_paterno: fighter.tutor_apellido_paterno ?? fighter.tutorApellidoPaterno ?? '',
  tutor_apellido_materno: fighter.tutor_apellido_materno ?? fighter.tutorApellidoMaterno ?? '',
  tutor_telefono: fighter.tutor_telefono ?? fighter.tutorTelefono ?? '',
  tutor_correo: fighter.tutor_correo ?? fighter.tutorCorreo ?? fighter.tutorEmail ?? '',
  tutor_fecha_nacimiento: fighter.tutor_fecha_nacimiento ?? fighter.tutorFechaNacimiento ?? '',
  foto_path: fighter.foto_path ?? fighter.fotoPerfil ?? fighter.photo_url ?? '',
  qr_path: fighter.qr_path ?? fighter.Qr_Path ?? '',
});

export const normalizePaymentRecord = (payment = {}) => ({
  ...payment,
  peleador_matricula: payment.peleador_matricula ?? payment.matricula ?? '',
  tipo_pago: payment.tipo_pago ?? payment.type ?? '',
  monto: payment.monto ?? payment.amount ?? 0,
  metodo_pago: payment.metodo_pago ?? payment.method ?? 'EFECTIVO',
  fecha_pago: payment.fecha_pago ?? payment.date ?? new Date().toISOString(),
});

export const normalizeProductRecord = (product = {}) => ({
  ...product,
  nombre: product.nombre ?? product.name ?? '',
  precio: product.precio ?? product.price ?? 0,
  categoria: product.categoria ?? product.category ?? 'Equipo',
});

export const addFighterFull = async (fighterData) => {
  try {
    const normalized = normalizeFighterRecord(fighterData);
    return await db.fighters.add({
      ...normalized,
      name: getFighterDisplayName(normalized),
      fotoPerfil: normalized.foto_path,
      estado: normalized.estado ?? 'ACTIVO',
      created_at: new Date().toISOString(),
      synced: 0,
    });
  } catch (error) {
    console.error('Error al guardar peleador:', error);
    throw error;
  }
};

export const addPayment = async (fighter, tipoPago = 'MENSUALIDAD', monto = 650, metodoPago = 'EFECTIVO') => {
  const normalizedFighter = normalizeFighterRecord(fighter);
  if (!normalizedFighter.matricula) {
    throw new Error('El pago requiere una matricula valida.');
  }

  const payment = normalizePaymentRecord({
    peleador_matricula: normalizedFighter.matricula,
    matricula: normalizedFighter.matricula,
    tipo_pago: tipoPago,
    type: tipoPago,
    monto,
    amount: monto,
    metodo_pago: metodoPago,
    method: metodoPago,
    fecha_pago: new Date().toISOString(),
    date: new Date().toISOString(),
    synced: 0,
  });

  return db.payments.add(payment);
};
