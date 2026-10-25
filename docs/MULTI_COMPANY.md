# Empresas e isolamento de dados

O cadastro `/companies` usa o PostgreSQL configurado em `DATABASE_URL`. Não importa o antigo estado demonstrativo do navegador. Empresas novas começam sem plano de contas, parâmetros, saldos ou movimentações. USD é a moeda funcional; EIN é validado apenas pelo formato.

O perfil define permissões e acesso a todas as empresas ou a empresas selecionadas. O administrador protegido mantém acesso global. A empresa ativa é uma preferência de navegação: todas as funções de servidor validam novamente a sessão, o perfil e o acesso. Inativar uma empresa preserva seus dados e bloqueia as operações.

## Banco de dados

Em uma instalação existente com as migrações 001–003, aplicar na ordem:

1. `database/004_companies.sql`: empresas, permissões, vínculos, dados contábeis por domínio e relacionamentos com chave composta por empresa.
2. `database/005_reset_legacy_cash.sql`: **exclui definitivamente o caixa antigo sem empresa**, conforme a transição autorizada. Mantém usuários, sessões, perfis e auditoria. A execução é registrada e a repetição preserva os novos registros com empresa.
3. `database/006_system_parameters.sql`: auditoria dos parâmetros.

Esses scripts não são executados na inicialização da aplicação. Em instalação nova, aplicar também as migrações anteriores. As alterações não exigem reescrita do histórico Git.

## Operação

Cadastrar as empresas, atribuí-las aos perfis e selecionar a empresa no header. Cadastrar plano de contas e períodos fiscais antes de lançar. As regras de lançamento automático existentes continuam usando os códigos convencionais: caixa 1000, recebíveis 1100, estoque 1300, fornecedores 2000, imposto sobre vendas 2200, receita de serviços 4000, receita de produtos 4100, custo 5000 e variação cambial 6300. Não há criação automática dessas contas.

Os comandos contábeis são executados no servidor em uma transação, com controle de revisão. Uma gravação com revisão antiga é rejeitada e exige atualização; alterações pendentes não são aplicadas a outra empresa quando o usuário alterna o header. A autoria e a auditoria usam a sessão autenticada. Dados de caixa são compartilhados pelos usuários autorizados à mesma empresa.

Extratos: CSV UTF-8 de até 2 MB e 5.000 linhas, com cabeçalho `date,description,amount`, data `YYYY-MM-DD`, ponto decimal e valores negativos para saídas. A interface mostra uma prévia antes de importar e armazena o conteúdo original. OFX e PDF permanecem indisponíveis até haver um parser real. A classificação exige conta bancária e contrapartida cadastradas na empresa.

## Verificação

- `npx tsc --noEmit`
- `npm run build`
- `node scripts/cash-flow.test.mjs`
- `npm run test:companies`

O teste de empresas substitui somente a leitura da sessão, executando os serviços reais com usuários de teste. Quando `DATABASE_URL` está configurado, cria um schema temporário exclusivo e o remove ao concluir. Verifica migrações, limpeza idempotente, isolamento, perfis, revogação, inativação, concorrência, caixa, lançamentos e estorno, projetos, estoque, faturas, pagamentos, câmbio e extratos. Não grava fixtures nas tabelas da aplicação.

A identidade visual utiliza o layout anterior de `CashShell`, com logo, sidebar, header, estilos e cotação preservados; o seletor de empresas é integrado a esse layout.
