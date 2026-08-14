const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareBookFilenames(left: string, right: string): number {
  return collator.compare(left, right);
}

export function sortBookFilenames(names: string[]): string[] {
  return [...names].sort(compareBookFilenames);
}
