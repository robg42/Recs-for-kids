import { NextRequest, NextResponse } from 'next/server';

// Proxy Google Places photos server-side so the API key never leaves the server.
// Auth is enforced upstream by proxy.ts (rfk-session cookie required).

const VALID_PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');

  if (!name || !VALID_PHOTO_NAME.test(name)) {
    return new NextResponse('Bad request', { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return new NextResponse('Not configured', { status: 503 });
  }

  try {
    // skipHttpRedirect=true returns JSON { photoUri } instead of a redirect
    const metaRes = await fetch(
      `https://places.googleapis.com/v1/${name}/media?key=${apiKey}&maxWidthPx=800&skipHttpRedirect=true`,
      { next: { revalidate: 86400 } }
    );

    if (!metaRes.ok) {
      return new NextResponse('Photo not found', { status: 404 });
    }

    const meta = (await metaRes.json()) as { photoUri?: string };
    if (!meta.photoUri) {
      return new NextResponse('No photo URI', { status: 404 });
    }

    // Proxy the image bytes so img-src 'self' in CSP stays clean
    const imgRes = await fetch(meta.photoUri);
    if (!imgRes.ok) {
      return new NextResponse('Image fetch failed', { status: 502 });
    }

    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err) {
    console.error('[photo] Error fetching photo:', err);
    return new NextResponse('Server error', { status: 500 });
  }
}
