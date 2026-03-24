import React, { useEffect, useState } from 'react';
import { FiDollarSign, FiEdit2, FiMinus, FiPackage, FiPlus, FiShoppingCart, FiTrash2, FiUser } from 'react-icons/fi';
import { fetchApi } from '../config/api';
import { db, getFighterDisplayName, normalizeFighterRecord, normalizeProductRecord } from '../db/db';

const PALETTE = {
  orange: '#FF7F27',
  white: '#fff',
  dark: '#2d2e30',
  green: '#00bb2d',
  red: '#e74c3c',
  grayBg: '#fafafa',
  grayBorder: '#eee',
  grayText: '#888'
};

export function ProShop({ userRole }) {
  const [productos, setProductos] = useState([]);
  const [fighters, setFighters] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [selectedFighter, setSelectedFighter] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [productModal, setProductModal] = useState({
    isOpen: false,
    saving: false,
    data: { id: null, nombre: '', precio: '', stock: 10, categoria: 'Equipo' }
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [productosResponse, fightersResponse] = await Promise.all([
        fetchApi('/api/productos'),
        fetchApi('/api/peleadores'),
      ]);

      const productosResult = await productosResponse.json().catch(() => ({}));
      const fightersResult = await fightersResponse.json().catch(() => []);

      if (!productosResponse.ok) {
        throw new Error(productosResult.message || 'No pude cargar los productos.');
      }

      const todosProductos = (Array.isArray(productosResult.data) ? productosResult.data : []).map(normalizeProductRecord);
      const todosFighters = (Array.isArray(fightersResult) ? fightersResult : [])
        .map(normalizeFighterRecord)
        .sort((a, b) => getFighterDisplayName(a).localeCompare(getFighterDisplayName(b)));

      setProductos(todosProductos);
      setFighters(todosFighters);

      await db.products.clear();
      if (todosProductos.length > 0) {
        await db.products.bulkAdd(todosProductos);
      }
    } catch (error) {
      console.error('No pude cargar la tienda:', error);
      setErrorMessage('No pude cargar la tienda.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuardarProducto = async () => {
    const { id, nombre, precio, stock, categoria } = productModal.data;
    if (!nombre || !precio) {
      alert('Completa nombre y precio.');
      return;
    }

    setProductModal((prev) => ({ ...prev, saving: true }));
    try {
      const payload = { nombre, precio: parseFloat(precio), stock, categoria };
      const response = await fetchApi(id ? `/api/productos/${id}` : '/api/productos', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'No pude guardar el articulo.');
      }

      setProductModal({ isOpen: false, saving: false, data: { id: null, nombre: '', precio: '', stock: 10, categoria: 'Equipo' } });
      await cargarDatos();
    } catch (error) {
      console.error('No pude guardar el articulo:', error);
      alert(error.message || 'No pude guardar el articulo.');
      setProductModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleBorrarProducto = async (e, id, nombre) => {
    e.stopPropagation();
    if (!window.confirm(`Borrar permanentemente ${nombre}?`)) return;
    try {
      const response = await fetchApi(`/api/productos/${id}`, {
        method: 'DELETE',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || 'No pude eliminar el producto.');
      }
      await cargarDatos();
    } catch (error) {
      console.error('No pude borrar el producto:', error);
      alert(error.message || 'No pude borrar el producto.');
    }
  };

  const abrirModalEditar = (e, prod) => {
    e.stopPropagation();
    setProductModal({ isOpen: true, saving: false, data: normalizeProductRecord(prod) });
  };

  const abrirModalNuevo = () => {
    setProductModal({ isOpen: true, saving: false, data: { id: null, nombre: '', precio: '', stock: 10, categoria: 'Equipo' } });
  };

  const agregarAlCarrito = (producto) => {
    const cantidadEnCarrito = carrito
      .filter((item) => item.id === producto.id)
      .reduce((sum, item) => sum + item.cantidad, 0);

    if (cantidadEnCarrito >= Number(producto.stock || 0)) {
      alert(`No hay mas stock disponible para ${producto.nombre}.`);
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
        if (item.id !== id) {
          return item;
        }

        const stockDisponible = Number(item.stock || 0);
        const siguienteCantidad = item.cantidad + delta;
        if (delta > 0 && siguienteCantidad > stockDisponible) {
          return item;
        }

        return { ...item, cantidad: siguienteCantidad };
      })
      .filter((item) => item.cantidad > 0);
    setCarrito(nuevoCarrito);
  };

  const totalCarrito = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  const tieneRentas = carrito.some((item) => item.categoria === 'Renta');

  const handleCobrar = async () => {
    if (carrito.length === 0) return;
    if (tieneRentas && !selectedFighter) {
      alert('Cuando hay renta necesito asignar el equipo a un peleador.');
      return;
    }

    try {
      const fighter = selectedFighter ? fighters.find((item) => item.id === parseInt(selectedFighter, 10)) : null;
      const payloadVenta = {
        fecha: new Date().toISOString(),
        total: totalCarrito,
        metodo_pago: metodoPago,
        peleador_matricula: fighter?.matricula || null,
        items: carrito.map((item) => ({
          id: item.id,
          cantidad: item.cantidad,
        })),
      };

      const response = await fetchApi('/api/ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadVenta),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'No pude registrar la venta.');
      }

      await db.sales.add({
        fecha: payloadVenta.fecha,
        date: payloadVenta.fecha,
        items: result.items || carrito,
        total: totalCarrito,
        metodo_pago: metodoPago,
        method: metodoPago,
        peleador_matricula: fighter?.matricula || null,
        fighter_name: fighter ? getFighterDisplayName(fighter) : 'Venta general',
        synced: 1,
      });

      new Audio('/beep-success.mp3').play().catch(() => {});
      setCarrito([]);
      setSelectedFighter('');
      setMetodoPago('EFECTIVO');
      await cargarDatos();
    } catch (error) {
      console.error('No pude registrar la venta:', error);
      alert(error.message || 'No pude registrar la venta.');
    }
  };

  return (
    <div style={{ padding: '2vh 2vw', backgroundColor: PALETTE.grayBg, minHeight: '100vh', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 55%', backgroundColor: PALETTE.white, padding: '18px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `2px solid ${PALETTE.orange}`, paddingBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ color: PALETTE.dark, margin: 0, fontSize: '1.2rem' }}>TIENDA Y RENTAS</h2>
          {userRole === 'admin' && (
            <button onClick={abrirModalNuevo} style={headerButtonStyle}>
              <FiPackage size={14} /> Nuevo articulo
            </button>
          )}
        </div>

        {loading && <p style={helperTextStyle}>Cargando articulos...</p>}
        {errorMessage && <p style={{ ...helperTextStyle, color: PALETTE.red }}>{errorMessage}</p>}

        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
            {productos.map((prod) => (
              <button
                key={prod.id}
                onClick={() => agregarAlCarrito(prod)}
                style={{
                  position: 'relative',
                  padding: '14px',
                  paddingTop: '24px',
                  backgroundColor: prod.categoria === 'Renta' ? '#fff9e6' : '#fdfdfd',
                  border: `1px solid ${prod.categoria === 'Renta' ? '#f1c40f' : PALETTE.grayBorder}`,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center'
                }}
              >
                {userRole === 'admin' && (
                  <div style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', gap: '4px' }}>
                    <div onClick={(e) => abrirModalEditar(e, prod)} style={miniActionStyle} title="Editar"><FiEdit2 size={11} /></div>
                    <div onClick={(e) => handleBorrarProducto(e, prod.id, prod.nombre)} style={{ ...miniActionStyle, color: PALETTE.red, backgroundColor: '#fff5f5' }} title="Borrar"><FiTrash2 size={11} /></div>
                  </div>
                )}

                <div style={{ fontSize: '0.72rem', color: prod.categoria === 'Renta' ? '#d35400' : PALETTE.grayText, fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase' }}>
                  {prod.categoria}
                </div>
                <div style={{ fontWeight: 700, color: PALETTE.dark, fontSize: '0.95rem', marginBottom: '10px', lineHeight: 1.2 }}>{prod.nombre}</div>
                <div style={{ fontSize: '0.72rem', color: PALETTE.grayText, marginBottom: '8px' }}>
                  Stock: {prod.stock ?? 0}
                </div>
                <div style={{ backgroundColor: prod.categoria === 'Renta' ? '#f39c12' : '#eef2f5', color: prod.categoria === 'Renta' ? '#fff' : PALETTE.dark, padding: '4px 10px', borderRadius: '18px', fontWeight: 700, fontSize: '0.95rem' }}>
                  ${prod.precio}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: '1 1 35%', minWidth: '320px', backgroundColor: PALETTE.white, padding: '18px', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '0 0 15px 0', color: PALETTE.dark, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1rem' }}>
          <FiShoppingCart /> Ticket actual
        </h3>

        <div style={{ marginBottom: '15px', backgroundColor: tieneRentas ? '#fff5f5' : '#f9f9f9', padding: '10px', borderRadius: '8px', border: `1px solid ${tieneRentas ? PALETTE.red : PALETTE.grayBorder}` }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700, color: tieneRentas ? PALETTE.red : PALETTE.grayText, marginBottom: '5px' }}>
            <FiUser size={13} /> {tieneRentas ? 'Peleador requerido por renta' : 'Peleador opcional'}
          </label>
          <select value={selectedFighter} onChange={(e) => setSelectedFighter(e.target.value)} style={selectStyle}>
            <option value="">Venta general</option>
            {fighters.map((fighter) => (
              <option key={fighter.id} value={fighter.id}>{getFighterDisplayName(fighter)} ({fighter.matricula})</option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', borderTop: `1px solid ${PALETTE.grayBorder}`, borderBottom: `1px solid ${PALETTE.grayBorder}`, padding: '10px 0', minHeight: '180px' }}>
          {carrito.length === 0 ? (
            <div style={{ textAlign: 'center', color: PALETTE.grayText, marginTop: '50px', fontSize: '0.9rem' }}>El carrito esta vacio</div>
          ) : (
            carrito.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: PALETTE.dark }}>{item.nombre}</div>
                  <div style={{ fontSize: '0.8rem', color: PALETTE.grayText }}>${item.precio} c/u</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => cambiarCantidad(item.id, -1)} style={btnCantStyle}><FiMinus size={12} /></button>
                  <span style={{ fontWeight: 700, fontSize: '1rem', width: '18px', textAlign: 'center' }}>{item.cantidad}</span>
                  <button onClick={() => cambiarCantidad(item.id, 1)} style={btnCantStyle}><FiPlus size={12} /></button>
                </div>
                <div style={{ width: '60px', textAlign: 'right', fontWeight: 700, color: PALETTE.dark, fontSize: '0.95rem' }}>
                  ${item.precio * item.cantidad}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ paddingTop: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '1rem', color: PALETTE.grayText, fontWeight: 700 }}>TOTAL</span>
            <span style={{ fontSize: '1.5rem', color: PALETTE.dark, fontWeight: 800 }}>${totalCarrito}</span>
          </div>

          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: PALETTE.grayText, marginBottom: '5px' }}>Metodo de pago</label>
          <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={{ ...selectStyle, marginBottom: '18px' }}>
            <option value="EFECTIVO">EFECTIVO</option>
            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
          </select>

          <button onClick={handleCobrar} disabled={carrito.length === 0} style={{ ...chargeButtonStyle, opacity: carrito.length === 0 ? 0.6 : 1 }}>
            <FiDollarSign size={18} /> Cobrar ${totalCarrito}
          </button>
        </div>
      </div>

      {productModal.isOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle}>
            <h3 style={{ margin: '0 0 15px 0', borderBottom: `2px solid ${PALETTE.orange}`, paddingBottom: '10px', fontSize: '1rem' }}>
              {productModal.data.id ? 'Editar articulo' : 'Nuevo articulo'}
            </h3>

            <label style={labelStyle}>Nombre</label>
            <input type="text" value={productModal.data.nombre} onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, nombre: e.target.value } })} style={inputStyle} />

            <label style={labelStyle}>Precio</label>
            <input type="number" value={productModal.data.precio} onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, precio: e.target.value } })} style={inputStyle} />

            <label style={labelStyle}>Categoria</label>
            <select value={productModal.data.categoria} onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, categoria: e.target.value } })} style={inputStyle}>
              <option value="Bebidas">Bebidas</option>
              <option value="Equipo">Equipo</option>
              <option value="Renta">Renta</option>
              <option value="Ropa">Ropa</option>
              <option value="Snacks">Snacks</option>
            </select>

            <label style={labelStyle}>Stock</label>
            <input type="number" value={productModal.data.stock} onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, stock: parseInt(e.target.value || '0', 10) } })} style={inputStyle} />

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setProductModal({ isOpen: false, saving: false, data: { id: null, nombre: '', precio: '', stock: 10, categoria: 'Equipo' } })} style={secondaryButtonStyle}>Cancelar</button>
              <button onClick={handleGuardarProducto} disabled={productModal.saving} style={primaryButtonStyle}>
                {productModal.saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const helperTextStyle = { fontSize: '0.9rem', color: PALETTE.grayText, padding: '8px 0' };
const headerButtonStyle = { backgroundColor: '#f4f4f5', color: PALETTE.dark, border: '1px solid #e5e7eb', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem' };
const miniActionStyle = { padding: '5px', backgroundColor: '#eef2f5', borderRadius: '4px', color: PALETTE.dark, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const selectStyle = { width: '100%', padding: '9px 10px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', fontWeight: 600 };
const btnCantStyle = { backgroundColor: '#eef2f5', border: 'none', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: PALETTE.dark };
const chargeButtonStyle = { width: '100%', padding: '12px', border: 'none', borderRadius: '8px', backgroundColor: PALETTE.green, color: PALETTE.white, fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' };
const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalBoxStyle = { backgroundColor: PALETTE.white, padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '350px' };
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: PALETTE.grayText, marginBottom: '5px', marginTop: '10px' };
const inputStyle = { width: '100%', padding: '10px', border: `1px solid ${PALETTE.grayBorder}`, borderRadius: '6px', outline: 'none', boxSizing: 'border-box' };
const secondaryButtonStyle = { padding: '10px', flex: 1, border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', fontWeight: 600, cursor: 'pointer' };
const primaryButtonStyle = { padding: '10px', flex: 1, border: 'none', borderRadius: '6px', backgroundColor: PALETTE.dark, color: '#fff', fontWeight: 700, cursor: 'pointer' };
