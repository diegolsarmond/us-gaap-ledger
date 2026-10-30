import assert from 'node:assert/strict';
import { runReport, flatten } from '../src/lib/report-engine.ts';
const sources = [
 {id:'sales',label:'Sales',fields:['id','customer','amount','currency'],rows:[{id:'1',customer:'a',amount:10,currency:'USD'},{id:'2',customer:null,amount:20,currency:'BRL'},{id:'3',customer:'b',amount:30,currency:'USD'}]},
 {id:'customers',label:'Customers',fields:['id','name'],rows:[{id:'a',name:'Alice'},{id:'a',name:'Other'},{id:'b',name:'Bob'},{id:null,name:'Null must not match'}]}
];
const base = {name:'Test',source:'sales',joins:[],columns:['sales.id','sales.amount'],filters:[],groups:[],metric:'sales.amount',operation:'sum',summary:false,sort:'',descending:false};
assert.equal(runReport(sources,base).matched,3);
const join = {source:'customers',left:'sales.customer',right:'id',kind:'left'};
const left = runReport(sources,{...base,joins:[join]});
assert.equal(left.matched,4); assert.equal(left.expanded,true);
assert.equal(left.rows.find(r=>r['sales.id']==='2')['customers.name'],null);
assert.equal(runReport(sources,{...base,joins:[{...join,kind:'inner'}]}).matched,3);
const summary=runReport(sources,{...base,summary:true,groups:['sales.currency']});
assert.equal(summary.rows.find(r=>r['sales.currency']==='USD').resultado,40);
assert.equal(runReport(sources,{...base,filters:[{field:'sales.amount',operator:'gte',value:'20'}]}).matched,2);
assert.equal(runReport(sources,{...base,summary:true,operation:'avg'}).rows[0].resultado,20);
assert.deepEqual(flatten({name:'a',content:'secret',attachments:[1],address:{city:'X'}}),{name:'a','address.city':'X'});
assert.throws(()=>runReport(sources,{...base,joins:[{...join,right:'missing'}]}));
console.log('Report engine: 9 checks passed.');
