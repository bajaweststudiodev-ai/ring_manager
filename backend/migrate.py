import sqlite3

def crear_gym():
    conn = sqlite3.connect('ring_manager.db')
    cursor = conn.cursor()

    # Insertamos tu gimnasio con el color naranja oficial que usas
    cursor.execute('''
        INSERT INTO gimnasios (nombre, color_principal) 
        VALUES (?, ?)
    ''', ("Team Cota's Muay Thai", "#FF7F27"))

    conn.commit()
    conn.close()
    print("✅ Gimnasio creado con éxito. Ya puedes generar el QR.")

if __name__ == '__main__':
    crear_gym()