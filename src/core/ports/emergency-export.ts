import type { Registration } from '../domain/types';

/**
 * Puerto de exportación para acceso de emergencia. Implementado por el
 * adapter de Google Sheets: copia los datos a una planilla read-only que
 * los organizadores pueden abrir (y cachear offline) en el spot.
 */
export interface EmergencyExportPort {
  /** Agrega/actualiza las filas de emergencia de una registración. */
  sync(registration: Registration): Promise<void>;
}
