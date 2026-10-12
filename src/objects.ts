import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const catalogPath = 'skills/balatro-wiki-rules/references/objects.json';
const rulesPath = 'model/context/balatro.md';
const matchLimit = 20;

/** Kind of object each balatro://rules table describes, keyed by its first header cell. */
const tableKinds: [RegExp, string][] = [
  [/^Hand\b/, 'planet'], [/^Enhancement$/, 'enhancement'], [/^Edition$/, 'edition'], [/^Seal$/, 'seal'],
  [/^Deck$/, 'deck'], [/^Stake\b/, 'stake'], [/^Boss$/, 'blind'], [/^Tarot\b/, 'tarot'], [/^Spectral\b/, 'spectral'],
  [/^Category$/, 'pack'], [/^Tag\b/, 'tag'], [/^Base -> Upgrade\b/, 'voucher'], [/^Joker$/, 'joker'], [/^Challenge$/, 'challenge'],
];

type CatalogObject = { kind: string; name: string; lookup_url: string; source_status: string; chapter?: string } & Record<string, unknown>;
type RulesRow = { kind: string; header: string[]; cells: string[] };

function normalize(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
}

/** Rows of the per-object tables in balatro://rules, tagged with the object kind they describe. */
function rulesRows(markdown: string): RulesRow[] {
  const lines = markdown.split(/\r?\n/), rows: RulesRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!/^\|\s*---/.test(lines[i]) || !lines[i - 1].startsWith('|')) continue;
    const header = cells(lines[i - 1]);
    const kind = tableKinds.find(([pattern]) => pattern.test(header[0]))?.[1];
    for (i++; kind && i < lines.length && lines[i].startsWith('|'); i++) rows.push({ kind, header, cells: cells(lines[i]) });
  }
  return rows;
}

/** Table rows name objects tersely: "Gold" for Gold Seal, "8 Gold Stake", "Overstock -> Overstock Plus", "Arcana" for its packs. */
function rowNames(row: RulesRow): string[] {
  const names = row.cells.flatMap(cell => cell.split('->')).flatMap(cell => [cell.trim(), cell.trim().replace(/^\d+\s+/, '')]);
  return [...names, row.cells[0] + ' ' + row.kind];
}

function rulesFor(object: CatalogObject, rows: RulesRow[]): string | undefined {
  const name = normalize(object.name), pack = normalize(object.name.replace(/\s+(Normal|Jumbo|Mega)\s+Pack$/i, ''));
  const row = rows.find(row => row.kind === object.kind && rowNames(row).some(candidate => {
    const value = normalize(candidate);
    return value === name || (object.kind === 'pack' && value === pack);
  }));
  return row && row.header.map((title, index) => `${title}: ${row.cells[index] ?? ''}`).join('; ');
}

function search(query: string, objects: CatalogObject[]): CatalogObject[] {
  const needle = normalize(query);
  if (!needle) return [];
  const exact = objects.filter(object => normalize(object.name) === needle);
  return exact.length ? exact : objects.filter(object => normalize(object.name).includes(needle));
}

async function loadCatalog(root: string): Promise<CatalogObject[]> {
  try { return JSON.parse(await readFile(resolve(root, catalogPath), 'utf8')).objects; }
  catch { throw new Error('The object catalog of balatro-wiki-rules is unavailable.'); }
}

export async function objectNames(root: string, prefix: string): Promise<string[]> {
  const needle = normalize(prefix);
  return [...new Set((await loadCatalog(root)).map(object => object.name))].filter(name => normalize(name).startsWith(needle)).slice(0, 100);
}

/**
 * Port of balatro-wiki-rules/scripts/lookup.py for agents without a shell:
 * exact name match first, then substring, joined with the object's balatro://rules row.
 */
export async function lookupObjects(root: string, query: string, kind?: string, chapterUri = (path: string) => path) {
  let objects = await loadCatalog(root);
  if (kind) objects = objects.filter(object => object.kind === kind.toLowerCase());
  const found = search(query, objects);
  const rows = found.length ? rulesRows(await readFile(resolve(root, rulesPath), 'utf8')) : [];
  const matches = found.slice(0, matchLimit).map(({ lookup_url, table_source: _, individual_revision_id: __, chapter, ...object }) => ({
    ...object,
    rules: rulesFor({ lookup_url, chapter, ...object }, rows) ?? null,
    chapter: chapter ? chapterUri(chapter) : null,
    wiki: lookup_url,
  }));
  return {
    query, kind: kind ?? null, total: found.length, matches,
    ...(found.length > matchLimit ? { note: `Showing ${matchLimit} of ${found.length}; use a longer name or ?kind=.` } : {}),
    ...(found.length ? {} : { note: 'No catalog match. Use the English object name, e.g. balatro://objects/Blueprint or balatro://objects/Gold?kind=seal.' }),
  };
}
