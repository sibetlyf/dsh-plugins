import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
for (const name of ['didi','tencent-meeting']) {
 test(`${name}: save and delete use credential service, clear input, handle rejection`, async()=> {
  let module, Panel; const state=[]; const refs=[]; let si=0,ri=0; const calls=[];let fail=false;
  const React={createElement:(type,props,...children)=>({type,props:props??{},children}),useState:initial=>{const i=si++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=v;}];},useRef:initial=>{const i=ri++;return refs[i]??=( {current:initial});},useEffect:()=>{}};
  vm.runInNewContext(await readFile(new URL(`../plugins/dsh-plugin-${name}/settings.js`,import.meta.url),'utf8'),{window:{confirm:()=>true,__ModuleLoader__:{load:m=>{module=m;}}}});
  const client=module.factory(()=>React);
  const ctx={effect:f=>f(),locale:{register:()=>()=>{},bind:()=>k=>k},slots:{inject:(_s,f)=>f(),register:(_s,p)=>{Panel=p;return ()=>{};}},remote:{credentials:{describe:async()=>({[state[0]]:{configured:true,writable:true}}),set:async(ref,value)=>{calls.push(['set',ref,value]);if(fail)throw Error('secret echoed by server');},unset:async ref=>{calls.push(['unset',ref]);}},$on:()=>()=>{}}};
  client.apply(ctx);
  function render(){si=ri=0;return Panel({ctx,t:k=>k});}
  function elements(node){return [node,...node.children.flat().filter(n=>n&&typeof n==='object').flatMap(elements)];}
  render();state[1]={configured:true,writable:true};refs[0].current={value:'FAKE_ONLY'};
  let tree=render();await elements(tree).find(n=>n.type==='button'&&n.children[0]==='save').props.onClick();
  // UI handlers intentionally return void; flush asynchronous credential operations.
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(calls[0][0],'set');assert.equal(calls[0][2],'FAKE_ONLY');assert.equal(refs[0].current.value,'');
  tree=render();await elements(tree).find(n=>n.type==='button'&&n.children[0]==='remove').props.onClick();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(calls[1][0],'unset');
  fail=true;refs[0].current.value='FAKE_ONLY';tree=render();elements(tree).find(n=>n.type==='button'&&n.children[0]==='save').props.onClick();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(refs[0].current.value,'');assert.equal(state[3],'failed');
  state[1]={configured:true,writable:false};tree=render();assert.equal(elements(tree).find(n=>n.type==='button'&&n.children[0]==='save').props.disabled,true);
 });
}
