# Transporte JSON

O HAR fornecido usa o protocolo RPC Seroval do TanStack, com marcadores t/i/p/k/v, URLs _serverFn codificadas e payload serializado. As chamadas da aplicação agora usam /api/json/<módulo>/<operação>. POST recebe o objeto de dados diretamente; GET usa ?data=<JSON convencional> quando precisa de filtros. Respostas contêm o resultado diretamente; falhas HTTP contêm { "error": "mensagem" }.

## Mapeamento

- accounting: loadAccounting, loadCashAccountLinks, runAccountingCommand
- auth: getSession, login, logout, register, changePassword
- admin: loadAdministration, updateProfile, updateUser, resetUserPassword, getAuditEvents
- companies: loadCompanies, saveCompany
- cash-flow: loadCashData, saveCashAccount, saveCashTransaction, deleteCashTransaction, saveCashCategory, deleteCashCategory, loadCashReconciliation, saveCashReconciliation, checkCashAgainstGl
- parameters: loadParameterCompanies, loadParameters, mutateParameter
- reports: loadReportSources
- journals: loadJournalConfiguration, saveJournalConfiguration
- vendor-attachments: listVendorAttachments, uploadVendorAttachment, downloadVendorAttachment, removeVendorAttachment

Validação Zod, autenticação, permissões e transações continuam nas implementações do servidor. SSR executa as mesmas operações diretamente no contexto da requisição. Os endpoints REST existentes de lançamentos já usam JSON convencional e foram preservados.

JSON.stringify em localStorage, parâmetros JSONB do PostgreSQL, hashes e exportação não é o protocolo codificado do anexo. Base64 de anexos representa bytes do arquivo e permanece no campo content. Não é necessária migração do banco para esta alteração de transporte.

## Exemplo: criar conta

`POST /api/json/accounting/runAccountingCommand`

```json
{
  "companyId": "90918cc9-bcda-4f10-99ee-20e47f07cb8f",
  "revision": 4,
  "command": "addAccount",
  "args": [{
    "code": "1000",
    "name": "Cash and Cash Equivalents",
    "type": "Asset",
    "balanceType": "Debit",
    "description": "",
    "maturity": "Not Applicable",
    "isContra": false,
    "track1099": false
  }]
}
```

Verificação automatizada do transporte: `node scripts/test-json-transport.mjs` (sem acesso ao banco; sessão simulada).

## Atualização de versões em produção

Abas de versões anteriores podem continuar chamando `/_serverFn/<id>` após a migração. Esse transporte foi desativado: o servidor retorna HTTP 410 com orientação para recarregar a página, sem executar a operação nem tentar resolver IDs antigos no TanStack. As páginas HTML usam `Cache-Control: no-store`; os assets versionados mantêm sua política de cache.

Após publicar, recarregue as abas antigas e limpe eventual cache de HTML no proxy/CDN. Publique cliente e servidor do mesmo build. A resposta 410 não atualiza automaticamente uma aba já aberta. Verificação: `node scripts/test-deployment-response.mjs`.
