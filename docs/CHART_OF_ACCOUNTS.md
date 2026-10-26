# Chart of Accounts

O módulo está disponível em **General Ledger → Chart of Accounts**, com atalho no fluxo de caixa. Usa o plano da empresa selecionada e começa vazio: não importa contas de demonstração nem lê cadastros do localStorage.

O cadastro permite criar, consultar, filtrar, exportar, editar e excluir contas sem uso. Inclui código, nome, classificação (Asset, Liability, Equity, Revenue, COGS, Operating Expense, Other Income, Other Expense), natureza Debit/Credit e descrição. Os códigos são definidos pela empresa; a numeração sugerida não é uma obrigação do US GAAP.

## Banco e autorização

A integração utiliza as tabelas existentes da migração `database/004_companies.sql`: `ledger_accounts`, `ledger_journals`, `ledger_references`, `ledger_auditlogs` e `system_audit_log`. Não é necessária uma nova migração para esta entrega. Execute as migrações de implantação do projeto se estiver instalando em um banco novo.

Todas as consultas e gravações usam a empresa autorizada no servidor. A permissão `write_accounting` controla criação, edição e exclusão; usuários de consulta não podem gravar. Cada operação valida a revisão da empresa e usa transação para impedir sobrescrita de alterações feitas em outra sessão. Criação, edição e exclusão geram auditoria; as operações sobre contas incluem os dados anteriores e posteriores no log do sistema.

Não são apagados cadastros existentes automaticamente. Empresas sem contas continuam vazias até o cadastro explícito. Os saldos da tela são calculados dos lançamentos persistidos, incluindo originais e estornos, segundo a natureza da conta.

## Proteção do histórico

- Códigos são obrigatórios, sem espaços nas extremidades, únicos por empresa e comparados sem diferenciar maiúsculas de minúsculas em novos cadastros.
- O código não é alterado na edição. Nome e descrição podem ser atualizados.
- Uma conta com lançamentos não pode mudar de classificação ou natureza, pois isso alteraria a interpretação do histórico.
- Contas ligadas a lançamentos, contas a pagar, extratos, classificações de extratos ou parâmetros contábeis não podem ser excluídas. A validação de referências no servidor e as chaves estrangeiras também protegem essas relações.
- O plano contábil é separado das contas bancárias e das categorias do fluxo de caixa. Esta entrega não transforma previsões de caixa em lançamentos contábeis automaticamente.

## Verificação

```powershell
node --env-file=.env scripts/test-chart-of-accounts-db.mjs
npx.cmd tsc --noEmit
npm.cmd run build
```

O teste usa um schema PostgreSQL isolado e o remove ao terminar. Verifica plano vazio, persistência, edição, exclusão, duplicidade, dados inválidos, proteção do histórico, auditoria, concorrência, permissões e isolamento entre empresas.
