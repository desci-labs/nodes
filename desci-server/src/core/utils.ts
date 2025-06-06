export function sanitizeBigInts(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeBigInts);
  } else if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, sanitizeBigInts(v)]));
  } else if (typeof obj === 'bigint') {
    return obj.toString();
  } else {
    return obj;
  }
}
