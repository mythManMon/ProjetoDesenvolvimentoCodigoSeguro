import { db, genId, nowIso, tx } from "./lib/db";
import { hashPassword } from "./lib/password";
import { ROLES } from "./constants/roles";

async function main() {
  // Senhas precisam ser geradas (async) antes de abrir a transacao,
  // pois o driver de SQLite e sincrono.
  const [adminHash, modHash, partHash] = await Promise.all([
    hashPassword("Admin@12345"),
    hashPassword("Mod@12345"),
    hashPassword("Part@12345"),
  ]);

  const adminId = genId();
  const modId = genId();
  const partId = genId();
  const eventId = genId();
  const pollId = genId();
  const ts = nowIso();
  const startsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  tx(() => {
    // Limpa dados existentes (ordem respeita as dependencias).
    for (const t of [
      "votes",
      "poll_options",
      "polls",
      "comments",
      "events",
      "refresh_tokens",
      "users",
    ]) {
      db.prepare(`DELETE FROM ${t}`).run();
    }

    const insertUser = db.prepare(
      `INSERT INTO users (id, name, email, passwordHash, role, createdAt)
       VALUES (@id, @name, @email, @passwordHash, @role, @createdAt)`
    );
    insertUser.run({
      id: adminId,
      name: "Alice Admin",
      email: "admin@evento.com",
      passwordHash: adminHash,
      role: ROLES.ADMINISTRADOR,
      createdAt: ts,
    });
    insertUser.run({
      id: modId,
      name: "Bruno Moderador",
      email: "mod@evento.com",
      passwordHash: modHash,
      role: ROLES.MODERADOR,
      createdAt: ts,
    });
    insertUser.run({
      id: partId,
      name: "Carla Participante",
      email: "part@evento.com",
      passwordHash: partHash,
      role: ROLES.PARTICIPANTE,
      createdAt: ts,
    });

    db.prepare(
      `INSERT INTO events (id, title, description, startsAt, status, createdById, createdAt)
       VALUES (@id, @title, @description, @startsAt, 'PUBLISHED', @createdById, @createdAt)`
    ).run({
      id: eventId,
      title: "Tech Summit Manaus 2026",
      description:
        "Conferencia de tecnologia com palestras e paineis interativos.",
      startsAt,
      createdById: adminId,
      createdAt: ts,
    });

    db.prepare(
      `INSERT INTO polls (id, question, status, eventId, createdAt)
       VALUES (@id, @question, 'OPEN', @eventId, @createdAt)`
    ).run({
      id: pollId,
      question: "Qual tema voce mais quer ver no proximo painel?",
      eventId,
      createdAt: ts,
    });
    const insertOption = db.prepare(
      "INSERT INTO poll_options (id, text, pollId) VALUES (@id, @text, @pollId)"
    );
    for (const text of [
      "Inteligencia Artificial",
      "Seguranca da Informacao",
      "Bioinformatica",
    ]) {
      insertOption.run({ id: genId(), text, pollId });
    }

    db.prepare(
      `INSERT INTO comments (id, content, status, eventId, userId, createdAt)
       VALUES (@id, @content, 'VISIBLE', @eventId, @userId, @createdAt)`
    ).run({
      id: genId(),
      content: "Ansiosa pelo evento!",
      eventId,
      userId: partId,
      createdAt: ts,
    });
  });

  console.log("Seed concluido. Usuarios criados:");
  console.log("  ADMINISTRADOR  admin@evento.com / Admin@12345");
  console.log("  MODERADOR      mod@evento.com   / Mod@12345");
  console.log("  PARTICIPANTE   part@evento.com  / Part@12345");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
