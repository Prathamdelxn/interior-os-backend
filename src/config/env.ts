// =============================================================================
// InteriorOS Backend — Environment Configuration
// =============================================================================

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const raw = process.env[key];
  if (raw !== undefined) return parseInt(raw, 10);
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing required environment variable: ${key}`);
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  return raw === 'true' || raw === '1';
}

export const env = {
  // App
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  PORT: getEnvNumber('PORT', 4000),
  APP_NAME: getEnvVar('APP_NAME', 'InteriorOS'),
  APP_URL: getEnvVar('APP_URL', 'http://localhost:4000'),
  FRONTEND_URL: getEnvVar('FRONTEND_URL', 'http://localhost:3000'),

  // MongoDB
  MONGODB_URI: getEnvVar('MONGODB_URI', 'mongodb://localhost:27017/interioros'),

  // Redis
  REDIS_URL: getEnvVar('REDIS_URL', 'redis://localhost:6379'),

  // JWT
  JWT_SECRET: getEnvVar('JWT_SECRET', 'interioros-dev-secret-change-in-production'),
  JWT_ACCESS_EXPIRY: getEnvVar('JWT_ACCESS_EXPIRY', '15m'),
  JWT_REFRESH_EXPIRY: getEnvVar('JWT_REFRESH_EXPIRY', '7d'),

  // AWS S3
  AWS_REGION: getEnvVar('AWS_REGION', 'us-east-1'),
  AWS_ACCESS_KEY_ID: getEnvVar('AWS_ACCESS_KEY_ID', ''),
  AWS_SECRET_ACCESS_KEY: getEnvVar('AWS_SECRET_ACCESS_KEY', ''),
  AWS_S3_BUCKET: getEnvVar('AWS_S3_BUCKET', 'interioros-uploads'),
  AWS_S3_SIGNED_URL_EXPIRY: getEnvNumber('AWS_S3_SIGNED_URL_EXPIRY', 3600),

  // Email (Nodemailer)
  SMTP_HOST: getEnvVar('SMTP_HOST', 'smtp.gmail.com'),
  SMTP_PORT: getEnvNumber('SMTP_PORT', 587),
  SMTP_SECURE: getEnvBoolean('SMTP_SECURE', false),
  SMTP_USER: getEnvVar('SMTP_USER', ''),
  SMTP_PASS: getEnvVar('SMTP_PASS', ''),
  EMAIL_FROM: getEnvVar('EMAIL_FROM', 'noreply@interioros.com'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000),
  RATE_LIMIT_MAX_REQUESTS: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
//limitng
  // Pagination
  DEFAULT_PAGE_SIZE: getEnvNumber('DEFAULT_PAGE_SIZE', 20),
  MAX_PAGE_SIZE: getEnvNumber('MAX_PAGE_SIZE', 100),

  // File Upload
  MAX_FILE_SIZE: getEnvNumber('MAX_FILE_SIZE', 50 * 1024 * 1024), // 50MB

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: getEnvVar('CLOUDINARY_CLOUD_NAME', ''),
  CLOUDINARY_API_KEY: getEnvVar('CLOUDINARY_API_KEY', ''),
  CLOUDINARY_API_SECRET: getEnvVar('CLOUDINARY_API_SECRET', ''),
} as const;

export type Env = typeof env;
