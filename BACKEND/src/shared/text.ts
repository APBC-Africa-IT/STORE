/** "Brake Pads – Front (Corolla)" → "brake-pads-front-corolla" */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** "04465-02220" / "04465 02220" / "0446502220" → "0446502220" (used for part-number lookups) */
export function normalizePartNumber(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
