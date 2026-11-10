import { readFile, stat, writeFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry { name: string; data: Buffer }

/** Deterministic ZIP writer using STORE method and zero timestamps. */
export async function writeZip(path: string, entries: ZipEntry[], exclusive = false): Promise<void> {
  const sorted = [...entries].sort((a,b)=>a.name.localeCompare(b.name));
  const locals: Buffer[] = []; const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of sorted) {
    const name = Buffer.from(entry.name.replaceAll('\\','/'));
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt16LE(0,6); local.writeUInt16LE(0,8);
    local.writeUInt16LE(0,10); local.writeUInt16LE(0,12); local.writeUInt32LE(crc,14);
    local.writeUInt32LE(entry.data.length,18); local.writeUInt32LE(entry.data.length,22); local.writeUInt16LE(name.length,26); local.writeUInt16LE(0,28); name.copy(local,30);
    locals.push(local, entry.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50,0); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt16LE(0,8); central.writeUInt16LE(0,10);
    central.writeUInt16LE(0,12); central.writeUInt16LE(0,14); central.writeUInt32LE(crc,16); central.writeUInt32LE(entry.data.length,20); central.writeUInt32LE(entry.data.length,24);
    central.writeUInt16LE(name.length,28); central.writeUInt16LE(0,30); central.writeUInt16LE(0,32); central.writeUInt16LE(0,34); central.writeUInt16LE(0,36); central.writeUInt32LE(0,38); central.writeUInt32LE(offset,42); name.copy(central,46);
    centrals.push(central);
    offset += local.length + entry.data.length;
  }
  const centralOffset = offset; const centralSize = centrals.reduce((n,b)=>n+b.length,0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0); eocd.writeUInt16LE(0,4); eocd.writeUInt16LE(0,6); eocd.writeUInt16LE(sorted.length,8); eocd.writeUInt16LE(sorted.length,10);
  eocd.writeUInt32LE(centralSize,12); eocd.writeUInt32LE(centralOffset,16); eocd.writeUInt16LE(0,20);
  await writeFile(path, Buffer.concat([...locals,...centrals,eocd]), { flag: exclusive ? 'wx' : 'w' });
}


/** Conservative ZIP32 limits prevent archive bombs before decompression. */
export const ZIP_LIMITS = { archiveBytes: 128 * 1024 * 1024, entryBytes: 64 * 1024 * 1024, totalBytes: 256 * 1024 * 1024, entries: 10000 } as const;
export function assertArchivePath(name: string): void {
  const path = name.endsWith('/') ? name.slice(0, -1) : name;
  if (!path || /[\\:\x00-\x1f<>"|?*]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error(`Unsafe ZIP path: ${name}`);
}
export async function readZip(path: string | Buffer): Promise<ZipEntry[]> {
  if ((Buffer.isBuffer(path) ? path.length : (await stat(path)).size) > ZIP_LIMITS.archiveBytes) throw new Error('ZIP archive size limit exceeded');
  const buf = Buffer.isBuffer(path) ? path : await readFile(path);
  function bounds(offset: number, size: number): void { if (offset < 0 || size < 0 || offset + size > buf.length) throw new Error('Invalid ZIP bounds'); }
  let eocd = -1;
  for (let i = Math.max(0, buf.length - 65557); i <= buf.length - 22; i++) if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) eocd = i;
  if (eocd < 0) throw new Error('Invalid ZIP: EOCD not found');
  const count = buf.readUInt16LE(eocd + 10), centralOffset = buf.readUInt32LE(eocd + 16), centralSize = buf.readUInt32LE(eocd + 12);
  if (buf.readUInt16LE(eocd + 4) || buf.readUInt16LE(eocd + 6) || buf.readUInt16LE(eocd + 8) !== count || centralOffset + centralSize !== eocd) throw new Error('Invalid or unsupported multidisk/ZIP64 directory');
  if (count > ZIP_LIMITS.entries) throw new Error('ZIP entry count limit exceeded');
  const entries: ZipEntry[] = []; const seen = new Map<string, boolean>(); const spellings = new Map<string, string>(); const ranges: [number, number][] = [];
  let p = centralOffset, total = 0;
  for (let i = 0; i < count; i++) {
    bounds(p, 46); if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), compressed = buf.readUInt32LE(p + 20), uncompressed = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), localOffset = buf.readUInt32LE(p + 42);
    bounds(p + 46, nameLen + extraLen + commentLen);
    if (p + 46 + nameLen + extraLen + commentLen > eocd || buf.readUInt16LE(p + 34) || flags & ~0x0808 || ![0, 8].includes(method)) throw new Error('Unsupported ZIP flags, disk or compression');
    const nameBytes = buf.subarray(p + 46, p + 46 + nameLen); const name = nameBytes.toString('utf8');
    if (!Buffer.from(name).equals(nameBytes)) throw new Error('Invalid ZIP filename encoding'); assertArchivePath(name);
    const directory = name.endsWith('/'), key = (directory ? name.slice(0, -1) : name).toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate/case collision ZIP path: ${name}`);
    const previouslyImpliedDirectory = spellings.has(key);
    const parts = (directory ? name.slice(0, -1) : name).split('/');
    for (let n = 1; n <= parts.length; n++) {
      const prefix = parts.slice(0, n).join('/'), lower = prefix.toLowerCase();
      if (spellings.has(lower) && spellings.get(lower) !== prefix) throw new Error(`Case collision ZIP path: ${name}`); spellings.set(lower, prefix);
      if (n < parts.length && seen.get(lower) === false) throw new Error(`ZIP file/directory collision: ${name}`);
    }
    if (!directory && previouslyImpliedDirectory) throw new Error(`ZIP file/directory collision: ${name}`); seen.set(key, directory);
    const mode = (buf.readUInt32LE(p + 38) >>> 16) & 0xf000;
    if (mode && mode !== 0x8000 && mode !== 0x4000) throw new Error('Unsupported ZIP symbolic link or special file');
    total += uncompressed;
    if (uncompressed > ZIP_LIMITS.entryBytes || total > ZIP_LIMITS.totalBytes) throw new Error('ZIP output size budget exceeded');
    bounds(localOffset, 30); if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid ZIP local header');
    const localNameLen = buf.readUInt16LE(localOffset + 26), localExtraLen = buf.readUInt16LE(localOffset + 28), start = localOffset + 30 + localNameLen + localExtraLen;
    bounds(localOffset + 30, localNameLen + localExtraLen); bounds(start, compressed);
    if (start + compressed > centralOffset || buf.readUInt16LE(localOffset + 6) !== flags || buf.readUInt16LE(localOffset + 8) !== method || !buf.subarray(localOffset + 30, localOffset + 30 + localNameLen).equals(nameBytes)) throw new Error('ZIP local/central header mismatch');
    if (!(flags & 8) && (buf.readUInt32LE(localOffset + 14) !== crc || buf.readUInt32LE(localOffset + 18) !== compressed || buf.readUInt32LE(localOffset + 22) !== uncompressed)) throw new Error('ZIP local/central size or CRC mismatch');
    ranges.push([localOffset, start + compressed]);
    const raw = buf.subarray(start, start + compressed);
    const data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: Math.max(1, uncompressed) });
    if (data.length !== uncompressed || directory && data.length) throw new Error(`ZIP size mismatch for ${name}`);
    if (crc32(data) !== crc) throw new Error(`ZIP CRC checksum mismatch for ${name}`);
    entries.push({ name, data }); p += 46 + nameLen + extraLen + commentLen;
  }
  if (p !== eocd) throw new Error('Invalid ZIP directory length');
  ranges.sort((a, b) => a[0] - b[0]); for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) throw new Error('Invalid overlapping ZIP entries');
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}
