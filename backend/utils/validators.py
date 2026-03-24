from typing import Any


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def get_first_value(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
    return None


def require_fields(data: dict[str, Any], field_map: dict[str, tuple[str, ...]]) -> list[str]:
    missing: list[str] = []
    for label, keys in field_map.items():
        value = get_first_value(data, *keys)
        if clean_text(value) == "":
            missing.append(label)
    return missing


def parse_positive_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed <= 0:
        return None
    return parsed
