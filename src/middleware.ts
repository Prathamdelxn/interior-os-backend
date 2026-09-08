// =============================================================================
// InteriorOS Backend — Universal CORS Middleware (Allow All Origins)
// =============================================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  // Allow all origins: reflect requesting origin if present, or '*'
  const allowOrigin = origin || '*';

  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    response.headers.set('Access-Control-Allow-Origin', allowOrigin);
    if (origin) {
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-Organization-Id, Accept, Origin, Range, X-CSRF-Token, X-Api-Version'
    );
    response.headers.set('Access-Control-Max-Age', '86400');
    return response;
  }

  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', allowOrigin);
  if (origin) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-Organization-Id, Accept, Origin, Range, X-CSRF-Token, X-Api-Version'
  );
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
