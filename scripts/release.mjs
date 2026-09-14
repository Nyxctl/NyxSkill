import { resolve, join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildReleaseArtifacts } from '../dist/src/release.js';
const root=resolve('.'), out=join(root,'release'); await mkdir(out,{recursive:true});
const result=await buildReleaseArtifacts(root,out,{includeSource:true});
const packed=spawnSync('npm',['pack','--pack-destination',out],{cwd:root,encoding:'utf8'});
if(packed.status!==0) throw new Error(packed.stderr||packed.stdout||'npm pack failed');
const tarball=packed.stdout.trim().split(/\r?\n/).at(-1);
if(tarball){const p=join(out,tarball);const sha=createHash('sha256').update(await readFile(p)).digest('hex');await writeFile(result.checksums,(await readFile(result.checksums,'utf8'))+`${sha}  ${basename(p)}\n`);}
console.log(JSON.stringify({...result,npmTarball:tarball?join(out,tarball):null},null,2));
