import { describe, it, expect } from 'vitest';
import { parseRegistrationInput, attendeeSchema } from './schemas';
import { ValidationError } from './errors';
import { MAX_ATTENDEES, type Attendee } from './types';

const validAttendee = (over: Partial<Attendee> = {}): Attendee => ({
  fullName: 'Ana Pérez',
  country: 'Uruguay',
  documentNumber: '1.234.567-8',
  experience: 'beginner',
  emergencyContact: { name: 'Luis Pérez', phone: '+59899123456', relation: 'Hermano' },
  medicalInsurance: 'CASMU',
  waiverAccepted: true,
  ...over,
});

const validInput = (over: Record<string, unknown> = {}) => ({
  buyerName: 'Ana Pérez',
  buyerEmail: 'ana@example.com',
  attendees: [validAttendee()],
  ...over,
});

describe('parseRegistrationInput', () => {
  it('acepta una entrada válida y devuelve datos tipados', () => {
    const data = parseRegistrationInput(validInput());
    expect(data.buyerEmail).toBe('ana@example.com');
    expect(data.attendees).toHaveLength(1);
  });

  it('acepta varios asistentes', () => {
    const data = parseRegistrationInput(
      validInput({ attendees: [validAttendee(), validAttendee({ fullName: 'Bob' })] }),
    );
    expect(data.attendees).toHaveLength(2);
  });

  it('lanza ValidationError con email inválido', () => {
    expect(() => parseRegistrationInput(validInput({ buyerEmail: 'no-es-email' }))).toThrow(
      ValidationError,
    );
  });

  it('rechaza lista de asistentes vacía', () => {
    expect(() => parseRegistrationInput(validInput({ attendees: [] }))).toThrow(ValidationError);
  });

  it('rechaza más asistentes que el tope permitido', () => {
    const tooMany = Array.from({ length: MAX_ATTENDEES + 1 }, () => validAttendee());
    try {
      parseRegistrationInput(validInput({ attendees: tooMany }));
      expect.unreachable('debió lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).issues.attendees).toBeDefined();
    }
  });

  it('agrupa issues por ruta de campo', () => {
    try {
      parseRegistrationInput(validInput({ buyerName: '', buyerEmail: 'x' }));
      expect.unreachable('debió lanzar');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.issues.buyerName).toBeDefined();
      expect(err.issues.buyerEmail).toBeDefined();
    }
  });

  it('usa clave "_" cuando el issue no tiene ruta', () => {
    // Un valor no-objeto produce un issue sin path -> clave "_".
    try {
      parseRegistrationInput(null);
      expect.unreachable('debió lanzar');
    } catch (e) {
      expect((e as ValidationError).issues._).toBeDefined();
    }
  });
});

describe('attendeeSchema (deslinde obligatorio)', () => {
  it('rechaza waiverAccepted = false', () => {
    const r = attendeeSchema.safeParse(validAttendee({ waiverAccepted: false }));
    expect(r.success).toBe(false);
  });

  it('rechaza waiver ausente', () => {
    const sinWaiver: Partial<Attendee> = validAttendee();
    delete sinWaiver.waiverAccepted;
    const r = attendeeSchema.safeParse(sinWaiver);
    expect(r.success).toBe(false);
  });

  it('rechaza nivel de experiencia inválido', () => {
    const r = attendeeSchema.safeParse(validAttendee({ experience: 'pro' as never }));
    expect(r.success).toBe(false);
  });

  it('rechaza contacto de emergencia incompleto', () => {
    const r = attendeeSchema.safeParse(
      validAttendee({ emergencyContact: { name: '', phone: '', relation: '' } }),
    );
    expect(r.success).toBe(false);
  });

  it('recorta espacios en los campos de texto', () => {
    const r = attendeeSchema.safeParse(validAttendee({ fullName: '  Ana  ' }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fullName).toBe('Ana');
  });
});
