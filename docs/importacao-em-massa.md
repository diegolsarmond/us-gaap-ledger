# Importação em massa

Acesse **Settings → Importação em massa** (`/imports`) e selecione a empresa.

1. Escolha o cadastro e baixe o modelo `.xlsx`.
2. Leia a aba Instruções e preencha a aba Dados, mantendo os cabeçalhos. Datas usam `AAAA-MM-DD`; números usam ponto decimal sem separador de milhar; booleanos usam `true` ou `false`. Códigos, telefones e documentos devem permanecer como texto para preservar zeros iniciais.
3. Selecione o arquivo, confira a prévia e confirme a importação. Limites: 5 MB e 1.000 registros. Não são aceitos fórmulas nem anexos.

## Mapeamento

| Cadastro | Chave de duplicidade | Dependências |
| --- | --- | --- |
| Clientes | displayName | currency, paymentTermId, defaultTaxCode, parentCustomerId quando informados |
| Fornecedores | displayName | currency, paymentTermId, defaultExpenseAccountCode quando informados |
| Plano de contas | code | parentCode quando informado; importar pais primeiro |
| Moedas | code | USD é a única moeda base |
| Condições de pagamento | code | Nenhuma |
| Centros de custo | code | Nenhuma |
| Categorias de despesas | code | glAccountCode |
| Jurisdições tributárias | code | glAccountCode |
| Períodos fiscais | periodCode | Datas sem sobreposição; permissão close_periods |

Os campos disponíveis e seus valores permitidos são gerados dos mesmos schemas de validação dos cadastros. Referências com sufixo `Id` usam o identificador interno existente; referências com sufixo `Code` usam o código cadastrado. IDs dos novos registros são gerados pelo sistema. Importar primeiro contas, moedas e condições de pagamento e depois os cadastros dependentes. Clientes pai devem existir antes dos filhos.

## Outros dados do sistema

| Dados | Tratamento |
| --- | --- |
| Lançamentos contábeis | Motor próprio de partidas e contabilização; fora deste importador |
| Contas bancárias, categorias e movimentos de caixa | Fluxo próprio com moedas, conciliação, vínculos e status; fora deste importador |
| Extratos e linhas de staging | Fluxo específico de extratos; rota atualmente indisponível |
| Faturas, contas a pagar, estoque e projetos | Rotas atualmente indisponíveis; não habilitadas pela importação |
| Empresas, usuários e perfis | Administração de acesso e escopo; cadastro individual |
| Auditoria, saldos, relatórios e anexos | Dados gerados pelo sistema ou arquivos; não importáveis por este módulo |

## Garantias

Somente inclusão: registros existentes não são substituídos. A prévia executa o motor e as validações no servidor e desfaz a transação. A confirmação repete todas as validações em uma única transação com autorização da empresa e bloqueio da revisão. Uma falha cancela o lote inteiro. Alterações posteriores à prévia exigem selecionar e validar novamente a planilha. A conclusão gera auditoria `bulkImport:<comando>:<quantidade>`.

Verificação local: `node scripts/test-bulk-import.mjs`, `npx tsc --noEmit` e `npm run build`. O teste de planilhas não depende de banco e não verifica persistência ou permissões em um PostgreSQL real.
