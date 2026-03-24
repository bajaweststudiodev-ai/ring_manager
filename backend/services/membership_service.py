# backend/services/membership_service.py
from datetime import datetime
from database import get_db_connection

class MembershipService:
    @staticmethod
    def obtener_estado_alumno(matricula):
        conn = get_db_connection()
        # Buscamos el pago con la fecha_fin más lejana
        query = "SELECT MAX(fecha_fin) as vencimiento FROM pagos WHERE peleador_matricula = ?"
        resultado = conn.execute(query, (matricula,)).fetchone()
        conn.close()

        if not resultado or not resultado['vencimiento']:
            return {"status": "SIN_PAGO", "color": "#888"}

        vencimiento = datetime.strptime(resultado['vencimiento'], '%Y-%m-%d')
        hoy = datetime.now()

        if vencimiento < hoy:
            return {"status": "VENCIDO", "color": "#e74c3c", "fecha": resultado['vencimiento']}
        
        return {"status": "ACTIVO", "color": "#00bb2d", "fecha": resultado['vencimiento']}