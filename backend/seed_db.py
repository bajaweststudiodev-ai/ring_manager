import sqlite3
import os

if os.path.exists("ring_manager.db"):
    print("⚠️ La base de datos ya existe. No se recreará.")
    exit()
def inicializar_bd():
    # Esto crea el archivo físicamente en tu carpeta
    conexion = sqlite3.connect('ring_manager.db')
    cursor = conexion.cursor()

    # Activar el soporte para llaves foráneas en SQLite
    cursor.execute('PRAGMA foreign_keys = ON')

    print("Construyendo tablas...")

    # 1. PELEADORES (La tabla principal)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS peleadores (
            matricula TEXT PRIMARY KEY,
            nombre TEXT NOT NULL,
            fecha_nacimiento TEXT,
            colonia TEXT,
            calle TEXT,
            numero_exterior TEXT,
            numero_interior TEXT,
            codigo_postal TEXT,
            ciudad TEXT,
            telefono TEXT,
            correo TEXT,
            fecha_ingreso TEXT,
            estado TEXT DEFAULT 'ACTIVO',
            motivo_baja TEXT,
            foto_path TEXT,
            qr_path TEXT,
            inscripcion_pagada INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 2. TUTORES
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tutores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            peleador_matricula TEXT,
            nombre TEXT,
            telefono TEXT,
            correo TEXT,
            firma_path TEXT,
            foto_path TEXT,
            fecha_nacimiento TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (peleador_matricula) REFERENCES peleadores(matricula)
        )
    ''')

    # 3. DATOS MÉDICOS
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS datos_medicos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            peleador_matricula TEXT,
            tipo_sangre TEXT,
            alergias TEXT,
            lesiones TEXT,
            contacto_emergencia TEXT,
            telefono_emergencia TEXT,
            seguro_medico TEXT,
            consultorio TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (peleador_matricula) REFERENCES peleadores(matricula)
        )
    ''')

    # 4. MEMBRESÍAS (Catálogo de precios)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS membresias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            precio REAL,
            duracion_dias INTEGER,
            descripcion TEXT,
            activo INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 5. PAGOS
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            peleador_matricula TEXT,
            membresia_id INTEGER,
            tipo_pago TEXT,
            monto REAL,
            fecha_pago TEXT,
            fecha_inicio TEXT,
            fecha_fin TEXT,
            metodo_pago TEXT,
            usuario_id INTEGER,
            notas TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (peleador_matricula) REFERENCES peleadores(matricula),
            FOREIGN KEY (membresia_id) REFERENCES membresias(id)
        )
    ''')

    # 6. ASISTENCIAS
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS asistencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            peleador_matricula TEXT,
            fecha TEXT,
            hora_entrada TEXT,
            hora_salida TEXT,
            medio_registro TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (peleador_matricula) REFERENCES peleadores(matricula)
        )
    ''')

    # 7. CONTRATOS
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contratos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            peleador_matricula TEXT,
            tutor_id INTEGER,
            tipo_contrato TEXT,
            firma_path TEXT,
            contrato_path TEXT,
            fecha TEXT,
            aceptado INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (peleador_matricula) REFERENCES peleadores(matricula),
            FOREIGN KEY (tutor_id) REFERENCES tutores(id)
        )
    ''')

    # 8. USUARIOS (Staff/Admins)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            usuario TEXT UNIQUE,
            password TEXT,
            rol TEXT,
            telefono TEXT,
            correo TEXT,
            estado TEXT DEFAULT 'ACTIVO',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    

    conexion.commit()
    conexion.close()
    print("✅ Base de datos 'ring_manager.db' creada con éxito y lista para usarse.")

if __name__ == '__main__':
    inicializar_bd()
    
    
    