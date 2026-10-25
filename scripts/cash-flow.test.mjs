import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, dateSchema, transactionSchema } from '../src/lib/cash-flow-model.ts';
const account = {id:'a', name:'Conta', currency:'USD', opening_date:'2026-10-01', opening_balance:100};
const entry = (overrides={}) => ({id:'t',account_id:'a',description:'Recebimento',category:'Vendas',direction:'in',amount:10.10,due_date:'2026-10-02',paid_date:'2026-10-03',status:'paid',...overrides});

test('despesas previstas entram nas saídas e reduzem o saldo projetado sem duplicar pagamentos',()=>{
 const entries=[
  entry({id:'p1',direction:'out',status:'planned',paid_date:null,amount:100.10}),
  entry({id:'p2',direction:'out',status:'planned',paid_date:null,amount:254.79}),
  entry({id:'paid',direction:'out',amount:123}),
  entry({id:'cancelled',direction:'out',status:'cancelled',paid_date:null,amount:999}),
 ];
 for (const interval of ['daily','weekly','monthly','quarterly','yearly']) {
  const projected=summarize([account],entries,'2026-10-01','2026-10-31',interval,true);
  assert.equal(Math.round(projected.periods.reduce((sum,p)=>sum+p.outflows,0)*100),47789);
  assert.equal(projected.periods.at(-1).balance,-377.89);
  const actual=summarize([account],entries,'2026-10-01','2026-10-31',interval,false);
  assert.equal(actual.periods.at(-1).balance,-23);
 }
 const paid=entries.map(t=>t.id==='p1'?{...t,status:'paid',paid_date:'2026-10-04'}:t);
 assert.equal(summarize([account],paid,'2026-10-01','2026-10-31','monthly',true).periods[0].outflows,477.89);
});
test('realizado utiliza pagamento, previsto utiliza vencimento e cancelados não afetam saldo',()=>{
 const entries=[entry(),entry({id:'p',status:'planned',paid_date:null,amount:20}),entry({id:'c',status:'cancelled',paid_date:null,amount:999})];
 const actual=summarize([account],entries,'2026-10-02','2026-10-03','daily',false);
 assert.equal(actual.opening,100);assert.equal(actual.periods[0].inflows,0);assert.equal(actual.periods[1].balance,110.10);
 const forecast=summarize([account],entries,'2026-10-02','2026-10-03','daily',true);
 assert.equal(forecast.periods[0].inflows,20);assert.equal(forecast.periods[1].balance,130.10);
});
test('saldo inicial durante período e centavos exatos, inclusive saldo negativo',()=>{
 const report=summarize([{...account,opening_balance:-50}], [entry({amount:0.1}),entry({amount:0.2}),entry({direction:'out',amount:1})], '2026-10-01','2026-10-31','monthly',false);
 assert.equal(report.opening,0); assert.equal(report.periods[0].adjustments,-50);assert.equal(report.periods[0].balance,-50.7);
});
test('saldo anterior inclui todo histórico anterior ao filtro',()=>{
 const report=summarize([account],[entry()], '2026-10-10','2026-10-10','daily',false);
 assert.equal(report.opening,110.10);assert.equal(report.periods[0].balance,110.10);
});
test('agrupamentos preservam totais e segunda-feira define semana',()=>{
 const entries=[entry(),entry({due_date:'2026-11-01',paid_date:'2026-11-01',direction:'out',amount:5})];
 for(const interval of ['daily','weekly','monthly','quarterly','yearly']) {
   const report=summarize([account],entries,'2026-10-01','2026-12-31',interval,false);
   assert.equal(report.periods.at(-1).balance,105.10);
   assert.equal(report.periods.reduce((s,p)=>s+p.inflows,0),10.10);
 }
 assert.equal(summarize([account],entries,'2026-10-03','2026-10-04','weekly',false).periods[0].label,'2026-09-28');
});
test('período vazio e contas futuras não fabricam saldo',()=>{
 assert.equal(summarize([],[],'2026-10-01','2026-10-01','daily',true).periods[0].balance,0);
 assert.equal(summarize([{...account,opening_date:'2027-01-01'}],[],'2026-10-01','2026-10-31','monthly',false).periods[0].balance,0);
});
test('validação rejeita datas inexistentes, valor inválido e pagamento inconsistente',()=>{
 assert.equal(dateSchema.safeParse('2026-02-30').success,false);
 const valid=entry({id:'bbda1c08-3d13-44c0-920b-f1c67f1423ca',account_id:'bbda1c08-3d13-44c0-920b-f1c67f1423ca'});
 assert.equal(transactionSchema.safeParse(valid).success,true);
 for(const changes of [{amount:0},{amount:1.111},{status:'paid',paid_date:null},{status:'planned',paid_date:'2026-10-03'}]) assert.equal(transactionSchema.safeParse({...valid,...changes}).success,false);
});

test('cada linha reconcilia saldo anterior, abertura de contas e movimentações',()=>{
 const accounts=[account,{...account,id:'b',opening_date:'2026-10-05',opening_balance:50}];
 const entries=[entry(),entry({account_id:'b',paid_date:'2026-10-06',direction:'out',amount:20})];
 for(const interval of ['daily','weekly','monthly','quarterly','yearly']) {
  const report=summarize(accounts,entries,'2026-10-02','2026-11-01',interval,false);
  let previous=report.opening;
  for(const row of report.periods) {
   assert.equal(row.openingBalance,previous);
   assert.equal(Math.round(row.balance*100),Math.round(row.openingBalance*100)+Math.round(row.adjustments*100)+Math.round(row.inflows*100)-Math.round(row.outflows*100));
   previous=row.balance;
  }
  assert.equal(previous,140.1);
 }
});

test('lançamentos de contas fora da seleção ou anteriores à abertura não afetam saldos',()=>{
 const report=summarize([account],[entry({account_id:'other'}),entry({paid_date:'2026-09-30'})],'2026-10-01','2026-10-31','monthly',false);
 assert.equal(report.opening,0);
 assert.equal(report.periods[0].inflows,0);
 assert.equal(report.periods[0].balance,100);
});
