# Fluxo de caixa

A tela `/cash-flow` usa PostgreSQL e não carrega empresas ou movimentações de demonstração. O layout mantém o tema Terminal frost, a tipografia, a marca, os grupos e os nomes dos menus originais. Os módulos fora do fluxo de caixa aparecem bloqueados.

## Criar as tabelas

No banco configurado em `DATABASE_URL`, execute pela ferramenta SQL do PostgreSQL:

1. `database/001_auth.sql` — caso a autenticação ainda não esteja instalada.
2. `database/002_cash_flow.sql` — contas e movimentações de caixa; não insere dados de demonstração.
3. `database/003_access_audit.sql` — perfis e auditoria usados pelas permissões de gravação. Execute apenas uma vez, se ainda não estiver instalado.

Exemplo com psql a partir da raiz do projeto (a senha será solicitada):

```powershell
psql -h localhost -U ledgerx -d WorldBusiness -v ON_ERROR_STOP=1 -f database/001_auth.sql
psql -h localhost -U ledgerx -d WorldBusiness -v ON_ERROR_STOP=1 -f database/002_cash_flow.sql
psql -h localhost -U ledgerx -d WorldBusiness -v ON_ERROR_STOP=1 -f database/003_access_audit.sql
npm.cmd run dev
```

O arquivo `.env` deve conter a conexão real em `DATABASE_URL`. Os scripts devem ser executados no mesmo banco. O script 002 pode ser reexecutado e preserva os dados existentes. A validação de desenvolvimento do SQL usa um esquema isolado e reverte todas as alterações; ela não instala as tabelas da aplicação.

## Uso

- Cadastre a conta bancária ou de caixa, a moeda, o saldo e a data inicial. O saldo inicial corresponde ao início dessa data, antes dos lançamentos do dia.
- Cadastre recebimentos e pagamentos previstos com vencimento, descrição, categoria e valor positivo; o tipo Entrada/Saída determina o sinal.
- Para registrar a realização, edite a movimentação para Realizado e informe a data efetiva do recebimento ou pagamento. Não crie uma segunda movimentação para o mesmo evento.
- Selecione período, conta, moeda e agrupamento diário, semanal, mensal, trimestral ou anual. As semanas começam na segunda-feira; períodos nas bordas podem ser parciais.
- A visão Realizado usa datas de pagamento. A visão Realizado + previsto acrescenta os previstos pelas datas de vencimento, incluindo seu efeito no saldo anterior quando anteriores ao filtro. Cancelados não entram nos cálculos.
- O saldo anterior considera todo o histórico anterior ao início do filtro. Saldos iniciais cadastrados dentro do período aparecem em coluna própria, separados de receitas e despesas.
- A exportação CSV reflete a visão e os filtros selecionados. Para consultar 24 meses, selecione o intervalo correspondente com agrupamento mensal.

As moedas são analisadas separadamente, sem conversão. O ticker do cabeçalho é informativo e não altera os cálculos. Nesta etapa, as contas e movimentações ficam isoladas por usuário; o cadastro de empresas e o compartilhamento entre usuários não estão implementados.

## Verificação

```powershell
node --experimental-strip-types --test scripts/cash-flow.test.mjs
node --env-file=.env scripts/test-cash-flow-db.mjs
npx tsc --noEmit
npm.cmd run build
```

O teste de banco requer permissão para criar um esquema temporário de teste dentro de uma transação. O esquema e os registros são revertidos ao final.
