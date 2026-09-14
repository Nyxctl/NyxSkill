import { readFile, writeFile } from 'node:fs/promises';
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
export async function writeZip(path: string, entries: ZipEntry[]): Promise<void> {
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
  await writeFile(path, Buffer.concat([...locals,...centrals,eocd]));
}

export async function readZip(path: string): Promise<ZipEntry[]> {
  const buf = await readFile(path);
  let eocd = -1;
  for (let i = Math.max(0, buf.length - 65557); i <= buf.length - 22; i++) if (buf.readUInt32LE(i) === 0x06054b50) eocd = i;
  if (eocd < 0) throw new Error('Invalid ZIP: EOCD not found');
  const count = buf.readUInt16LE(eocd + 10); const centralOffset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = []; let p = centralOffset;
  for (let i=0;i<count;i++) {
    if (buf.readUInt32LE(p)!==0x02014b50) throw new Error('Invalid ZIP central directory');
    const method=buf.readUInt16LE(p+10); const compressed=buf.readUInt32LE(p+20); const uncompressed=buf.readUInt32LE(p+24);
    const nameLen=buf.readUInt16LE(p+28), extraLen=buf.readUInt16LE(p+30), commentLen=buf.readUInt16LE(p+32), localOffset=buf.readUInt32LE(p+42);
    const name=buf.subarray(p+46,p+46+nameLen).toString('utf8');
    if (name.startsWith('/') || name.includes('..')) throw new Error(`Unsafe ZIP path: ${name}`);
    if (buf.readUInt32LE(localOffset)!==0x04034b50) throw new Error('Invalid ZIP local header');
    const localNameLen=buf.readUInt16LE(localOffset+26), localExtraLen=buf.readUInt16LE(localOffset+28);
    const start=localOffset+30+localNameLen+localExtraLen; const raw=buf.subarray(start,start+compressed);
    let data:Buffer;
    if(method===0) data=Buffer.from(raw); else if(method===8) data=inflateRawSync(raw); else throw new Error(`Unsupported ZIP compression method: ${method}`);
    if(data.length!==uncompressed) throw new Error(`ZIP size mismatch for ${name}`);
    entries.push({name,data}); p += 46+nameLen+extraLen+commentLen;
  }
  return entries.sort((a,b)=>a.name.localeCompare(b.name));
}
