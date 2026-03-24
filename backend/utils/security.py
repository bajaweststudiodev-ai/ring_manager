import bcrypt


def hash_password(password):
    if not password:
        raise ValueError('La password es obligatoria.')

    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password, hashed_password):
    if not password or not hashed_password:
        return False

    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
    except ValueError:
        return False


def sanitize_user_row(row):
    if row is None:
        return None

    user = dict(row)
    user.pop('password', None)
    return user
