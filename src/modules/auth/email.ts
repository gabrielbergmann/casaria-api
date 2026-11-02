// users.email é sempre guardado e comparado assim (spec 003, tabela users).
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
