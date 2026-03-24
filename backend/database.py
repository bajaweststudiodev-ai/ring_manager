import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'ring_manager.db'
UPLOADS_DIR = BASE_DIR / 'uploads'
RESET_TABLES = [
    'contratos',
    'asistencias',
    'pagos',
    'datos_medicos',
    'tutores',
    'ventas_tienda',
    'productos',
    'membresias',
    'usuarios',
    'settings',
    'gimnasios',
    'peleadores',
]


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def ensure_core_tables():
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                clave TEXT UNIQUE,
                valor TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario)')
        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_clave ON settings(clave)')
        conn.commit()
    finally:
        conn.close()


def cleanup_invalid_records():
    conn = get_db_connection()
    cursor = conn.cursor()

    pagos_borrados = cursor.execute(
        '''
        DELETE FROM pagos
        WHERE peleador_matricula IS NULL
           OR TRIM(peleador_matricula) = ''
           OR NOT EXISTS (
               SELECT 1
               FROM peleadores
               WHERE peleadores.matricula = pagos.peleador_matricula
           )
        '''
    ).rowcount

    asistencias_borradas = cursor.execute(
        '''
        DELETE FROM asistencias
        WHERE peleador_matricula IS NULL
           OR TRIM(peleador_matricula) = ''
           OR NOT EXISTS (
               SELECT 1
               FROM peleadores
               WHERE peleadores.matricula = asistencias.peleador_matricula
           )
        '''
    ).rowcount

    conn.commit()
    conn.close()

    return {
        "pagos_borrados": pagos_borrados,
        "asistencias_borradas": asistencias_borradas,
    }


def execute_query(query, params=(), *, fetchone=False, fetchall=False, commit=False):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(query, params)
        if commit:
            conn.commit()

        if fetchone:
            row = cursor.fetchone()
            return dict(row) if row else None

        if fetchall:
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

        return {
            "rowcount": cursor.rowcount,
            "lastrowid": cursor.lastrowid,
        }
    finally:
        conn.close()


def get_setting(clave, default=None):
    row = execute_query(
        'SELECT valor FROM settings WHERE clave = ?',
        (clave,),
        fetchone=True,
    )
    if not row:
        return default
    return row.get('valor', default)


def set_setting(clave, valor):
    return execute_query(
        '''
        INSERT INTO settings (clave, valor)
        VALUES (?, ?)
        ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
        ''',
        (clave, valor),
        commit=True,
    )


def reset_database():
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conn.execute('PRAGMA foreign_keys = OFF')
        for table in RESET_TABLES:
            cursor.execute(f'DELETE FROM {table}')

        cursor.execute("DELETE FROM sqlite_sequence")
        conn.commit()
        print("✔ Base de datos limpiada")
        return {
            "status": "success",
            "tables_cleared": RESET_TABLES,
        }
    except Exception as e:
        conn.rollback()
        print("❌ Error:", e)
        raise
    finally:
        conn.execute('PRAGMA foreign_keys = ON')
        conn.close()
