let sequence = 0;

export function randomId(): string {
  const cryptoValue = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoValue?.randomUUID) return cryptoValue.randomUUID();
  sequence += 1;
  return `id_${Date.now().toString(36)}_${sequence.toString(36)}`;
}
