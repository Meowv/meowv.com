export interface KeyboardKey {
  code: string;
  label: string;
  width: number;
  sub?: string;
  mac?: string;
  macSub?: string;
  macCode?: string;
  tall?: boolean;
  placeholder?: boolean;
}

export interface KeyboardRow {
  main: KeyboardKey[];
  nav: KeyboardKey[];
  numpad: KeyboardKey[];
}

function key(
  code: string,
  label: string,
  width = 1,
  options: Omit<Partial<KeyboardKey>, 'code' | 'label' | 'width'> = {},
): KeyboardKey {
  return { code, label, width, ...options };
}

function placeholder(width = 1): KeyboardKey {
  return { code: '', label: '', width, placeholder: true };
}

function functionGroup(start: number): KeyboardKey[] {
  return Array.from({ length: 4 }, (_, index) => {
    const number = start + index;
    return key(`F${number}`, `F${number}`);
  });
}

function letterKeys(letters: string): KeyboardKey[] {
  return [...letters].map((letter) => key(`Key${letter}`, letter));
}

export const functionGroups: KeyboardKey[][] = [
  [key('Escape', 'Esc')],
  functionGroup(1),
  functionGroup(5),
  functionGroup(9),
];

export const functionNav: KeyboardKey[] = [
  key('PrintScreen', 'PrtSc'),
  key('ScrollLock', 'ScrLk'),
  key('Pause', 'Pause'),
];

export const keyboardRows: KeyboardRow[] = [
  {
    main: [
      key('Backquote', '`', 1, { sub: '~' }),
      key('Digit1', '1', 1, { sub: '!' }),
      key('Digit2', '2', 1, { sub: '@' }),
      key('Digit3', '3', 1, { sub: '#' }),
      key('Digit4', '4', 1, { sub: '$' }),
      key('Digit5', '5', 1, { sub: '%' }),
      key('Digit6', '6', 1, { sub: '^' }),
      key('Digit7', '7', 1, { sub: '&' }),
      key('Digit8', '8', 1, { sub: '*' }),
      key('Digit9', '9', 1, { sub: '(' }),
      key('Digit0', '0', 1, { sub: ')' }),
      key('Minus', '-', 1, { sub: '_' }),
      key('Equal', '=', 1, { sub: '+' }),
      key('Backspace', 'Backspace', 2, { mac: '⌫' }),
    ],
    nav: [key('Insert', 'Insert'), key('Home', 'Home'), key('PageUp', 'PgUp')],
    numpad: [
      key('NumLock', 'Num', 1, { sub: 'Lock' }),
      key('NumpadDivide', '/'),
      key('NumpadMultiply', '×'),
      key('NumpadSubtract', '−'),
    ],
  },
  {
    main: [key('Tab', 'Tab', 1.5, { mac: '⇥' })]
      .concat(letterKeys('QWERTYUIOP'))
      .concat([
        key('BracketLeft', '[', 1, { sub: '{' }),
        key('BracketRight', ']', 1, { sub: '}' }),
        key('Backslash', '\\', 1.5, { sub: '|' }),
      ]),
    nav: [key('Delete', 'Delete', 1, { mac: '⌦' }), key('End', 'End'), key('PageDown', 'PgDn')],
    numpad: [
      key('Numpad7', '7', 1, { sub: 'Home' }),
      key('Numpad8', '8', 1, { sub: '↑' }),
      key('Numpad9', '9', 1, { sub: 'PgUp' }),
      key('NumpadAdd', '+', 1, { tall: true }),
    ],
  },
  {
    main: [key('CapsLock', 'Caps', 1.75, { sub: 'Lock', mac: '⇪', macSub: '' })]
      .concat(letterKeys('ASDFGHJKL'))
      .concat([
        key('Semicolon', ';', 1, { sub: ':' }),
        key('Quote', "'", 1, { sub: '"' }),
        key('Enter', 'Enter', 2.25, { mac: '↩' }),
      ]),
    nav: [placeholder(), placeholder(), placeholder()],
    numpad: [
      key('Numpad4', '4', 1, { sub: '←' }),
      key('Numpad5', '5'),
      key('Numpad6', '6', 1, { sub: '→' }),
      placeholder(),
    ],
  },
  {
    main: [key('ShiftLeft', 'Shift', 2.25, { mac: '⇧' })]
      .concat(letterKeys('ZXCVBNM'))
      .concat([
        key('Comma', ',', 1, { sub: '<' }),
        key('Period', '.', 1, { sub: '>' }),
        key('Slash', '/', 1, { sub: '?' }),
        key('ShiftRight', 'Shift', 2.75, { mac: '⇧' }),
      ]),
    nav: [placeholder(), key('ArrowUp', '↑'), placeholder()],
    numpad: [
      key('Numpad1', '1', 1, { sub: 'End' }),
      key('Numpad2', '2', 1, { sub: '↓' }),
      key('Numpad3', '3', 1, { sub: 'PgDn' }),
      key('NumpadEnter', 'Enter', 1, { tall: true, mac: '↩' }),
    ],
  },
  {
    main: [
      key('ControlLeft', 'Ctrl', 1.25, { mac: '⌃' }),
      key('MetaLeft', 'Win', 1.25, { mac: '⌥', macCode: 'AltLeft' }),
      key('AltLeft', 'Alt', 1.25, { mac: '⌘', macCode: 'MetaLeft' }),
      key('Space', 'Space', 6.25),
      key('AltRight', 'Alt', 1.25, { mac: '⌘', macCode: 'MetaRight' }),
      key('MetaRight', 'Win', 1.25, { mac: '⌥', macCode: 'AltRight' }),
      key('ContextMenu', 'Menu', 1.25),
      key('ControlRight', 'Ctrl', 1.25, { mac: '⌃' }),
    ],
    nav: [key('ArrowLeft', '←'), key('ArrowDown', '↓'), key('ArrowRight', '→')],
    numpad: [
      key('Numpad0', '0', 2, { sub: 'Ins' }),
      key('NumpadDecimal', '.', 1, { sub: 'Del' }),
      placeholder(),
    ],
  },
];

export const allKeyboardKeys = [
  ...functionGroups.flat(),
  ...functionNav,
  ...keyboardRows.flatMap((row) => [...row.main, ...row.nav, ...row.numpad]),
].filter((item) => !item.placeholder);

export const numpadCodes = new Set(
  keyboardRows
    .flatMap((row) => row.numpad)
    .filter((item) => !item.placeholder)
    .map((item) => item.code),
);

export const FULL_KEY_COUNT = 104;
export const TKL_KEY_COUNT = 87;
