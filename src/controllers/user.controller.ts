import { Request, Response } from "express";
import { z } from "zod";
import { db, nowIso } from "../lib/db";
import { HttpError } from "../middlewares/errorHandler";

const changeRoleSchema = z.object({
  role: z.enum(["PARTICIPANTE", "MODERADOR", "ADMINISTRADOR"]),
});

// ADMINISTRADOR: lista todos os usuarios (painel administrativo).
export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = db
    .prepare(
      "SELECT id, name, email, role, createdAt FROM users ORDER BY createdAt ASC"
    )
    .all();
  res.json({ users });
}

// ADMINISTRADOR: altera o papel de um usuario.
export async function changeUserRole(req: Request, res: Response): Promise<void> {
  const { role } = changeRoleSchema.parse(req.body);
  const user = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(req.params.id) as { id: string } | undefined;
  if (!user) throw new HttpError(404, "Usuario nao encontrado");

  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id);

  // Revoga refresh tokens ativos para forcar novo login com o novo papel.
  db.prepare(
    "UPDATE refresh_tokens SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL"
  ).run(nowIso(), user.id);

  const updated = db
    .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
    .get(user.id);
  res.json({ user: updated });
}

// ADMINISTRADOR: estatisticas do painel administrativo.
export async function adminDashboard(_req: Request, res: Response): Promise<void> {
  const count = (sql: string): number =>
    (db.prepare(sql).get() as { n: number }).n;

  res.json({
    stats: {
      users: count("SELECT COUNT(*) AS n FROM users"),
      events: count("SELECT COUNT(*) AS n FROM events"),
      polls: count("SELECT COUNT(*) AS n FROM polls"),
      votes: count("SELECT COUNT(*) AS n FROM votes"),
      comments: count("SELECT COUNT(*) AS n FROM comments"),
      hiddenComments: count(
        "SELECT COUNT(*) AS n FROM comments WHERE status = 'HIDDEN'"
      ),
    },
  });
}
