// Papeis (niveis de permissao) do sistema e sua hierarquia.
// Atende ao requisito "pelo menos dois niveis de permissao" com tres niveis.

export const ROLES = {
  PARTICIPANTE: "PARTICIPANTE",
  MODERADOR: "MODERADOR",
  ADMINISTRADOR: "ADMINISTRADOR",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = [
  ROLES.PARTICIPANTE,
  ROLES.MODERADOR,
  ROLES.ADMINISTRADOR,
];

// Nivel numerico para autorizacao hierarquica (maior = mais privilegios).
export const ROLE_LEVEL: Record<Role, number> = {
  PARTICIPANTE: 1,
  MODERADOR: 2,
  ADMINISTRADOR: 3,
};
