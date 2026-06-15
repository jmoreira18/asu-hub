import type { EmergencyExportPort } from '@core/ports/emergency-export';
import type { Registration } from '@core/domain/types';
import type { FetchLike } from '../storage/supabase-storage';

export interface GoogleSheetsExportConfig {
  /**
   * URL del Web App de Google Apps Script que agrega filas a la planilla.
   * Delegamos la auth de Google al script (ver docs/emergency-access.md).
   */
  webhookUrl: string;
  /** Token compartido para que el script rechace requests ajenos. */
  secret: string;
  fetchImpl?: FetchLike;
}

/** Una fila aplanada por asistente, pensada para lectura humana. */
export interface EmergencyRow {
  registrationId: string;
  buyerName: string;
  buyerEmail: string;
  attendeeName: string;
  country: string;
  documentNumber: string;
  experience: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  medicalInsurance: string;
}

/** Aplana una registración a una fila por asistente para la planilla. */
export function toEmergencyRows(registration: Registration): EmergencyRow[] {
  return registration.attendees.map((a) => ({
    registrationId: registration.id,
    buyerName: registration.buyerName,
    buyerEmail: registration.buyerEmail,
    attendeeName: a.fullName,
    country: a.country,
    documentNumber: a.documentNumber,
    experience: a.experience,
    emergencyContactName: a.emergencyContact.name,
    emergencyContactPhone: a.emergencyContact.phone,
    emergencyContactRelation: a.emergencyContact.relation,
    medicalInsurance: a.medicalInsurance,
  }));
}

/**
 * Adapter de exportación de emergencia hacia Google Sheets, vía un Web App
 * de Apps Script. Mantiene una planilla read-only que los organizadores
 * abren (y cachean offline) en el spot.
 */
export class GoogleSheetsExport implements EmergencyExportPort {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly config: GoogleSheetsExportConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async sync(registration: Registration): Promise<void> {
    const res = await this.fetchImpl(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: this.config.secret, rows: toEmergencyRows(registration) }),
    });
    if (!res.ok) throw new Error(`Google Sheets sync falló: ${res.status}`);
  }
}
