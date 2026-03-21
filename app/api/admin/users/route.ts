import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listUsers, addUser, removeUser, isUserAdmin, setUserAdmin } from '@/lib/users';
import { initSchema } from '@/lib/schema';

export const runtime = 'nodejs';

const PROTECTED_EMAIL = (process.env.SEED_EMAIL ?? 'mail@robgregg.com').toLowerCase();

async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const admin = await isUserAdmin(session.email);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET() {
  await initSchema();
  const denied = await requireAdmin();
  if (denied) return denied;

  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  await initSchema();
  const denied = await requireAdmin();
  if (denied) return denied;

  let email: string;
  try {
    const body = await req.json();
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!email || !email.includes('@') || email.length > 255) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  await initSchema();
  await addUser(email, 'admin');
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  await initSchema();
  const denied = await requireAdmin();
  if (denied) return denied;

  let id: number, makeAdmin: boolean;
  try {
    const body = await req.json();
    id = Number(body.id);
    makeAdmin = Boolean(body.isAdmin);
    if (!id || isNaN(id)) throw new Error('invalid id');
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const users = await listUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Cannot demote the primary admin
  if (target.email.toLowerCase() === PROTECTED_EMAIL && !makeAdmin) {
    return NextResponse.json({ error: 'Cannot remove admin from primary user' }, { status: 403 });
  }

  await setUserAdmin(id, makeAdmin);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  await initSchema();
  const denied = await requireAdmin();
  if (denied) return denied;

  let id: number;
  try {
    const body = await req.json();
    id = Number(body.id);
    if (!id || isNaN(id)) throw new Error('invalid id');
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const users = await listUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.email.toLowerCase() === PROTECTED_EMAIL) {
    return NextResponse.json({ error: 'Cannot remove the primary admin user' }, { status: 403 });
  }

  await removeUser(id);
  return NextResponse.json({ success: true });
}
