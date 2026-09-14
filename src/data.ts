import { readFile } from 'node:fs/promises';

function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if ((c === '"' || c === "'") && line[i - 1] !== '\\') quote = quote === c ? null : quote ?? c;
    if (c === '#' && quote === null && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line;
}

function scalar(raw: string): unknown {
  const s = raw.trim();
  if (s === '') return {};
  if (s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    if (s.startsWith('"')) return JSON.parse(s);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
    try { return JSON.parse(s.replace(/'/g, '"')); } catch { /* fall through */ }
  }
  return s;
}

type Frame = { indent: number; value: Record<string, unknown> | unknown[]; parent?: Frame; key?: string };

/** Safe, dependency-free YAML subset parser. Supports maps, sequences, scalars, inline JSON, and block strings. */
export function parseYamlSubset(text: string): unknown {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const root: Record<string, unknown> = {};
  const stack: Frame[] = [{ indent: -1, value: root }];

  for (let index = 0; index < lines.length; index += 1) {
    let raw = stripComment(lines[index]);
    if (!raw.trim() || raw.trim() === '---' || raw.trim() === '...') continue;
    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    raw = raw.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const frame = stack[stack.length - 1];

    if (raw.startsWith('- ')) {
      if (!Array.isArray(frame.value)) throw new Error(`YAML sequence at line ${index + 1} has no array parent`);
      const item = raw.slice(2).trim();
      if (item.includes(':')) {
        const [k, ...rest] = item.split(':');
        const obj: Record<string, unknown> = {};
        obj[k.trim()] = scalar(rest.join(':'));
        frame.value.push(obj);
        stack.push({ indent, value: obj, parent: frame });
      } else frame.value.push(scalar(item));
      continue;
    }

    const colon = raw.indexOf(':');
    if (colon < 1 || Array.isArray(frame.value)) throw new Error(`Invalid YAML mapping at line ${index + 1}`);
    const key = raw.slice(0, colon).trim();
    const rest = raw.slice(colon + 1).trim();
    if (rest === '|' || rest === '>') {
      const parts: string[] = [];
      const baseIndent = indent;
      while (index + 1 < lines.length) {
        const next = lines[index + 1];
        const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
        if (next.trim() && nextIndent <= baseIndent) break;
        index += 1;
        parts.push(next.slice(Math.min(next.length, baseIndent + 2)));
      }
      frame.value[key] = rest === '>' ? parts.join(' ').replace(/\s+/g, ' ').trim() : parts.join('\n');
      continue;
    }
    if (rest !== '') {
      frame.value[key] = scalar(rest);
      continue;
    }

    // Infer child container from the next meaningful line.
    let isArray = false;
    for (let j = index + 1; j < lines.length; j += 1) {
      const next = stripComment(lines[j]);
      if (!next.trim()) continue;
      const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
      if (nextIndent <= indent) break;
      isArray = next.trim().startsWith('- ');
      break;
    }
    const child: Record<string, unknown> | unknown[] = isArray ? [] : {};
    frame.value[key] = child;
    stack.push({ indent, value: child, parent: frame, key });
  }
  return root;
}

export function parseData(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try { return JSON.parse(trimmed); } catch { return parseYamlSubset(text); }
}

export async function readDataFile(path: string): Promise<unknown> {
  return parseData(await readFile(path, 'utf8'));
}
