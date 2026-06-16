'use client';

import { useState, type SyntheticEvent } from 'react';
import { EXPERIENCE_LEVELS, MAX_ATTENDEES, type Attendee } from '@core/domain/types';

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
// ponytail: flag gates the pay step (decisión de producto de ASU: ¿listo para
// cobrar?). Off = Fase 1 sin pago. On = botón "Pagar ahora" en la confirmación.
const PAYMENT_ENABLED = process.env.NEXT_PUBLIC_PAYMENT_ENABLED === 'true';

export function RegistrationForm() {
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [attendees, setAttendees] = useState<Attendee[]>([emptyAttendee()]);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const setQuantity = (n: number) => {
    const next = Math.min(MAX_ATTENDEES, Math.max(1, n || 1));
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

  const onSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerName, buyerEmail, attendees }),
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

  const onPay = async () => {
    if (!confirmationId) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: confirmationId }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setPayError(data.error ?? 'No se pudo iniciar el pago.');
        setPaying(false);
        return;
      }
      // Redirige al checkout del proveedor. La confirmación llega por webhook,
      // no por el retorno del navegador.
      window.location.href = data.checkoutUrl;
    } catch {
      setPayError('No se pudo conectar. Intentá de nuevo.');
      setPaying(false);
    }
  };

  if (status === 'done') {
    return (
      <div className="success" role="status">
        <h2>¡Registro confirmado!</h2>
        <p>
          Tu código de registro es <strong>{confirmationId}</strong>.
        </p>
        {emailSent ? (
          <p>Te enviamos un email de confirmación.</p>
        ) : (
          <p>Guardá este código: no pudimos enviarte el email de confirmación.</p>
        )}
        {PAYMENT_ENABLED && (
          <>
            <p>Para completar tu inscripción, realizá el pago:</p>
            {payError && (
              <p className="error" role="alert">
                {payError}
              </p>
            )}
            <button type="button" onClick={onPay} disabled={paying}>
              {paying ? 'Redirigiendo…' : 'Pagar ahora'}
            </button>
          </>
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
            max={MAX_ATTENDEES}
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
            Acepto el{' '}
            <a href={WAIVER_URL} target="_blank" rel="noreferrer">
              deslinde de responsabilidad
            </a>
          </label>
        </fieldset>
      ))}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Enviando…' : 'Registrarme'}
      </button>
    </form>
  );
}
