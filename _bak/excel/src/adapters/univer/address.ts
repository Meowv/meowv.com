const CELL_ADDRESS_PATTERN = /^([A-Z]+)([1-9]\d*)$/i;

export function decodeNormalizedAddress(address: string): {
  row: number;
  column: number;
} | null {
  const match = CELL_ADDRESS_PATTERN.exec(address);
  if (!match) {
    return null;
  }
  const columnLetters = match[1];
  const rowNumber = match[2];
  if (!columnLetters || !rowNumber) {
    return null;
  }

  let column = 0;
  for (const character of columnLetters.toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }

  return {
    row: Number(rowNumber) - 1,
    column: column - 1,
  };
}

export function encodeNormalizedAddress(row: number, column: number): string {
  let value = column + 1;
  let letters = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }

  return `${letters}${row + 1}`;
}
