import { NextResponse } from 'next/server';
import { registerAttendees } from '@core/usecases/register-attendees';
import { ValidationError } from '@core/domain/errors';
import { buildDeps } from '@adapters/factory';

// Adapters construidos una vez por proceso (memoria persiste en dev).
const handle = registerAttendees(buildDeps());

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  try {
    const result = await handle(body);
    return NextResponse.json(
      { id: result.registration.id, emailSent: result.emailSent },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
