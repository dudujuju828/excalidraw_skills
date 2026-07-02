import { randomInt } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const used = new Set<string>();

/**
 * 8-char lowercase alphanumeric id. Doubles as the Obsidian block
 * reference for text elements, so it must stay block-ref safe.
 */
export function makeId(): string {
  for (;;) {
    let id = "";
    for (let i = 0; i < 8; i++) {
      id += ALPHABET[randomInt(ALPHABET.length)];
    }
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

export function randomSeed(): number {
  return randomInt(1, 2 ** 31);
}
