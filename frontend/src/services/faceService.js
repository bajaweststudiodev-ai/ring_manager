// src/services/faceService.js
//
// Reconocimiento facial 100% en el navegador usando face-api.js.
// Reemplaza el microservicio Python face_service/ (FastAPI + DeepFace).
//
// Modelos requeridos en /public/models/:
//   ssd_mobilenetv1_model-weights_manifest.json  + shard(s)
//   face_landmark_68_model-weights_manifest.json + shard(s)
//   face_recognition_model-weights_manifest.json + shard(s)
//
// Descarga: https://github.com/vladmandic/face-api/tree/master/model
// (usar la carpeta "model" del repo vladmandic, que es la fork activa de justadudewhohacks)

import * as faceapi from 'face-api.js';
import { db } from '../db/db';

const MODEL_URL = '/models';

// Umbral de distancia euclidiana. Menor = más estricto.
// 0.5 es el punto óptimo para indoor con iluminación estable.
const MATCH_THRESHOLD = 0.50;

// TinyFaceDetector con inputSize 160 para enrolamiento y CheckIn en CPU.
// inputSize 160 = ~10× menos píxeles que SSD MobileNet (que procesa 300²).
// En iPad sin WebGL (CPU fallback), SSD MobileNet tardaba 4-8 s por frame;
// TinyFaceDetector 160 tarda ~200-400 ms — dentro de lo usable.
// inputSize debe ser múltiplo de 32: valores válidos = 128, 160, 224, 320...
const TINY_ENROLL_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.50 });
// Para CheckIn ligero (detección sin descriptor) usamos el mismo modelo.
const TINY_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.50 });
// SSD solo como fallback para identifyFace si los modelos SSD están disponibles.
const SSD_LIGHT_OPTIONS = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.30 });

// Estado interno del servicio (singleton por módulo).
let _modelsReady = false;
let _loadingPromise = null;
let _tinyReady = false;
let _ssdReady = false;

// ─────────────────────────────────────────────────────────────────────────────
// CARGA DE MODELOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Carga los tres modelos necesarios desde /public/models.
 * Seguro para llamar múltiples veces: solo carga una vez.
 * Llámalo temprano en App.jsx para que los modelos estén listos
 * antes de que el primer empleado escanee su QR.
 */
export async function initFaceApi() {
  if (_modelsReady) return;
  if (_loadingPromise) return _loadingPromise;

  // TinyFaceDetector es ahora el modelo PRINCIPAL para enrolamiento y CheckIn.
  // Pesa ~190 KB vs ~5.4 MB de SSD MobileNet — crítico en iPad sin WebGL.
  // SSD MobileNet se carga como opcional: si los archivos no están en /models/,
  // identifyFace degrada automáticamente a TinyFaceDetector.
  _loadingPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
      .then(() => { _tinyReady = true; }),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)
      .then(() => { _ssdReady = true; })
      .catch(() => {}),
  ])
    .then(() => {
      _modelsReady = true;
      _loadingPromise = null;
      console.info('[FaceService] Modelos cargados OK');
    })
    .catch((err) => {
      _loadingPromise = null;
      console.error('[FaceService] Error cargando modelos:', err);
      throw err;
    });

  return _loadingPromise;
}

/** Indica si los modelos ya están en memoria y listos para usar. */
export function areModelsReady() {
  return _modelsReady;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACCIÓN DE DESCRIPTOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrae el descriptor facial de 128 dimensiones de un elemento de media.
 * Acepta HTMLVideoElement, HTMLImageElement o HTMLCanvasElement.
 *
 * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} mediaElement
 * @returns {Promise<Float32Array|null>}  null si no se detectó ningún rostro.
 */
export async function extractDescriptor(mediaElement) {
  if (!mediaElement) return null;
  if (!_modelsReady) await initFaceApi();

  // Usar TinyFaceDetector con inputSize 160 — no SsdMobilenetv1.
  // En CPU (iPad sin WebGL), SSD MobileNet procesaba el frame completo
  // a 300×300 con una red de 22 capas conv → 4-8 s por inferencia.
  // TinyFaceDetector con inputSize 160 usa una red de 7 capas y menos
  // de 1 MB de pesos → ~200-400 ms en CPU, lo que hace el enrolamiento usable.
  const detection = await faceapi
    .detectSingleFace(mediaElement, TINY_ENROLL_OPTIONS)
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection?.descriptor ?? null;
}

/**
 * Detección rápida (sin descriptor). Úsala para el buffer de estabilización en CheckIn.
 * Usa TinyFaceDetector si está disponible; cae a SSD ligero si no.
 * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} mediaElement
 * @returns {Promise<{ detected: boolean, score: number }>}
 */
export async function detectFaceScore(mediaElement) {
  if (!mediaElement || !_modelsReady) return { detected: false, score: 0 };
  const opts = _tinyReady ? TINY_OPTIONS : SSD_LIGHT_OPTIONS;
  const detection = await faceapi.detectSingleFace(mediaElement, opts);
  return { detected: !!detection, score: detection?.score ?? 0 };
}

/**
 * Identifica a qué persona pertenece el rostro visible en el elemento de media,
 * comparando contra TODOS los descriptores almacenados en IndexedDB.
 * Úsala para el auto-checkin anónimo en CheckIn (TAREA 3).
 *
 * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} mediaElement
 * @param {number} [threshold]  Distancia euclidiana máxima. Default: MATCH_THRESHOLD (0.50).
 * @returns {Promise<{ matricula: string|null, distance: number|null }>}
 */
export async function identifyFace(mediaElement, threshold = MATCH_THRESHOLD) {
  if (!mediaElement || !_modelsReady) return { matricula: null, distance: null };

  // Usar SSD solo si sus modelos se cargaron; de lo contrario Tiny.
  const opts = _ssdReady ? SSD_LIGHT_OPTIONS : TINY_ENROLL_OPTIONS;
  const detection = await faceapi
    .detectSingleFace(mediaElement, opts)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return { matricula: null, distance: null };

  const liveDescriptor = detection.descriptor;
  const records = await db.face_descriptors.toArray();
  if (!records.length) return { matricula: null, distance: null };

  let bestMatricula = null;
  let bestDistance = threshold;

  for (const rec of records) {
    if (!rec.descriptor || !rec.matricula) continue;
    const stored = new Float32Array(rec.descriptor);
    const dist = faceapi.euclideanDistance(liveDescriptor, stored);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatricula = rec.matricula;
    }
  }

  return {
    matricula: bestMatricula,
    distance: bestMatricula ? +bestDistance.toFixed(4) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPARACIÓN DE DESCRIPTORES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compara dos descriptores usando distancia euclidiana de face-api.js.
 * @param {Float32Array} live     Descriptor capturado en vivo.
 * @param {Float32Array|number[]} stored  Descriptor guardado (Float32Array o array plano).
 * @param {number} [threshold]    Umbral de distancia. Default: MATCH_THRESHOLD (0.50).
 * @returns {{ matched: boolean, distance: number }}
 */
export function compareFaces(live, stored, threshold = MATCH_THRESHOLD) {
  const storedTyped = stored instanceof Float32Array
    ? stored
    : new Float32Array(stored);
  const distance = faceapi.euclideanDistance(live, storedTyped);
  return { matched: distance <= threshold, distance: +distance.toFixed(4) };
}

/**
 * Promedia un array de descriptores en un único vector representativo.
 * Calcula la media aritmética elemento a elemento sobre los 128 índices.
 * Usar con al menos 2 capturas; 3 ángulos (frente, izquierda, derecha) es lo recomendado.
 * @param {Float32Array[]} descriptors
 * @returns {Float32Array}
 */
export function averageDescriptors(descriptors) {
  const len = descriptors[0].length; // 128
  const result = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const d of descriptors) sum += d[i];
    result[i] = sum / descriptors.length;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCIA EN INDEXEDDB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recupera el descriptor guardado de un empleado desde IndexedDB.
 * @param {string} matricula  Ej. "ST-ABCD-123"
 * @returns {Promise<Float32Array|null>}
 */
export async function loadStoredDescriptor(matricula) {
  const record = await db.face_descriptors.get(matricula);
  if (!record?.descriptor) return null;
  return new Float32Array(record.descriptor);
}

/**
 * Guarda o actualiza el descriptor facial de un empleado en IndexedDB.
 * El descriptor se serializa como array plano (compatible con JSON/Dexie).
 * @param {string} matricula
 * @param {Float32Array|number[]} descriptor
 */
export async function saveDescriptor(matricula, descriptor) {
  await db.face_descriptors.put({
    matricula,
    descriptor: Array.from(descriptor),
    enrolled_at: new Date().toISOString(),
  });
}

/** Elimina el descriptor de un empleado de IndexedDB. */
export async function deleteDescriptor(matricula) {
  await db.face_descriptors.delete(matricula);
}

/** Devuelve todas las matrículas con descriptor guardado. */
export async function listEnrolledMatriculas() {
  const records = await db.face_descriptors.toArray();
  return records.map((r) => r.matricula);
}

// ─────────────────────────────────────────────────────────────────────────────
// API DE ALTO NIVEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flujo completo de verificación: extrae descriptor del elemento live,
 * busca el descriptor guardado para esa matrícula y los compara.
 *
 * Política fail-open:
 *   - NO_FACE_DETECTED → rechazar (pedir que se coloque bien frente a la cámara)
 *   - NOT_ENROLLED     → permitir (el empleado aún no tiene rostro registrado)
 *   - MATCH            → permitir
 *   - NO_MATCH         → rechazar
 *
 * @param {HTMLVideoElement|HTMLImageElement} mediaElement
 * @param {string} matricula
 * @returns {Promise<{ verified: boolean, distance: number|null, reason: string }>}
 */
export async function verifyFace(mediaElement, matricula) {
  const liveDescriptor = await extractDescriptor(mediaElement);

  if (!liveDescriptor) {
    return { verified: false, distance: null, reason: 'NO_FACE_DETECTED' };
  }

  const storedDescriptor = await loadStoredDescriptor(matricula);

  if (!storedDescriptor) {
    // Fail-open: empleado no enrolado, no bloqueamos su acceso.
    return { verified: true, distance: null, reason: 'NOT_ENROLLED' };
  }

  const { matched, distance } = compareFaces(liveDescriptor, storedDescriptor);
  return {
    verified: matched,
    distance,
    reason: matched ? 'MATCH' : 'NO_MATCH',
  };
}
