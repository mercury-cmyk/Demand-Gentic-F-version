import crypto from "crypto";
import { Request } from "express";

export function verifyApiKey(req: Request, envKey: string): boolean {
  return !!req.body?.api_key && req.body.api_key === envKey;
}

export function verifyHmac(req: Request, secret: string, ttl: number = 300): boolean {
  const sig = req.get("X-Signature");
  const tsHeader = req.get("X-Timestamp");
  
  if (!sig || !tsHeader) {
    return false;
  }
  
  const ts = parseInt(tsHeader, 10);
  if (!Number.isFinite(ts)) {
    return false;
  }
  
  // Check timestamp is within TTL window
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > ttl) {
    return false;
  }
  
  // Calculate expected signature
  const body = JSON.stringify(req.body);
  const message = `${ts}.${body}`;
  const expected = crypto.createHmac("sha256", secret).update(message).digest("base64");
  
  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
