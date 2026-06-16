import { describe, it, expect } from 'vitest';
import { computePrice, type PricingConfig } from './pricing';
import { PricingError } from './errors';
import type { Attendee } from './types';

const attendee = (category?: Attendee['category']): Attendee => ({
  fullName: 'X',
  country: 'Uruguay',
  documentNumber: '1',
  experience: 'beginner',
  emergencyContact: { name: 'A', phone: 'B', relation: 'C' },
  medicalInsurance: 'CASMU',
  waiverAccepted: true,
  ...(category ? { category } : {}),
});

const config: PricingConfig = {
  currency: 'UYU',
  tiers: [
    {
      id: 'early',
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-06-01T00:00:00Z'),
      prices: { socio: 10000, 'no-socio': 30000 },
    },
    {
      id: 'late',
      from: new Date('2026-06-01T00:00:00Z'),
      to: new Date('2026-07-01T00:00:00Z'),
      prices: { socio: 20000, 'no-socio': 50000 },
    },
  ],
};

describe('computePrice', () => {
  it('suma por categoría en la tanda vigente', () => {
    const reg = { attendees: [attendee('socio'), attendee('no-socio'), attendee('no-socio')] };
    const quote = computePrice(reg, config, new Date('2026-02-01T00:00:00Z'));

    expect(quote.tierId).toBe('early');
    expect(quote.currency).toBe('UYU');
    expect(quote.breakdown.socio).toEqual({ count: 1, unitCents: 10000, subtotalCents: 10000 });
    expect(quote.breakdown['no-socio']).toEqual({
      count: 2,
      unitCents: 30000,
      subtotalCents: 60000,
    });
    expect(quote.amountCents).toBe(70000);
  });

  it('trata un asistente sin categoría como no-socio', () => {
    const quote = computePrice(
      { attendees: [attendee()] },
      config,
      new Date('2026-02-01T00:00:00Z'),
    );
    expect(quote.breakdown['no-socio'].count).toBe(1);
    expect(quote.breakdown.socio.count).toBe(0);
    expect(quote.amountCents).toBe(30000);
  });

  it('elige la tanda por fecha (rango semiabierto: from inclusivo)', () => {
    const reg = { attendees: [attendee('socio')] };
    // Borde exacto del inicio de "late" → cae en late, no en early.
    const quote = computePrice(reg, config, new Date('2026-06-01T00:00:00Z'));
    expect(quote.tierId).toBe('late');
    expect(quote.amountCents).toBe(20000);
  });

  it('lanza PricingError si no hay tanda vigente para la fecha', () => {
    const reg = { attendees: [attendee('socio')] };
    expect(() => computePrice(reg, config, new Date('2025-01-01T00:00:00Z'))).toThrow(PricingError);
    // `to` es exclusivo: el instante final de la última tanda ya no aplica.
    expect(() => computePrice(reg, config, new Date('2026-07-01T00:00:00Z'))).toThrow(PricingError);
  });
});
