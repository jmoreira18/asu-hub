import type { EmergencyExportPort } from '@core/ports/emergency-export';
import type { Registration } from '@core/domain/types';
import { toEmergencyRows, type EmergencyRow } from './google-sheets-export';

/** Export de emergencia en memoria, para desarrollo local y E2E. */
export class MemoryEmergencyExport implements EmergencyExportPort {
  readonly rows: EmergencyRow[] = [];

  async sync(registration: Registration): Promise<void> {
    this.rows.push(...toEmergencyRows(registration));
  }
}
