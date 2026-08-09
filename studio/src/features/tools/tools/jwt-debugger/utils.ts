export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  issuedAt?: Date;
  expiresAt?: Date;
  notBefore?: Date;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('JWT 包含无效的 Base64URL 内容。');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseSection(value: string, label: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('JWT 包含')) throw error;
    throw new Error(`${label} 不是有效的 JSON 对象。`);
  }
}

function claimDate(payload: Record<string, unknown>, key: string): Date | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : undefined;
}

export function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error('JWT 应由 Header、Payload、Signature 三个部分组成。');
  }

  const header = parseSection(parts[0], 'Header');
  const payload = parseSection(parts[1], 'Payload');
  return {
    header,
    payload,
    signature: parts[2],
    issuedAt: claimDate(payload, 'iat'),
    expiresAt: claimDate(payload, 'exp'),
    notBefore: claimDate(payload, 'nbf'),
  };
}

export function formatJwt(decoded: DecodedJwt): string {
  return [
    'Header',
    JSON.stringify(decoded.header, null, 2),
    '',
    'Payload',
    JSON.stringify(decoded.payload, null, 2),
    '',
    'Signature (未验证)',
    decoded.signature,
  ].join('\n');
}
