import { PRICE_CATEGORIES, type PriceCategory, type Registration } from './types';
import { PricingError } from './errors';

/**
 * Cálculo de precios (Fase 2). Dominio puro y portable: sin red, sin floats.
 *
 * El precio NO es fijo. Depende de:
 *  - la **categoría** del asistente (socio / no-socio),
 *  - la **tanda** vigente según la fecha (early-bird vs tardío).
 *
 * Todos los montos van en **centavos enteros** para evitar errores de coma
 * flotante. La config es inyectable (la arma el factory desde env/DB), así el
 * dominio no decide de dónde salen los números.
 */

/** Precio por categoría, en centavos. */
export type TierPrices = Record<PriceCategory, number>;

/** Una tanda: rango de fechas semiabierto `[from, to)` y su precio por categoría. */
export interface PricingTier {
  /** Identificador legible (ej: "early-bird"). Para trazas y breakdown. */
  id: string;
  from: Date;
  to: Date;
  prices: TierPrices;
}

/** Configuración de precios de un evento. */
export interface PricingConfig {
  /** Código ISO de moneda (ej: "UYU"). */
  currency: string;
  tiers: PricingTier[];
}

/** Detalle de cuánto aporta cada categoría al total. */
export type PriceBreakdown = Record<
  PriceCategory,
  { count: number; unitCents: number; subtotalCents: number }
>;

export interface PriceQuote {
  amountCents: number;
  currency: string;
  /** Tanda usada para cotizar. */
  tierId: string;
  breakdown: PriceBreakdown;
}

/** Categoría efectiva de un asistente (default `no-socio` si no se declaró). */
function categoryOf(category: PriceCategory | undefined): PriceCategory {
  return category ?? 'no-socio';
}

/** Devuelve la tanda vigente en `now` (rango semiabierto), o lanza. */
function activeTier(config: PricingConfig, now: Date): PricingTier {
  const ts = now.getTime();
  const tier = config.tiers.find((t) => t.from.getTime() <= ts && ts < t.to.getTime());
  if (!tier) {
    throw new PricingError(`No hay tanda de precios vigente para ${now.toISOString()}`);
  }
  return tier;
}

/**
 * Cotiza una registración a la fecha `now`. Suma el precio de cada asistente
 * según su categoría en la tanda vigente. Lanza {@link PricingError} si no hay
 * tanda para esa fecha.
 */
export function computePrice(
  registration: Pick<Registration, 'attendees'>,
  config: PricingConfig,
  now: Date,
): PriceQuote {
  const tier = activeTier(config, now);

  const breakdown = Object.fromEntries(
    PRICE_CATEGORIES.map((cat) => [
      cat,
      { count: 0, unitCents: tier.prices[cat], subtotalCents: 0 },
    ]),
  ) as PriceBreakdown;

  for (const attendee of registration.attendees) {
    const cat = categoryOf(attendee.category);
    const line = breakdown[cat];
    line.count += 1;
    line.subtotalCents += tier.prices[cat];
  }

  const amountCents = PRICE_CATEGORIES.reduce((sum, cat) => sum + breakdown[cat].subtotalCents, 0);

  return { amountCents, currency: config.currency, tierId: tier.id, breakdown };
}
