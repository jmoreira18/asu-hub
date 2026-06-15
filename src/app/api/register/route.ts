import { NextResponse } from 'next/server';
import { registerAttendees } from '@core/usecases/register-attendees';
import { ValidationError } from '@core/domain/errors';
import { buildDeps } from '@adapters/factory';

// Adapters construidos perezosamente en el primer request y cacheados por
// proceso (memoria persiste en dev). No se construyen al importar el módulo:
// `next build` evalúa rutas sin variables de entorno y buildDeps lanzaría.
let handle: ReturnType<typeof registerAttendees> | null = null;
function getHandle() {
  return (handle ??= registerAttendees(buildDeps()));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  try {
    const result = await getHandle()(body);
    if (!result.emergencySynced) {
      // Registro persistido pero la planilla de emergencia no se sincronizó:
      // requiere reintento manual/automático. No rompe el registro.
      console.error(
        `[register] emergencia NO sincronizada para registro ${result.registration.id}`,
      );
    }
    return NextResponse.json(
      {
        id: result.registration.id,
        emergencySynced: result.emergencySynced,
        emailSent: result.emailSent,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
