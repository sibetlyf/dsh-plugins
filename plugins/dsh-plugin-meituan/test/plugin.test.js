import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, validateConfig, MeituanBrowser } from '../browser.js';
import { apply } from '../index.js';
test('reject unknown actions and wrong parameter types', () => {
 for (const [action,args] of [['pay',{}],['search_meituan',{}],['search_meituan',{keyword:''}],['smart_scroll',{distance:3000}],['smart_scroll',{distance:1.5}],['fetch_meituan_content',{url:'x'}]]) assert.throws(()=>validate(action,args));
 validate('search_meituan',{keyword:'奶茶'}); validate('smart_scroll',{distance:-500});
});
test('payment and checkout text forbidden', () => { for (const text of ['去结算','立即支付','提交订单','清空购物车','checkout']) assert.throws(()=>validate('click_target',{text})); });
test('no invented geolocation, pairs required',()=> { validateConfig({}); validateConfig({longitude:116,latitude:39}); for(const config of [{longitude:116},{longitude:181,latitude:39},{channel:'evil'}]) assert.throws(()=>validateConfig(config)); });
function context(){ const tools=new Map(); const approvals=[]; return { tools,approvals,ctx:{effect:f=>f(),on:()=>{},skills:{register:()=>()=>{}},tools:{register:t=>{tools.set(t.name,t);return ()=>{};}},approval:{request:async r=>{approvals.push(r);return 'denied';}}}}; }
test('discovery does not launch browser and never exposes cookies',async()=> {const {ctx,tools}=context();await apply(ctx);const result=await tools.get('meituan_discover').execute({});assert.equal(result.tools.length,8);assert.equal(result.savesCookies,false);assert.equal(result.ordersSupported,false);});
test('never denies clicks and add before browser launch',async()=>{const {ctx,tools,approvals}=context();await apply(ctx);for(const [action,args] of [['click_target',{text:'餐厅'}],['add_food_to_cart',{food_name:'奶茶'}]]) await assert.rejects(tools.get('meituan_call').execute({action,arguments:args,confirmationSummary:'已展示商品与金额'},{agent:{}}),/not approved/);assert.equal(approvals.length,2);});
test('no summary cannot request approval',async()=> {const {ctx,tools,approvals}=context();await apply(ctx);await assert.rejects(tools.get('meituan_call').execute({action:'click_target',arguments:{text:'餐厅'}},{}),/Sensitive/);assert.equal(approvals.length,0);});
test('queued browser operations serialize',async()=>{const browser=new MeituanBrowser();let active=0;browser.perform=async()=>{assert.equal(active++,0);await Promise.resolve();active--;return true;};assert.deepEqual(await Promise.all([browser.run('fetch_meituan_content'),browser.run('view_cart_status')]),[true,true]);});
test('aborted call never initializes browser',async()=>{const browser=new MeituanBrowser({},()=>assert.fail());const controller=new AbortController();controller.abort();await assert.rejects(browser.run('fetch_meituan_content',{},controller.signal),/cancelled/);});
test('safe click rejects ambiguous or checkout targets',async()=>{const browser=new MeituanBrowser();await assert.rejects(browser.safeClick({count:async()=>2}),/ambiguous/);await assert.rejects(browser.safeClick({count:async()=>1,isVisible:async()=>true,evaluate:async()=>({text:'去结算'}),click:()=>assert.fail()}),/Unsafe/);});
test('close does not launch browser',async()=>{const browser=new MeituanBrowser({},()=>assert.fail());assert.deepEqual(await browser.run('close_browser'),{closed:true});});
