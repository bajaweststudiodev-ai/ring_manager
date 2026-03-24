import json
from datetime import datetime

from flask import Blueprint, jsonify, request

from database import get_db_connection
from routes.pagos import registrar_pago_en_bd
from utils.validators import clean_text, get_first_value, parse_positive_float


sync_bp = Blueprint('sync', __name__)


def normalizar_fecha(valor):
    texto = clean_text(valor)
    if not texto:
        return datetime.now()
    try:
        return datetime.fromisoformat(texto.replace('Z', '+00:00'))
    except ValueError:
        return datetime.now()


def insertar_asistencia(cursor, item):
    matricula = clean_text(get_first_value(item, 'peleador_matricula', 'matricula'))
    if not matricula:
        return {"status": "error", "message": "La asistencia requiere peleador_matricula"}, 400

    existe = cursor.execute(
        'SELECT matricula FROM peleadores WHERE matricula = ?',
        (matricula,)
    ).fetchone()
    if not existe:
        return {"status": "error", "message": f"El peleador {matricula} no existe"}, 404

    fecha_entrada = normalizar_fecha(get_first_value(item, 'date', 'fecha'))
    fecha_salida_raw = get_first_value(item, 'checkOut', 'hora_salida')
    fecha_salida = normalizar_fecha(fecha_salida_raw) if fecha_salida_raw else None
    medio_registro = clean_text(get_first_value(item, 'medio_registro', 'method')) or 'QR'

    cursor.execute('''
        INSERT INTO asistencias (peleador_matricula, fecha, hora_entrada, hora_salida, medio_registro)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        matricula,
        fecha_entrada.strftime('%Y-%m-%d'),
        fecha_entrada.strftime('%H:%M:%S'),
        fecha_salida.strftime('%H:%M:%S') if fecha_salida else None,
        medio_registro,
    ))
    return None, None


def insertar_venta(cursor, item):
    total = parse_positive_float(get_first_value(item, 'total'))
    articulos = get_first_value(item, 'items', 'articulos_json')
    if total is None:
        return {"status": "error", "message": "La venta requiere total valido"}, 400
    if not isinstance(articulos, list) or len(articulos) == 0:
        return {"status": "error", "message": "La venta requiere items"}, 400

    fecha = normalizar_fecha(get_first_value(item, 'date', 'fecha'))
    metodo_pago = clean_text(get_first_value(item, 'metodo_pago', 'method')) or 'EFECTIVO'
    matricula = clean_text(get_first_value(item, 'peleador_matricula', 'matricula')) or None

    cursor.execute('''
        INSERT INTO ventas_tienda (fecha, total, metodo_pago, peleador_matricula, articulos_json)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        fecha.isoformat(),
        total,
        metodo_pago,
        matricula,
        json.dumps(articulos),
    ))
    return None, None


@sync_bp.route('/api/sync', methods=['POST'])
def sincronizar():
    data = request.get_json(silent=True) or {}
    attendance = data.get('attendance') or []
    sales = data.get('sales') or []
    payments = data.get('payments') or []

    if not all(isinstance(group, list) for group in [attendance, sales, payments]):
        return jsonify({"status": "error", "message": "attendance, sales y payments deben ser listas"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        for item in attendance:
            error_body, status_code = insertar_asistencia(cursor, item)
            if error_body:
                conn.rollback()
                return jsonify(error_body), status_code

        for item in sales:
            error_body, status_code = insertar_venta(cursor, item)
            if error_body:
                conn.rollback()
                return jsonify(error_body), status_code

        for item in payments:
            _, error = registrar_pago_en_bd(cursor, item)
            if error:
                conn.rollback()
                body, status_code = error
                return jsonify(body), status_code

        conn.commit()
        return jsonify({
            "status": "success",
            "synced": {
                "attendance": len(attendance),
                "sales": len(sales),
                "payments": len(payments),
            }
        })
    except Exception as e:
        conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        conn.close()
