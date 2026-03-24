from flask import Blueprint, jsonify, request

from database import execute_query, get_db_connection, reset_database
from utils.validators import clean_text, get_first_value, parse_positive_float


crud_bp = Blueprint('crud', __name__)

TABLE_CONFIG = {
    'peleadores': {
        'pk': 'matricula',
        'required': ['matricula', 'nombre'],
    },
    'tutores': {
        'pk': 'id',
        'required': [],
    },
    'datos_medicos': {
        'pk': 'id',
        'required': [],
    },
    'membresias': {
        'pk': 'id',
        'required': [],
    },
    'pagos': {
        'pk': 'id',
        'required': ['peleador_matricula', 'monto'],
    },
    'asistencias': {
        'pk': 'id',
        'required': ['peleador_matricula'],
    },
    'contratos': {
        'pk': 'id',
        'required': [],
    },
    'ventas_tienda': {
        'pk': 'id',
        'required': [],
    },
    'productos': {
        'pk': 'id',
        'required': [],
    },
    'gimnasios': {
        'pk': 'id',
        'required': [],
    },
}


def get_table_columns(table_name):
    conn = get_db_connection()
    try:
        rows = conn.execute(f'PRAGMA table_info({table_name})').fetchall()
        return [row['name'] for row in rows]
    finally:
        conn.close()


def validate_required_fields(table_name, payload):
    required_fields = TABLE_CONFIG[table_name]['required']
    missing_fields = []

    for field in required_fields:
        value = payload.get(field)
        if value is None or clean_text(value) == '':
            missing_fields.append(field)

    if 'monto' in payload and payload.get('monto') is not None:
        if parse_positive_float(payload.get('monto')) is None:
            missing_fields.append('monto')

    return missing_fields


def filter_payload(table_name, payload, *, include_pk=False):
    valid_columns = set(get_table_columns(table_name))
    pk_column = TABLE_CONFIG[table_name]['pk']
    filtered = {}

    for key, value in payload.items():
        if key not in valid_columns:
            continue
        if key == pk_column and not include_pk:
            continue
        filtered[key] = value

    return filtered


def exists_record(table_name, pk_value):
    pk_column = TABLE_CONFIG[table_name]['pk']
    return execute_query(
        f'SELECT * FROM {table_name} WHERE {pk_column} = ?',
        (pk_value,),
        fetchone=True,
    )


def validate_foreign_keys(table_name, payload):
    if table_name in {'pagos', 'asistencias'}:
        matricula = clean_text(payload.get('peleador_matricula'))
        if not matricula:
            return {"status": "error", "message": "peleador_matricula es obligatorio"}, 400

        peleador = execute_query(
            'SELECT matricula FROM peleadores WHERE matricula = ?',
            (matricula,),
            fetchone=True,
        )
        if not peleador:
            return {"status": "error", "message": "El peleador no existe"}, 404

    return None


@crud_bp.route('/api/reset-db', methods=['POST'])
def reset_db():
    try:
        result = reset_database()
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@crud_bp.route('/api/<table_name>', methods=['GET'])
def get_all(table_name):
    if table_name not in TABLE_CONFIG:
        return jsonify({"status": "error", "message": "Tabla no permitida"}), 404

    try:
        data = execute_query(f'SELECT * FROM {table_name}', fetchall=True)
        return jsonify(data)
    except Exception as e:
        print("❌ Error:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@crud_bp.route('/api/<table_name>/<record_id>', methods=['GET'])
def get_one(table_name, record_id):
    if table_name not in TABLE_CONFIG:
        return jsonify({"status": "error", "message": "Tabla no permitida"}), 404

    pk_column = TABLE_CONFIG[table_name]['pk']
    try:
        data = execute_query(
            f'SELECT * FROM {table_name} WHERE {pk_column} = ?',
            (record_id,),
            fetchone=True,
        )
        if not data:
            return jsonify({"status": "error", "message": "Registro no encontrado"}), 404
        return jsonify(data)
    except Exception as e:
        print("❌ Error:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@crud_bp.route('/api/crud/<table_name>', methods=['POST'])
def create_one(table_name):
    if table_name not in TABLE_CONFIG:
        return jsonify({"status": "error", "message": "Tabla no permitida"}), 404

    payload = request.get_json(silent=True) or {}
    filtered_payload = filter_payload(table_name, payload, include_pk=True)
    missing_fields = validate_required_fields(table_name, filtered_payload)
    fk_error = validate_foreign_keys(table_name, filtered_payload)

    if missing_fields:
        return jsonify({
            "status": "error",
            "message": "Faltan campos requeridos",
            "missing_fields": sorted(set(missing_fields)),
        }), 400
    if fk_error:
        body, status_code = fk_error
        return jsonify(body), status_code

    pk_column = TABLE_CONFIG[table_name]['pk']
    pk_value = filtered_payload.get(pk_column)
    if pk_value is not None and exists_record(table_name, pk_value):
        return jsonify({"status": "error", "message": "Registro duplicado"}), 409

    if table_name == 'pagos' and 'monto' in filtered_payload:
        filtered_payload['monto'] = parse_positive_float(filtered_payload['monto'])
    if table_name == 'ventas_tienda' and 'total' in filtered_payload:
        total = parse_positive_float(filtered_payload['total'])
        if total is None:
            return jsonify({"status": "error", "message": "total debe ser un numero mayor a 0"}), 400
        filtered_payload['total'] = total

    if not filtered_payload:
        return jsonify({"status": "error", "message": "No hay campos validos para insertar"}), 400

    columns = ', '.join(filtered_payload.keys())
    placeholders = ', '.join(['?'] * len(filtered_payload))
    values = tuple(filtered_payload.values())

    try:
        result = execute_query(
            f'INSERT INTO {table_name} ({columns}) VALUES ({placeholders})',
            values,
            commit=True,
        )
        print("✔ Registro creado")
        created_id = pk_value if pk_value is not None else result['lastrowid']
        created_row = get_one_row(table_name, created_id)
        return jsonify({"status": "success", "data": created_row}), 201
    except Exception as e:
        print("❌ Error:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@crud_bp.route('/api/<table_name>/<record_id>', methods=['PUT'])
def update_one(table_name, record_id):
    if table_name not in TABLE_CONFIG:
        return jsonify({"status": "error", "message": "Tabla no permitida"}), 404

    if not exists_record(table_name, record_id):
        return jsonify({"status": "error", "message": "Registro no encontrado"}), 404

    payload = request.get_json(silent=True) or {}
    filtered_payload = filter_payload(table_name, payload, include_pk=False)
    fk_error = validate_foreign_keys(table_name, {**exists_record(table_name, record_id), **filtered_payload})

    if fk_error:
        body, status_code = fk_error
        return jsonify(body), status_code

    if 'monto' in filtered_payload:
        filtered_payload['monto'] = parse_positive_float(filtered_payload['monto'])
        if filtered_payload['monto'] is None:
            return jsonify({"status": "error", "message": "monto debe ser un numero mayor a 0"}), 400

    if not filtered_payload:
        return jsonify({"status": "error", "message": "No hay campos validos para actualizar"}), 400

    assignments = ', '.join([f'{key} = ?' for key in filtered_payload.keys()])
    values = tuple(filtered_payload.values())
    pk_column = TABLE_CONFIG[table_name]['pk']

    try:
        execute_query(
            f'UPDATE {table_name} SET {assignments} WHERE {pk_column} = ?',
            values + (record_id,),
            commit=True,
        )
        print("✔ Registro actualizado")
        updated_row = get_one_row(table_name, record_id)
        return jsonify({"status": "success", "data": updated_row})
    except Exception as e:
        print("❌ Error:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@crud_bp.route('/api/<table_name>/<record_id>', methods=['DELETE'])
def delete_one(table_name, record_id):
    if table_name not in TABLE_CONFIG:
        return jsonify({"status": "error", "message": "Tabla no permitida"}), 404

    if not exists_record(table_name, record_id):
        return jsonify({"status": "error", "message": "Registro no encontrado"}), 404

    pk_column = TABLE_CONFIG[table_name]['pk']
    try:
        execute_query(
            f'DELETE FROM {table_name} WHERE {pk_column} = ?',
            (record_id,),
            commit=True,
        )
        print("✔ Registro eliminado")
        return jsonify({"status": "success"})
    except Exception as e:
        print("❌ Error:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


def get_one_row(table_name, record_id):
    pk_column = TABLE_CONFIG[table_name]['pk']
    return execute_query(
        f'SELECT * FROM {table_name} WHERE {pk_column} = ?',
        (record_id,),
        fetchone=True,
    )
