export function calculateExpression(source: string): number {
  const tokens = source.match(/\d*\.?\d+(?:e[+-]?\d+)?|[()+\-*/%]/gi);
  if (!tokens || tokens.join('') !== source.replace(/\s+/g, ''))
    throw new Error('表达式包含不支持的字符。');
  const output: Array<number | string> = [];
  const operators: string[] = [];
  const priority: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
  let previous = 'start';
  for (const token of tokens) {
    if (/^\d/.test(token) || /^\.\d/.test(token)) {
      output.push(Number(token));
      previous = 'number';
    } else if (token === '(') {
      operators.push(token);
      previous = 'open';
    } else if (token === ')') {
      while (operators.length && operators.at(-1) !== '(') output.push(operators.pop()!);
      if (operators.pop() !== '(') throw new Error('括号不匹配。');
      previous = 'close';
    } else {
      if (token === '-' && (previous === 'start' || previous === 'open' || previous === 'operator'))
        output.push(0);
      while (
        operators.length &&
        operators.at(-1) !== '(' &&
        (priority[operators.at(-1)!] ?? 0) >= priority[token]
      )
        output.push(operators.pop()!);
      operators.push(token);
      previous = 'operator';
    }
  }
  while (operators.length) {
    const operator = operators.pop()!;
    if (operator === '(') throw new Error('括号不匹配。');
    output.push(operator);
  }
  const stack: number[] = [];
  for (const token of output) {
    if (typeof token === 'number') stack.push(token);
    else {
      const right = stack.pop();
      const left = stack.pop();
      if (left === undefined || right === undefined) throw new Error('表达式不完整。');
      const value =
        token === '+'
          ? left + right
          : token === '-'
            ? left - right
            : token === '*'
              ? left * right
              : token === '/'
                ? left / right
                : left % right;
      stack.push(value);
    }
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error('计算结果无效。');
  return stack[0];
}

const symbols =
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(
    ' ',
  );
const names =
  '氢 氦 锂 铍 硼 碳 氮 氧 氟 氖 钠 镁 铝 硅 磷 硫 氯 氩 钾 钙 钪 钛 钒 铬 锰 铁 钴 镍 铜 锌 镓 锗 砷 硒 溴 氪 铷 锶 钇 锆 铌 钼 锝 钌 铑 钯 银 镉 铟 锡 锑 碲 碘 氙 铯 钡 镧 铈 镨 钕 钷 钐 铕 钆 铽 镝 钬 铒 铥 镱 镥 铪 钽 钨 铼 锇 铱 铂 金 汞 铊 铅 铋 钋 砹 氡 钫 镭 锕 钍 镤 铀 镎 钚 镅 锔 锫 锎 锿 镄 钔 锘 铹 𬬻 𬭊 𬭳 𬭛 𬭶 鐽 錀 鎶 鉨 鈇 镆 鉝 鿬 鿫 鿭'.split(
    ' ',
  );
export const elements = symbols.map((symbol, index) => ({
  atomicNumber: index + 1,
  symbol,
  name: names[index] ?? symbol,
  period:
    index < 2
      ? 1
      : index < 10
        ? 2
        : index < 18
          ? 3
          : index < 36
            ? 4
            : index < 54
              ? 5
              : index < 86
                ? 6
                : 7,
}));

const answers = [
  '可以，先迈出一小步。',
  '现在不是最佳时机。',
  '把问题换个角度再看。',
  '相信你的第一直觉。',
  '先收集更多信息。',
  '答案就在你已经忽略的细节里。',
  '今天适合行动。',
  '与可信任的人讨论一下。',
  '保持耐心，结果会更清晰。',
  '做一个最小可逆的尝试。',
  '暂时放下，明天再决定。',
  '专注你能够控制的部分。',
];
export function randomAnswer(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return answers[values[0] % answers.length];
}
