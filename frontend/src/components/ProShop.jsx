import React, { useEffect, useState } from 'react';
import {
  FiAlertCircle, FiDollarSign, FiEdit2, FiLock, FiMinus, FiPackage,
  FiPlus, FiShoppingCart, FiTrash2, FiUnlock, FiUser, FiXCircle
} from 'react-icons/fi';
import { getCajaEstado } from '../services/cajaService';
import { fetchApi } from '../config/api';
import {
  db, getFighterDisplayName, logLocalActivity, normalizeFighterRecord,
  normalizeProductRecord, replaceProductsCache
} from '../db/db';

const PALETTE = {
  orange: 'var(--secondary-color)',
  white: '#fff',
  dark: 'var(--primary-color)',
  darkSoft: '#2d2e30',
  green: '#00bb2d',
  red: '#e74c3c',
  grayBg: '#fafafa',
  grayBorder: '#eaeaea',
  grayText: '#888',
  blueTint: '#eef4ff',
};

const EMPTY_PRODUCT_MODAL = {
  isOpen: false,
  saving: false,
  data: { id: null, nombre: '', precio: '', stock: 10, categoria: 'Equipo' },
};

const EMPTY_CLOSE_MODAL = {
  isOpen: false,
  montoReal: '',
  notas: '',
  loading: false,
};

const EMPTY_RESTOCK_MODAL = {
  isOpen: false,
  product: null,
  cantidad: '1',
  saving: false,
  error: '',
};

export function ProShop({ userRole, currentUser }) {
  const [productos, setProductos] = useState([]);
  const [fighters, setFighters] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [selectedFighter, setSelectedFighter] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  
  const [cashRegisterLoading, setCashRegisterLoading] = useState(true);
  const [cashRegisterError, setCashRegisterError] = useState('');
  const [aperturaMonto, setAperturaMonto] = useState('');
  const [openingCash, setOpeningCash] = useState(false);
  const [cashRegister, setCashRegister] = useState(null);
  const [closeModal, setCloseModal] = useState(EMPTY_CLOSE_MODAL);
  const [closeSummary, setCloseSummary] = useState(null);
  
  const [productModal, setProductModal] = useState(EMPTY_PRODUCT_MODAL);
  const [restockModal, setRestockModal] = useState(EMPTY_RESTOCK_MODAL);
  const [isCharging, setIsCharging] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // 🛡️ EFECTOS BLINDADOS (Memory Leak Prevention)
  useEffect(() => {
    let cancelled = false;
    fetchProducts(() => cancelled);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    consultarEstadoCaja(() => cancelled);
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Sincronizar isOnline con el estado real del dispositivo — evita falso offline
  // cuando el endpoint de caja está lento pero el dispositivo SÍ tiene red.
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // 🛡️ FUNCIONES DE CARGA BLINDADAS
  const fetchProducts = async (isCancelled = () => false) => {
    setLoading(true);
    setErrorMessage('');

    // ── REGLA 1: LECTURA LOCAL INMEDIATA ──────────────────────────────────
    // Muestra productos desde Dexie antes de intentar la red.
    // 5 s de margen para el primer arranque en iOS (Dexie puede tardar si el
    // ready handler de la BD aún está sembrando datos).
    try {
      const [localProductos, localFighters] = await Promise.race([
        Promise.all([db.products.toArray(), db.fighters.toArray()]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Dexie timeout 5 s')), 5000)
        ),
      ]);
      if (!isCancelled()) {
        setProductos(
          localProductos
            .map(normalizeProductRecord)
            .filter((p) => p.nombre && Number.isFinite(Number(p.precio)))
        );
        setFighters(
          localFighters
            .map(normalizeFighterRecord)
            .filter((f) => (f.estado || 'ACTIVO').toUpperCase() === 'ACTIVO')
            .sort((a, b) => getFighterDisplayName(a).localeCompare(getFighterDisplayName(b)))
        );
        setLoading(false);  // Liberar spinner con datos locales inmediatamente
      }
    } catch (dexieErr) {
      console.warn('[ProShop] Dexie no disponible en carga inicial:', dexieErr.message);
      if (!isCancelled()) setLoading(false);
    }

    // ── REGLA 2: RED BEST-EFFORT (silenciada en fallo) ────────────────────
    // Si el servidor responde, actualiza la vista y recache. Si no, la UI ya
    // tiene los datos locales y el usuario puede operar sin interrupciones.
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      let productosResponse, fightersResponse;
      try {
        [productosResponse, fightersResponse] = await Promise.all([
          fetchApi('/api/productos', { signal: controller.signal }),
          fetchApi('/api/peleadores', { signal: controller.signal }),
        ]);
      } finally {
        clearTimeout(tid);
      }

      const productosResult = await productosResponse.json().catch(() => ({}));
      const fightersResult = await fightersResponse.json().catch(() => []);

      if (!productosResponse.ok) throw new Error(productosResult.message || 'Error productos');

      const todosProductos = (Array.isArray(productosResult.data) ? productosResult.data : [])
        .map(normalizeProductRecord)
        .filter((p) => p.nombre && Number.isFinite(Number(p.precio)));

      const todosFighters = (Array.isArray(fightersResult) ? fightersResult : [])
        .map(normalizeFighterRecord)
        .sort((a, b) => getFighterDisplayName(a).localeCompare(getFighterDisplayName(b)));

      if (!isCancelled()) {
        setProductos(todosProductos);
        setFighters(todosFighters);
        setErrorMessage('');
      }

      await replaceProductsCache(todosProductos).catch(() => {});
    } catch (serverError) {
      console.warn('[ProShop] Sin red — usando datos locales ya cargados:', serverError.message);
    }
  };

  const consultarEstadoCaja = async (isCancelled = () => false, { force = false } = {}) => {
    if (!currentUser?.id) {
      if (!isCancelled()) {
        setCashRegister(null);
        setCashRegisterLoading(false);
        setCashRegisterError('');
      }
      return;
    }

    setCashRegisterLoading(true);
    setCashRegisterError('');

    // Validación de fecha: si el marcador offline es de otro día, borrarlo.
    // Esto evita que el catch reactive una caja sintética de ayer aunque el
    // servidor responda correctamente más tarde.
    const _today = new Date().toLocaleDateString();
    const _storedDate = localStorage.getItem('ring_manager_caja_fecha');
    if (_storedDate && _storedDate !== _today) {
      localStorage.removeItem('ring_manager_caja_fecha');
    }

    // ── SERVIDOR PRIMERO ──────────────────────────────────────────────────
    // No establecer caja sintética al inicio: si el servidor responde "sin caja"
    // necesitamos mostrar la pantalla de apertura, no permitir ventas falsas.
    // La caja sintética (_offline) SOLO se activa en el catch (red inaccesible).
    try {
      const result = await Promise.race([
        getCajaEstado(currentUser.id, { force }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('getCajaEstado timeout 4 s')), 4000)
        ),
      ]);

      if (!isCancelled()) {
        if (!result || result.status === 'error') {
          // Servidor respondió: no hay caja abierta → pedir apertura al usuario
          setCashRegister(null);
        } else {
          // Servidor confirmó caja activa
          setCashRegister(result.data?.caja || null);
          setCashRegisterError('');
        }
        setCashRegisterLoading(false);
      }
    } catch (serverError) {
      // Red inaccesible o timeout.
      // Solo activar caja sintética si el usuario YA abrió caja hoy.
      // Si la fecha guardada es de otro día (o no existe), exigir apertura nueva.
      console.warn('[ProShop] Sin servidor — modo offline activado:', serverError.message);
      if (!isCancelled()) {
        const today = new Date().toLocaleDateString();
        const storedDate = localStorage.getItem('ring_manager_caja_fecha');
        if (storedDate !== today) {
          localStorage.removeItem('ring_manager_caja_fecha');
          setCashRegister(null);
        } else {
          setCashRegister({ _offline: true, monto_inicial: 0, ventas_efectivo: 0, monto_calculado: 0 });
        }
        setCashRegisterLoading(false);
      }
    }
  };

  // --- LOGICA DE PRODUCTOS ---
  const handleGuardarProducto = async () => {
    const { id, nombre, precio, stock, categoria } = productModal.data;
    if (!nombre || !precio) {
      alert('Completa nombre y precio.');
      return;
    }

    setProductModal((prev) => ({ ...prev, saving: true }));
    const payload = { nombre, precio: parseFloat(precio), stock, categoria };

    try {
      const response = await fetchApi(id ? `/api/productos/${id}` : '/api/productos', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'No pude guardar el artículo.');

      setProductModal(EMPTY_PRODUCT_MODAL);
      await fetchProducts();
    } catch (error) {
      const isNetworkError = error instanceof TypeError || error.name === 'AbortError';
      if (isNetworkError) {
        // Sin red: persistir en Dexie con synced:0.
        // El SW lo sincronizará con el servidor cuando haya conexión.
        try {
          await db.products.put({ ...(id ? { id } : {}), ...payload, synced: 0 });
          console.warn('[ProShop] Producto guardado offline en Dexie (synced:0):', payload.nombre);
          setProductModal(EMPTY_PRODUCT_MODAL);
          await fetchProducts();
        } catch (dexieErr) {
          console.error('[ProShop] Falló guardado offline en Dexie:', dexieErr.message);
          alert('Sin conexión y no se pudo guardar localmente. Intenta de nuevo.');
          setProductModal((prev) => ({ ...prev, saving: false }));
        }
      } else {
        // Error de validación del servidor → mostrarlo
        console.error('No pude guardar el artículo:', error);
        alert(error.message || 'No pude guardar el artículo.');
        setProductModal((prev) => ({ ...prev, saving: false }));
      }
    }
  };

  const handleBorrarProducto = async (event, id, nombre) => {
    event.stopPropagation();
    if (!window.confirm(`¿Borrar permanentemente ${nombre}?`)) return;
    try {
      const response = await fetchApi(`/api/productos/${id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'No pude eliminar el producto.');
      logLocalActivity('ProShop', 'Eliminación', `Artículo eliminado: ${nombre}`, currentUser?.nombre || 'Admin').catch(() => {});
      await fetchProducts();
    } catch (error) {
      const isNetworkError = error instanceof TypeError || error.name === 'AbortError';
      if (isNetworkError) {
        try {
          await db.products.delete(id);
          logLocalActivity('ProShop', 'Eliminación', `Artículo eliminado offline: ${nombre}`, currentUser?.nombre || 'Admin').catch(() => {});
          await fetchProducts();
        } catch (dexieErr) {
          alert('Sin conexión y no se pudo eliminar localmente.');
        }
      } else {
        console.error('No pude borrar el producto:', error);
        alert(error.message || 'No pude borrar el producto.');
      }
    }
  };

  const handleRestockProducto = async () => {
    if (!restockModal.product?.id) return;
    
    const cantidad = Number.parseInt(restockModal.cantidad, 10);
    if (Number.isNaN(cantidad) || cantidad <= 0) {
      setRestockModal((prev) => ({ ...prev, error: 'Ingresa una cantidad valida mayor a 0.' }));
      return;
    }

    setRestockModal((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      const response = await fetchApi(`/api/productos/${restockModal.product.id}/restock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cantidad }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(result.message || 'No pude actualizar el stock.');

      setRestockModal(EMPTY_RESTOCK_MODAL);
      await fetchProducts(); // 🛡️ Corregido: llamado con paréntesis
    } catch (error) {
      const isNetworkError = error instanceof TypeError || error.name === 'AbortError';
      if (isNetworkError) {
        try {
          const newStock = Number(restockModal.product?.stock || 0) + cantidad;
          await db.products.update(restockModal.product.id, { stock: newStock, synced: 0 });
          logLocalActivity('ProShop', 'Restock', `Restock offline: ${restockModal.product?.nombre} +${cantidad} → ${newStock}`, currentUser?.nombre || 'Admin').catch(() => {});
          setRestockModal(EMPTY_RESTOCK_MODAL);
          await fetchProducts();
        } catch (dexieErr) {
          setRestockModal((prev) => ({ ...prev, saving: false, error: 'Sin conexión y no se pudo guardar el stock.' }));
        }
      } else {
        console.error('No pude hacer restock:', error);
        setRestockModal((prev) => ({
          ...prev,
          saving: false,
          error: error.message || 'No pude actualizar el stock.',
        }));
      }
    }
  };

  const abrirModalEditar = (event, prod) => {
    event.stopPropagation();
    setProductModal({ isOpen: true, saving: false, data: normalizeProductRecord(prod) });
  };

  const abrirModalNuevo = () => {
    setProductModal({ isOpen: true, saving: false, data: { id: null, nombre: '', precio: '', stock: 10, categoria: 'Equipo' } });
  };

  const abrirModalRestock = (event, prod) => {
    event.stopPropagation();
    setRestockModal({ isOpen: true, product: normalizeProductRecord(prod), cantidad: '1', saving: false, error: '' });
  };

  // --- LÓGICA DE CARRITO Y CAJA ---
  const agregarAlCarrito = (producto) => {
    if (!cashRegister) {
      alert('Necesitas abrir caja antes de vender.');
      return;
    }

    const cantidadEnCarrito = carrito
      .filter((item) => item.id === producto.id)
      .reduce((sum, item) => sum + item.cantidad, 0);

    if (cantidadEnCarrito >= Number(producto.stock || 0)) {
      alert(`No hay más stock disponible para ${producto.nombre}.`);
      return;
    }

    const existe = carrito.find((item) => item.id === producto.id);
    if (existe) {
      setCarrito(carrito.map((item) => item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item));
      return;
    }
    setCarrito([...carrito, { ...producto, cantidad: 1 }]);
  };

  const cambiarCantidad = (id, delta) => {
    const nuevoCarrito = carrito
      .map((item) => {
        if (item.id !== id) return item;
        const stockDisponible = Number(item.stock || 0);
        const siguienteCantidad = item.cantidad + delta;
        if (delta > 0 && siguienteCantidad > stockDisponible) return item;
        return { ...item, cantidad: siguienteCantidad };
      })
      .filter((item) => item.cantidad > 0);
    setCarrito(nuevoCarrito);
  };

  const handleAbrirCaja = async () => {
    if (!currentUser?.id) {
      alert('Inicia sesión para abrir caja.');
      return;
    }
    const montoInicial = Number.parseFloat(aperturaMonto);
    if (Number.isNaN(montoInicial) || montoInicial < 0) {
      alert('Ingresa un monto inicial válido.');
      return;
    }

    setOpeningCash(true);
    setCashRegisterError('');
    try {
      const response = await fetchApi('/api/caja/abrir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: currentUser.id, monto_inicial: montoInicial }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'No pude abrir la caja.');

      setAperturaMonto('');
      localStorage.setItem('ring_manager_caja_fecha', new Date().toLocaleDateString());
      setCashRegister(result.data || null);
      setCloseSummary(null);
    } catch (error) {
      // TypeError = error de red (CORS, Load failed, sin conexión).
      // Cualquier otro tipo = respuesta de servidor con mensaje de error (ej. "ya hay caja abierta").
      const isNetworkError = error instanceof TypeError || error.name === 'AbortError';
      if (isNetworkError) {
        // Sin red: crear caja local para no bloquear al cajero.
        // El monto de apertura queda guardado; se sincronizará cuando haya internet.
        console.warn('[ProShop] Sin red al abrir caja — activando caja offline:', error.message);
        setAperturaMonto('');
        localStorage.setItem('ring_manager_caja_fecha', new Date().toLocaleDateString());
        setCashRegister({
          _offline: true,
          monto_inicial: montoInicial,
          ventas_efectivo: 0,
          monto_calculado: montoInicial,
        });
        setCloseSummary(null);
      } else {
        // El servidor respondió con un error de validación → mostrarlo al usuario
        console.error('No pude abrir la caja:', error);
        setCashRegisterError(error.message || 'No pude abrir la caja.');
      }
    } finally {
      setOpeningCash(false);
    }
  };

  const handleCobrar = async () => {
    if (isCharging || !cashRegister || carrito.length === 0 || totalCarrito <= 0) return;

    const fighter = selectedFighter
      ? fighters.find((item) => String(item.matricula || item.id) === String(selectedFighter))
      : null;

    if (tieneRentas && !fighter?.matricula) {
      alert('Cuando hay renta necesito asignar el equipo a un peleador válido para saber quién lo tiene.');
      return;
    }

    setIsCharging(true);
    try {
      const ventaPayload = {
        client_uuid: crypto.randomUUID(),
        fecha: new Date().toISOString(),
        total: Number(totalCarrito.toFixed(2)),
        metodo_pago: metodoPago,
        peleador_matricula: fighter?.matricula || null,
        items: carrito.map((item) => ({ id: item.id, cantidad: item.cantidad })),
      };

      let registradaEnServidor = false;
      try {
        const response = await fetchApi('/api/ventas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ventaPayload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || 'No pude registrar la venta.');
        registradaEnServidor = true;
      } catch (serverError) {
        // Fallback offline: guardar en Dexie con synced: 0
        await db.sales.add({
          ...ventaPayload,
          articulos_json: JSON.stringify(ventaPayload.items),
          synced: 0,
        });
        console.warn('[ProShop] Venta guardada localmente (sin red):', serverError.message);
      }

      setCarrito([]);
      setMetodoPago('EFECTIVO');
      setSelectedFighter('');
      await fetchProducts();
      if (registradaEnServidor) {
        await consultarEstadoCaja(() => false, { force: true });
      }
      alert(registradaEnServidor ? '¡Venta registrada con éxito!' : 'Sin conexión: venta guardada localmente. Se sincronizará cuando haya internet.');
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setIsCharging(false);
    }
  };

  const handleCerrarCaja = async () => {
    if (!cashRegister || !currentUser?.id) return;

    const montoReal = Number.parseFloat(closeModal.montoReal);
    if (Number.isNaN(montoReal) || montoReal < 0) {
      alert('Ingresa un monto real válido.');
      return;
    }

    setCloseModal((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetchApi('/api/caja/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: currentUser.id,
          monto_real: montoReal,
          notas: closeModal.notas,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(result.message || 'No pude cerrar la caja.');

      setCloseSummary(result.data || null);
      setCloseModal(EMPTY_CLOSE_MODAL);
      setCashRegister(null);
      setCarrito([]);
      setSelectedFighter('');
      setMetodoPago('EFECTIVO');
      await consultarEstadoCaja(() => false, { force: true }); // fuerza fetch fresco post-cierre
    } catch (error) {
      const isNetworkError = error instanceof TypeError || error.name === 'AbortError';
      if (isNetworkError) {
        // Sin red: cerrar localmente para liberar el turno del cajero
        try {
          localStorage.setItem('ring_manager_cierre_pendiente', JSON.stringify({
            usuario_id: currentUser.id,
            monto_real: montoReal,
            notas: closeModal.notas,
            fecha: new Date().toISOString(),
            monto_calculado: cashRegister.monto_calculado || 0,
          }));
        } catch (_) {}
        logLocalActivity('ProShop', 'Cierre de turno', `Cierre offline — real: $${montoReal}, calculado: $${cashRegister.monto_calculado || 0}`, currentUser?.nombre || 'Cajero').catch(() => {});
        setCloseSummary({
          monto_calculado: cashRegister.monto_calculado || 0,
          monto_real: montoReal,
          diferencia: montoReal - (cashRegister.monto_calculado || 0),
        });
        setCloseModal(EMPTY_CLOSE_MODAL);
        setCashRegister(null);
        setCarrito([]);
        setSelectedFighter('');
        setMetodoPago('EFECTIVO');
      } else {
        console.error('No pude cerrar la caja:', error);
        alert(error.message || 'No pude cerrar la caja.');
        setCloseModal((prev) => ({ ...prev, loading: false }));
      }
    }
  };

  const totalCarrito = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  const tieneRentas = carrito.some((item) => item.categoria === 'Renta');

  // --- RENDERIZADO VISUAL ---
  if (!currentUser?.id) {
    return (
      <div style={blockedWrapperStyle}>
        <div style={blockedCardStyle}>
          <div style={blockedIconStyle}><FiLock size={30} /></div>
          <h2 style={blockedTitleStyle}>Acceso a caja protegido</h2>
          <p style={blockedTextStyle}>Inicia sesión como empleado o administrador para abrir caja y registrar ventas.</p>
        </div>
      </div>
    );
  }

  if (cashRegisterLoading) {
    return (
      <div style={blockedWrapperStyle}>
        <div style={blockedCardStyle}>
          <div style={blockedIconStyle}><FiDollarSign size={30} /></div>
          <h2 style={blockedTitleStyle}>Consultando caja</h2>
          <p style={blockedTextStyle}>Estoy verificando si {currentUser.nombre} ya tiene una caja abierta.</p>
        </div>
      </div>
    );
  }

  if (!cashRegister) {
    return (
      <div style={blockedWrapperStyle}>
        <div style={{ ...blockedCardStyle, maxWidth: '460px' }}>
          <div style={blockedIconStyle}><FiUnlock size={30} /></div>
          <h2 style={blockedTitleStyle}>Abrir caja</h2>
          <p style={blockedTextStyle}>
            Usuario activo: <strong style={{ color: PALETTE.dark }}>{currentUser.nombre}</strong>. Antes de vender necesitamos registrar el efectivo inicial.
          </p>

          <div style={panelStyle}>
            <label style={labelStyle}>Monto Inicial de Apertura</label>
            <input
              type="number" min="0" step="0.01"
              value={aperturaMonto} onChange={(event) => setAperturaMonto(event.target.value)}
              placeholder="0.00" style={{ ...inputStyle, marginBottom: '14px' }}
            />

            {cashRegisterError && (
              <div style={errorBannerStyle}>
                <FiAlertCircle size={16} /><span>{cashRegisterError}</span>
              </div>
            )}

            {closeSummary && (
              <div style={summaryCardStyle}>
                <div style={summaryHeaderStyle}><FiDollarSign size={18} /><span>Último corte realizado</span></div>
                <div style={summaryRowStyle}><span>Esperado</span><strong>${Number(closeSummary.monto_final || closeSummary.monto_calculado || 0).toFixed(2)}</strong></div>
                <div style={summaryRowStyle}><span>Real contado</span><strong>${Number(closeSummary.monto_real || 0).toFixed(2)}</strong></div>
                <div style={summaryRowStyle}><span>Diferencia</span><strong style={{ color: Number(closeSummary.diferencia || 0) < 0 ? PALETTE.red : PALETTE.green }}>${Number(closeSummary.diferencia || 0).toFixed(2)}</strong></div>
              </div>
            )}

            <button onClick={handleAbrirCaja} disabled={openingCash} style={{ ...primaryButtonStyle, width: '100%' }}>
              <FiUnlock size={17} />{openingCash ? 'Abriendo caja...' : 'Abrir Caja'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={mainLayoutWrapper}>
      <button onClick={() => setCloseModal({ isOpen: true, montoReal: '', notas: '', loading: false })} style={floatingCloseButtonStyle}>
        <FiXCircle size={18} /> Cerrar Turno
      </button>

      <div style={topBannerStyle}>
        <div>
          <div style={{ fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: !isOnline ? '#b45309' : cashRegister?._offline ? '#b45309' : '#16a34a', fontWeight: 700 }}>
            {!isOnline ? '⚠ Sin Conexión' : cashRegister?._offline ? '⚠ Modo Offline' : '● Caja Abierta'}
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: PALETTE.darkSoft }}>{currentUser.nombre}</div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={statusPillStyle}>
            <span style={{ color: PALETTE.grayText }}>Apertura</span>
            <strong style={{ color: PALETTE.darkSoft }}>${Number(cashRegister.monto_inicial || 0).toFixed(2)}</strong>
          </div>
          <div style={statusPillStyle}>
            <span style={{ color: PALETTE.grayText }}>Ventas efectivo</span>
            <strong style={{ color: PALETTE.darkSoft }}>${Number(cashRegister.ventas_efectivo || 0).toFixed(2)}</strong>
          </div>
          <div style={{ ...statusPillStyle, backgroundColor: '#fff8f2', border: '1px solid rgba(255, 127, 39, 0.2)' }}>
            <span style={{ color: PALETTE.orange }}>Debería haber</span>
            <strong style={{ color: PALETTE.darkSoft }}>${Number(cashRegister.monto_calculado || 0).toFixed(2)}</strong>
          </div>
        </div>
      </div>

      <div style={catalogContainerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `1px solid ${PALETTE.grayBorder}`, paddingBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ color: PALETTE.darkSoft, margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>TIENDA Y RENTAS</h2>
          {userRole === 'admin' && (
            <button onClick={abrirModalNuevo} style={headerButtonStyle}>
              <FiPackage size={14} /> Nuevo artículo
            </button>
          )}
        </div>

        {loading && <p style={helperTextStyle}>Cargando artículos...</p>}
        {errorMessage && <p style={{ ...helperTextStyle, color: PALETTE.red }}>{errorMessage}</p>}

        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
            {productos.map((prod) => (
              <button
                key={prod.id}
                onClick={() => agregarAlCarrito(prod)}
                style={{
                  position: 'relative',
                  padding: '20px 14px 14px 14px',
                  backgroundColor: prod.categoria === 'Renta' ? '#fffbfa' : PALETTE.white,
                  border: `1px solid ${prod.categoria === 'Renta' ? 'rgba(255, 127, 39, 0.3)' : PALETTE.grayBorder}`,
                  borderRadius: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                  transition: 'transform 0.1s ease',
                  opacity: Number(prod.stock || 0) <= 0 ? 0.72 : 1,
                }}
              >
                {userRole === 'admin' && (
                  <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                    <div onClick={(event) => abrirModalEditar(event, prod)} style={miniActionStyle} title="Editar"><FiEdit2 size={11} /></div>
                    <div onClick={(event) => abrirModalRestock(event, prod)} style={{ ...miniActionStyle, color: PALETTE.orange, backgroundColor: '#fff7ed' }} title="Hacer restock"><FiPlus size={11} /></div>
                    <div onClick={(event) => handleBorrarProducto(event, prod.id, prod.nombre)} style={{ ...miniActionStyle, color: PALETTE.red, backgroundColor: '#fff5f5' }} title="Borrar"><FiTrash2 size={11} /></div>
                  </div>
                )}

                <div style={{ fontSize: '0.72rem', color: prod.categoria === 'Renta' ? PALETTE.orange : PALETTE.grayText, fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase' }}>
                  {prod.categoria}
                </div>
                <div style={{ fontWeight: 700, color: PALETTE.darkSoft, fontSize: '0.95rem', marginBottom: '10px', lineHeight: 1.2 }}>{prod.nombre}</div>
                <div style={{ fontSize: '0.72rem', color: PALETTE.grayText, marginBottom: '12px', fontWeight: 600 }}>
                  Stock: {prod.stock ?? 0}
                </div>
                {Number(prod.stock || 0) <= 0 && (
                  <div style={soldOutBadgeStyle}>Agotado</div>
                )}
                <div style={{ backgroundColor: prod.categoria === 'Renta' ? PALETTE.orange : '#f3f4f6', color: prod.categoria === 'Renta' ? '#fff' : PALETTE.darkSoft, padding: '6px 12px', borderRadius: '12px', fontWeight: 800, fontSize: '0.95rem' }}>
                  ${prod.precio}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={cartContainerStyle}>
        <h3 style={{ margin: '0 0 15px 0', color: PALETTE.darkSoft, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', fontWeight: 800 }}>
          <FiShoppingCart /> Ticket actual
        </h3>

        <div style={{ marginBottom: '15px', backgroundColor: tieneRentas ? '#fff5f5' : '#f9fafb', padding: '12px', borderRadius: '12px', border: `1px solid ${tieneRentas ? 'rgba(231, 76, 60, 0.3)' : PALETTE.grayBorder}` }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700, color: tieneRentas ? PALETTE.red : PALETTE.grayText, marginBottom: '8px' }}>
            <FiUser size={13} /> {tieneRentas ? 'Peleador requerido por renta' : 'Peleador opcional'}
          </label>
          <select value={selectedFighter} onChange={(event) => setSelectedFighter(event.target.value)} style={selectStyle}>
            <option value="">Venta general</option>
            {fighters
              .filter((f) => String(f.estado || 'ACTIVO').toUpperCase() === 'ACTIVO')
              .map((fighter) => (
                <option key={fighter.id || fighter.matricula} value={fighter.matricula || fighter.id}>
                  {getFighterDisplayName(fighter)} ({fighter.matricula})
                </option>
              ))}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', borderTop: `1px solid ${PALETTE.grayBorder}`, borderBottom: `1px solid ${PALETTE.grayBorder}`, padding: '15px 0', minHeight: '180px' }}>
          {carrito.length === 0 ? (
            <div style={{ textAlign: 'center', color: PALETTE.grayText, marginTop: '50px', fontSize: '0.9rem', fontWeight: 600 }}>El carrito está vacío</div>
          ) : (
            carrito.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: PALETTE.darkSoft }}>{item.nombre}</div>
                  <div style={{ fontSize: '0.8rem', color: PALETTE.grayText, fontWeight: 600 }}>${item.precio} c/u</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => cambiarCantidad(item.id, -1)} style={btnCantStyle}><FiMinus size={12} /></button>
                  <span style={{ fontWeight: 700, fontSize: '1rem', width: '18px', textAlign: 'center', color: PALETTE.darkSoft }}>{item.cantidad}</span>
                  <button onClick={() => cambiarCantidad(item.id, 1)} style={btnCantStyle}><FiPlus size={12} /></button>
                </div>
                <div style={{ width: '60px', textAlign: 'right', fontWeight: 800, color: PALETTE.darkSoft, fontSize: '0.95rem' }}>
                  ${item.precio * item.cantidad}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ paddingTop: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '1rem', color: PALETTE.grayText, fontWeight: 700 }}>TOTAL</span>
            <span style={{ fontSize: '1.6rem', color: PALETTE.darkSoft, fontWeight: 800 }}>${totalCarrito}</span>
          </div>

          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: PALETTE.grayText, marginBottom: '8px' }}>Método de pago</label>
          <select value={metodoPago} onChange={(event) => setMetodoPago(event.target.value)} style={{ ...selectStyle, marginBottom: '20px' }}>
            <option value="EFECTIVO">EFECTIVO</option>
            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
          </select>

          <button
            onClick={handleCobrar}
            disabled={isCharging || carrito.length === 0 || totalCarrito <= 0 || !cashRegister}
            style={{ 
              ...chargeButtonStyle, 
              opacity: isCharging || carrito.length === 0 || totalCarrito <= 0 || !cashRegister ? 0.6 : 1,
              cursor: isCharging || carrito.length === 0 || totalCarrito <= 0 || !cashRegister ? 'not-allowed' : 'pointer'
            }}
          >
            <FiDollarSign size={18} />
            {isCharging ? 'Cobrando...' : `Cobrar $${totalCarrito.toFixed(2)}`}
          </button>
        </div>
      </div>

      {productModal.isOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <h3 style={{ margin: '0 0 20px 0', color: PALETTE.darkSoft, fontSize: '1.1rem', fontWeight: 800 }}>
              {productModal.data.id ? 'Editar artículo' : 'Nuevo artículo'}
            </h3>

            <label style={labelStyle}>Nombre</label>
            <input type="text" value={productModal.data.nombre} onChange={(event) => setProductModal({ ...productModal, data: { ...productModal.data, nombre: event.target.value } })} style={inputStyle} />

            <label style={labelStyle}>Precio</label>
            <input type="number" value={productModal.data.precio} onChange={(event) => setProductModal({ ...productModal, data: { ...productModal.data, precio: event.target.value } })} style={inputStyle} />

            <label style={labelStyle}>Categoría</label>
            <select value={productModal.data.categoria} onChange={(event) => setProductModal({ ...productModal, data: { ...productModal.data, categoria: event.target.value } })} style={inputStyle}>
              <option value="Bebidas">Bebidas</option>
              <option value="Equipo">Equipo</option>
              <option value="Renta">Renta</option>
              <option value="Ropa">Ropa</option>
              <option value="Snacks">Snacks</option>
            </select>

            <label style={labelStyle}>Stock</label>
            <input type="number" value={productModal.data.stock} onChange={(event) => setProductModal({ ...productModal, data: { ...productModal.data, stock: parseInt(event.target.value || '0', 10) } })} style={inputStyle} />

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setProductModal(EMPTY_PRODUCT_MODAL)} style={secondaryButtonStyle}>Cancelar</button>
              <button onClick={handleGuardarProducto} disabled={productModal.saving} style={primaryButtonStyle}>
                {productModal.saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {restockModal.isOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <h3 style={{ margin: '0 0 12px 0', color: PALETTE.darkSoft, fontSize: '1.1rem', fontWeight: 800 }}>Hacer restock</h3>
            <p style={{ margin: '0 0 18px 0', color: PALETTE.grayText, fontSize: '0.92rem', lineHeight: 1.5, fontWeight: 600 }}>
              Vas a sumar piezas al stock de <strong style={{ color: PALETTE.darkSoft }}>{restockModal.product?.nombre}</strong>.
            </p>

            <label style={labelStyle}>Cantidad a ingresar</label>
            <input type="number" min="1" step="1" value={restockModal.cantidad} onChange={(event) => setRestockModal((prev) => ({ ...prev, cantidad: event.target.value, error: '' }))} style={inputStyle} />

            {restockModal.error ? (
              <div style={{ ...errorBannerStyle, marginTop: '14px', marginBottom: 0 }}>
                <FiAlertCircle size={16} /><span>{restockModal.error}</span>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setRestockModal(EMPTY_RESTOCK_MODAL)} disabled={restockModal.saving} style={secondaryButtonStyle}>Cancelar</button>
              <button onClick={handleRestockProducto} disabled={restockModal.saving} style={primaryButtonStyle}>
                {restockModal.saving ? 'Actualizando...' : 'Confirmar Restock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {closeModal.isOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <h3 style={{ margin: '0 0 12px 0', color: PALETTE.darkSoft, fontWeight: 800 }}>Cerrar turno</h3>
            <p style={{ margin: '0 0 20px 0', color: PALETTE.grayText, fontSize: '0.92rem', fontWeight: 600 }}>
              Según el sistema deberían existir <strong style={{ color: PALETTE.darkSoft }}>${Number(cashRegister.monto_calculado || 0).toFixed(2)}</strong> en caja.
            </p>

            <label style={labelStyle}>Efectivo físico en Caja</label>
            <input type="number" min="0" step="0.01" value={closeModal.montoReal} onChange={(event) => setCloseModal((prev) => ({ ...prev, montoReal: event.target.value }))} placeholder="0.00" style={inputStyle} />

            <label style={labelStyle}>Comentarios de cierre</label>
            <textarea value={closeModal.notas} onChange={(event) => setCloseModal((prev) => ({ ...prev, notas: event.target.value }))} placeholder="Observaciones del corte, faltantes, sobrantes, incidencias..." style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }} />

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setCloseModal(EMPTY_CLOSE_MODAL)} disabled={closeModal.loading} style={secondaryButtonStyle}>Cancelar</button>
              <button onClick={handleCerrarCaja} disabled={closeModal.loading} style={primaryButtonStyle}>
                {closeModal.loading ? 'Cerrando...' : 'Confirmar Cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- ESTILOS REFACTORIZADOS Y TIPOGRAFÍA ---
// Inyectamos la familia tipográfica moderna para garantizar legibilidad y diseño limpio.

const mainLayoutWrapper = { 
  padding: '2vh 2vw', 
  backgroundColor: 'transparent', 
  minHeight: '100vh', 
  display: 'flex', 
  gap: '20px', 
  flexWrap: 'wrap', 
  position: 'relative',
  fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" 
};

const catalogContainerStyle = { 
  flex: '1 1 55%', 
  backgroundColor: PALETTE.white, 
  padding: '24px', 
  borderRadius: '20px', 
  boxShadow: '0 4px 20px rgba(0,0,0,0.02)' 
};

const cartContainerStyle = { 
  flex: '1 1 35%', 
  minWidth: '320px', 
  backgroundColor: PALETTE.white, 
  padding: '24px', 
  borderRadius: '20px', 
  boxShadow: '0 4px 20px rgba(0,0,0,0.02)', 
  display: 'flex', 
  flexDirection: 'column' 
};

const blockedWrapperStyle = { minHeight: '80vh', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '10vh', backgroundColor: 'transparent', padding: '24px', fontFamily: "'Inter', system-ui, sans-serif" };
const blockedCardStyle = { width: '100%', maxWidth: '420px', backgroundColor: PALETTE.white, borderRadius: '20px', padding: '32px', boxShadow: '0 8px 30px rgba(0,0,0,0.04)', border: `1px solid ${PALETTE.grayBorder}`, textAlign: 'center' };
const blockedIconStyle = { width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', color: PALETTE.darkSoft, margin: '0 auto 20px auto' };
const blockedTitleStyle = { margin: '0 0 10px 0', color: PALETTE.darkSoft, fontSize: '1.3rem', fontWeight: 800 };
const blockedTextStyle = { margin: '0 0 24px 0', color: PALETTE.grayText, lineHeight: 1.5, fontSize: '0.95rem', fontWeight: 600 };

const topBannerStyle = { width: '100%', backgroundColor: PALETTE.white, borderRadius: '20px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' };
const panelStyle = { backgroundColor: '#fffbfa', border: `1px solid rgba(255, 127, 39, 0.2)`, borderRadius: '16px', padding: '20px', textAlign: 'left' };
const errorBannerStyle = { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff5f5', color: PALETTE.red, border: `1px solid rgba(231, 76, 60, 0.2)`, borderRadius: '12px', padding: '12px', marginBottom: '16px', fontSize: '0.88rem', fontWeight: 700 };

const summaryCardStyle = { backgroundColor: '#f8fafc', border: `1px solid ${PALETTE.grayBorder}`, borderRadius: '12px', padding: '16px', marginBottom: '16px' };
const summaryHeaderStyle = { display: 'flex', alignItems: 'center', gap: '8px', color: PALETTE.darkSoft, fontWeight: 800, marginBottom: '12px' };
const summaryRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: PALETTE.grayText, fontSize: '0.92rem', marginBottom: '8px', fontWeight: 600 };

const floatingCloseButtonStyle = { position: 'fixed', top: '20px', right: '24px', zIndex: 20, backgroundColor: PALETTE.white, color: PALETTE.red, border: `1px solid rgba(231, 76, 60, 0.2)`, borderRadius: '999px', padding: '12px 18px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 15px rgba(231, 76, 60, 0.1)', display: 'flex', alignItems: 'center', gap: '8px' };
const statusPillStyle = { minWidth: '130px', backgroundColor: '#f9fafb', border: `1px solid ${PALETTE.grayBorder}`, borderRadius: '14px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem', fontWeight: 700 };

const helperTextStyle = { fontSize: '0.9rem', color: PALETTE.grayText, padding: '8px 0', fontWeight: 600 };
const headerButtonStyle = { backgroundColor: PALETTE.white, color: PALETTE.darkSoft, border: `1px solid ${PALETTE.grayBorder}`, padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' };
const miniActionStyle = { padding: '6px', backgroundColor: '#f3f4f6', borderRadius: '8px', color: PALETTE.grayText, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const selectStyle = { width: '100%', padding: '12px 14px', borderRadius: '12px', border: `1px solid ${PALETTE.grayBorder}`, outline: 'none', fontWeight: 700, backgroundColor: PALETTE.white, color: PALETTE.darkSoft };
const btnCantStyle = { backgroundColor: '#f3f4f6', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: PALETTE.darkSoft };
const chargeButtonStyle = { width: '100%', padding: '14px', border: 'none', borderRadius: '14px', backgroundColor: 'var(--secondary-color)', color: PALETTE.white, fontSize: '1rem', fontWeight: 800, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' };

const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', fontFamily: "'Inter', system-ui, sans-serif" };
const modalBoxStyle = { backgroundColor: PALETTE.white, padding: '28px', borderRadius: '20px', width: '90%', maxWidth: '380px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' };
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 800, color: PALETTE.grayText, marginBottom: '6px', marginTop: '14px', textTransform: 'uppercase' };
const inputStyle = { width: '100%', padding: '12px 14px', border: `1px solid ${PALETTE.grayBorder}`, borderRadius: '12px', outline: 'none', boxSizing: 'border-box', fontWeight: 700, backgroundColor: '#f9fafb', color: PALETTE.darkSoft };
const secondaryButtonStyle = { padding: '12px', flex: 1, border: `1px solid ${PALETTE.grayBorder}`, borderRadius: '12px', backgroundColor: PALETTE.white, color: PALETTE.darkSoft, fontWeight: 800, cursor: 'pointer' };
const primaryButtonStyle = { padding: '12px', flex: 1, border: 'none', borderRadius: '12px', backgroundColor: 'var(--secondary-color)', color: PALETTE.white, fontWeight: 800, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' };
const soldOutBadgeStyle = { marginBottom: '10px', padding: '4px 9px', borderRadius: '999px', backgroundColor: '#fff5f5', color: PALETTE.red, fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em' };