import { NextResponse } from 'next/server';
import { buildDeps } from '@adapters/factory';

// Adapters perezosos (igual que /api/register): no construir al importar.
let storage: ReturnType<typeof buildDeps>['storage'] | null = null;
function getStorage() {
  storage ??= buildDeps().storage;
  return storage;
}

/**
 * Estado de una registración — SOLO el `status`, nunca datos sensibles
 * (documento, contacto de emergencia, mutualista). Es la fuente de verdad para
 * "¿pagó?": la pantalla de retorno lo consulta en vez de confiar en el redirect
 * del navegador. Read-only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const registration = await getStorage().findById(id);
  if (!registration) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  }
  return NextResponse.json({ status: registration.status }, { status: 200 });
}
