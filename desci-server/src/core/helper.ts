export function sanitizeObject<T extends object>(response: T): T {
  const clone: T = {} as T;
  Object.assign(clone, response);
  for (const field in clone) if (clone[field] === 'undefined') delete clone[field];
  return clone;
}
