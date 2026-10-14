import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
for (const name of ['didi', 'tencent-meeting']) {
 test(`${name}: client registers localized credential panel and disposes`, async () => {
  const source = await readFile(new URL(`../plugins/dsh-plugin-${name}/settings.js`, import.meta.url), 'utf8');
  let module; const calls=[]; const effects=[];
  vm.runInNewContext(source,{window:{__ModuleLoader__:{load:m=>{module=m;}}}});
  assert.equal(module.id,`dsh-plugin-${name}`);
  const exported=module.factory(id=>{assert.equal(id,'react');return {};});
  assert.ok(exported.inject.includes('remote.credentials'));
  const ctx={effect:f=>{effects.push(f());},locale:{register:(_ns,d)=>{assert.ok(d.zh.save);assert.ok(d.en.save);return ()=>calls.push('locale');},bind:()=>key=>key},slots:{inject:(_slot,f)=>f(),register:(spec,Panel)=>{assert.equal(spec.name,'plugins.item');assert.equal(typeof Panel,'function');return ()=>calls.push('slot');}}};
  exported.apply(ctx);effects.forEach(f=>f?.());assert.deepEqual(calls,['locale','slot']);
 });
 test(`${name}: no secret readback, browser persistence or console logging`,async()=>{
  const source=await readFile(new URL(`../plugins/dsh-plugin-${name}/settings.js`,import.meta.url),'utf8');
  assert.ok(source.includes("type: 'password'"));assert.ok(source.includes('credentials.set(ref, input.current.value)'));assert.ok(source.includes('credentials.unset(ref)'));assert.ok(source.includes('info.writable !== true'));
  assert.ok(!/localStorage|sessionStorage|console\.|credentials\.resolve|innerHTML/.test(source));
  assert.ok(source.includes("input.current.value = ''"));
 });
}
