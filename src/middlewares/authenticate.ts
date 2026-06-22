import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/tokens";

// Estende o Request do Express para carregar o usuario autenticado.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

// Exige um access token JWT valido no header Authorization: Bearer <token>.
// Sem token valido, a rota e bloqueada com 401 — nenhuma rota privada e
// servida sem essa verificacao no backend.
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de acesso ausente" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Token invalido ou expirado" });
  }
}

// Variante opcional: popula req.user se houver token valido, mas nao bloqueia.
// Util para rotas publicas cujo conteudo varia conforme o papel (ex.: listar
// comentarios e tambem mostrar ocultos para moderadores).
export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(header.slice("Bearer ".length).trim());
      req.user = { id: payload.sub, role: payload.role };
    } catch {
      // ignora token invalido em rota opcional
    }
  }
  next();
}
