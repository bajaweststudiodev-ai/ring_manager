from flask import Blueprint, jsonify, request

from database import execute_query, get_db_connection
from utils.validators import parse_positive_float

productos_bp = Blueprint('productos', __name__)

@productos_bp.route('/api/productos', methods=['GET'])
def get_productos():
    try:
        productos = execute_query(
            'SELECT * FROM productos WHERE activo = 1 ORDER BY categoria ASC, nombre ASC',
            fetchall=True,
        )
        return jsonify({
            "status": "success",
            "data": productos,
        })
    except Exception as e:
        print('Error al obtener productos:', e)
        return jsonify({
            "status": "error",
            "message": "No pude obtener los productos.",
        }), 500

@productos_bp.route('/api/productos', methods=['POST'])
def crear_producto():
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    categoria = (data.get('categoria') or 'Equipo').strip()
    precio = parse_positive_float(data.get('precio'))
    stock_raw = data.get('stock', 0)

    try:
        stock = int(stock_raw)
    except (TypeError, ValueError):
        stock = -1

    if not nombre:
        return jsonify({"status": "error", "message": "nombre es obligatorio"}), 400
    if precio is None:
        return jsonify({"status": "error", "message": "precio debe ser mayor a 0"}), 400
    if stock < 0:
        return jsonify({"status": "error", "message": "stock debe ser 0 o mayor"}), 400

    try:
        result = execute_query(
            '''
            INSERT INTO productos (nombre, precio, stock, categoria)
            VALUES (?, ?, ?, ?)
            ''',
            (nombre, precio, stock, categoria),
            commit=True,
        )
        producto = execute_query(
            'SELECT * FROM productos WHERE id = ?',
            (result['lastrowid'],),
            fetchone=True,
        )
        return jsonify({"status": "success", "data": producto}), 201
    except Exception as e:
        print('Error al crear producto:', e)
        return jsonify({"status": "error", "message": "No pude crear el producto."}), 500


@productos_bp.route('/api/productos/<int:product_id>', methods=['PUT'])
def actualizar_producto(product_id):
    data = request.get_json(silent=True) or {}
    existente = execute_query(
        'SELECT * FROM productos WHERE id = ?',
        (product_id,),
        fetchone=True,
    )
    if not existente:
        return jsonify({"status": "error", "message": "Producto no encontrado"}), 404

    nombre = (data.get('nombre') or existente.get('nombre') or '').strip()
    categoria = (data.get('categoria') or existente.get('categoria') or 'Equipo').strip()
    precio = parse_positive_float(data.get('precio', existente.get('precio')))
    stock_raw = data.get('stock', existente.get('stock', 0))

    try:
        stock = int(stock_raw)
    except (TypeError, ValueError):
        stock = -1

    if not nombre:
        return jsonify({"status": "error", "message": "nombre es obligatorio"}), 400
    if precio is None:
        return jsonify({"status": "error", "message": "precio debe ser mayor a 0"}), 400
    if stock < 0:
        return jsonify({"status": "error", "message": "stock debe ser 0 o mayor"}), 400

    try:
        execute_query(
            '''
            UPDATE productos
            SET nombre = ?, precio = ?, stock = ?, categoria = ?
            WHERE id = ?
            ''',
            (nombre, precio, stock, categoria, product_id),
            commit=True,
        )
        producto = execute_query(
            'SELECT * FROM productos WHERE id = ?',
            (product_id,),
            fetchone=True,
        )
        return jsonify({"status": "success", "data": producto})
    except Exception as e:
        print('Error al actualizar producto:', e)
        return jsonify({"status": "error", "message": "No pude actualizar el producto."}), 500


@productos_bp.route('/api/productos/<int:product_id>', methods=['DELETE'])
def eliminar_producto(product_id):
    existente = execute_query(
        'SELECT id FROM productos WHERE id = ?',
        (product_id,),
        fetchone=True,
    )
    if not existente:
        return jsonify({"status": "error", "message": "Producto no encontrado"}), 404

    try:
        execute_query(
            'UPDATE productos SET activo = 0 WHERE id = ?',
            (product_id,),
            commit=True,
        )
        return jsonify({"status": "success"})
    except Exception as e:
        print('Error al eliminar producto:', e)
        return jsonify({"status": "error", "message": "No pude eliminar el producto."}), 500
