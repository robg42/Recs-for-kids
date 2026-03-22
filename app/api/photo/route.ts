import { NextRequest, NextResponse } from 'next/server';

// Proxy server: handles two modes
//   ?name=places/.../photos/...   → Google Places photo (API key auth)
//   ?url=https://...              → External image (Eventbrite, Serper thumbnails)
//
// Both modes keep the img-src 'self' CSP rule clean — all image traffic
// flows through this origin.  Auth is enforced upstream (rfk-session cookie).

const VALID_PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

// RFC 1918 + loopback + link-local — block to prevent SSRF
const PRIVATE_IP_RE =
  /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fc00:|fd|fe80:)/i;

const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml',
]);

// ─── Google Places photo ──────────────────────────────────────────────────────

async function handlePlacesPhoto(name: string): Promise<NextResponse> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('[photo] GOOGLE_PLACES_API_KEY not set');
    return new NextResponse('Not configured', { status: 503 });
  }

  console.log(`[photo] Fetching Places photo: ${name}`);
  const metaUrl = `https://places.googleapis.com/v1/${name}/media?key=${apiKey}&maxWidthPx=800&skipHttpRedirect=true`;
  const metaRes = await fetch(metaUrl, { next: { revalidate: 86400 } });

  if (!metaRes.ok) {
    const body = await metaRes.text().catch(() => '');
    console.error(`[photo] Places API ${metaRes.status} for ${name}: ${body.slice(0, 300)}`);
    return new NextResponse('Photo not found', { status: 404 });
  }

  const meta = (await metaRes.json()) as { photoUri?: string };
  if (!meta.photoUri) {
    console.error(`[photo] No photoUri in metadata for ${name}`, JSON.stringify(meta).slice(0, 300));
    return new NextResponse('No photo URI', { status: 404 });
  }
  console.log(`[photo] Got photoUri for ${name}: ${meta.photoUri.slice(0, 100)}...`);

  const imgRes = await fetch(meta.photoUri);
  if (!imgRes.ok) return new NextResponse('Image fetch failed', { status: 502 });

  const buffer = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}

// ─── External image proxy ─────────────────────────────────────────────────────

async function handleExternalImage(rawUrl: string): Promise<NextResponse> {
  // 1. Must be https
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return new NextResponse('Bad URL', { status: 400 }); }

  if (parsed.protocol !== 'https:') return new NextResponse('HTTPS only', { status: 400 });

  // 2. Block private IPs (SSRF guard) — check the hostname
  const host = parsed.hostname;
  if (PRIVATE_IP_RE.test(host) || host === 'localhost') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 3. Fetch with a tight timeout — this is a fire-and-forget background enrichment
  //    so slow external hosts should not block the response.
  let imgRes: Response;
  try {
    imgRes = await fetch(rawUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'RecsForKids/1.0 (image proxy)' },
    });
  } catch {
    return new NextResponse('Image fetch failed', { status: 502 });
  }

  if (!imgRes.ok) return new NextResponse('Image not found', { status: 404 });

  // 4. Validate content-type
  const ct = (imgRes.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_CONTENT_TYPES.has(ct)) {
    return new NextResponse('Not an image', { status: 415 });
  }

  // 5. Cap size at 10 MB to avoid unbounded memory use
  const MAX_BYTES = 10 * 1024 * 1024;
  const buffer = await imgRes.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return new NextResponse('Image too large', { status: 413 });
  }

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': ct || 'image/jpeg',
      // Shorter TTL than Google Places — external URLs may rotate/expire
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  const externalUrl = req.nextUrl.searchParams.get('url');

  try {
    if (name) {
      if (!VALID_PHOTO_NAME.test(name)) {
        console.warn(`[photo] Rejected invalid photo name: ${name.slice(0, 100)}`);
        return new NextResponse('Bad request', { status: 400 });
      }
      return await handlePlacesPhoto(name);
    }

    if (externalUrl) {
      console.log(`[photo] Proxying external image: ${externalUrl.slice(0, 100)}`);
      return await handleExternalImage(externalUrl);
    }

    console.warn('[photo] Request missing both name and url params');
    return new NextResponse('Missing name or url', { status: 400 });
  } catch (err) {
    console.error('[photo] Unexpected error:', err);
    return new NextResponse('Server error', { status: 500 });
  }
}
