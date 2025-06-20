export const safePct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
