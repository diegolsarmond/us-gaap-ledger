# Armazenamento em colunas

Os scripts `018_structured_ledger.sql` e `019_structured_audit.sql` convertem o armazenamento legado JSON em dados relacionais. A aplicação atual depende dessas migrações. Execute os scripts completos, na ordem, com as gravações da aplicação interrompidas.

## Aplicação

1. Confirme que as migrações anteriores, de `001` a `017`, foram aplicadas. O script `005` é uma limpeza histórica e não deve ser reaplicado como parte desta conversão.
2. Se o editor mostrar `25P02`, execute **apenas** `ROLLBACK;`, separadamente, na mesma conexão. Se necessário, reconecte o editor. Esse erro indica uma transação abortada por um erro anterior.
3. Execute o arquivo atualizado `database/018_structured_ledger.sql`, inteiro.
4. Execute `database/019_structured_audit.sql`, inteiro.
5. Disponibilize a versão correspondente da aplicação e retome as gravações.

O `018` também suporta a ausência de `cash_flow_reconciliations`: cria a tabela de conciliação se ela não existir. Isso não substitui as demais alterações de fluxo de caixa do script `010`.

Ambas as migrações são transacionais e podem ser reexecutadas. O `018` rejeita campos legados desconhecidos em vez de removê-los silenciosamente. Dados obrigatórios incompletos ou tipos incompatíveis interrompem a conversão; corrija a origem e reexecute após `ROLLBACK;`. Os scripts antigos continuam representando o histórico de instalação e não devem ser reexecutados depois da conversão.

## Modelo final

- As 18 tabelas `ledger_*` armazenam campos escalares em colunas tipadas.
- Endereços de clientes são colunas de cobrança e entrega.
- Linhas de lançamentos, itens de faturas e contas a pagar, lotes de estoque, anexos de clientes e empresas do escopo dos parâmetros são tabelas filhas com chave da empresa, registro pai e posição.
- Conciliações têm colunas numéricas e texto de explicação; o escopo já existente permanece em suas próprias colunas.
- Empresas já são estruturadas pelo script `017`.
- Auditoria usa `system_audit_events` e `system_audit_fields`. Os snapshots variáveis são árvores de nós relacionais, com valores de texto, número e booleano separados. A view `system_audit_log` monta JSON somente para manter o contrato de leitura e inserção dos consumidores existentes. Nenhuma tabela final contém colunas JSON/JSONB.
- Metadados e cotações de moedas continuam derivados em tempo de execução.

As views `chart_of_accounts`, `customer_registration` e `vendor_registration` consultam as colunas. Os anexos de clientes ficam em `ledger_customers_attachments`, em vez de um array na view de cadastro.

## Verificação

```sh
npm run test:structured-storage
npm run test:structured-storage -- --without-reconciliation
```

Os testes usam `DATABASE_URL`, criam um esquema temporário e o removem ao terminar. Exercitam conversão dos 18 domínios, coleções, auditoria, reexecução, serviços de cadastro e lançamentos, parâmetros e conciliação. A segunda execução reproduz a ausência da tabela de conciliação.

O mapa explícito de campos fica em `src/lib/ledger-schema.ts`. Para regenerar o SQL `018` após alterações nesse mapa:

```sh
node scripts/generate-ledger-migration.mjs
```
