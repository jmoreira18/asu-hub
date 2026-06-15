import type { EmailPort } from '@core/ports/email';
import type { Registration } from '@core/domain/types';

/** Email de desarrollo: imprime en consola en vez de enviar. */
export class ConsoleEmail implements EmailPort {
  constructor(private readonly logger: Pick<Console, 'info'> = console) {}

  async sendConfirmation(registration: Registration): Promise<void> {
    this.logger.info(
      `[email] confirmación para ${registration.buyerEmail} (registro ${registration.id})`,
    );
  }
}
