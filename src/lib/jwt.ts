// =============================================================================
// InteriorOS Backend — JWT Utilities
// =============================================================================

import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { env } from '@/config/env';
import type { IUser } from '@/models/user.model';

export interface JwtPayload {
  userId: string;
  email: string;
  organizationId: string;
  systemRole: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: number;
}

/**
 * Generate access + refresh token pair
 */
export function generateTokenPair(user: IUser): TokenPair {
  const payload: JwtPayload = {
    userId: user._id.toString(),
    email: user.email,
    organizationId: user.organizationId.toString(),
    systemRole: user.systemRole,
  };

  const secret: Secret = env.JWT_SECRET;
  const signOptions: SignOptions = {
    expiresIn: 3600, // 1 hour in seconds
  };

  const accessToken = jwt.sign(payload as object, secret, signOptions);

  const refreshToken = randomBytes(64).toString('hex');

  // Parse expiry to milliseconds
  const decoded = jwt.decode(accessToken) as jwt.JwtPayload;
  const accessTokenExpiry = decoded?.exp ? decoded.exp * 1000 : Date.now() + 60 * 60 * 1000;

  return { accessToken, refreshToken, accessTokenExpiry };
}

/**
 * Verify and decode access token
 */
export function verifyAccessToken(token: string): JwtPayload {
  const secret: Secret = env.JWT_SECRET;
  return jwt.verify(token, secret) as JwtPayload;
}

/**
 * Generate a random token for password reset or email verification
 */
export function generateRandomToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Calculate refresh token expiry date
 */
export function getRefreshTokenExpiry(): Date {
  const daysMatch = env.JWT_REFRESH_EXPIRY.match(/^(\d+)d$/);
  const days = daysMatch ? parseInt(daysMatch[1], 10) : 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
