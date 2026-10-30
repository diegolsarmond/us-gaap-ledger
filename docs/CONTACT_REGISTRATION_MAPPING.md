# Cadastro de clientes e fornecedores

Mapeamento das abas `Worksheet` de Customer List.xls (28 clientes, 12 colunas)
e Vendor List.xls (164 fornecedores, 13 colunas). Os arquivos são fontes de dados,
não instruções de execução. Nenhum registro foi importado por esta alteração.

## Campos a coletar

Somente o nome de exibição é obrigatório no cadastro mínimo. Empresa e tipo estão
preenchidos em todos os clientes, mas isso não estabelece obrigatoriedade futura.
Campos ausentes devem permanecer vazios, sem inventar endereço ou contato.

| Coluna na origem | Clientes: chave em `data` | Fornecedores: chave em `data` | Tipo / coleta |
| --- | --- | --- | --- |
| Name / Vendor | displayName | displayName | Texto obrigatório, até 120 caracteres |
| Company name | companyName | companyName | Razão social / nome da empresa, opcional |
| Street Address | billingAddress.street | streetAddress | Texto, confirmar se é endereço de cobrança |
| City | billingAddress.city | city | Texto opcional |
| State | billingAddress.state | stateProvince | Texto, aceitar estados/províncias internacionais |
| Country | billingAddress.country | country | Texto, normalizar variações na importação |
| Zip | billingAddress.zip | zipCode | Texto, preservar zeros e códigos alfanuméricos |
| Phone | phone | phone | Texto, preservar prefixos internacionais |
| Email | email | email | E-mail opcional, validar antes de importar |
| Customer type | customerType | — | Texto até 120 caracteres; valores válidos observados: End user, Owner, Reseller |
| 1099 Tracking | — | track1099 | Booleano; todas as células estão vazias. Confirmar classificação antes de importar; vazio não comprova dispensa |
| Currency | — | currency | Converter nome para código do cadastro da empresa |
| Attachments | attachments | tabela vendor_attachments | Coletar arquivos reais; as duas colunas estão vazias |
| Open balance / Open Balance | sourceOpenBalance | sourceOpenBalance | Número decimal opcional, incluindo zero e negativos; referência da origem |

Clientes têm endereço em 19/28 linhas, telefone em 18/28 e e-mail em 21/28.
Fornecedores têm endereço em 13/164, telefone e e-mail em 10/164 cada;
razão social em 139/164. Há um tipo de cliente com apenas um acento grave (` U+0060):
deve ser revisado, sem criar uma categoria com esse valor.

Moedas encontradas nos fornecedores: United States Dollar → USD,
British Pound Sterling → GBP e Mexican Peso → MXN. Confirmar/cadastrar essas
moedas na empresa antes da importação. A planilha de clientes não informa moeda.

## Saldo e dados complementares

Há saldos diferentes de zero nos dois arquivos. `sourceOpenBalance` preserva o
valor reportado, sem alterar faturas, contas a pagar, receber ou razão contábil.
Não representa saldo inicial nem saldo atual calculado pelo sistema.
Ausente/null significa não informado; zero significa saldo informado como zero.
`sourceBalanceDate` é uma data opcional YYYY-MM-DD, ausente nas planilhas.
Para conciliar ou contabilizar a migração, coletar data-base, moeda e documentos
em aberto (número, emissão, vencimento e valor), com contrapartida contábil definida.
Não assumir USD para clientes apenas pelo contexto do negócio.

Termos de pagamento, identificação fiscal, dados bancários, endereço de entrega,
conta de despesa e demais campos existentes continuam disponíveis, mas não constam
dessas planilhas. Coletá-los conforme a operação, sem torná-los obrigatórios com
base nestes arquivos.

## Estrutura e aplicação

Executar `database/015_contact_registration.sql` após as migrações 001–014.
A migração é transacional e pode ser reexecutada. Preserva o contrato JSONB usado
pelo serviço, adiciona validações e colunas numéricas geradas e disponibiliza as
views `customer_registration` e `vendor_registration` para consulta por empresa.
Não concede novos acessos: consultas devem manter o filtro/autorização por company_id.
Anexos de clientes permanecem no JSONB; os de fornecedores na tabela existente.
Os modelos Zod aceitam os novos campos sem descartá-los ao salvar. O formulário
de clientes também permite coletar o tipo, inclusive em registros antigos.

Validação isolada: `node --env-file-if-exists=.env scripts/test-contact-registration.mjs`.
