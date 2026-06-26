import { fetchApi } from '../config/api';
import { replaceBootstrapCache } from '../db/db';

const parseJsonSafe = async (response) => response.json().catch(() => ({}));

export const bootstrapCacheFromServer = async () => {
  const [fightersResponse, paymentsResponse, productsResponse, gymsResponse] = await Promise.all([
    fetchApi('/api/peleadores'),
    fetchApi('/api/pagos'),
    fetchApi('/api/productos'),
    fetchApi('/api/gimnasios'),
  ]);

  const [fightersResult, paymentsResult, productsResult, gymsResult] = await Promise.all([
    parseJsonSafe(fightersResponse),
    parseJsonSafe(paymentsResponse),
    parseJsonSafe(productsResponse),
    parseJsonSafe(gymsResponse),
  ]);

  if (!fightersResponse.ok) {
    throw new Error('No pude descargar la lista de peleadores.');
  }
  if (!paymentsResponse.ok) {
    throw new Error('No pude descargar la lista de pagos.');
  }
  if (!productsResponse.ok) {
    throw new Error('No pude descargar la lista de productos.');
  }
  if (!gymsResponse.ok) {
    throw new Error('No pude descargar la lista de gimnasios.');
  }

  await replaceBootstrapCache({
    fighters: Array.isArray(fightersResult) ? fightersResult : [],
    payments: Array.isArray(paymentsResult) ? paymentsResult : [],
    products: Array.isArray(productsResult.data) ? productsResult.data : [],
    gyms: Array.isArray(gymsResult) ? gymsResult : [],
  });

  return {
    fighters: Array.isArray(fightersResult) ? fightersResult.length : 0,
    payments: Array.isArray(paymentsResult) ? paymentsResult.length : 0,
    products: Array.isArray(productsResult.data) ? productsResult.data.length : 0,
    gyms: Array.isArray(gymsResult) ? gymsResult.length : 0,
  };
};
