/**
 * /api/blocked-places
 *
 * GET  — list the authenticated user's blocked places
 * POST — block a place for the authenticated user
 * DELETE (via POST body action:"unblock") — unblock a place
 *
 * Security:
 *  - All operations use session.email from getSession() — never from the request body.
 *  - place_id / place_name / address are validated and length-capped server-side.
 *  - A user can only read/mutate their own blocked places.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { initSchema } from '@/lib/schema';
import { blockPlace, unblockPlace, getBlockedPlaces } from '@/lib/blocked-places';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await initSchema();
  const places = await getBlockedPlaces(session.email);
  return NextResponse.json({ places });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, placeId, placeName, address } = body as Record<string, unknown>;

  // Validate all fields — none come from session, all from trusted client UI
  if (typeof placeId !== 'string' || placeId.trim().length === 0 || placeId.length > 500) {
    return NextResponse.json({ error: 'Invalid placeId' }, { status: 400 });
  }

  await initSchema();

  if (action === 'unblock') {
    await unblockPlace(session.email, placeId.trim());
    return NextResponse.json({ ok: true });
  }

  // Default action = block
  if (typeof placeName !== 'string' || placeName.trim().length === 0) {
    return NextResponse.json({ error: 'Invalid placeName' }, { status: 400 });
  }

  await blockPlace(
    session.email,
    placeId.trim(),
    placeName.trim().slice(0, 200),
    typeof address === 'string' ? address.trim().slice(0, 300) : ''
  );
  return NextResponse.json({ ok: true });
}
