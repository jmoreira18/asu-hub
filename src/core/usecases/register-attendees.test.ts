import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAttendees, type RegisterAttendeesDeps } from './register-attendees';
import { ValidationError } from '../domain/errors';
import type { Attendee, Registration } from '../domain/types';

const validInput = () => ({
  buyerName: 'Ana Pérez',
  buyerEmail: 'ana@example.com',
  quantity: 1,
  attendees: [
    {
      fullName: 'Ana Pérez',
      country: 'Uruguay',
      documentNumber: '1234567-8',
      experience: 'beginner',
      emergencyContact: { name: 'Luis', phone: '+59899123456', relation: 'Hermano' },
      medicalInsurance: 'CASMU',
      waiverAccepted: true,
    } satisfies Attendee,
  ],
});

const savedRegistration = (): Registration => ({
  ...validInput(),
  id: 'reg-1',
  status: 'confirmed',
  createdAt: new Date('2026-06-14T00:00:00Z'),
});

function makeDeps(): RegisterAttendeesDeps {
  return {
    storage: {
      save: vi.fn().mockResolvedValue(savedRegistration()),
      findById: vi.fn(),
      updateStatus: vi.fn(),
    },
    emergency: { sync: vi.fn().mockResolvedValue(undefined) },
    email: { sendConfirmation: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('registerAttendees', () => {
  let deps: RegisterAttendeesDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('guarda como "confirmed", sincroniza emergencia y manda email', async () => {
    const result = await registerAttendees(deps)(validInput());

    expect(deps.storage.save).toHaveBeenCalledWith(expect.anything(), 'confirmed');
    expect(deps.emergency.sync).toHaveBeenCalledWith(result.registration);
    expect(deps.email.sendConfirmation).toHaveBeenCalledWith(result.registration);
    expect(result.emailSent).toBe(true);
    expect(result.registration.id).toBe('reg-1');
  });

  it('lanza ValidationError y no toca storage si la entrada es inválida', async () => {
    await expect(registerAttendees(deps)({ buyerEmail: 'x' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(deps.storage.save).not.toHaveBeenCalled();
    expect(deps.emergency.sync).not.toHaveBeenCalled();
  });

  it('no envía email si la sincronización de emergencia falla (crítico)', async () => {
    deps.emergency.sync = vi.fn().mockRejectedValue(new Error('sheets down'));
    await expect(registerAttendees(deps)(validInput())).rejects.toThrow('sheets down');
    expect(deps.email.sendConfirmation).not.toHaveBeenCalled();
  });

  it('el registro sobrevive a un fallo de email (best-effort)', async () => {
    deps.email.sendConfirmation = vi.fn().mockRejectedValue(new Error('resend 500'));
    const result = await registerAttendees(deps)(validInput());
    expect(result.emailSent).toBe(false);
    expect(result.registration.id).toBe('reg-1');
  });

  it('propaga el error si falla el guardado (crítico)', async () => {
    deps.storage.save = vi.fn().mockRejectedValue(new Error('db down'));
    await expect(registerAttendees(deps)(validInput())).rejects.toThrow('db down');
    expect(deps.emergency.sync).not.toHaveBeenCalled();
  });
});
