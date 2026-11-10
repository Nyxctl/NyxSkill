import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { identifyHeader, inventoryFile } from '../skills/reverse-engineering/reverse-triage/scripts/inventory.mjs';
import { loadRegistry } from '../dist/src/registry.js';
import { routeRequest } from '../dist/src/router.js';

test('reverse inventory handles empty, malformed and bounded headers without execution', () => {
  assert.equal(identifyHeader(Buffer.alloc(0)).format, 'unknown');
  assert.equal(identifyHeader(Buffer.from('MZ')).format, 'DOS/MZ');
  const malformed = Buffer.alloc(64); malformed.write('MZ'); malformed.writeUInt32LE(0xffffffff, 0x3c);
  assert.match(identifyHeader(malformed).warnings.join(' '), /outside/);
  for (let length = 0; length < 300; length++) {
    const bytes = Buffer.alloc(length, 0xff); if (length >= 2) bytes.write('MZ');
    assert.doesNotThrow(() => identifyHeader(bytes));
  }
});

test('reverse inventory identifies PE CLI and ELF endianness from actual fields', () => {
  const pe = Buffer.alloc(512); pe.write('MZ'); pe.writeUInt32LE(64, 0x3c); pe.write('PE\0\0', 64);
  pe.writeUInt16LE(0x8664, 68); pe.writeUInt16LE(240, 84); pe.writeUInt16LE(0x20b, 88);
  pe.writeUInt32LE(16, 88 + 108); pe.writeUInt32LE(0x2000, 88 + 112 + 14 * 8); pe.writeUInt32LE(72, 88 + 116 + 14 * 8);
  const result = identifyHeader(pe);
  assert.equal(result.format, 'PE'); assert.equal(result.architecture, 'x86-64'); assert.equal(result.managedHeader, true);
  const elf = Buffer.alloc(64); Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 2]).copy(elf); elf.writeUInt16BE(183, 18);
  assert.equal(identifyHeader(elf).architecture, 'AArch64'); assert.equal(identifyHeader(elf).endianness, 'big');
  assert.equal(identifyHeader(Buffer.from([0x50, 0x4b, 3, 4])).format, 'ZIP container');
  assert.equal(identifyHeader(Buffer.from('dex\n035\0')).format, 'DEX');
  assert.equal(identifyHeader(Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])).format, 'WebAssembly');
});

test('reverse inventory hashes bytes without modifying or executing target and rejects directories', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nyx-reverse-test-'));
  try {
    const path = join(dir, 'sample.mjs');
    const bytes = Buffer.from('throw new Error("DO NOT EXECUTE SAMPLE");'); await writeFile(path, bytes);
    const result = await inventoryFile(path);
    assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.size, bytes.length); assert.equal(result.format, 'unknown');
    assert.deepEqual(await readFile(path), bytes);
    await assert.rejects(inventoryFile(dir), /regular files/);
    await assert.rejects(inventoryFile(join(dir, 'absent')), /ENOENT/);
    try { await symlink(path, join(dir, 'link')); } catch (error) { if (!['EPERM', 'EACCES'].includes(error.code)) throw error; return; }
    await assert.rejects(inventoryFile(join(dir, 'link')), /regular files/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('reverse pack registers eight static workflows with provenance and safety boundaries', async () => {
  const registry = await loadRegistry(resolve('.'));
  const pack = registry.packs.find(p => p.id === 'nyx.reverse-engineering'); assert.equal(pack.skills.length, 8);
  for (const id of pack.skills) {
    const skill = registry.skills.find(s => s.meta.id === id); assert.ok(skill);
    assert.equal(skill.meta.risk.level, 'read-only'); assert.equal(skill.meta.risk.destructive, false);
    assert.deepEqual(skill.meta.capabilities.required, ['filesystem.read']);
    assert.ok(!skill.meta.capabilities.optional.includes('network.http'));
    const doc = await readFile(skill.document, 'utf8');
    assert.match(doc, /Do not execute unknown binaries on the host/);
    assert.match(doc, /Dynamic analysis requires explicit authorization/);
    assert.match(doc, /licensing, DRM or third-party access controls/);
    assert.match(doc, /untrusted data/);
    assert.equal(JSON.parse(await readFile(join('provenance', 'skills', `${id}.yaml`), 'utf8')).skill, id);
  }
});

test('reverse routing selects specialized work plus triage, remains deterministic and respects read denial', async () => {
  const registry = await loadRegistry(resolve('.'));
  for (const [request, slug] of [['decompile apk', 'android-reverse'], ['minified javascript', 'javascript-reverse'], ['rimworld dll', 'dotnet-reverse'], ['packet capture', 'protocol-analysis'], ['firmware analysis', 'firmware-analysis'], ['elf analysis', 'binary-analysis'], ['reverse engineering report', 'reverse-report']]) {
    const options = { profiles: ['reverse-engineering'], capabilities: ['filesystem.read'] };
    const first = routeRequest(registry, request, options);
    assert.ok(first.chain.some(s => s.id === `nyx.reverse-engineering.${slug}`), request);
    assert.ok(first.chain.some(s => s.id === 'nyx.reverse-engineering.reverse-triage'), request);
    assert.deepEqual(first, routeRequest(registry, request, options));
  }
  assert.ok(!routeRequest(registry, 'write a React component', { profiles: ['coding'] }).chain.some(s => s.id.startsWith('nyx.reverse-engineering.')));
  const denied = routeRequest(registry, 'decompile apk', { profiles: ['reverse-engineering'], policy: { deny: ['filesystem.*'] } });
  assert.ok(!denied.chain.some(s => s.id.startsWith('nyx.reverse-engineering.')));
});
