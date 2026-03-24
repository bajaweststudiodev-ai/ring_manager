from flask import Blueprint, jsonify, request

from database import execute_query
from utils.security import hash_password, sanitize_user_row


users_bp = Blueprint('users', __name__)


def validate_user_payload(data, *, creating):
    nombre = (data.get('nombre') or '').strip()
    usuario = (data.get('usuario') or '').strip()
    password = data.get('password') or ''

    if not nombre:
        return 'nombre es obligatorio'
    if not usuario:
        return 'usuario es obligatorio'
    if creating and not password:
        return 'password es obligatoria'

    return None


@users_bp.route('/api/usuarios', methods=['GET'])
def get_users():
    try:
        rows = execute_query(
            '''
            SELECT id, nombre, usuario, rol, telefono, correo, estado, created_at
            FROM usuarios
            ORDER BY id DESC
            ''',
            fetchall=True,
        )
        return jsonify({"status": "success", "data": rows})
    except Exception as e:
        print('Error al obtener usuarios:', e)
        return jsonify({"status": "error", "message": "No pude obtener los usuarios."}), 500


@users_bp.route('/api/usuarios', methods=['POST'])
def create_user():
    data = request.get_json(silent=True) or {}
    validation_error = validate_user_payload(data, creating=True)
    if validation_error:
        return jsonify({"status": "error", "message": validation_error}), 400

    usuario = data['usuario'].strip()
    existing_user = execute_query(
        'SELECT id FROM usuarios WHERE usuario = ?',
        (usuario,),
        fetchone=True,
    )
    if existing_user:
        return jsonify({"status": "error", "message": "El usuario ya existe"}), 409

    try:
        password_hash = hash_password(data['password'])
        result = execute_query(
            '''
            INSERT INTO usuarios (nombre, usuario, password, rol, telefono, correo, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                data['nombre'].strip(),
                usuario,
                password_hash,
                (data.get('rol') or 'staff').strip(),
                (data.get('telefono') or '').strip(),
                (data.get('correo') or '').strip().lower(),
                (data.get('estado') or 'ACTIVO').strip(),
            ),
            commit=True,
        )
        created_user = execute_query(
            'SELECT * FROM usuarios WHERE id = ?',
            (result['lastrowid'],),
            fetchone=True,
        )
        return jsonify({"status": "success", "data": sanitize_user_row(created_user)}), 201
    except Exception as e:
        print('Error al crear usuario:', e)
        return jsonify({"status": "error", "message": "No pude crear el usuario."}), 500


@users_bp.route('/api/usuarios/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    data = request.get_json(silent=True) or {}
    existing_user = execute_query(
        'SELECT * FROM usuarios WHERE id = ?',
        (user_id,),
        fetchone=True,
    )
    if not existing_user:
        return jsonify({"status": "error", "message": "Usuario no encontrado"}), 404

    validation_error = validate_user_payload({
        'nombre': data.get('nombre', existing_user.get('nombre')),
        'usuario': data.get('usuario', existing_user.get('usuario')),
        'password': data.get('password'),
    }, creating=False)
    if validation_error:
        return jsonify({"status": "error", "message": validation_error}), 400

    next_username = (data.get('usuario') or existing_user.get('usuario') or '').strip()
    duplicated_user = execute_query(
        'SELECT id FROM usuarios WHERE usuario = ? AND id != ?',
        (next_username, user_id),
        fetchone=True,
    )
    if duplicated_user:
        return jsonify({"status": "error", "message": "El usuario ya existe"}), 409

    password_hash = existing_user.get('password')
    if data.get('password'):
        password_hash = hash_password(data['password'])

    try:
        execute_query(
            '''
            UPDATE usuarios
            SET nombre = ?, usuario = ?, password = ?, rol = ?, telefono = ?, correo = ?, estado = ?
            WHERE id = ?
            ''',
            (
                (data.get('nombre') or existing_user.get('nombre') or '').strip(),
                next_username,
                password_hash,
                (data.get('rol') or existing_user.get('rol') or 'staff').strip(),
                (data.get('telefono') or existing_user.get('telefono') or '').strip(),
                (data.get('correo') or existing_user.get('correo') or '').strip().lower(),
                (data.get('estado') or existing_user.get('estado') or 'ACTIVO').strip(),
                user_id,
            ),
            commit=True,
        )
        updated_user = execute_query(
            'SELECT * FROM usuarios WHERE id = ?',
            (user_id,),
            fetchone=True,
        )
        return jsonify({"status": "success", "data": sanitize_user_row(updated_user)})
    except Exception as e:
        print('Error al actualizar usuario:', e)
        return jsonify({"status": "error", "message": "No pude actualizar el usuario."}), 500


@users_bp.route('/api/usuarios/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    existing_user = execute_query(
        'SELECT id FROM usuarios WHERE id = ?',
        (user_id,),
        fetchone=True,
    )
    if not existing_user:
        return jsonify({"status": "error", "message": "Usuario no encontrado"}), 404

    try:
        execute_query(
            'DELETE FROM usuarios WHERE id = ?',
            (user_id,),
            commit=True,
        )
        return jsonify({"status": "success"})
    except Exception as e:
        print('Error al eliminar usuario:', e)
        return jsonify({"status": "error", "message": "No pude eliminar el usuario."}), 500
