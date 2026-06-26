import Dexie from 'dexie';

// _V2: fuerza la creación de un archivo IDB físico nuevo en WebKit.
// El archivo anterior (RingManagerDB) puede estar bloqueado a nivel OS en iOS,
// causando que db.open() quede en estado pending infinito sin lanzar error.
export const db = new Dexie('RingManagerDB_V2');

const DEVICE_ID_STORAGE_KEY = 'ring_manager_device_id';

const getPersistentDeviceId = () => {
  if (typeof window === 'undefined') {
    return 'server-render';
  }

  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated = `device-${generateClientUuidFragment()}`;
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
  return generated;
};

const generateClientUuidFragment = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const buildSyncId = (entityName) => `${entityName}-${generateClientUuidFragment()}`;

const DEVICE_ID = getPersistentDeviceId();

db.version(8).stores({
  fighters: '++id, matricula, nombre, apellido_paterno, apellido_materno, name, synced',
  payments: '++id, client_uuid, device_id, peleador_matricula, matricula, fecha_pago, date, synced',
  attendance: '++id, client_uuid, device_id, peleador_matricula, matricula, fecha, date, synced',
  staff: '++id, nombre, usuario, pin, role, synced',
  products: '++id, nombre, name, precio, price, stock, categoria, category',
  sales: '++id, client_uuid, device_id, fecha, date, metodo_pago, method, peleador_matricula, synced',
  gyms: '++id, nombre',
});

// v9: descriptores faciales (face-api.js, offline)
db.version(9).stores({
  face_descriptors: 'matricula',
});

// v10: bitácora de actividad local — reemplaza el endpoint /api/auditoria en modo offline
db.version(10).stores({
  bitacora: '++id, fecha, modulo, operacion, usuario',
});

/**
 * Registra una entrada en la bitácora local (IndexedDB).
 * Silencia errores para no interrumpir el flujo del llamador.
 */
export async function logLocalActivity(modulo, operacion, descripcion, usuario = 'Sistema') {
  try {
    await db.bitacora.add({
      modulo,
      operacion,
      descripcion,
      usuario,
      fecha: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[logLocalActivity]', e);
  }
}

const attachOfflineSyncMetadata = (entityName) => (primaryKey, obj) => {
  const nextObject = obj;
  if (!nextObject.client_uuid) {
    nextObject.client_uuid = buildSyncId(entityName);
  }
  if (!nextObject.device_id) {
    nextObject.device_id = DEVICE_ID;
  }
  if (typeof nextObject.synced === 'undefined') {
    nextObject.synced = 0;
  }
};

db.sales.hook('creating', attachOfflineSyncMetadata('sale'));
db.payments.hook('creating', attachOfflineSyncMetadata('payment'));
db.attendance.hook('creating', attachOfflineSyncMetadata('attendance'));

const sanitizeDexiePrimaryKey = (record = {}) => {
  const nextRecord = { ...record };

  if (nextRecord.id === null || typeof nextRecord.id === 'undefined' || nextRecord.id === '') {
    delete nextRecord.id;
  } else if (typeof nextRecord.id === 'string' && /^\d+$/.test(nextRecord.id)) {
    nextRecord.id = Number.parseInt(nextRecord.id, 10);
  }

  return nextRecord;
};

const dedupeRecords = (records = [], buildKey) => {
  const uniqueRecords = new Map();

  records.forEach((record, index) => {
    const candidateKey = buildKey(record, index);
    const normalizedKey = candidateKey ?? `idx:${index}`;
    uniqueRecords.set(String(normalizedKey), record);
  });

  return Array.from(uniqueRecords.values());
};

db.on('ready', async () => {
  // Solicitar almacenamiento persistente — previene que Safari/iOS borre
  // IndexedDB bajo presión de memoria sin previo aviso
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    // Timeout de 2 s — en ciertos iOS/iPadOS, persist() devuelve una Promise que
    // nunca resuelve, lo que hace que db.open() quede en pending infinito y bloquee
    // TODA la app. Si no responde en 2 s, continuar sin persistencia.
    const persisted = await Promise.race([
      navigator.storage.persist().catch(() => false),
      new Promise((r) => setTimeout(() => r(false), 2000)),
    ]);
    if (!persisted) {
      console.warn('[DB] El almacenamiento no es persistente — iOS puede borrar datos bajo presión de memoria.');
    }
  }

  const countProducts = await db.products.count();
  const productosBase = [
    { nombre: 'Agua Embotellada', precio: 15, stock: 50, categoria: 'Bebidas' },
    { nombre: 'Gatorade', precio: 30, stock: 30, categoria: 'Bebidas' },
    { nombre: 'Vendas 5m', precio: 150, stock: 20, categoria: 'Equipo' },
    { nombre: 'Bucal Simple', precio: 100, stock: 15, categoria: 'Equipo' },
    { nombre: 'Renta Guantes', precio: 50, stock: 10, categoria: 'Renta' },
    { nombre: 'Renta Espinilleras', precio: 50, stock: 10, categoria: 'Renta' },
    { nombre: 'Renta Short Muay Thai', precio: 50, stock: 10, categoria: 'Renta' },
  ];

  if (countProducts === 0) {
    await db.products.bulkPut(productosBase.map((articulo) => sanitizeDexiePrimaryKey(normalizeProductRecord(articulo))));
  } else {
    for (const articulo of productosBase) {
      const existe = await db.products.where('nombre').equals(articulo.nombre).first();
      if (!existe) {
        await db.products.put(sanitizeDexiePrimaryKey(normalizeProductRecord(articulo)));
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
  foto_path: fighter.foto_path || fighter.fotoPerfil || fighter.foto_data_url || fighter.photo_url || '',
  qr_path: fighter.qr_path ?? fighter.Qr_Path ?? '',
});

export const normalizePaymentRecord = (payment = {}) => ({
  ...payment,
  peleador_matricula: payment.peleador_matricula ?? payment.matricula ?? '',
  tipo_pago: payment.tipo_pago ?? payment.type ?? '',
  monto: payment.monto ?? payment.amount ?? 0,
  metodo_pago: payment.metodo_pago ?? payment.method ?? 'EFECTIVO',
  fecha_pago: payment.fecha_pago ?? payment.date ?? new Date().toISOString(),
  fecha_fin: payment.fecha_fin ?? payment.expiration ?? '',
  usuario_id: payment.usuario_id ?? null,
  notas: payment.notas ?? payment.notes ?? '',
  cancelado: Number(payment.cancelado ?? 0),
  motivo_cancelacion: payment.motivo_cancelacion ?? '',
});

export const normalizeProductRecord = (product = {}) => ({
  ...product,
  nombre: product.nombre ?? product.name ?? '',
  precio: Number(product.precio ?? product.price ?? 0),
  stock: Number.parseInt(product.stock ?? 0, 10) || 0,
  categoria: product.categoria ?? product.category ?? 'Equipo',
});

export const normalizeGymRecord = (gym = {}) => ({
  ...gym,
  id: gym.id ?? undefined,
  nombre: gym.nombre ?? '',
  logo: gym.logo ?? '',
  color_principal: gym.color_principal ?? gym.colorPrimary ?? '',
});

const prepareProductsForDexie = (products = []) => dedupeRecords(
  products
    .map((product) => sanitizeDexiePrimaryKey(normalizeProductRecord(product)))
    .filter((product) => product.nombre),
  (product, index) => product.id ?? `nombre:${(product.nombre || '').trim().toLowerCase() || index}`,
);

const prepareFightersForDexie = (fighters = []) => dedupeRecords(
  fighters.map((fighter) => {
    const normalized = normalizeFighterRecord(fighter);
    return sanitizeDexiePrimaryKey({
      ...normalized,
      name: getFighterDisplayName(normalized),
      fotoPerfil: normalized.foto_path,
      synced: 1,
    });
  }),
  (fighter, index) => fighter.matricula ?? fighter.id ?? `fighter:${index}`,
);

const preparePaymentsForDexie = (payments = []) => dedupeRecords(
  payments.map((payment) => sanitizeDexiePrimaryKey({
    ...normalizePaymentRecord(payment),
    synced: 1,
  })),
  (payment, index) => payment.id ?? payment.client_uuid ?? `${payment.peleador_matricula || payment.matricula || 'sin-matricula'}:${payment.fecha_pago || payment.date || index}:${payment.tipo_pago || payment.type || 'sin-tipo'}`,
);

const prepareGymsForDexie = (gyms = []) => dedupeRecords(
  gyms.map((gym) => sanitizeDexiePrimaryKey(normalizeGymRecord(gym))),
  (gym, index) => gym.id ?? `gym:${(gym.nombre || '').trim().toLowerCase() || index}`,
);

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

export const addPayment = async (
  fighter,
  tipoPago = 'MENSUALIDAD',
  monto = 650,
  metodoPago = 'EFECTIVO',
  options = {},
) => {
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
    usuario_id: options.usuario_id ?? null,
    notas: options.notas ?? '',
    cancelado: Number(options.cancelado ?? 0),
    motivo_cancelacion: options.motivo_cancelacion ?? '',
    fecha_fin: options.fecha_fin ?? '',
    fecha_pago: new Date().toISOString(),
    date: new Date().toISOString(),
    synced: 0,
  });

  return db.payments.add(payment);
};

export const getLatestActivePaymentForFighter = async (matricula = '') => {
  const normalizedMatricula = String(matricula || '').trim();
  if (!normalizedMatricula) {
    return null;
  }

  const [paymentsByFighter, paymentsByLegacyMatricula] = await Promise.all([
    db.payments.where('peleador_matricula').equals(normalizedMatricula).toArray(),
    db.payments.where('matricula').equals(normalizedMatricula).toArray(),
  ]);

  const paymentMap = new Map();

  [...paymentsByFighter, ...paymentsByLegacyMatricula].forEach((payment, index) => {
    const normalizedPayment = normalizePaymentRecord(payment);
    const key = normalizedPayment.id ?? normalizedPayment.client_uuid ?? `${normalizedMatricula}:${normalizedPayment.fecha_pago}:${index}`;
    paymentMap.set(String(key), normalizedPayment);
  });

  const activePayments = Array.from(paymentMap.values())
    .filter((payment) => Number(payment.cancelado ?? 0) !== 1)
    .sort((left, right) => {
      const rightDate = Date.parse(right.fecha_pago || right.date || '') || 0;
      const leftDate = Date.parse(left.fecha_pago || left.date || '') || 0;
      if (rightDate !== leftDate) {
        return rightDate - leftDate;
      }
      return Number(right.id || 0) - Number(left.id || 0);
    });

  return activePayments[0] || null;
};

export const replaceProductsCache = async (products = []) => {
  const normalizedProducts = prepareProductsForDexie(products);

  await db.transaction('rw', db.products, async () => {
    await db.products.clear();

    if (normalizedProducts.length > 0) {
      await db.products.bulkPut(normalizedProducts);
    }
  });
};

export const replaceBootstrapCache = async ({
  fighters = [],
  payments = [],
  products = [],
  gyms = [],
}) => {
  const normalizedFighters = prepareFightersForDexie(fighters);
  const normalizedPayments = preparePaymentsForDexie(payments);
  const normalizedProducts = prepareProductsForDexie(products);
  const normalizedGyms = prepareGymsForDexie(gyms);

  await db.transaction('rw', db.fighters, db.payments, db.products, db.gyms, async () => {
    await db.fighters.clear();
    await db.payments.clear();
    await db.products.clear();
    await db.gyms.clear();

    if (normalizedFighters.length > 0) {
      await db.fighters.bulkPut(normalizedFighters);
    }
    if (normalizedPayments.length > 0) {
      await db.payments.bulkPut(normalizedPayments);
    }
    if (normalizedProducts.length > 0) {
      await db.products.bulkPut(normalizedProducts);
    }
    if (normalizedGyms.length > 0) {
      await db.gyms.bulkPut(normalizedGyms);
    }
  });
};
