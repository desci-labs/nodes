import { createHmac, randomBytes } from 'crypto';

export function hashApiKey(apiKey: string): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }

  // Create an HMAC hash using SHA-256
  return createHmac('sha256', secret).update(apiKey).digest('hex');
}

export function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}
