// =============================================================================
// InteriorOS Backend — Auth API Routes: Login
// =============================================================================

import { NextRequest } from 'next/server';
import { login, AppError } from '@/services/auth.service';
import { loginSchema } from '@/lib/validations';
import { successResponse, errorResponse, validationErrorResponse, serverErrorResponse } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
console.log("hello",process.env.MONGODB_URI);
    // Validate input
    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return validationErrorResponse(errors);
    }

    const deviceInfo = {
      userAgent: req.headers.get('user-agent') || undefined,
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
    };

    const result = await login(validation.data, deviceInfo);
    return successResponse(result, 'Login successful');
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.statusCode);
    }
    console.error('Login error:', error);
    return new Response(JSON.stringify({ error: String(error), stack: (error as Error).stack }), { status: 500 });
  }
}
