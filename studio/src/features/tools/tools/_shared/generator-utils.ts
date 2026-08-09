function secureInteger(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1) throw new Error('随机范围无效。');
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}

export function secureString(length: number, alphabet: string): string {
  const characters = Array.from(new Set(Array.from(alphabet))).join('');
  if (characters.length < 2) throw new Error('字符集至少需要两个不同字符。');
  const size = Math.max(1, Math.min(4096, Math.trunc(length)));
  return Array.from({ length: size }, () => characters[secureInteger(characters.length)]).join('');
}

export function randomNumbers(min: number, max: number, count: number, decimals: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max)
    throw new Error('最小值不能大于最大值。');
  const size = Math.max(1, Math.min(1000, Math.trunc(count)));
  const places = Math.max(0, Math.min(8, Math.trunc(decimals)));
  const scale = 10 ** places;
  const low = Math.ceil(min * scale);
  const high = Math.floor(max * scale);
  const range = high - low + 1;
  if (!Number.isSafeInteger(range) || range < 1 || range > 0xffffffff)
    throw new Error('随机范围过大。');
  return Array.from({ length: size }, () => (low + secureInteger(range)) / scale);
}

export function fakeUser(): Record<string, unknown> {
  const surnames = ['林', '陈', '周', '许', '顾', '沈', '江', '宋'];
  const given = ['星河', '清越', '知夏', '言川', '予安', '云舟', '若宁', '景行'];
  const cities = ['上海', '杭州', '成都', '深圳', '南京', '苏州', '厦门', '武汉'];
  const name = surnames[secureInteger(surnames.length)] + given[secureInteger(given.length)];
  const year = 1985 + secureInteger(21);
  const month = 1 + secureInteger(12);
  const day = 1 + secureInteger(28);
  const username = `user_${secureString(8, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
  return {
    id: crypto.randomUUID(),
    name,
    username,
    email: `${username}@example.com`,
    birthday: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    city: cities[secureInteger(cities.length)],
    bio: '这是浏览器本地生成的虚构测试用户。',
    fictional: true,
  };
}

export function avatarSvg(label: string, background: string, foreground: string): string {
  const initials = Array.from(label.trim() || 'M')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const safe = initials.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ??
      character,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="128" fill="${background}"/><circle cx="390" cy="116" r="68" fill="${foreground}" opacity=".12"/><text x="256" y="286" text-anchor="middle" dominant-baseline="middle" fill="${foreground}" font-family="system-ui,sans-serif" font-size="176" font-weight="700">${safe}</text></svg>`;
}
