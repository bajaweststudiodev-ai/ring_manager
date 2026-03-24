from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from database import UPLOADS_DIR, cleanup_invalid_records, ensure_core_tables, get_db_connection
from routes.auth import auth_bp
from routes.crud import crud_bp
from routes.dashboard import dashboard_bp
from routes.pagos import pagos_bp
from routes.peleadores import peleadores_bp
from routes.productos import productos_bp
from routes.settings import settings_bp
from routes.sync import sync_bp
from routes.users import users_bp
from routes.ventas import ventas_bp

app = Flask(__name__)
CORS(app)
ensure_core_tables()
cleanup_invalid_records()


@app.route('/', methods=['GET'])
def monitor_db():
    try:
        conn = get_db_connection()
        peleadores = conn.execute('SELECT matricula, nombre, apellido_paterno FROM peleadores ORDER BY matricula DESC LIMIT 5').fetchall()
        ventas = conn.execute('SELECT total, metodo_pago, fecha FROM ventas_tienda ORDER BY fecha DESC LIMIT 5').fetchall()
        conn.close()

        return jsonify({
            "1_estado": "ONLINE",
            "2_mensaje": "API de Cota's Muay Thai funcionando al 100%",
            "3_ultimos_peleadores": [dict(p) for p in peleadores],
            "4_ultimas_ventas": [dict(v) for v in ventas]
        })
    except Exception as e:
        return jsonify({
            "1_estado": "ERROR",
            "2_detalle": str(e)
        })


@app.route('/uploads/<path:filename>', methods=['GET'])
def serve_upload(filename):
    return send_from_directory(UPLOADS_DIR, filename)


app.register_blueprint(peleadores_bp)
app.register_blueprint(productos_bp)
app.register_blueprint(ventas_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(pagos_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(sync_bp)
app.register_blueprint(settings_bp)
app.register_blueprint(crud_bp)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
