import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 512 * 1024 * 1024;
const machines = { 0x14c: 'x86', 0x8664: 'x86-64', 0x1c4: 'ARM', 0xaa64: 'AArch64' };

// Header facts only: extension names and strings are not proof of executable behavior.
export function identifyHeader(bytes) {
  const result = { format: 'unknown', architecture: 'unknown', warnings: [] };
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    result.format = 'ELF';
    if (bytes.length < 20 || ![1, 2].includes(bytes[4]) || ![1, 2].includes(bytes[5])) {
      result.warnings.push('Truncated or invalid ELF identification');
    } else {
      const machine = bytes[5] === 1 ? bytes.readUInt16LE(18) : bytes.readUInt16BE(18);
      result.architecture = ({ 3: 'x86', 62: 'x86-64', 40: 'ARM', 183: 'AArch64', 243: 'RISC-V' })[machine] ?? `ELF machine ${machine}`;
      result.bits = bytes[4] === 1 ? 32 : 64;
      result.endianness = bytes[5] === 1 ? 'little' : 'big';
    }
  } else if (bytes.length >= 2 && bytes.toString('ascii', 0, 2) === 'MZ') {
    result.format = 'DOS/MZ';
    if (bytes.length < 64) result.warnings.push('Truncated DOS header');
    else {
      const pe = bytes.readUInt32LE(0x3c);
      if (pe > bytes.length - 24 || bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0') {
        result.warnings.push('PE header absent or outside bounded header window');
      } else {
        result.format = 'PE';
        result.architecture = machines[bytes.readUInt16LE(pe + 4)] ?? 'unknown';
        const optional = pe + 24;
        const size = bytes.readUInt16LE(pe + 20);
        if (size >= 2 && optional + size <= bytes.length) {
          const magic = bytes.readUInt16LE(optional);
          const countOffset = magic === 0x10b ? 92 : magic === 0x20b ? 108 : null;
          if (countOffset !== null) {
            result.bits = magic === 0x10b ? 32 : 64;
            const cli = countOffset + 4 + 14 * 8;
            if (size >= cli + 8 && bytes.readUInt32LE(optional + countOffset) > 14) {
              result.managedHeader = bytes.readUInt32LE(optional + cli) !== 0 && bytes.readUInt32LE(optional + cli + 4) !== 0;
            }
          }
        } else result.warnings.push('Optional PE header absent or truncated');
      }
    }
  } else if (bytes.length >= 8 && bytes.toString('ascii', 0, 4) === 'dex\n' && bytes[7] === 0) {
    result.format = 'DEX';
    result.architecture = 'Dalvik bytecode';
  } else if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) {
    result.format = 'ZIP container';
    result.warnings.push('Container contents not inspected; APK/JAR classification requires member inventory');
  } else if (bytes.length >= 8 && bytes.subarray(0, 4).equals(Buffer.from([0, 0x61, 0x73, 0x6d]))) {
    result.format = 'WebAssembly';
    result.architecture = 'WebAssembly bytecode';
  }
  return result;
}

export async function inventoryFile(input) {
  const path = resolve(input);
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Only explicit regular files are accepted (no symlinks or devices)');
  if (before.size > MAX_BYTES) throw new Error('File exceeds the 512 MiB inventory limit');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error('File changed before opening');
    if (opened.size > MAX_BYTES) throw new Error('File exceeds the 512 MiB inventory limit');
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let header = Buffer.alloc(0);
    let size = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > MAX_BYTES) throw new Error('File grew beyond inventory limit');
      const chunk = buffer.subarray(0, bytesRead);
      if (header.length === 0) header = Buffer.from(chunk);
      hash.update(chunk);
    }
    const after = await handle.stat();
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || size !== opened.size) throw new Error('File changed during inventory');
    return { path, size, sha256: hash.digest('hex'), ...identifyHeader(header), limitations: ['Static header inspection only; no execution, extraction, compiler or packer attribution'] };
  } finally { await handle.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = process.argv.slice(2);
  if (!files.length) { process.stderr.write('Usage: node inventory.mjs <file> [file...]\n'); process.exitCode = 2; }
  else {
    const results = [];
    for (const file of files) {
      try { results.push(await inventoryFile(file)); }
      catch (error) { results.push({ path: resolve(file), error: error.message }); process.exitCode = 1; }
    }
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  }
}
