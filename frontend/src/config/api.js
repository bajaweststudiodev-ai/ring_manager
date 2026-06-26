const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');
const AUTH_STORAGE_KEY = 'ring_manager_auth';
let logoutDispatched = false;

const safeParseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isAuthExpired = (sessionData) => {
  const expiresAt = Date.parse(sessionData?.expires_at || '');
  return Number.isFinite(expiresAt) && Date.now() >= expiresAt;
};

export const getStoredAuth = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const parsed = safeParseJson(window.localStorage.getItem(AUTH_STORAGE_KEY) || '');
  if (!parsed) {
    return null;
  }

  if (isAuthExpired(parsed)) {
    clearAuthSession();
    return null;
  }

  return parsed;
};

export const getAuthToken = () => getStoredAuth()?.token || '';

export const saveAuthSession = (sessionData) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
  window.dispatchEvent(new CustomEvent('auth:changed', { detail: sessionData }));
};

export const clearAuthSession = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const hadSession = Boolean(window.localStorage.getItem(AUTH_STORAGE_KEY));
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  if (hadSession && !logoutDispatched) {
    logoutDispatched = true;
    window.dispatchEvent(new CustomEvent('auth:logout'));
    window.setTimeout(() => {
      logoutDispatched = false;
    }, 250);
  }
  window.dispatchEvent(new CustomEvent('auth:changed', { detail: null }));
};

// --- 🛡️ EL NUEVO BLOQUE DE URL AUTOMÁTICA ---
export const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;

  // SAME_ORIGIN: las rutas /api y /uploads son proxeadas por Vite (dev y preview).
  // Úsalo en .env.local para tunnel testing — el iPad habla con el tunnel,
  // Vite reenvía internamente a Flask:5000 sin que el cliente sepa la IP.
  if (envUrl === 'SAME_ORIGIN') {
    return typeof window !== 'undefined' ? trimTrailingSlash(window.location.origin) : '';
  }

  // URL explícita (cualquier otro valor en VITE_API_URL)
  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }

  // Modo desarrollador (npm run dev) sin .env.local
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:5000';
  }

  // Producción real desplegada en PythonAnywhere
  return 'https://bajaweststudio.pythonanywhere.com';
};

export const getBackendBaseUrl = getApiBaseUrl;

export const getApiBaseCandidates = () => [getApiBaseUrl()];
// ---------------------------------------------

export const apiUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
};

export const apiAssetUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getBackendBaseUrl()}${normalizedPath}`;
};

export const resolveAssetUrl = (path = '', fallback = '') => {
  if (!path) {
    return fallback;
  }

  const normalized = String(path).trim();
  if (!normalized) {
    return fallback;
  }

  if (/^(?:https?:|data:|blob:)/i.test(normalized)) {
    return normalized;
  }

  return apiAssetUrl(normalized.startsWith('/') ? normalized : `/${normalized}`);
};

export const fetchApi = async (path = '', options = {}) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const bases = getApiBaseCandidates();
  let lastError = null;
  const originBase = typeof window !== 'undefined' ? trimTrailingSlash(window.location.origin) : '';
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const requestOptions = {
    ...options,
    headers,
  };

  for (const base of bases) {
    const url = `${base}${normalizedPath}`;

    try {
      const response = await fetch(url, requestOptions);
      const contentType = response.headers.get('content-type') || '';
      const isJsonResponse = contentType.toLowerCase().includes('application/json');

      if (base === originBase && (response.status === 404 || !isJsonResponse)) {
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        response.authExpired = true;
        // Solo cierra sesión si hay red real — evita logout por respuestas
        // cacheadas del SW o proxies cuando el dispositivo está offline
        if (navigator.onLine) {
          clearAuthSession();
        }
      }

      response.apiBaseUrl = base;
      response.apiResolvedUrl = url;
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`No pude conectar con la API para ${normalizedPath}.`);
};