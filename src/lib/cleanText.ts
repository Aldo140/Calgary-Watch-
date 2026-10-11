/**
 * Feed text arrives with HTML entities (sometimes encoded twice, "&amp;#8211;"),
 * Windows-1252 mojibake ("Â " before a space) and replacement characters where a
 * feed broke an emoji. Titles and summaries go through this before anyone sees them.
 */
const NAMED: Record<string, string> = {
  amp: '&', quot: '"', apos: '’', lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', eacute: 'é', egrave: 'è', ccedil: 'ç', rarr: '→',
};

/** Third byte of a UTF-8 punctuation mark (E2 80 xx). */
const C1_PUNCT: Record<number, string> = { 0x93: '–', 0x94: '—', 0x98: '‘', 0x99: '’', 0x9c: '“', 0x9d: '”', 0xa6: '…', 0xa2: '•' };

function decodeOnce(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

function repair(input: string): string {
  let s = input;
  for (let i = 0; i < 3 && /&(#x?[0-9a-f]+|[a-z]+);/i.test(s); i++) s = decodeOnce(s);
  return s
    .replace(/Â(?=[\s\u00a0])/g, '')        // UTF-8 nbsp read as Windows-1252
    .replace(/â€™/g, '’').replace(/â€œ/g, '“').replace(/â€\u009d/g, '”').replace(/â€“/g, '–').replace(/â€”/g, '—')
    // The same punctuation when the feed's bytes came through as C1 controls ("Â\x80\x93").
    .replace(/[âÂ]\u0080([\u0080-\u009f])/g, (_, c: string) => C1_PUNCT[c.charCodeAt(0)] ?? '')
    .replace(/Ã([\u0080-\u00bf])/g, (_, c: string) => String.fromCharCode(0xc0 + c.charCodeAt(0) - 0x80)) // "Ã©" → "é"
    .replace(/[\u0080-\u009f]/g, '')
    .replace(/\uFFFD/g, '');                // a character the feed couldn't encode
}

/** One line of text: a title, venue or summary. */
export function cleanText(input: string): string;
export function cleanText(input: string | undefined): string | undefined;
export function cleanText(input: string | undefined): string | undefined {
  return input ? repair(input).replace(/[\s\u00a0]+/g, ' ').trim() : input;
}

/** A description: same repairs, but paragraphs keep their line breaks. */
export function cleanBlock(input: string): string;
export function cleanBlock(input: string | undefined): string | undefined;
export function cleanBlock(input: string | undefined): string | undefined {
  return input ? repair(input).replace(/[ \t\u00a0]+/g, ' ').trim() : input;
}
