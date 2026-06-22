# Event Engage — Autenticação e Controle de Acesso (RBAC)

Backend de **autenticação** e **controle de acesso baseado em papéis (RBAC)** para um
webapp de engajamento de audiência em eventos (palestras, shows, festivais, eventos
acadêmicos). Implementa cadastro, login, hash de senhas, autenticação por token JWT,
proteção de rotas privadas e **três níveis de permissão** sobre funcionalidades reais:
gerenciamento de eventos, controle de enquetes, moderação de comentários e painel
administrativo.

Acompanha um **console de demonstração** (`/`) que loga como cada papel e mostra, em
tempo real, o backend **permitindo ou negando** cada ação — incluindo os códigos HTTP.

---

## Sumário

- [Stack](#stack)
- [Como executar](#como-executar)
- [Fluxo de autenticação](#fluxo-de-autenticação)
- [Tipos de usuário (papéis e permissões)](#tipos-de-usuário-papéis-e-permissões)
- [Rotas protegidas](#rotas-protegidas)
- [Atendimento às restrições do enunciado](#atendimento-às-restrições-do-enunciado)
- [Decisões de segurança](#decisões-de-segurança)
- [Persistência](#persistência)
- [Console de demonstração](#console-de-demonstração)
- [Exemplos de uso (curl)](#exemplos-de-uso-curl)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Credenciais do seed](#credenciais-do-seed)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22+ |
| Linguagem | TypeScript (executado via `tsx`) |
| Framework HTTP | Express |
| Hash de senha | **Argon2id** (`argon2`) |
| Token | **JWT** (`jsonwebtoken`, HS256) + refresh token opaco rotacionado |
| Validação | Zod |
| Persistência | SQLite embarcado — `better-sqlite3` com fallback automático para `node:sqlite` |
| Segurança HTTP | `helmet`, `cors`, `express-rate-limit` |

Sem build obrigatório e sem servidor de banco externo: `npm install` e pronto.

---

## Como executar

**Pré-requisitos:** Node.js **22.5 ou superior** (necessário para o fallback `node:sqlite`).
Verifique com `node --version`.

```bash
# 1. Instalar dependências
npm install

# 2. Variáveis de ambiente (copie o exemplo e ajuste o segredo do JWT)
cp .env.example .env

# 3. Popular o banco com dados de exemplo (3 usuários, 1 evento, 1 enquete, 1 comentário)
npm run seed

# 4. Subir o servidor
npm run dev      # com auto-reload (desenvolvimento)
# ou
npm start        # execução simples
```

O servidor sobe em `http://localhost:3000`. Abra essa URL no navegador para o
**console de demonstração**. A API fica sob o mesmo host (ex.: `POST /auth/login`).

> O banco é criado automaticamente na primeira execução (`data.db` na raiz). Para
> recriar do zero, apague `data.db*` e rode `npm run seed` novamente.

---

## Fluxo de autenticação

O sistema usa **dois tokens** — um par clássico de *access token* curto + *refresh
token* longo com rotação.

### 1. Cadastro — `POST /auth/register`
O usuário envia `name`, `email` e `password`. A senha passa por **Argon2id** e somente o
**hash** é gravado (a senha em texto puro nunca é persistida). Todo cadastro público cria
um usuário com papel **PARTICIPANTE** — a promoção de papel só ocorre por rota
administrativa, evitando escalonamento de privilégio na inscrição.

### 2. Login — `POST /auth/login`
Valida as credenciais. Se o e-mail não existe **ou** a senha está errada, a resposta é
idêntica (`401`, mesma mensagem) para mitigar **enumeração de usuários**. Em caso de
sucesso, emite o par de tokens.

### 3. Access token (JWT)
- Assinado em **HS256**, vida curta (`15m` por padrão).
- *Payload*: `{ sub: <id do usuário>, role: <papel> }`.
- Enviado em todas as requisições protegidas no header `Authorization: Bearer <token>`.
- O middleware `authenticate` valida a assinatura/expiração e injeta `req.user = { id, role }`.
  **Sem token válido, a rota privada responde `401` — nenhuma rota privada é servida sem
  essa verificação no servidor.**

### 4. Refresh token (opaco, rotacionado)
- Valor aleatório de 48 bytes; no banco guarda-se apenas o **SHA-256** do token. Um
  vazamento do banco não expõe tokens utilizáveis.
- Vida longa (`7 dias` por padrão).
- `POST /auth/refresh` valida o refresh token, **revoga o token usado** e emite um novo
  par (**rotação**). Se um refresh token já rotacionado for reapresentado (replay), a
  requisição é **rejeitada com `401`** (detecção de reuso).

### 5. Logout — `POST /auth/logout`
Revoga o refresh token informado (marca `revokedAt`). O access token, por ser curto,
expira naturalmente.

### Diagrama do fluxo

```
  register ──▶ cria PARTICIPANTE (senha → Argon2id) ──▶ emite par de tokens
  login ─────▶ valida credenciais ───────────────────▶ emite par de tokens
                                                          │
              ┌───────────────── access token (15m) ─────┤
              │                                           └── refresh token (7d, hash no banco)
              ▼
  rota privada ── Authorization: Bearer <access> ──▶ authenticate (401 se inválido)
                                                   └▶ authorize/authorizeMin (403 se papel insuficiente)

  refresh ──▶ valida refresh ──▶ revoga o usado ──▶ emite novo par   (reuso do antigo ⇒ 401)
  logout  ──▶ revoga refresh
```

---

## Tipos de usuário (papéis e permissões)

Três níveis hierárquicos (atende ao requisito de "pelo menos dois"). A hierarquia é
numérica: `PARTICIPANTE (1) < MODERADOR (2) < ADMINISTRADOR (3)`.

| Papel | Nível | Pode fazer |
|---|:---:|---|
| **PARTICIPANTE** | 1 | Ler eventos/enquetes/resultados, **votar** (1 voto por enquete), **comentar**, ver seus dados (`/auth/me`). |
| **MODERADOR** | 2 | Tudo do participante **+ controle de enquetes** (criar, abrir/fechar) **+ moderação de comentários** (ocultar, excluir, ver ocultos). |
| **ADMINISTRADOR** | 3 | Tudo do moderador **+ gerenciamento de eventos** (criar/editar/excluir) **+ painel administrativo** (estatísticas, listar usuários, **alterar papéis**). |

O controle é feito por dois middlewares:
- `authorize(...papéis)` — lista explícita de papéis permitidos.
- `authorizeMin(papel)` — exige um papel **mínimo** na hierarquia (ex.: `authorizeMin(MODERADOR)` libera moderador e administrador).

---

## Rotas protegidas

Legenda de acesso: 🌐 público · 🔒 autenticado (qualquer papel) · 🛡️ MODERADOR+ · ⚙️ ADMINISTRADOR.

### Autenticação — `/auth`
| Método | Rota | Acesso | Descrição |
|---|---|:---:|---|
| POST | `/auth/register` | 🌐 | Cadastro (cria sempre PARTICIPANTE) |
| POST | `/auth/login` | 🌐 | Login, emite par de tokens |
| POST | `/auth/refresh` | 🌐¹ | Rotaciona o refresh token |
| POST | `/auth/logout` | 🌐¹ | Revoga o refresh token |
| GET | `/auth/me` | 🔒 | Dados do usuário autenticado |

¹ Não exige access token, mas requer um refresh token válido no corpo/cookie.

### Eventos — `/events`
| Método | Rota | Acesso | Descrição |
|---|---|:---:|---|
| GET | `/events` | 🌐 | Lista eventos |
| GET | `/events/:id` | 🌐 | Detalhe (só comentários visíveis) |
| POST | `/events` | ⚙️ | **Criar evento** |
| PATCH | `/events/:id` | ⚙️ | **Editar evento** |
| DELETE | `/events/:id` | ⚙️ | **Excluir evento** |

### Enquetes — `/events/:eventId/polls` e `/polls`
| Método | Rota | Acesso | Descrição |
|---|---|:---:|---|
| GET | `/events/:eventId/polls` | 🌐 | Lista enquetes do evento |
| POST | `/events/:eventId/polls` | 🛡️ | **Criar enquete** |
| GET | `/polls/:id/results` | 🌐 | Resultados agregados |
| PATCH | `/polls/:id/status` | 🛡️ | **Abrir/fechar enquete** |
| POST | `/polls/:id/vote` | 🔒 | **Votar** (1 voto por enquete; repetir ⇒ 409) |

### Comentários — `/events/:eventId/comments` e `/comments`
| Método | Rota | Acesso | Descrição |
|---|---|:---:|---|
| GET | `/events/:eventId/comments` | 🔒² | Lista comentários |
| POST | `/events/:eventId/comments` | 🔒 | **Comentar** |
| PATCH | `/comments/:id/hide` | 🛡️ | **Ocultar comentário** (moderação) |
| DELETE | `/comments/:id` | 🛡️ | **Excluir comentário** (moderação) |

² Moderadores e administradores também enxergam comentários **ocultos**; participantes só veem os visíveis.

### Administração — `/admin`
| Método | Rota | Acesso | Descrição |
|---|---|:---:|---|
| GET | `/admin/dashboard` | ⚙️ | Estatísticas do painel |
| GET | `/admin/users` | ⚙️ | Listar usuários |
| PATCH | `/admin/users/:id/role` | ⚙️ | **Alterar papel** (revoga sessões do alvo) |

---

## Atendimento às restrições do enunciado

O enunciado lista o que **não será aceito**. Mapeamento direto:

| Restrição (não aceito) | Como o projeto evita |
|---|---|
| Senha em texto puro | Apenas o **hash Argon2id** é gravado (`src/lib/password.ts`). Não há coluna de senha em claro. |
| Autenticação simulada | JWT **assinado e verificado** de verdade (`src/lib/tokens.ts`, middleware `authenticate`). Token inválido/expirado ⇒ `401`. |
| Rotas privadas sem proteção | Toda rota restrita passa por `authenticate` (+ `authorize`/`authorizeMin`) **no backend**. Sem header válido, `401`; papel insuficiente, `403`. |
| Permissões só no frontend | O console é mera conveniência visual. **Toda decisão de autorização ocorre no servidor** — o console exibe exatamente o código HTTP que o backend devolve, inclusive os `403`. |

---

## Decisões de segurança

- **Argon2id** com parâmetros recomendados pelo OWASP (memória ~19 MiB, `timeCost=2`). Sal por usuário, embutido no hash.
- **Refresh token guardado como hash** (SHA-256). O valor em claro só existe no cliente.
- **Rotação de refresh token** com **detecção de replay** (reuso de token revogado ⇒ `401`).
- **Resistência a enumeração de usuários**: login com e-mail inexistente e senha incorreta retornam a mesma resposta.
- **Promoção de privilégio controlada**: cadastro público sempre cria PARTICIPANTE; mudança de papel só via rota de administrador, que ainda **revoga as sessões** do usuário alterado (força novo login com o papel novo).
- **Cabeçalhos de segurança** via `helmet`, **CORS** habilitado e **rate limiting** no fluxo `/auth` (mitiga força bruta).
- **Validação de entrada** com Zod em todos os corpos de requisição (erros ⇒ `400`).
- **1 voto por usuário por enquete** garantido por restrição `UNIQUE(pollId, userId)` no banco (violação ⇒ `409`).

---

## Persistência

O projeto usa **SQLite embarcado** (sem servidor de banco). A camada de acesso
(`src/lib/db.ts`) escolhe o driver automaticamente:

1. **`better-sqlite3`** (módulo nativo) — usado quando disponível; ideal em produção.
2. **`node:sqlite`** — SQLite embutido no Node 22+; **fallback automático** quando o
   binário nativo não está presente (ex.: ambientes sem compilação/sem acesso para baixar
   binários). Não requer download nem build.

Como `better-sqlite3` é uma dependência **opcional**, o `npm install` **nunca falha** por
causa dele: se o binário não puder ser obtido/compilado, o sistema cai para `node:sqlite`
de forma transparente. A lógica de autenticação, hashing e RBAC é idêntica nos dois casos.
O driver ativo aparece no canto superior do console e em `GET /health`.

O esquema (tabelas `users`, `refresh_tokens`, `events`, `polls`, `poll_options`, `votes`,
`comments`) é criado de forma idempotente na inicialização.

---

## Console de demonstração

Abra `http://localhost:3000/`. O console permite:

- **Logar como cada papel** com um clique (chama `POST /auth/login` de verdade).
- Ver os **claims do JWT** decodificados (`sub`, `role`, `iat`, `exp`) e a contagem regressiva de expiração.
- Uma **matriz de permissões**: cada ação restrita tem um botão *Testar* que dispara a
  requisição real com o token atual e mostra o **código HTTP** e o **veredito**
  (permitido / negado pelo RBAC / regra de negócio). É a prova visual de que a
  autorização é feita no servidor.
- **Ações de participante** (votar, comentar) e um **terminal** que registra cada chamada HTTP.

---

## Exemplos de uso (curl)

```bash
# Login como administrador → captura o access token
ATK=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@evento.com","password":"Admin@12345"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

# Rota protegida sem token → 401
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/auth/me        # 401

# Rota protegida com token → 200
curl -s http://localhost:3000/auth/me -H "Authorization: Bearer $ATK"

# Admin cria evento → 201
curl -s -X POST http://localhost:3000/events \
  -H "Authorization: Bearer $ATK" -H 'Content-Type: application/json' \
  -d '{"title":"Tech Talk","description":"Painel","startsAt":"2026-12-01T10:00:00Z"}'

# Participante tentando criar evento → 403 (negado pelo RBAC)
PTK=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"part@evento.com","password":"Part@12345"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/events \
  -H "Authorization: Bearer $PTK" -H 'Content-Type: application/json' \
  -d '{"title":"x","description":"y","startsAt":"2026-12-01T10:00:00Z"}'   # 403
```

---

## Estrutura do projeto

```
event-engage-auth/
├── src/
│   ├── server.ts                 # bootstrap do servidor
│   ├── app.ts                    # Express: middlewares, rotas, estáticos, /health
│   ├── seed.ts                   # popular o banco com dados de exemplo
│   ├── config/
│   │   └── env.ts                # variáveis de ambiente
│   ├── constants/
│   │   └── roles.ts              # papéis e hierarquia (ROLE_LEVEL)
│   ├── lib/
│   │   ├── db.ts                 # SQLite (better-sqlite3 → node:sqlite) + esquema
│   │   ├── password.ts           # hash/verificação Argon2id
│   │   └── tokens.ts             # JWT + refresh token (hash SHA-256)
│   ├── middlewares/
│   │   ├── authenticate.ts       # exige JWT válido (401)
│   │   ├── authorize.ts          # RBAC: authorize / authorizeMin (403)
│   │   └── errorHandler.ts       # HttpError, asyncHandler, tratamento central
│   ├── controllers/              # auth, event, poll, comment, user
│   └── routes/                   # auth, event, poll, comment, admin
├── public/
│   └── index.html                # console de demonstração (sem dependências externas)
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Credenciais do seed

| Papel | E-mail | Senha |
|---|---|---|
| ADMINISTRADOR | `admin@evento.com` | `Admin@12345` |
| MODERADOR | `mod@evento.com` | `Mod@12345` |
| PARTICIPANTE | `part@evento.com` | `Part@12345` |

> Credenciais de demonstração. Em produção, troque o `JWT_ACCESS_SECRET` no `.env` por um
> valor aleatório de pelo menos 32 caracteres.
