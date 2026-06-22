import { Request, Response } from "express";
import { z } from "zod";
import { db, genId, nowIso } from "../lib/db";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "../lib/tokens";
import { ROLES } from "../constants/roles";
import { env } from "../config/env";
import { HttpError } from "../middlewares/errorHandler";

// ---- Schemas de validacao (Zod) ----

const registerSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(100),
  email: z.string().email("E-mail invalido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(128),
});

const loginSchema = z.object({
  email: z.string().email("E-mail invalido"),
  password: z.string().min(1, "Senha obrigatoria"),
});

// ---- Tipos auxiliares ----

interface UserRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: string;
}

// ---- Helpers de emissao de tokens ----

function refreshExpiryIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + env.refreshTokenTtlDays);
  return d.toISOString();
}

// Emite um par (access + refresh). O refresh e persistido apenas como hash.
function issueTokens(userId: string, role: string) {
  const accessToken = signAccessToken({ sub: userId, role });
  const { token: refreshToken, tokenHash } = generateRefreshToken();
  db.prepare(
    `INSERT INTO refresh_tokens (id, tokenHash, userId, expiresAt, createdAt)
     VALUES (@id, @tokenHash, @userId, @expiresAt, @createdAt)`
  ).run({
    id: genId(),
    tokenHash,
    userId,
    expiresAt: refreshExpiryIso(),
    createdAt: nowIso(),
  });
  return { accessToken, refreshToken };
}

function publicUser(u: { id: string; name: string; email: string; role: string }) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

// ---- Handlers ----

// Cadastro publico: cria sempre um PARTICIPANTE. Promocao de papel so e
// possivel via rota administrativa (PATCH /admin/users/:id/role).
export async function register(req: Request, res: Response): Promise<void> {
  const data = registerSchema.parse(req.body);

  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(data.email);
  if (existing) throw new HttpError(409, "E-mail ja cadastrado");

  const passwordHash = await hashPassword(data.password);
  const user: UserRow = {
    id: genId(),
    name: data.name,
    email: data.email,
    passwordHash,
    role: ROLES.PARTICIPANTE,
    createdAt: nowIso(),
  };
  db.prepare(
    `INSERT INTO users (id, name, email, passwordHash, role, createdAt)
     VALUES (@id, @name, @email, @passwordHash, @role, @createdAt)`
  ).run(user);

  const tokens = issueTokens(user.id, user.role);
  res.status(201).json({ user: publicUser(user), ...tokens });
}

// Login: valida credenciais e emite tokens. Resposta identica para usuario
// inexistente e senha incorreta (mitiga enumeracao de usuarios).
export async function login(req: Request, res: Response): Promise<void> {
  const data = loginSchema.parse(req.body);

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(data.email) as UserRow | undefined;
  if (!user) throw new HttpError(401, "Credenciais invalidas");

  const ok = await verifyPassword(user.passwordHash, data.password);
  if (!ok) throw new HttpError(401, "Credenciais invalidas");

  const tokens = issueTokens(user.id, user.role);
  res.json({ user: publicUser(user), ...tokens });
}

// Refresh com ROTACAO: o refresh token usado e revogado e um novo par e
// emitido. Reuso de um token ja rotacionado e rejeitado (deteccao de replay).
export async function refresh(req: Request, res: Response): Promise<void> {
  const provided: string | undefined =
    req.body?.refreshToken ?? req.cookies?.refreshToken;
  if (!provided) throw new HttpError(400, "Refresh token ausente");

  const tokenHash = hashRefreshToken(provided);
  const stored = db
    .prepare("SELECT * FROM refresh_tokens WHERE tokenHash = ?")
    .get(tokenHash) as
    | { id: string; userId: string; expiresAt: string; revokedAt: string | null }
    | undefined;

  if (!stored || stored.revokedAt || stored.expiresAt < nowIso()) {
    throw new HttpError(401, "Refresh token invalido ou expirado");
  }

  // Rotaciona: revoga o token atual antes de emitir um novo.
  db.prepare("UPDATE refresh_tokens SET revokedAt = ? WHERE id = ?").run(
    nowIso(),
    stored.id
  );

  const user = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(stored.userId) as UserRow | undefined;
  if (!user) throw new HttpError(401, "Usuario nao encontrado");

  const tokens = issueTokens(user.id, user.role);
  res.json(tokens);
}

// Logout: revoga o refresh token informado.
export async function logout(req: Request, res: Response): Promise<void> {
  const provided: string | undefined =
    req.body?.refreshToken ?? req.cookies?.refreshToken;
  if (provided) {
    db.prepare(
      "UPDATE refresh_tokens SET revokedAt = ? WHERE tokenHash = ? AND revokedAt IS NULL"
    ).run(nowIso(), hashRefreshToken(provided));
  }
  res.status(204).send();
}

// Dados do usuario autenticado (rota protegida).
export async function me(req: Request, res: Response): Promise<void> {
  const user = db
    .prepare(
      "SELECT id, name, email, role, createdAt FROM users WHERE id = ?"
    )
    .get(req.user!.id);
  res.json({ user });
}
