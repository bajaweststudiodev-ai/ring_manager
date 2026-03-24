const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

export const getApiBaseCandidates = () => {
  const candidates = [];
  const envBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || '');
  if (envBaseUrl) {
    candidates.push(envBaseUrl);
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const { protocol, hostname, host } = window.location;
    const normalizedProtocol = protocol === 'https:' ? 'https:' : 'http:';

    candidates.push(`${window.location.origin}`);
    candidates.push(`${normalizedProtocol}//${hostname}:5000`);

    if (protocol === 'https:') {
      candidates.push(`http://${hostname}:5000`);
    }

    if (host !== `${hostname}:5000`) {
      candidates.push(`http://${hostname}:5000`);
    }

    if (hostname !== 'localhost') {
      candidates.push('http://localhost:5000');
      candidates.push('http://127.0.0.1:5000');
    }
  }

  candidates.push('http://localhost:5000');
  candidates.push('http://127.0.0.1:5000');

  return [...new Set(candidates.map(trimTrailingSlash).filter(Boolean))];
};

export const getApiBaseUrl = () => getApiBaseCandidates()[0];

export const getBackendBaseUrl = () => {
  const envBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || '');
  if (envBaseUrl) {
    return envBaseUrl;
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:5000`;
  }

  return 'http://localhost:5000';
};

export const apiUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
};

export const apiAssetUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getBackendBaseUrl()}${normalizedPath}`;
};

export const fetchApi = async (path = '', options = {}) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const bases = getApiBaseCandidates();
  let lastError = null;
  const originBase = typeof window !== 'undefined' ? trimTrailingSlash(window.location.origin) : '';

  for (const base of bases) {
    const url = `${base}${normalizedPath}`;

    try {
      const response = await fetch(url, options);
      const contentType = response.headers.get('content-type') || '';
      const isJsonResponse = contentType.toLowerCase().includes('application/json');

      if (base === originBase && (response.status === 404 || !isJsonResponse)) {
        continue;
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
