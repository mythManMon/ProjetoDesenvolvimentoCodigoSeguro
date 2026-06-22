import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.port, () => {
  console.log(`Servidor rodando em http://localhost:${env.port}`);
  console.log(`Console de demonstracao: http://localhost:${env.port}/`);
});
