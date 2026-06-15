import type { PricingConfig } from '@core/domain/pricing';
import { parsePricingConfig } from '@core/domain/schemas';

/**
 * Config de precios de desarrollo: una única tanda amplia, para correr local y
 * E2E sin definir `PRICING_CONFIG`. NO usar en producción (los montos reales y
 * las tandas los define ASU). Socio paga solo remera; no-socio paga full.
 */
export const DEV_PRICING: PricingConfig = {
  currency: 'UYU',
  tiers: [
    {
      id: 'dev',
      from: new Date('2000-01-01T00:00:00Z'),
      to: new Date('2100-01-01T00:00:00Z'),
      prices: { socio: 50000, 'no-socio': 150000 },
    },
  ],
};

/**
 * Carga la config de precios desde `PRICING_CONFIG` (JSON) si está definida;
 * si no, cae en {@link DEV_PRICING}. El JSON se valida con el schema del dominio.
 */
export function loadPricingConfig(raw: string | undefined): PricingConfig {
  if (!raw) return DEV_PRICING;
  return parsePricingConfig(JSON.parse(raw));
}
