import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const c=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
try {
 await c.connect();
 await c.query(await readFile(new URL('../database/007_cash_categories.sql',import.meta.url),'utf8'));
 await c.query('BEGIN');
 const companies=(await c.query('SELECT id FROM companies WHERE active LIMIT 2')).rows;
 assert.ok(companies.length,'É necessária uma empresa ativa');
 const company=companies[0].id;
 const name='Teste categoria '+randomUUID();
 const global=(await c.query('INSERT INTO cash_categories(name) VALUES($1) RETURNING id',[name])).rows[0].id;
 const local=(await c.query('INSERT INTO cash_categories(name,company_id) VALUES($1,$2) RETURNING id',[name,company])).rows[0].id;
 const visible=(await c.query('SELECT id FROM cash_categories WHERE name=$1 AND (company_id IS NULL OR company_id=$2)',[name,company])).rows;
 assert.equal(visible.length,2);
 if(companies[1]) {
  const other=(await c.query('SELECT id FROM cash_categories WHERE name=$1 AND (company_id IS NULL OR company_id=$2)',[name,companies[1].id])).rows;
  assert.deepEqual(other.map(r=>r.id),[global]);
 }
 await c.query('SAVEPOINT duplicate');
 await assert.rejects(c.query('INSERT INTO cash_categories(name) VALUES($1)',[name.toUpperCase()]),e=>e.code==='23505');
 await c.query('ROLLBACK TO SAVEPOINT duplicate');
 await c.query('UPDATE cash_categories SET name=$2 WHERE id=$1',[local,name+' editada']);
 assert.equal((await c.query('SELECT name FROM cash_categories WHERE id=$1',[local])).rows[0].name,name+' editada');
 await c.query('DELETE FROM cash_categories WHERE id=ANY($1::uuid[])',[[local,global]]);
 assert.equal((await c.query('SELECT id FROM cash_categories WHERE id=ANY($1::uuid[])',[[local,global]])).rowCount,0);
 console.log('Categorias: migração reexecutável, criação, escopo, unicidade, edição e exclusão validados. Dados de teste revertidos.');
} finally {await c.query('ROLLBACK').catch(()=>{}); await c.end();}
