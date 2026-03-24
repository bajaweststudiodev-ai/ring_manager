from flask import Blueprint, request, jsonify
from database import get_db_connection
from datetime import datetime, timedelta
from utils.validators import clean_text, get_first_value, parse_positive_float

pagos_bp = Blueprint('pagos', __name__)


def calcular_fecha_fin(tipo, fecha_inicio):
    fecha_fin = fecha_inicio

    if 'VISITA' in tipo:
        return fecha_fin
    if 'DOS SEMANAS' in tipo or 'QUINCENA' in tipo:
        return fecha_inicio + timedelta(days=14)
    if 'SEMANA' in tipo:
        return fecha_inicio + timedelta(days=7)
    if 'MENSUALIDAD' in tipo or 'PROPORCIONAL' in tipo:
        if fecha_inicio.month == 12:
            return fecha_inicio.replace(year=fecha_inicio.year + 1, month=1, day=1)
        return fecha_inicio.replace(month=fecha_inicio.month + 1, day=1)
    return fecha_inicio


def registrar_pago_en_bd(cursor, data):
    matricula = clean_text(get_first_value(data, 'peleador_matricula', 'matricula'))
    tipo = clean_text(get_first_value(data, 'tipo_pago', 'type')).upper()
    monto = parse_positive_float(get_first_value(data, 'monto', 'amount'))
    metodo = clean_text(get_first_value(data, 'metodo_pago', 'method')).upper() or 'EFECTIVO'

    if not matricula:
        return None, ({"status": "error", "message": "peleador_matricula es obligatorio"}, 400)
    if monto is None:
        return None, ({"status": "error", "message": "monto debe ser un numero mayor a 0"}, 400)

    existe = cursor.execute(
        'SELECT matricula FROM peleadores WHERE matricula = ?',
        (matricula,)
    ).fetchone()
    if not existe:
        return None, ({"status": "error", "message": "El peleador no existe"}, 404)

    fecha_inicio = datetime.now()
    fecha_fin = calcular_fecha_fin(tipo, fecha_inicio)
    fecha_inicio_str = fecha_inicio.strftime('%Y-%m-%d')
    fecha_fin_str = fecha_fin.strftime('%Y-%m-%d')

    cursor.execute('''
        INSERT INTO pagos (peleador_matricula, tipo_pago, monto, fecha_pago, metodo_pago, fecha_inicio, fecha_fin)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (matricula, tipo, monto, fecha_inicio_str, metodo, fecha_inicio_str, fecha_fin_str))

    if 'INSCRIPCION' in tipo or 'INSCRIPCIÓN' in tipo:
        cursor.execute('''
            UPDATE peleadores
            SET inscripcion_pagada = 1
            WHERE matricula = ?
        ''', (matricula,))

    return {
        "peleador_matricula": matricula,
        "tipo_pago": tipo,
        "monto": monto,
        "metodo_pago": metodo,
        "fecha_inicio": fecha_inicio_str,
        "fecha_fin": fecha_fin_str,
    }, None

# ==========================================
# 📊 LEER ESTADO DE PAGOS (El que ya tenías)
# ==========================================
@pagos_bp.route('/api/estado_pagos', methods=['GET'])
def estado_pagos():
    conn = get_db_connection()

    data = conn.execute("""
        SELECT p.matricula, p.nombre, MAX(pg.fecha_fin) as ultima_fecha_pago
        FROM peleadores p
        LEFT JOIN pagos pg ON p.matricula = pg.peleador_matricula
        GROUP BY p.matricula
    """).fetchall()

    resultado = []
    for row in data:
        ultima = row['ultima_fecha_pago']
        if not ultima:
            estado = "SIN PAGOS"
        else:
            fecha = datetime.fromisoformat(ultima).date()
            estado = "VENCIDO" if fecha < datetime.now().date() else "ACTIVO"

        resultado.append({
            "matricula": row['matricula'],
            "nombre": row['nombre'],
            "estado_pago": estado
        })

    conn.close()
    return jsonify(resultado)


# ==========================================
# 💰 RECIBIR NUEVO PAGO (El Cajero Automático)
# ==========================================
@pagos_bp.route('/api/pagos', methods=['POST'])
def registrar_pago():
    data = request.get_json(silent=True) or {}
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        pago, error = registrar_pago_en_bd(cursor, data)
        if error:
            conn.rollback()
            body, status_code = error
            return jsonify(body), status_code

        conn.commit()
        return jsonify({
            "status": "success",
            "msg": "Pago registrado con exito",
            "vencimiento": pago["fecha_fin"],
            "pago": pago,
        }), 201

    except Exception as e:
        conn.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500
    finally:
        conn.close()
