import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCodexInventory} from '../dist/src/codex-discovery.js';
test('CLI inventory strips configuration and never assumes auth from installation',()=>{
 const inventory=normalizeCodexInventory({installed:[{pluginId:'github@local',name:'github',installed:true,enabled:true,token:'do-not-forward',source:{path:'private-config'}}],available:[]});
 assert.equal(inventory.plugins[0].auth,'unknown');
 assert.equal(JSON.stringify(inventory).includes('do-not-forward'),false);
 assert.equal(JSON.stringify(inventory).includes('private-config'),false);
 assert.deepEqual(inventory.tools,[]);
});
test('inventory fails closed on unknown enabled/install state',()=>{
 assert.throws(()=>normalizeCodexInventory({installed:[{pluginId:'x',name:'x',installed:true}]}));
 assert.throws(()=>normalizeCodexInventory({installed:'untrusted instructions'}));
});
