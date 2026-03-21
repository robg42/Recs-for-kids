import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { listUsers, addUser, removeUser } from '@/lib/users';
import { initSchema } from '@/lib/schema';

export const runtime = 'nodejs';

async function requireAdmin() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  await initSchema();
  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
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

export async function DELETE(req: NextRequest) {
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

  await removeUser(id);
  return NextResponse.json({ success: true });
}
