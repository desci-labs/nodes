export function ensureUuidEndsWithDot(uuid: string): string {
  return uuid.endsWith('.') ? uuid : uuid + '.';
}
