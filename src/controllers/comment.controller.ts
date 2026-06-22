import { Request, Response } from "express";
import { z } from "zod";
import { db, genId, nowIso } from "../lib/db";
import { ROLES } from "../constants/roles";
import { HttpError } from "../middlewares/errorHandler";

const createCommentSchema = z.object({
  content: z.string().min(1).max(1000),
});

interface CommentRow {
  id: string;
  content: string;
  status: string;
  eventId: string;
  userId: string;
  createdAt: string;
}

// Monta o comentario com o autor aninhado (user: {id, name}).
function shapeComment(row: any) {
  return {
    id: row.id,
    content: row.content,
    status: row.status,
    eventId: row.eventId,
    userId: row.userId,
    createdAt: row.createdAt,
    user: { id: row.commenterId, name: row.commenterName },
  };
}

// Autenticado: lista comentarios. Moderadores/admins veem tambem os ocultos.
export async function listComments(req: Request, res: Response): Promise<void> {
  const role = req.user?.role;
  const canSeeHidden = role === ROLES.MODERADOR || role === ROLES.ADMINISTRADOR;

  const sql =
    `SELECT c.id, c.content, c.status, c.eventId, c.userId, c.createdAt,
            u.id AS commenterId, u.name AS commenterName
     FROM comments c
     JOIN users u ON u.id = c.userId
     WHERE c.eventId = @eventId` +
    (canSeeHidden ? "" : " AND c.status = 'VISIBLE'") +
    " ORDER BY c.createdAt DESC";

  const rows = db.prepare(sql).all({ eventId: req.params.eventId });
  res.json({ comments: rows.map(shapeComment) });
}

// Autenticado (PARTICIPANTE+): publica comentario.
export async function createComment(req: Request, res: Response): Promise<void> {
  const { content } = createCommentSchema.parse(req.body);
  const event = db
    .prepare("SELECT id FROM events WHERE id = ?")
    .get(req.params.eventId) as { id: string } | undefined;
  if (!event) throw new HttpError(404, "Evento nao encontrado");

  const id = genId();
  db.prepare(
    `INSERT INTO comments (id, content, status, eventId, userId, createdAt)
     VALUES (@id, @content, 'VISIBLE', @eventId, @userId, @createdAt)`
  ).run({
    id,
    content,
    eventId: event.id,
    userId: req.user!.id,
    createdAt: nowIso(),
  });

  const row = db
    .prepare(
      `SELECT c.id, c.content, c.status, c.eventId, c.userId, c.createdAt,
              u.id AS commenterId, u.name AS commenterName
       FROM comments c JOIN users u ON u.id = c.userId
       WHERE c.id = ?`
    )
    .get(id);
  res.status(201).json({ comment: shapeComment(row) });
}

// MODERADOR/ADMINISTRADOR: oculta comentario (moderacao de mensagens).
export async function hideComment(req: Request, res: Response): Promise<void> {
  const comment = db
    .prepare("SELECT * FROM comments WHERE id = ?")
    .get(req.params.id) as CommentRow | undefined;
  if (!comment) throw new HttpError(404, "Comentario nao encontrado");

  db.prepare("UPDATE comments SET status = 'HIDDEN' WHERE id = ?").run(comment.id);
  const updated = db.prepare("SELECT * FROM comments WHERE id = ?").get(comment.id);
  res.json({ comment: updated });
}

// MODERADOR/ADMINISTRADOR: remove comentario.
export async function deleteComment(req: Request, res: Response): Promise<void> {
  const comment = db
    .prepare("SELECT id FROM comments WHERE id = ?")
    .get(req.params.id);
  if (!comment) throw new HttpError(404, "Comentario nao encontrado");
  db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);
  res.status(204).send();
}
