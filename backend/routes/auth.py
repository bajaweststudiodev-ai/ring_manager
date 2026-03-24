from flask import Blueprint, jsonify, request

from database import get_db_connection
from utils.security import verify_password


auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    usuario = (data.get('usuario') or '').strip()
    password = data.get('password') or ''

    if not usuario or not password:
        return jsonify({
            "status": "error",
            "message": "usuario y password son obligatorios",
        }), 400

    conn = get_db_connection()
    user = conn.execute(
        '''
        SELECT id, nombre, usuario, password, rol, estado
        FROM usuarios
        WHERE usuario = ?
        ''',
        (usuario,),
    ).fetchone()
    conn.close()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Usuario no encontrado",
        }), 404

    if (user['estado'] or 'ACTIVO').upper() != 'ACTIVO':
        return jsonify({
            "status": "error",
            "message": "El usuario esta inactivo",
        }), 403

    if not verify_password(password, user['password']):
        return jsonify({
            "status": "error",
            "message": "Password incorrecta",
        }), 401

    return jsonify({
        "status": "success",
        "data": {
            "id": user['id'],
            "nombre": user['nombre'],
            "rol": user['rol'],
            "usuario": user['usuario'],
        }
    })
