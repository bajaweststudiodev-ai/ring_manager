from functools import wraps
from flask import request, jsonify
import jwt

SECRET_KEY = "tu_clave_secreta"

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')

        if not token:
            return jsonify({"error": "Token requerido"}), 403

        try:
            jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except:
            return jsonify({"error": "Token inválido"}), 403

        return f(*args, **kwargs)

    return decorated