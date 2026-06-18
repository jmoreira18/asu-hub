'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type View = 'loading' | 'paid' | 'pending' | 'failed' | 'unknown';

/**
 * Pantalla de retorno tras el pago (back_urls de MP / dev-checkout). Regla de
 * oro: NO se confía en el `?status=` del redirect para dar por PAGO — eso solo
 * sale de la DB (`paid`, que pone el webhook tras verificar contra el proveedor).
 * El `?status=` solo se usa para distinguir un rechazo (back_urls.failure) de una
 * confirmación pendiente: sin esto, una tarjeta rechazada veía "en proceso, te
 * avisaremos por email" — un mensaje falso (nunca confirma). Trust mínimo: peor
 * caso es mostrar "rechazado" ante un webhook demorado; la DB sigue mandando.
 */
function Retorno() {
  const params = useSearchParams();
  const registrationId = params.get('external_reference') ?? '';
  const redirectStatus = params.get('status') ?? '';
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
        else if (data?.status === 'confirmed')
          setView(
            redirectStatus === 'rejected' || redirectStatus === 'failure' ? 'failed' : 'pending',
          );
        else setView('unknown');
      })
      .catch(() => setView('unknown'));
  }, [registrationId, redirectStatus]);

  if (view === 'loading') return <p>Verificando el pago…</p>;
  if (view === 'paid')
    return (
      <>
        <h1>¡Pago confirmado!</h1>
        <p>Tu inscripción quedó paga. Te enviamos un email de confirmación.</p>
      </>
    );
  if (view === 'failed')
    return (
      <>
        <h1>El pago no se pudo procesar</h1>
        <p>
          Tu pago fue rechazado o cancelado. Tu registro sigue guardado: volvé a intentar el pago
          desde la confirmación, o escribinos con tu código de registro.
        </p>
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
