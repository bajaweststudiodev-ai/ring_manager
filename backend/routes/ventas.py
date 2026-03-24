from flask import Blueprint, jsonify, request
from database import get_db_connection
import json
from utils.validators import clean_text, get_first_value, parse_positive_float

ventas_bp = Blueprint('ventas', __name__)

@ventas_bp.route('/api/ventas', methods=['POST'])
def crear_venta():
    data = request.get_json(silent=True) or {}
    total = parse_positive_float(get_first_value(data, 'total'))
    items = get_first_value(data, 'items', 'articulos_json')
    fecha = clean_text(get_first_value(data, 'fecha')) or datetime_now_iso()
    metodo_pago = clean_text(get_first_value(data, 'metodo_pago', 'method')) or 'EFECTIVO'
    matricula = clean_text(get_first_value(data, 'peleador_matricula', 'matricula')) or None

    if total is None:
        return jsonify({"status": "error", "message": "total debe ser un numero mayor a 0"}), 400
    if not isinstance(items, list) or len(items) == 0:
        return jsonify({"status": "error", "message": "items debe contener al menos un articulo"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        normalized_items = []
        total_calculado = 0.0

        for item in items:
            try:
                product_id = int(item.get('id'))
                cantidad = int(item.get('cantidad', 0))
            except (TypeError, ValueError):
                return jsonify({"status": "error", "message": "Cada articulo debe tener id y cantidad validos"}), 400

            if cantidad <= 0:
                return jsonify({"status": "error", "message": "La cantidad debe ser mayor a 0"}), 400

            producto = cursor.execute(
                'SELECT id, nombre, precio, stock, categoria, activo FROM productos WHERE id = ?',
                (product_id,),
            ).fetchone()

            if not producto or int(producto['activo'] or 0) != 1:
                return jsonify({"status": "error", "message": f"El producto con id {product_id} no existe o esta inactivo"}), 404

            stock_actual = int(producto['stock'] or 0)
            if stock_actual < cantidad:
                return jsonify({
                    "status": "error",
                    "message": f"Stock insuficiente para {producto['nombre']}. Disponible: {stock_actual}",
                }), 400

            subtotal = float(producto['precio']) * cantidad
            total_calculado += subtotal
            normalized_items.append({
                "id": producto['id'],
                "nombre": producto['nombre'],
                "precio": float(producto['precio']),
                "cantidad": cantidad,
                "categoria": producto['categoria'],
                "subtotal": subtotal,
            })

        total_redondeado = round(total_calculado, 2)
        if round(total, 2) != total_redondeado:
            return jsonify({
                "status": "error",
                "message": f"El total no coincide con los articulos. Esperado: {total_redondeado}",
            }), 400

        for item in normalized_items:
            cursor.execute(
                'UPDATE productos SET stock = stock - ? WHERE id = ?',
                (item['cantidad'], item['id']),
            )

        cursor.execute('''
            INSERT INTO ventas_tienda 
            (fecha, total, metodo_pago, peleador_matricula, articulos_json)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            fecha,
            total_redondeado,
            metodo_pago,
            matricula,
            json.dumps(normalized_items)
        ))

        venta_id = cursor.lastrowid
        conn.commit()

        venta = cursor.execute(
            'SELECT * FROM ventas_tienda WHERE id = ?',
            (venta_id,),
        ).fetchone()

        return jsonify({
            "status": "success",
            "data": dict(venta),
            "items": normalized_items,
        }), 201
    except Exception as e:
        conn.rollback()
        print('Error al crear venta:', e)
        return jsonify({"status": "error", "message": "No pude guardar la venta."}), 500
    finally:
        conn.close()


def datetime_now_iso():
    from datetime import datetime
    return datetime.now().isoformat()
