export interface SessionTokenPayload {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  deviceId: string;
}
