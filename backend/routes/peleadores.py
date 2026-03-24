from flask import Blueprint, request, jsonify
from database import UPLOADS_DIR, get_db_connection
import base64
import json
from datetime import datetime
from pathlib import Path
from utils.validators import clean_text, get_first_value, require_fields

peleadores_bp = Blueprint('peleadores', __name__)
PENDING_REGISTRATIONS_DIR = UPLOADS_DIR / 'pending_registrations'

@peleadores_bp.route('/api/peleadores', methods=['GET'])
def obtener_peleadores():
    conn = get_db_connection()
    data = conn.execute('SELECT * FROM peleadores ORDER BY matricula DESC').fetchall()
    conn.close()
    return jsonify([dict(x) for x in data])

def guardar_archivo_imagen(data_url, carpeta, nombre_archivo):
    if not data_url or ',' not in data_url:
        return ""

    try:
        carpeta_destino = UPLOADS_DIR / carpeta
        carpeta_destino.mkdir(parents=True, exist_ok=True)

        ruta_relativa = Path('uploads') / carpeta / nombre_archivo
        ruta_absoluta = carpeta_destino / nombre_archivo
        _, encoded = data_url.split(',', 1)

        with open(ruta_absoluta, "wb") as fh:
            fh.write(base64.b64decode(encoded))

        return ruta_relativa.as_posix()
    except Exception as error:
        raise ValueError(f'No pude guardar el archivo {nombre_archivo}: {error}') from error


def get_pending_registration_path(matricula):
    PENDING_REGISTRATIONS_DIR.mkdir(parents=True, exist_ok=True)
    return PENDING_REGISTRATIONS_DIR / f'{matricula}.json'


def guardar_solicitud_pendiente(payload):
    matricula = payload['matricula']
    request_path = get_pending_registration_path(matricula)
    request_path.write_text(
        json.dumps(payload, ensure_ascii=True, indent=2),
        encoding='utf-8',
    )


def leer_solicitud_pendiente(matricula):
    request_path = get_pending_registration_path(matricula)
    if not request_path.exists():
        return None

    return json.loads(request_path.read_text(encoding='utf-8'))


def eliminar_solicitud_pendiente(matricula):
    request_path = get_pending_registration_path(matricula)
    if request_path.exists():
        request_path.unlink()


def listar_solicitudes_pendientes():
    PENDING_REGISTRATIONS_DIR.mkdir(parents=True, exist_ok=True)
    pendientes = []

    for file_path in sorted(PENDING_REGISTRATIONS_DIR.glob('*.json'), reverse=True):
        try:
            pendientes.append(json.loads(file_path.read_text(encoding='utf-8')))
        except json.JSONDecodeError:
            print(f'No pude leer la solicitud pendiente {file_path.name}')

    return pendientes


def mapear_payload_peleador(data):
    return {
        "matricula": clean_text(get_first_value(data, 'matricula')),
        "nombre": clean_text(get_first_value(data, 'nombre', 'nombres')),
        "apellido_paterno": clean_text(get_first_value(data, 'apellido_paterno', 'apellidoPaterno')),
        "apellido_materno": clean_text(get_first_value(data, 'apellido_materno', 'apellidoMaterno')),
        "fecha_nacimiento": clean_text(get_first_value(data, 'fecha_nacimiento', 'fechaNacimiento')),
        "colonia": clean_text(get_first_value(data, 'colonia')),
        "calle": clean_text(get_first_value(data, 'calle', 'direccion')),
        "numero_exterior": clean_text(get_first_value(data, 'numero_exterior', 'numeroCasa')),
        "codigo_postal": clean_text(get_first_value(data, 'codigo_postal', 'codigoPostal')),
        "ciudad": clean_text(get_first_value(data, 'ciudad')),
        "telefono": clean_text(get_first_value(data, 'telefono')),
        "correo": clean_text(get_first_value(data, 'correo', 'email')),
        "tipo_sangre": clean_text(get_first_value(data, 'tipo_sangre', 'grupoSanguineo')),
        "contacto_emergencia": clean_text(get_first_value(data, 'contacto_emergencia', 'emergNombre')),
        "telefono_emergencia": clean_text(get_first_value(data, 'telefono_emergencia', 'emergTelefono')),
        "alergias": clean_text(get_first_value(data, 'alergias')),
        "lesiones": clean_text(get_first_value(data, 'lesiones', 'padecimientos')),
        "seguro_medico": clean_text(get_first_value(data, 'seguro_medico', 'sistemaSalud')),
        "consultorio": clean_text(get_first_value(data, 'consultorio')),
        "tutor_nombre": clean_text(get_first_value(data, 'tutor_nombre', 'tutorNombres')),
        "tutor_apellido_paterno": clean_text(get_first_value(data, 'tutor_apellido_paterno', 'tutorApellidoPaterno')),
        "tutor_apellido_materno": clean_text(get_first_value(data, 'tutor_apellido_materno', 'tutorApellidoMaterno')),
        "tutor_telefono": clean_text(get_first_value(data, 'tutor_telefono', 'tutorTelefono')),
        "tutor_correo": clean_text(get_first_value(data, 'tutor_correo', 'tutorCorreo', 'tutorEmail')),
        "tutor_fecha_nacimiento": clean_text(get_first_value(data, 'tutor_fecha_nacimiento', 'tutorFechaNacimiento')),
        "gimnasio_id": get_first_value(data, 'gimnasio_id', 'gym_id'),
        "tipo_pago_sugerido": clean_text(get_first_value(data, 'tipo_pago_sugerido', 'tipoMembresia')),
        "foto_data_url": get_first_value(data, 'foto_data_url', 'fotoPerfil'),
        "firma_data_url": get_first_value(data, 'firma_data_url', 'firmaDigital'),
    }


def insertar_peleador(cursor, payload, estado='ACTIVO'):
    matricula = payload['matricula']
    foto_path = payload.get('foto_path') or guardar_archivo_imagen(payload.get('foto_data_url'), 'fotos', f'{matricula}.png')
    firma_path = payload.get('firma_path') or guardar_archivo_imagen(payload.get('firma_data_url'), 'firma', f'{matricula}.png')
    ruta_qr = payload.get('qr_path') or (Path('uploads') / 'qrs' / f'{matricula}.png').as_posix()
    fecha_hoy = payload.get('fecha_ingreso') or datetime.now().strftime('%Y-%m-%d')
    apellido_paterno = payload.get('apellido_paterno', '')
    apellido_materno = payload.get('apellido_materno', '')
    apellidos = payload.get('apellidos') or ' '.join(part for part in [apellido_paterno, apellido_materno] if part).strip()

    cursor.execute('''
        INSERT INTO peleadores (
            matricula, nombre, apellido_paterno, apellido_materno, apellidos, fecha_nacimiento,
            colonia, calle, numero_exterior, codigo_postal, ciudad, telefono, correo,
            foto_path, fecha_ingreso, qr_path, inscripcion_pagada, estado, gimnasio_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        matricula,
        payload['nombre'],
        apellido_paterno,
        apellido_materno,
        apellidos,
        payload.get('fecha_nacimiento', ''),
        payload.get('colonia', ''),
        payload.get('calle', ''),
        payload.get('numero_exterior', ''),
        payload.get('codigo_postal', ''),
        payload.get('ciudad', ''),
        payload.get('telefono', ''),
        payload.get('correo', ''),
        foto_path,
        fecha_hoy,
        ruta_qr,
        int(payload.get('inscripcion_pagada') or 0),
        estado,
        payload.get('gimnasio_id'),
    ))

    cursor.execute('''
        INSERT INTO datos_medicos (
            peleador_matricula, tipo_sangre, alergias, lesiones, contacto_emergencia,
            telefono_emergencia, seguro_medico, consultorio
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        matricula,
        payload.get('tipo_sangre', ''),
        payload.get('alergias', ''),
        payload.get('lesiones', ''),
        payload.get('contacto_emergencia', ''),
        payload.get('telefono_emergencia', ''),
        payload.get('seguro_medico', ''),
        payload.get('consultorio', ''),
    ))

    if payload.get('tutor_nombre'):
        cursor.execute('''
            INSERT INTO tutores (
                peleador_matricula, nombre, apellido_paterno, apellido_materno,
                telefono, correo, firma_path, fecha_nacimiento
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            matricula,
            payload.get('tutor_nombre', ''),
            payload.get('tutor_apellido_paterno', ''),
            payload.get('tutor_apellido_materno', ''),
            payload.get('tutor_telefono', ''),
            payload.get('tutor_correo', ''),
            firma_path,
            payload.get('tutor_fecha_nacimiento', ''),
        ))

    return {
        "foto_path": foto_path,
        "firma_path": firma_path,
        "qr_path": ruta_qr,
        "fecha_ingreso": fecha_hoy,
    }


@peleadores_bp.route('/api/registro', methods=['POST'])
@peleadores_bp.route('/api/peleadores', methods=['POST'])
def crear_peleador():
    conn = None

    try:
        data = request.get_json(silent=True) or {}
        payload = mapear_payload_peleador(data)
        es_registro_publico = request.path.endswith('/api/registro')
        estado_inicial = 'PENDIENTE' if es_registro_publico else clean_text(get_first_value(data, 'estado')) or 'ACTIVO'

        faltantes = require_fields(payload, {
            "matricula": ("matricula",),
            "nombre": ("nombre",),
        })
        if faltantes:
            return jsonify({
                "status": "error",
                "message": "Faltan campos obligatorios",
                "missing_fields": faltantes,
            }), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        matricula = payload['matricula']
        existe = cursor.execute('SELECT matricula FROM peleadores WHERE matricula = ?', (matricula,)).fetchone()
        if existe:
            return jsonify({"status": "error", "message": "La matricula ya existe"}), 400

        if leer_solicitud_pendiente(matricula):
            return jsonify({"status": "error", "message": "La solicitud ya existe"}), 400

        foto_path = guardar_archivo_imagen(payload['foto_data_url'], 'fotos', f'{matricula}.png')
        firma_path = guardar_archivo_imagen(payload['firma_data_url'], 'firma', f'{matricula}.png')
        ruta_qr = (Path('uploads') / 'qrs' / f'{matricula}.png').as_posix()
        fecha_hoy = datetime.now().strftime('%Y-%m-%d')
        payload_con_archivos = {
            **payload,
            "foto_path": foto_path,
            "firma_path": firma_path,
            "qr_path": ruta_qr,
            "fecha_ingreso": fecha_hoy,
            "estado": estado_inicial,
            "inscripcion_pagada": 0,
            "created_at": datetime.now().isoformat(),
            "foto_data_url": "",
            "firma_data_url": "",
        }

        if es_registro_publico:
            guardar_solicitud_pendiente(payload_con_archivos)
            print(f'Solicitud pendiente creada: {matricula}')
            return jsonify({
                "status": "success",
                "message": "Solicitud registrada correctamente",
                "peleador": payload_con_archivos,
            }), 201

        insertar_peleador(cursor, payload_con_archivos, estado=estado_inicial)
        conn.commit()
        print(f'Registro creado: {matricula} ({estado_inicial})')
        return jsonify({
            "status": "success",
            "message": "Peleador registrado correctamente",
            "peleador": payload_con_archivos,
        }), 201

    except Exception as e:
        if conn is not None:
            conn.rollback()
        print('Error al crear peleador:', e)
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn is not None:
            conn.close()


@peleadores_bp.route('/api/peleadores/pendientes', methods=['GET'])
def obtener_peleadores_pendientes():
    try:
        return jsonify(listar_solicitudes_pendientes())
    except Exception as e:
        print('Error al obtener peleadores pendientes:', e)
        return jsonify({
            "status": "error",
            "message": "No pude obtener los peleadores pendientes.",
        }), 500


@peleadores_bp.route('/api/peleadores/aprobar/<matricula>', methods=['PUT'])
def aprobar_peleador(matricula):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        solicitud = leer_solicitud_pendiente(matricula)
        if not solicitud:
            return jsonify({
                "status": "error",
                "message": "No encontre la solicitud pendiente.",
            }), 404

        peleador_existente = cursor.execute(
            'SELECT matricula FROM peleadores WHERE matricula = ?',
            (matricula,),
        ).fetchone()
        if peleador_existente:
            return jsonify({
                "status": "error",
                "message": "La matricula ya existe en peleadores.",
            }), 400

        insertar_peleador(cursor, solicitud, estado='ACTIVO')
        conn.commit()
        eliminar_solicitud_pendiente(matricula)

        actualizado = cursor.execute(
            'SELECT * FROM peleadores WHERE matricula = ?',
            (matricula,),
        ).fetchone()

        print(f'Peleador aprobado: {matricula}')
        return jsonify({
            "status": "success",
            "message": "Peleador aprobado correctamente.",
            "peleador": dict(actualizado),
        })
    except Exception as e:
        conn.rollback()
        print('Error al aprobar peleador:', e)
        return jsonify({
            "status": "error",
            "message": "No pude aprobar al peleador.",
        }), 500
    finally:
        conn.close()
