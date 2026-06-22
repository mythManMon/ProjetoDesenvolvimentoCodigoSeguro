import { Request, Response } from "express";
import { z } from "zod";
import { db, genId, nowIso } from "../lib/db";
import { HttpError } from "../middlewares/errorHandler";

const createEventSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(1),
  startsAt: z.coerce.date(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional(),
});

const updateEventSchema = createEventSchema.partial();

interface EventRow {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  status: string;
  createdById: string;
  createdAt: string;
}

// Publico: lista eventos (com autor e contagem de enquetes/comentarios).
export async function listEvents(_req: Request, res: Response): Promise<void> {
  const rows = db
    .prepare(
      `SELECT e.id, e.title, e.description, e.startsAt, e.status,
              e.createdById, e.createdAt,
              u.id AS creatorId, u.name AS creatorName,
              (SELECT COUNT(*) FROM polls p WHERE p.eventId = e.id)    AS pollsCount,
              (SELECT COUNT(*) FROM comments c WHERE c.eventId = e.id) AS commentsCount
       FROM events e
       JOIN users u ON u.id = e.createdById
       ORDER BY e.startsAt ASC`
    )
    .all();

  const events = rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: r.startsAt,
    status: r.status,
    createdById: r.createdById,
    createdAt: r.createdAt,
    createdBy: { id: r.creatorId, name: r.creatorName },
    _count: { polls: r.pollsCount, comments: r.commentsCount },
  }));
  res.json({ events });
}

// Publico: detalhe de um evento (so comentarios VISIBLE).
export async function getEvent(req: Request, res: Response): Promise<void> {
  const event = db
    .prepare("SELECT * FROM events WHERE id = ?")
    .get(req.params.id) as EventRow | undefined;
  if (!event) throw new HttpError(404, "Evento nao encontrado");

  const createdBy = db
    .prepare("SELECT id, name FROM users WHERE id = ?")
    .get(event.createdById);

  const polls = db
    .prepare("SELECT * FROM polls WHERE eventId = ? ORDER BY createdAt ASC")
    .all(event.id);
  for (const poll of polls as any[]) {
    poll.options = db
      .prepare("SELECT * FROM poll_options WHERE pollId = ?")
      .all(poll.id);
  }

  const commentRows = db
    .prepare(
      `SELECT c.id, c.content, c.status, c.eventId, c.userId, c.createdAt,
              u.id AS commenterId, u.name AS commenterName
       FROM comments c
       JOIN users u ON u.id = c.userId
       WHERE c.eventId = ? AND c.status = 'VISIBLE'
       ORDER BY c.createdAt DESC`
    )
    .all(event.id);
  const comments = commentRows.map((c: any) => ({
    id: c.id,
    content: c.content,
    status: c.status,
    eventId: c.eventId,
    userId: c.userId,
    createdAt: c.createdAt,
    user: { id: c.commenterId, name: c.commenterName },
  }));

  res.json({ event: { ...event, createdBy, polls, comments } });
}

// Restrito a ADMINISTRADOR: gerenciamento de eventos.
export async function createEvent(req: Request, res: Response): Promise<void> {
  const data = createEventSchema.parse(req.body);
  const id = genId();
  db.prepare(
    `INSERT INTO events (id, title, description, startsAt, status, createdById, createdAt)
     VALUES (@id, @title, @description, @startsAt, @status, @createdById, @createdAt)`
  ).run({
    id,
    title: data.title,
    description: data.description,
    startsAt: data.startsAt.toISOString(),
    status: data.status ?? "PUBLISHED",
    createdById: req.user!.id,
    createdAt: nowIso(),
  });
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  res.status(201).json({ event });
}

export async function updateEvent(req: Request, res: Response): Promise<void> {
  const data = updateEventSchema.parse(req.body);
  const exists = db
    .prepare("SELECT id FROM events WHERE id = ?")
    .get(req.params.id);
  if (!exists) throw new HttpError(404, "Evento nao encontrado");

  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  if (data.title !== undefined) {
    sets.push("title = @title");
    params.title = data.title;
  }
  if (data.description !== undefined) {
    sets.push("description = @description");
    params.description = data.description;
  }
  if (data.startsAt !== undefined) {
    sets.push("startsAt = @startsAt");
    params.startsAt = data.startsAt.toISOString();
  }
  if (data.status !== undefined) {
    sets.push("status = @status");
    params.status = data.status;
  }
  if (sets.length > 0) {
    db.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = @id`).run(params);
  }

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  res.json({ event });
}

export async function deleteEvent(req: Request, res: Response): Promise<void> {
  const exists = db
    .prepare("SELECT id FROM events WHERE id = ?")
    .get(req.params.id);
  if (!exists) throw new HttpError(404, "Evento nao encontrado");
  // ON DELETE CASCADE remove enquetes, opcoes, votos e comentarios.
  db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
  res.status(204).send();
}
