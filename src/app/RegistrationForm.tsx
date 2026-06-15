'use client';

import { useState } from 'react';
import { EXPERIENCE_LEVELS, type Attendee } from '@core/domain/types';

const emptyAttendee = (): Attendee => ({
  fullName: '',
  country: '',
  documentNumber: '',
  experience: 'beginner',
  emergencyContact: { name: '', phone: '', relation: '' },
  medicalInsurance: '',
  waiverAccepted: false,
});

const WAIVER_URL = process.env.NEXT_PUBLIC_WAIVER_URL ?? '#';

export function RegistrationForm() {
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [attendees, setAttendees] = useState<Attendee[]>([emptyAttendee()]);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const setQuantity = (n: number) => {
    const next = Math.max(1, n || 1);
    setAttendees((prev) => {
      const copy = [...prev];
      while (copy.length < next) copy.push(emptyAttendee());
      copy.length = next;
      return copy;
    });
  };

  const updateAttendee = (i: number, patch: Partial<Attendee>) =>
    setAttendees((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const updateContact = (i: number, patch: Partial<Attendee['emergencyContact']>) =>
    setAttendees((prev) =>
      prev.map((a, idx) =>
        idx === i ? { ...a, emergencyContact: { ...a.emergencyContact, ...patch } } : a,
      ),
    );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerName, buyerEmail, quantity: attendees.length, attendees }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error al registrar');
        setStatus('idle');
        return;
      }
      setConfirmationId(data.id);
      setEmailSent(Boolean(data.emailSent));
      setStatus('done');
    } catch {
      setError('No se pudo conectar. Intentá de nuevo.');
      setStatus('idle');
    }
  };

  if (status === 'done') {
    return (
      <div className="success" role="status">
        <h2>¡Registro confirmado!</h2>
        <p>Tu código de registro es <strong>{confirmationId}</strong>.</p>
        {emailSent ? (
          <p>Te enviamos un email de confirmación.</p>
        ) : (
          <p>Guardá este código: no pudimos enviarte el email de confirmación.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <fieldset>
        <legend>Comprador</legend>
        <label>
          Nombre
          <input
            name="buyerName"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            required
          />
        </label>
        <label>
          Email
          <input
            name="buyerEmail"
            type="email"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Cantidad de personas
          <input
            name="quantity"
            type="number"
            min={1}
            value={attendees.length}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
      </fieldset>

      {attendees.map((a, i) => (
        <fieldset key={i} data-attendee={i}>
          <legend>Asistente {i + 1}</legend>
          <label>
            Nombre completo
            <input
              value={a.fullName}
              onChange={(e) => updateAttendee(i, { fullName: e.target.value })}
              required
            />
          </label>
          <label>
            País de origen
            <input
              value={a.country}
              onChange={(e) => updateAttendee(i, { country: e.target.value })}
              required
            />
          </label>
          <label>
            Número de documento
            <input
              value={a.documentNumber}
              onChange={(e) => updateAttendee(i, { documentNumber: e.target.value })}
              required
            />
          </label>
          <label>
            Experiencia
            <select
              value={a.experience}
              onChange={(e) =>
                updateAttendee(i, { experience: e.target.value as Attendee['experience'] })
              }
            >
              {EXPERIENCE_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mutualista / seguro médico
            <input
              value={a.medicalInsurance}
              onChange={(e) => updateAttendee(i, { medicalInsurance: e.target.value })}
              required
            />
          </label>
          <label>
            Contacto de emergencia — nombre
            <input
              value={a.emergencyContact.name}
              onChange={(e) => updateContact(i, { name: e.target.value })}
              required
            />
          </label>
          <label>
            Contacto de emergencia — teléfono
            <input
              value={a.emergencyContact.phone}
              onChange={(e) => updateContact(i, { phone: e.target.value })}
              required
            />
          </label>
          <label>
            Contacto de emergencia — relación
            <input
              value={a.emergencyContact.relation}
              onChange={(e) => updateContact(i, { relation: e.target.value })}
              required
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={a.waiverAccepted}
              onChange={(e) => updateAttendee(i, { waiverAccepted: e.target.checked })}
              required
            />
            Acepto el <a href={WAIVER_URL} target="_blank" rel="noreferrer">deslinde de responsabilidad</a>
          </label>
        </fieldset>
      ))}

      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Enviando…' : 'Registrarme'}
      </button>
    </form>
  );
}
