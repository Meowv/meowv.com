const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';

function randomIndex(max: number): number {
  if (max < 1) throw new Error('字符集不能为空。');
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % max;
}

function shuffle(values: string[]): string[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

export function generatePassword(
  length: number,
  options: { lower: boolean; upper: boolean; digits: boolean; symbols: boolean },
): string {
  const size = Math.max(4, Math.min(256, Math.trunc(length)));
  const sets = [
    options.lower ? LOWER : '',
    options.upper ? UPPER : '',
    options.digits ? DIGITS : '',
    options.symbols ? SYMBOLS : '',
  ].filter(Boolean);
  if (!sets.length) throw new Error('至少选择一种字符类型。');
  if (size < sets.length) throw new Error('密码长度小于选中的字符类型数量。');
  const pool = sets.join('');
  const result = sets.map((set) => set[randomIndex(set.length)]);
  while (result.length < size) result.push(pool[randomIndex(pool.length)]);
  return shuffle(result).join('');
}

export function generateRandomString(length: number, alphabet: string): string {
  const size = Math.max(1, Math.min(4096, Math.trunc(length)));
  const unique = Array.from(new Set(Array.from(alphabet))).join('');
  if (unique.length < 2) throw new Error('字符集至少需要两个不同字符。');
  return Array.from({ length: size }, () => unique[randomIndex(unique.length)]).join('');
}

export interface PasswordStrength {
  score: number;
  label: string;
  entropyBits: number;
  poolSize: number;
  suggestions: string[];
  crackTime: string;
}

export function assessPassword(password: string): PasswordStrength {
  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/\d/.test(password)) poolSize += 10;
  if (/[^A-Za-z0-9]/.test(password)) poolSize += 33;
  const entropyBits = password.length && poolSize ? password.length * Math.log2(poolSize) : 0;
  const suggestions: string[] = [];
  if (password.length < 12) suggestions.push('长度建议至少 12 位。');
  if (!/[a-z]/.test(password)) suggestions.push('添加小写字母。');
  if (!/[A-Z]/.test(password)) suggestions.push('添加大写字母。');
  if (!/\d/.test(password)) suggestions.push('添加数字。');
  if (!/[^A-Za-z0-9]/.test(password)) suggestions.push('添加特殊符号。');
  if (/(.)\1{2,}/.test(password)) suggestions.push('避免连续重复字符。');
  if (/password|123456|qwerty|admin|letmein/i.test(password))
    suggestions.push('避免常见密码或键盘序列。');
  let score =
    entropyBits >= 80
      ? 4
      : entropyBits >= 60
        ? 3
        : entropyBits >= 40
          ? 2
          : entropyBits >= 25
            ? 1
            : 0;
  if (suggestions.some((item) => item.includes('常见密码'))) score = Math.min(score, 1);
  const seconds = entropyBits > 1024 ? Number.POSITIVE_INFINITY : 2 ** entropyBits / 1e10;
  const crackTime = !Number.isFinite(seconds)
    ? '极长时间'
    : seconds < 1
      ? '不到 1 秒'
      : seconds < 60
        ? `约 ${Math.round(seconds)} 秒`
        : seconds < 3600
          ? `约 ${Math.round(seconds / 60)} 分钟`
          : seconds < 86_400
            ? `约 ${Math.round(seconds / 3600)} 小时`
            : seconds < 31_536_000
              ? `约 ${Math.round(seconds / 86_400)} 天`
              : `约 ${Math.round(seconds / 31_536_000).toLocaleString()} 年`;
  return {
    score,
    label: ['很弱', '较弱', '一般', '较强', '很强'][score],
    entropyBits: Number(entropyBits.toFixed(1)),
    poolSize,
    suggestions,
    crackTime,
  };
}
