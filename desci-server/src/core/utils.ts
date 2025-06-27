export function sanitizeBigInts(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeBigInts);
  } else if (typeof obj === 'bigint') {
    return obj.toString();
  } else if (obj && typeof obj === 'object') {
    const keys = Object.keys(obj);
    return keys.length > 0 ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, sanitizeBigInts(v)])) : obj;
  } else {
    return obj;
  }
}
