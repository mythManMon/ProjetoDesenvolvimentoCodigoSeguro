import path from "node:path";
import crypto from "node:crypto";

// =====================================================================
//  Camada de persistencia — SQLite embarcado (sem servidor de banco).
//
//  Driver primario: better-sqlite3 (modulo nativo, ideal para uso real).
//  Fallback automatico: node:sqlite, o SQLite embutido no Node 22+, que
//  nao exige compilacao nem download de binarios. Isso garante que o
//  projeto rode com um simples `npm install` em qualquer ambiente,
//  inclusive redes restritas onde o binario nativo nao pode ser obtido.
//
//  A API usada (prepare/run/get/all/exec) e compativel entre os dois.
// =====================================================================

// Caminho do arquivo do banco. Configuravel via DATABASE_FILE; por padrao
// cria `data.db` na raiz do projeto.
const DB_PATH = process.env.DATABASE_FILE
  ? path.resolve(process.env.DATABASE_FILE)
  : path.resolve(process.cwd(), "data.db");

// Subconjunto comum da API dos dois drivers de SQLite.
export interface SqliteStatement {
  run(...args: unknown[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  get(...args: unknown[]): any;
  all(...args: unknown[]): any[];
}

export interface SqliteDb {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
}

function openDatabase(): { db: SqliteDb; driver: string } {
  // 1) Tenta o driver nativo. Se o binario nao estiver disponivel, a
  //    construcao lanca excecao e caimos para o SQLite embutido do Node.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return { db: db as unknown as SqliteDb, driver: "better-sqlite3" };
  } catch {
    // 2) Fallback: node:sqlite (experimental, disponivel no Node >= 22.5).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA foreign_keys = ON");
    return { db: db as unknown as SqliteDb, driver: "node:sqlite" };
  }
}

const opened = openDatabase();
export const db: SqliteDb = opened.db;
export const dbDriver: string = opened.driver;

// ---- Schema (criado de forma idempotente na inicializacao) ----
// Papeis e status sao armazenados como TEXT e validados na aplicacao.
// Datas/horarios sao strings ISO-8601 em UTC (ordenaveis lexicograficamente).
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'PARTICIPANTE',
    createdAt    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id        TEXT PRIMARY KEY,
    tokenHash TEXT NOT NULL UNIQUE,
    userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expiresAt TEXT NOT NULL,
    revokedAt TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    startsAt    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'PUBLISHED',
    createdById TEXT NOT NULL REFERENCES users(id),
    createdAt   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS polls (
    id        TEXT PRIMARY KEY,
    question  TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'OPEN',
    eventId   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS poll_options (
    id     TEXT PRIMARY KEY,
    text   TEXT NOT NULL,
    pollId TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS votes (
    id        TEXT PRIMARY KEY,
    pollId    TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    optionId  TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL,
    UNIQUE (pollId, userId)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id        TEXT PRIMARY KEY,
    content   TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'VISIBLE',
    eventId   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL
  );
`);

// ---- Helpers ----

// Identificador unico (UUID v4) para chaves primarias.
export function genId(): string {
  return crypto.randomUUID();
}

// Timestamp atual em ISO-8601 (UTC).
export function nowIso(): string {
  return new Date().toISOString();
}

// Executa uma funcao dentro de uma transacao (BEGIN/COMMIT/ROLLBACK).
// Compativel com os dois drivers.
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Indica se um erro do SQLite e violacao de restricao UNIQUE
// (mensagem identica nos dois drivers).
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/.test(e.message);
}
