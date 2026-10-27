# Cadastro de clientes

Execute database/013_customers.sql após as migrações anteriores antes de iniciar esta versão. O menu Configurações oferece Customers / Clientes em /customers.

O nome de exibição é o único campo obrigatório e deve ser único na empresa. Moedas, termos e códigos fiscais usam os parâmetros da empresa. Com mais de uma moeda ativa, selecione a preferência no cadastro. O cadastro registra preferências; não envia faturas nem realiza cobrança automaticamente.

Endereço de envio pode acompanhar o de cobrança. Clientes podem ser vinculados a um pai, com preferência por faturamento individual ou agrupado. Vínculos circulares e entre empresas são rejeitados no servidor. Notas são internas.

Anexos de até 20 MB cada (máximo de 20) são armazenados em PostgreSQL junto ao cadastro, com download e remoção na edição. Cadastros com muitos anexos aumentam o volume carregado pelo estado contábil; ajuste os limites HTTP do ambiente para os uploads necessários.

Consulta exige acesso à empresa; alterações exigem permissão de operação contábil e são auditadas.

Validação: node scripts/test-customers.mjs.
