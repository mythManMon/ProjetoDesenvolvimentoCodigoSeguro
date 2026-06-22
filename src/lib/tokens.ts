import jwt, { SignOptions } from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env";

// ---- Access token (JWT, curta duracao) ----

export interface AccessTokenPayload {
  sub: string; // id do usuario
  role: string; // papel do usuario (claim usado pelo RBAC)
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.accessTokenTtl as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.jwtAccessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtAccessSecret) as jwt.JwtPayload;
  return { sub: String(decoded.sub), role: String(decoded.role) };
}

// ---- Refresh token (opaco, longa duracao, guardado como hash) ----
// O token enviado ao cliente e aleatorio; no banco persistimos apenas o
// SHA-256, de modo que um vazamento do banco nao expoe tokens utilizaveis.

export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(48).toString("hex");
  const tokenHash = hashRefreshToken(token);
  return { token, tokenHash };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
