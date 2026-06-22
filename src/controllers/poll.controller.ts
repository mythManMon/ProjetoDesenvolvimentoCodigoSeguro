import { Request, Response } from "express";
import { z } from "zod";
import { db, genId, nowIso, tx, isUniqueViolation } from "../lib/db";
import { HttpError } from "../middlewares/errorHandler";

const createPollSchema = z.object({
  question: z.string().min(3),
  options: z.array(z.string().min(1)).min(2).max(10),
});

const voteSchema = z.object({
  optionId: z.string().min(1),
});

const statusSchema = z.object({
  status: z.enum(["OPEN", "CLOSED"]),
});

interface PollRow {
  id: string;
  question: string;
  status: string;
  eventId: string;
  createdAt: string;
}

function loadOptions(pollId: string) {
  return db.prepare("SELECT * FROM poll_options WHERE pollId = ?").all(pollId);
}

// Publico: lista enquetes de um evento.
export async function listPolls(req: Request, res: Response): Promise<void> {
  const polls = db
    .prepare("SELECT * FROM polls WHERE eventId = ? ORDER BY createdAt ASC")
    .all(req.params.eventId);
  for (const poll of polls as any[]) {
    poll.options = loadOptions(poll.id);
  }
  res.json({ polls });
}

// MODERADOR/ADMINISTRADOR: cria enquete (controle de enquetes).
export async function createPoll(req: Request, res: Response): Promise<void> {
  const data = createPollSchema.parse(req.body);
  const event = db
    .prepare("SELECT id FROM events WHERE id = ?")
    .get(req.params.eventId) as { id: string } | undefined;
  if (!event) throw new HttpError(404, "Evento nao encontrado");

  const pollId = genId();
  tx(() => {
    db.prepare(
      `INSERT INTO polls (id, question, status, eventId, createdAt)
       VALUES (@id, @question, 'OPEN', @eventId, @createdAt)`
    ).run({
      id: pollId,
      question: data.question,
      eventId: event.id,
      createdAt: nowIso(),
    });
    const insertOption = db.prepare(
      "INSERT INTO poll_options (id, text, pollId) VALUES (@id, @text, @pollId)"
    );
    for (const text of data.options) {
      insertOption.run({ id: genId(), text, pollId });
    }
  });

  const poll = db.prepare("SELECT * FROM polls WHERE id = ?").get(pollId) as PollRow;
  res.status(201).json({ poll: { ...poll, options: loadOptions(pollId) } });
}

// MODERADOR/ADMINISTRADOR: abre/fecha enquete.
export async function setPollStatus(req: Request, res: Response): Promise<void> {
  const { status } = statusSchema.parse(req.body);
  const poll = db
    .prepare("SELECT * FROM polls WHERE id = ?")
    .get(req.params.id) as PollRow | undefined;
  if (!poll) throw new HttpError(404, "Enquete nao encontrada");

  db.prepare("UPDATE polls SET status = ? WHERE id = ?").run(status, poll.id);
  const updated = db.prepare("SELECT * FROM polls WHERE id = ?").get(poll.id);
  res.json({ poll: updated });
}

// Qualquer usuario autenticado (PARTICIPANTE+): vota. 1 voto por enquete.
export async function vote(req: Request, res: Response): Promise<void> {
  const { optionId } = voteSchema.parse(req.body);
  const poll = db
    .prepare("SELECT * FROM polls WHERE id = ?")
    .get(req.params.id) as PollRow | undefined;
  if (!poll) throw new HttpError(404, "Enquete nao encontrada");
  if (poll.status !== "OPEN") throw new HttpError(409, "Enquete encerrada");

  const option = db
    .prepare("SELECT id FROM poll_options WHERE id = ? AND pollId = ?")
    .get(optionId, poll.id);
  if (!option) throw new HttpError(400, "Opcao invalida para esta enquete");

  try {
    const id = genId();
    db.prepare(
      `INSERT INTO votes (id, pollId, optionId, userId, createdAt)
       VALUES (@id, @pollId, @optionId, @userId, @createdAt)`
    ).run({
      id,
      pollId: poll.id,
      optionId,
      userId: req.user!.id,
      createdAt: nowIso(),
    });
    const created = db.prepare("SELECT * FROM votes WHERE id = ?").get(id);
    res.status(201).json({ vote: created });
  } catch (e: unknown) {
    // Violacao de UNIQUE (pollId, userId) -> usuario ja votou.
    if (isUniqueViolation(e)) {
      throw new HttpError(409, "Voce ja votou nesta enquete");
    }
    throw e;
  }
}

// Publico: resultados agregados da enquete.
export async function pollResults(req: Request, res: Response): Promise<void> {
  const poll = db
    .prepare("SELECT * FROM polls WHERE id = ?")
    .get(req.params.id) as PollRow | undefined;
  if (!poll) throw new HttpError(404, "Enquete nao encontrada");

  const results = db
    .prepare(
      `SELECT o.id AS optionId, o.text AS text, COUNT(v.id) AS votes
       FROM poll_options o
       LEFT JOIN votes v ON v.optionId = o.id
       WHERE o.pollId = ?
       GROUP BY o.id, o.text`
    )
    .all(poll.id) as { optionId: string; text: string; votes: number }[];
  const total = results.reduce((sum, r) => sum + r.votes, 0);

  res.json({
    pollId: poll.id,
    question: poll.question,
    status: poll.status,
    total,
    results,
  });
}
