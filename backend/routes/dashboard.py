from flask import Blueprint, jsonify
from database import get_db_connection

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/api/dashboard', methods=['GET'])
def dashboard():
    conn = get_db_connection()

    ingresos = conn.execute("""
        SELECT IFNULL(SUM(total),0) as total 
        FROM ventas_tienda 
        WHERE DATE(fecha) = DATE('now')
    """).fetchone()

    pagos = conn.execute("""
        SELECT IFNULL(SUM(monto),0) as total 
        FROM pagos 
        WHERE DATE(fecha_pago) = DATE('now')
    """).fetchone()

    asistencias = conn.execute("""
        SELECT COUNT(*) as total 
        FROM asistencias 
        WHERE fecha = DATE('now')
    """).fetchone()

    conn.close()

    return jsonify({
        "ventas_hoy": ingresos["total"],
        "pagos_hoy": pagos["total"],
        "asistencias_hoy": asistencias["total"]
    })