import argon2 from "argon2";

// Hash de senhas com Argon2id — algoritmo recomendado pelo OWASP para
// armazenamento de senhas. O sal e gerado automaticamente e embutido no hash.
// Em NENHUMA hipotese a senha em texto puro e persistida.

const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  plain: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
