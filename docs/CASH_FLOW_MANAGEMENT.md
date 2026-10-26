# Fluxo de caixa gerencial

Execute `database/010_cash_flow_management.sql` após as migrações anteriores, antes de servir esta versão. Requer PostgreSQL 16+. A migração pode ser reexecutada e não apaga lançamentos. Inclui novas colunas, preservação da previsão original e reconciliação contábil auditada.

## Operação

- A tela abre por semana, com quatro semanas anteriores e noventa dias futuros. Os filtros continuam editáveis.
- Registre vendas futuras como entradas **Planned**, com a data esperada de recebimento. Registre fornecedores, logística, salários e custos fixos como saídas **Planned**, nas datas esperadas de pagamento. Uma previsão de venda não reconhece receita contábil. COGS por competência não equivale necessariamente ao pagamento a fornecedores.
- Escolha a categoria gerencial e a linha de caixa US GAAP. A linha define atividade e direção; combinações incompatíveis são rejeitadas. Os registros anteriores permanecem **Unclassified** até revisão explícita.
- Ao receber ou pagar, edite o mesmo lançamento para **Actual**. Ajuste valor e data efetivos e registre a explicação do desvio. Não cadastre um segundo lançamento para liquidar a mesma previsão.
- A primeira gravação como Planned congela valor, direção e data originais no banco. As revisões alteram a projeção atual, mas não essa base comparativa. O comparativo não é um histórico de versões semanais do forecast; a auditoria registra as alterações.
- Cancelamentos ficam na previsão original, com realizado zero. Exclusão e mudança de conta de uma previsão são bloqueadas para preservar o histórico. Para substituí-la em outra conta, cancele e crie uma nova previsão.
- A migração estabelece a base dos lançamentos que estiverem Planned naquele momento. Não é possível recuperar previsões anteriores de lançamentos já realizados.

## Relatórios e indicadores

O método direto mostra recebimentos e pagamentos brutos, separados em Operating, Investing e Financing. A projeção usa realizados mais planos ainda não liquidados; o realizado usa somente pagamentos/recebimentos efetivos. O comparativo semanal usa sempre a previsão original e as datas reais. Variação líquida = realizado − previsto: valores positivos representam mais caixa que o previsto. Semanas abertas, futuras e parciais são identificadas. Valores não são convertidos ou somados entre moedas.

FCF = caixa operacional − aquisições brutas de PP&E (incluindo juros capitalizados). É uma medida gerencial, sem definição única em US GAAP. Net burn mensal = máximo de zero e consumo líquido operacional + investimento, dividido pelos dias decorridos selecionados, vezes 30,4375. Financiamentos ficam fora dessa medida para não mascarar consumo. Runway = caixa efetivo no final do intervalo decorrido / burn mensal. Os indicadores dependem dos dados registrados e da classificação; não há estimativa automática de vendas ou despesas ausentes.

O saldo reconcilia como: saldo anterior + saldos de contas abertas no período + entradas − saídas. Saldos de implantação não são tratados como fluxos das três atividades.

## Reconciliação contábil

A reconciliação indireta complementar é preenchida e persistida por empresa, período, moeda e seleção de conta. Informe lucro líquido, ajustes não caixa e variações operacionais de capital de giro com seus sinais. Informe também o saldo de caixa do balanço e as fontes utilizadas. Para a demonstração da empresa, selecione todas as contas de caixa e use dados contábeis da empresa inteira. Não use o lucro da empresa inteira para reconciliar apenas uma conta bancária.

A tela confronta o caixa operacional reconciliado com o método direto e o saldo final efetivo com o valor informado do balanço. Diferença zero significa concordância com os valores fornecidos; não substitui validação desses valores. Não há integração automática com DRE/balanço neste fluxo. A apresentação indireta usa somente realizados, mesmo quando o filtro geral inclui previsão. A exportação inclui linhas do método direto e reconciliação complementar salva.

Juros pagos (exceto capitalizados), juros recebidos e dividendos que representam retorno **sobre** investimento são operacionais; dividendos pagos são financiamento. Juros capitalizados e devoluções **do** investimento são investimento. Investidas por equivalência patrimonial exigem análise da política aplicável. Caixa restrito, efeitos cambiais, transferências internas e transações não caixa precisam de análise adicional quando aplicáveis: este módulo não constitui, isoladamente, uma demonstração completa para publicação.

Referências de classificação: [ASC 230 — texto e orientação sobre atividades de investimento](https://dart.deloitte.com/USDART/home/codification/presentation/asc230-10/roadmap-statement-cash-flow/chapter-6-classification-cash-flows/6-1-investing-activities) e [comparação de apresentação US GAAP / IFRS](https://kpmg.com/us/en/articles/2022/ifrs-accounting-standards-us-gaap.html).

## Verificações

```powershell
node --test scripts/cash-flow.test.mjs
node --env-file=.env scripts/test-cash-management-db.mjs
npx.cmd tsc --noEmit
npm.cmd run build
```

O teste de banco cria e remove um schema isolado, sem alterar os dados da empresa. Valida migração reexecutável, base original, liquidação, cancelamento, entradas sem previsão, persistência da reconciliação, auditoria e autorização.
