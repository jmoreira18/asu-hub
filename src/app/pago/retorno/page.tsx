'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type View = 'loading' | 'paid' | 'pending' | 'unknown';

/**
 * Pantalla de retorno tras el pago (back_urls de MP / dev-checkout). Regla de
 * oro: NO se confía en el `?status=` del redirect. La verdad es el estado en la
 * DB, que solo pasa a `paid` cuando el webhook verificó el pago contra el
 * proveedor. Por eso consultamos `/api/registrations/:id` y mostramos eso.
 */
function Retorno() {
  const params = useSearchParams();
  const registrationId = params.get('external_reference') ?? '';
  const [view, setView] = useState<View>('loading');

  useEffect(() => {
    if (!registrationId) {
      setView('unknown');
      return;
    }
    fetch(`/api/registrations/${encodeURIComponent(registrationId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.status === 'paid') setView('paid');
        else if (data?.status === 'confirmed') setView('pending');
        else setView('unknown');
      })
      .catch(() => setView('unknown'));
  }, [registrationId]);

  if (view === 'loading') return <p>Verificando el pago…</p>;
  if (view === 'paid')
    return (
      <>
        <h1>¡Pago confirmado!</h1>
        <p>Tu inscripción quedó paga. Te enviamos un email de confirmación.</p>
      </>
    );
  if (view === 'pending')
    return (
      <>
        <h1>Pago en proceso</h1>
        <p>
          Todavía no recibimos la confirmación del pago. Si ya pagaste, puede tardar unos minutos;
          te avisaremos por email al confirmarse.
        </p>
      </>
    );
  return (
    <>
      <h1>No pudimos verificar el pago</h1>
      <p>Si ya pagaste, escribinos con tu código de registro.</p>
    </>
  );
}

export default function RetornoPage() {
  return (
    <main role="status">
      <Suspense fallback={<p>Verificando el pago…</p>}>
        <Retorno />
      </Suspense>
    </main>
  );
}
