import base64
from io import BytesIO
from pathlib import Path

from flask import Blueprint, jsonify, request
from PIL import Image

from database import UPLOADS_DIR, execute_query, get_setting, set_setting


settings_bp = Blueprint('settings', __name__)
LOGO_RELATIVE_PATH = Path('uploads') / 'logo.png'
DEFAULT_PRIMARY = '#1F2A44'
DEFAULT_SECONDARY = '#FF7F27'


def normalize_hex(color_value):
    value = (color_value or '').strip()
    if not value:
        return ''
    if not value.startswith('#'):
        value = f'#{value}'
    return value.upper()


def is_usable_color(rgb):
    r, g, b = rgb
    brightness = (0.299 * r) + (0.587 * g) + (0.114 * b)
    saturation = max(rgb) - min(rgb)
    return brightness < 240 and saturation > 18


def rgb_to_hex(rgb):
    return '#{:02X}{:02X}{:02X}'.format(*rgb)


def color_distance(color_a, color_b):
    return sum((a - b) ** 2 for a, b in zip(color_a, color_b)) ** 0.5


def extract_brand_colors(image_bytes):
    image = Image.open(BytesIO(image_bytes)).convert('RGBA')
    image.thumbnail((220, 220))

    # Ignoro transparencia para no sesgar la paleta con fondos vacios.
    solid_background = Image.new('RGBA', image.size, (255, 255, 255, 255))
    image = Image.alpha_composite(solid_background, image).convert('RGB')

    quantized = image.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    color_counts = quantized.getcolors() or []

    rgb_palette = []
    for count, color_index in sorted(color_counts, reverse=True):
        base_index = color_index * 3
        rgb = tuple(palette[base_index:base_index + 3])
        if len(rgb) == 3:
            rgb_palette.append((count, rgb))

    usable_colors = [(count, rgb) for count, rgb in rgb_palette if is_usable_color(rgb)]
    fallback_colors = usable_colors or rgb_palette

    if not fallback_colors:
        return DEFAULT_PRIMARY, DEFAULT_SECONDARY

    primary_rgb = fallback_colors[0][1]
    secondary_rgb = None

    for _count, candidate in fallback_colors[1:]:
        if color_distance(primary_rgb, candidate) >= 70:
            secondary_rgb = candidate
            break

    if secondary_rgb is None and len(fallback_colors) > 1:
        secondary_rgb = fallback_colors[1][1]

    if secondary_rgb is None:
        secondary_rgb = tuple(max(0, min(255, channel + 40)) for channel in primary_rgb)

    return rgb_to_hex(primary_rgb), rgb_to_hex(secondary_rgb)


def get_logo_bytes():
    if 'logo' in request.files:
        return request.files['logo'].read()

    data = request.get_json(silent=True) or {}
    data_url = data.get('logo_data_url') or data.get('logo_base64') or ''
    if not data_url:
        return None

    if ',' in data_url:
        _, encoded = data_url.split(',', 1)
    else:
        encoded = data_url

    return base64.b64decode(encoded)


@settings_bp.route('/api/settings', methods=['GET'])
def get_settings():
    try:
        rows = execute_query('SELECT clave, valor FROM settings ORDER BY clave ASC', fetchall=True)
        data = {row['clave']: row['valor'] for row in rows}
        data.setdefault('nombre_gym', 'Ring Manager')
        data.setdefault('color_primary', DEFAULT_PRIMARY)
        data.setdefault('color_secondary', DEFAULT_SECONDARY)
        data.setdefault('logo_path', get_setting('logo_path', ''))
        return jsonify({
            "status": "success",
            "data": data,
        })
    except Exception as e:
        print('Error al obtener settings:', e)
        return jsonify({
            "status": "error",
            "message": "No pude obtener la configuracion.",
        }), 500


@settings_bp.route('/api/settings', methods=['POST'])
def create_setting():
    data = request.get_json(silent=True) or {}
    clave = (data.get('clave') or '').strip()
    valor = str(data.get('valor') or '').strip()

    if not clave:
        return jsonify({"status": "error", "message": "clave es obligatoria"}), 400

    existente = execute_query(
        'SELECT id FROM settings WHERE clave = ?',
        (clave,),
        fetchone=True,
    )
    if existente:
        return jsonify({"status": "error", "message": "La clave ya existe"}), 409

    try:
        execute_query(
            'INSERT INTO settings (clave, valor) VALUES (?, ?)',
            (clave, valor),
            commit=True,
        )
        return jsonify({"status": "success", "clave": clave, "valor": valor}), 201
    except Exception as e:
        print('Error al crear setting:', e)
        return jsonify({"status": "error", "message": "No pude crear el setting."}), 500


@settings_bp.route('/api/settings/<clave>', methods=['PUT'])
def update_setting(clave):
    data = request.get_json(silent=True) or {}
    valor = str(data.get('valor') or '').strip()

    try:
        set_setting(clave, valor)
        return jsonify({"status": "success", "clave": clave, "valor": valor})
    except Exception as e:
        print('Error al actualizar setting:', e)
        return jsonify({"status": "error", "message": "No pude actualizar el setting."}), 500


@settings_bp.route('/api/settings/logo', methods=['POST'])
def upload_logo():
    try:
        image_bytes = get_logo_bytes()
        if not image_bytes:
            return jsonify({"status": "error", "message": "No recibi imagen para el logo."}), 400

        logo_path = UPLOADS_DIR / 'logo.png'
        logo_path.parent.mkdir(parents=True, exist_ok=True)
        logo_path.write_bytes(image_bytes)

        primary_color, secondary_color = extract_brand_colors(image_bytes)
        set_setting('logo_path', LOGO_RELATIVE_PATH.as_posix())
        set_setting('color_primary', primary_color)
        set_setting('color_secondary', secondary_color)

        return jsonify({
            "status": "success",
            "data": {
                "logo_path": LOGO_RELATIVE_PATH.as_posix(),
                "color_primary": primary_color,
                "color_secondary": secondary_color,
            }
        })
    except Exception as e:
        print('Error al procesar logo:', e)
        return jsonify({
            "status": "error",
            "message": "No pude procesar el logo. Se conservaron los colores actuales.",
        }), 500
