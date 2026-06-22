import { Request, Response, NextFunction } from "express";
import { Role, ROLE_LEVEL } from "../constants/roles";

// RBAC por lista explicita de papeis permitidos.
// Ex.: authorize(ROLES.ADMINISTRADOR) ou authorize(ROLES.MODERADOR, ROLES.ADMINISTRADOR)
export function authorize(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Nao autenticado" });
      return;
    }
    if (!allowed.includes(req.user.role as Role)) {
      res.status(403).json({ error: "Acesso negado: permissao insuficiente" });
      return;
    }
    next();
  };
}

// RBAC hierarquico: exige um nivel minimo (papel >= minimo).
// Ex.: authorizeMin(ROLES.MODERADOR) libera MODERADOR e ADMINISTRADOR.
export function authorizeMin(min: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Nao autenticado" });
      return;
    }
    const userLevel = ROLE_LEVEL[req.user.role as Role] ?? 0;
    if (userLevel < ROLE_LEVEL[min]) {
      res.status(403).json({ error: "Acesso negado: permissao insuficiente" });
      return;
    }
    next();
  };
}
