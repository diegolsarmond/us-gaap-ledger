# ESCOPO TÉCNICO E FUNCIONAL DO SISTEMA
## Plataforma de Gestão Financeira e Contábil Multi-Empresa (US GAAP & Multi-Moeda)

---

### 1. Resumo Executivo
A plataforma **Quantum / LedgerX** é uma solução corporativa completa para **gestão financeira, controladoria e contabilidade em partidas dobradas aderente aos padrões US GAAP (FASB)**. Desenvolvida para suportar operações multi-empresa (*multi-tenant*), fluxos multi-moeda com controle cambial diário (ASC 830) e governança rigorosa com rastreabilidade total de auditoria e controle de fechamento de períodos fiscais.

Este documento detalha todos os módulos, funcionalidades e integrações disponíveis no sistema para composição de **Escopo em Propostas Comerciais e Contratos de Prestação de Serviços/Licenciamento**.

---

### 2. Arquitetura e Governança da Plataforma

#### 2.1 Multi-Empresa e Multi-Tenancy
- **Alternância Dinâmica de Entidades**: Troca instantânea entre subsidiárias, matrizes ou empresas do grupo econômico com segregação completa de dados e consolidação.
- **Parametrização Independente**: Cada entidade possui seu próprio plano de contas, moedas ativas, jurisdições fiscais e centros de custo.

#### 2.2 Segurança, Perfis e Controle de Acesso (RBAC)
- **Perfis Pré-configurados e Hierárquicos**:
  - **Platform Admin (Firm Owner & Administrator)**: Acesso irrestrito a configurações, parametrizações globais, auditoria e gestão de usuários.
  - **Accounting Admin / Senior CPA**: Gestão de rotinas contábeis avançadas, conciliação, aprovação de lançamentos e bloqueio/desbloqueio de períodos fiscais.
  - **Staff Accountant**: Operação diária de lançamentos, emissão de faturas, contas a pagar, conciliação e custeio.
  - **Client Portal (Portal Executivo/Cliente)**: Perfil exclusivo para visualização de relatórios gerenciais (DRE, Balanço, Fluxo de Caixa) e envio de extratos bancários, sem permissão de alteração ou lançamentos manuais.

#### 2.3 Governança Contábil e Bloqueio de Período (Fiscal Period Lock)
- **Fechamento e Trancamento de Exercício**: Trava contra alterações acidentais ou lançamentos retroativos em meses já auditados/fechados.
- **Controle de Exceções**: Ajustes pós-fechamento exigem justificativa formal de auditoria, perfil qualificado e registro no histórico.
- **Monitor de Equilíbrio em Tempo Real**: Widget de integridade do razão (*Balanced Ledger — Δ $0.00*) com detecção imediata de descompasso entre débitos e créditos.

---

### 3. Módulos Operacionais (Operations)

#### 3.1 Dashboard Executivo e Financeiro
- **Painel de Indicadores em Tempo Real**:
  - Saldo de Caixa Operacional e Reservas de Liquidez.
  - Faturamento Mensal, Despesas Operacionais e Margem Bruta (EBITDA).
  - Cálculo de *Runway* (meses de operação garantidos) e *Burn Rate*.
- **Alertas Operacionais Preventivos**:
  - Faturas a vencer nos próximos 7 a 30 dias.
  - Títulos vencidos de clientes com classificação de criticidade.
  - Contas a pagar prioritárias para evitar juros ou quebra de fornecimento.
- **Gráficos e Projeções**: Evolução mensal de receitas vs. despesas, distribuição de custos por departamento e indicadores de liquidez.

#### 3.2 Faturamento & Contas a Receber (Invoices & Accounts Receivable - AR)
- **Emissão e Gestão de Faturas**:
  - Criação de faturas detalhadas por produto, serviço ou projeto.
  - Seleção de condições de pagamento (*Payment Terms*: Net 15, Net 30, Net 60, Due on Receipt).
  - Cálculo e retenção automática de *Sales Tax* conforme o estado/jurisdição de destino.
- **Conformidade com ASC 606 (Reconhecimento de Receita)**:
  - Suporte ao reconhecimento de receita por obrigação de desempenho satisfeita ou receitas diferidas (*Deferred Revenue*).
- **Lançamentos Contábeis Automáticos**:
  - Geração automática do débito em Contas a Receber (Trade AR) e crédito em Receita e Impostos a Recolher (*Sales Tax Payable*).
- **Liquidação e Baixa de Faturas**:
  - Registro de recebimentos parciais ou integrais com escolha da conta bancária de destino e cálculo de juros/descontos.
- **Régua de Cobrança e Notificações**:
  - Envio de notificações de cobrança, download de faturas em PDF/formato padrão e status de cobrança em tempo real.

#### 3.3 Contas a Pagar & Despesas (Bills & Accounts Payable - AP)
- **Gestão de Títulos e Faturas de Fornecedores**:
  - Registro de despesas com número do documento, vencimento, fornecedor e anexo de notas fiscais/recibos.
  - Classificação por Centro de Custo e Categoria de Despesa.
- **Regime de Competência (Accrual Accounting)**:
  - Alocação contábil correta das despesas no período de competência, independentemente do fluxo de desembolso financeiro.
  - Apropriação de Despesas Antecipadas (*Prepaid Expenses* — ex: seguros anuais, licenças antecipadas).
- **Fluxo de Aprovação e Liquidação**:
  - Programação de pagamentos individuais ou em lote.
  - Baixa automática contra conta corrente pagadora com atualização instantânea do passivo de fornecedores.
- **Compliance e Suporte a Obrigações Fiscais**:
  - Controle de cadastros com EIN/CNPJ e suporte a relatórios para emissão de formulários fiscais anuais (ex: 1099-MISC/NEC).

#### 3.4 Gestão de Estoques & Custeio (Inventory Catalog & COGS)
- **Catálogo de Produtos e SKUs**:
  - Cadastro de códigos de item, categorias, unidades de medida e estoques de segurança.
  - Preço de venda sugerido e custo unitário de reposição.
- **Métodos de Custeio e Valorização**:
  - Suporte aos critérios de avaliação FIFO (Primeiro que Entra, Primeiro que Sai - PEPS) e Custo Médio Ponderado.
  - Aplicação da regra *Lower of Cost or Net Realizable Value* (menor entre custo e valor realizável líquido) conforme o US GAAP.
- **Baixa Automática para CPV / CMV (Cost of Goods Sold - COGS)**:
  - Integração entre a emissão de faturas/vendas e a redução automática do estoque físico com contabilização do CPV na DRE.
- **Movimentações e Ajustes**:
  - Registro de entradas, perdas, quebras, devoluções e inventário físico periódico.

#### 3.5 Gestão de Projetos e Rentabilidade (Projects & Margin)
- **Apuração de Margem por Projeto / Contrato**:
  - Atribuição de despesas diretas, horas, faturas emitidas e custos de terceiros vinculados a projetos específicos.
- **Métricas de Performance Operacional**:
  - Margem Bruta e Margem de Contribuição por projeto.
  - Comparativo Orçado vs. Realizado (*Budget vs. Actual*).
  - Análise de rentabilidade por cliente e linha de serviço.

---

### 4. Contabilidade Geral & Livro Razão (General Ledger)

#### 4.1 Livro Diário & Lançamentos Contábeis (Journal Entries)
- **Partidas Dobradas com Validação Estrita**:
  - Validação mandatória de Débitos = Créditos antes de qualquer postagem no sistema.
- **Modelos e Recursos Avançados**:
  - Criação de lançamentos manuais com suporte a múltiplas linhas.
  - Lançamentos automáticos de estorno (*Auto-Reversing Entries*) ideais para provisões de final de mês (*Accruals*).
  - Duplicação e clonagem de lançamentos recorrentes (depreciação, amortização, folha de pagamento).
  - Anexação de memórias de cálculo, comprovantes e trilha de auditoria por linha.

#### 4.2 Plano de Contas Estruturado (Chart of Accounts - COA)
- **Classificação US GAAP Hierárquica**:
  - `1000 - Assets` (Ativo Circulante e Não Circulante, Caixa, AR, Estoque, Imobilizado).
  - `2000 - Liabilities` (Passivo Circulante, AP, Provisões, Empréstimos, Sales Tax a Recolher).
  - `3000 - Stockholders' Equity` (Capital Social, Reservas e Lucros/Prejuízos Acumulados).
  - `4000 - Operating Revenue` (Receitas de Vendas e Serviços).
  - `5000 - Cost of Goods Sold (COGS)` (Custos Diretos de Mercadorias e Serviços).
  - `6000+ - Operating & Administrative Expenses` (Despesas Operacionais, Vendas, Gerais e Administrativas - SG&A).
  - `7000/8000 - Other Income & Expenses` (Receitas/Despesas Financeiras, Variação Cambial).
- **Customização e Manutenção**:
  - Inclusão, inativação, definição de natureza padrão (devedora/credora) e agrupamentos contábeis.

#### 4.3 Balancete de Verificação (Trial Balance)
- **Conferência em Tempo Real de Saldos**:
  - Visualização dos saldos iniciais, movimentações a débito, a crédito e saldos finais.
- **Filtros por Exercício e Período**:
  - Comparativo de períodos anteriores e validação da consistência matemática pré-fechamento.
- **Exportação e Drill-down**:
  - Acesso direto aos lançamentos que originaram o saldo de cada conta.

---

### 5. Demonstrações Financeiras & Relatórios (Financial Statements)

#### 5.1 Demonstração do Resultado do Exercício - DRE / P&L (Income Statement)
- **Estruturação por Padrão Contábil Internacional**:
  - Receita Bruta, Deduções e Receita Líquida.
  - Lucro Bruto (após dedução do COGS/CPV).
  - Despesas Operacionais detalhadas por categoria (R&D, Vendas & Marketing, G&A).
  - EBITDA / Resultado Operacional.
  - Despesas Financeiras, Efeitos Cambiais e Lucro Líquido do Período.
- **Visão Comparativa & Análise Vertical/Horizontal**:
  - Comparação mensal, trimestral ou anual com percentuais de representatividade sobre a receita.

#### 5.2 Balanço Patrimonial (Balance Sheet)
- **Estrutura Completa de Ativos, Passivos e Patrimônio Líquido**:
  - Ativo Circulante (*Current Assets*) e Ativo Não Circulante (*Non-Current Assets*).
  - Passivo Circulante (*Current Liabilities*) e Passivo de Longo Prazo (*Long-Term Liabilities*).
  - Patrimônio Líquido (*Stockholders' Equity*) integrando automaticamente o resultado apurado da DRE.
- **Verificação da Equação Contábil**:
  - Validação permanente de `Ativo Total = Passivo Total + Patrimônio Líquido`.

#### 5.3 Demonstração dos Fluxos de Caixa & Projeção (Cash Flow Statement & Forecast)
- **Método Indireto US GAAP (ASC 230)**:
  - Atividades Operacionais: Reconciliação do Lucro Líquido com variações de capital de giro (AR, AP, Estoque, Provisões).
  - Atividades de Investimento: Aquisição ou alienação de ativos imobilizados.
  - Atividades de Financiamento: Aportes de capital, captação de dívidas ou pagamento de dividendos.
- **Módulo de Forecast e Projeção de Caixa**:
  - Projeção de saldos futuros com base nas faturas a receber, contas a pagar provisionadas e despesas fixas recorrentes.

#### 5.4 Relatório de Contas a Receber por Idade de Vencimento (AR Aging Position)
- **Análise Detalhada de Inadimplência**:
  - Faixas de vencimento: *Current*, *1-30 dias*, *31-60 dias*, *61-90 dias* e *>90 dias*.
- **Conformidade com Provisão de Perdas (CECL / ASC 326)**:
  - Apoio ao cálculo e provisão para créditos de liquidação duvidosa (*Allowance for Doubtful Accounts*).

#### 5.5 Relatório de Impostos e Jurisdições Fiscais (Sales Tax Summary)
- **Consolidação Tributária por Jurisdição**:
  - Mapeamento das vendas por estado norte-americano ou região com alíquotas aplicadas.
  - Apuração do imposto total recolhido de clientes e saldo a pagar perante as receitas estaduais (*State DOR*).

---

### 6. Gestão Bancária, Conciliação & Auditoria (Banking & Governance)

#### 6.1 Integração de Extratos & Conciliação Bancária (Bank Feeds & Staging)
- **Importação de Extratos**:
  - Importação e processamento de arquivos bancários em formatos padrão (OFX, CSV, QBO).
- **Área de Staging e Pareamento Inteligente**:
  - Cruzamento de transações bancárias contra lançamentos de contas a receber e pagar já registrados no sistema.
  - Conciliação assistida para criação rápida de lançamentos de tarifas bancárias, juros e receitas financeiras.
- **Conciliação e Reconciliação Periódica**:
  - Fechamento com saldo bancário real conciliado contra o razão contábil da conta caixa.

#### 6.2 Trilha de Auditoria Imutável (Audit Trail Log)
- **Registro de Atividades em Tempo Real**:
  - Log completo de cada ação realizada no sistema: data, hora, usuário, IP, entidade e tipo de evento.
- **Eventos Monitorados**:
  - Criação, edição e exclusão de lançamentos contábeis.
  - Emissão, estorno e quitação de títulos a pagar e a receber.
  - Bloqueio e desbloqueio de períodos contábeis com registro de justificativas.
  - Alterações em configurações de impostos, cadastros e planos de contas.
- **Exportação para Auditoria Externa**:
  - Exportação de evidências para conformidade com normas de governança e auditorias contábeis independentes (Big Four e auditorias locais).

---

### 7. Central de Parâmetros e Configurações (System Parameters)

#### 7.1 Moedas & Cotações Cambiais (Currencies & FX Rates — ASC 830)
- **Multi-Moeda Nativo**:
  - Suporte a moedas internacionais (USD como moeda funcional padrão, EUR, GBP, CAD, BRL, MXN, etc.).
- **Tabela de Taxas Diárias**:
  - Cadastro de taxas de paridade diária, taxas de fechamento de mês e taxas médias.
- **Apuração de Variação Cambial**:
  - Suporte ao cálculo e segregação de ganhos e perdas cambiais realizados e não realizados (*Realized/Unrealized FX Gain/Loss*).

#### 7.2 Jurisdições Tributárias (Tax Jurisdictions)
- **Parametrização Flexível de Alíquotas**:
  - Cadastro de estados e municípios com alíquotas específicas de Sales Tax.
  - Vinculação com contas contábeis de recolhimento no passivo circulante.

#### 7.3 Condições de Pagamento (Payment Terms)
- **Definição de Prazos Comerciais**:
  - Configuração de prazos padrão (Net 15, Net 30, Net 45, Net 60, À Vista, Parcelado) com cálculo automático da data de vencimento a partir da data de emissão.

#### 7.4 Centros de Custo (Cost Centers)
- **Segregação por Departamentos e Unidades de Negócio**:
  - Organização dos lançamentos por centros de responsabilidade (ex: Marketing, Engenharia, Vendas, Administrativo, Operações).
  - Base para geração de relatórios gerenciais e acompanhamento orçamentário.

#### 7.5 Categorias de Despesa (Expense Categories)
- **Padronização Operacional**:
  - Dicionário de naturezas de gastos (ex: Software SaaS, Viagens & Hospedagem, Serviços de Terceiros, Material de Escritório) associadas diretamente a contas específicas do plano contábil, eliminando erros de classificação por usuários operacionais.

#### 7.6 Calendário e Períodos Fiscais (Fiscal Periods)
- **Estrutura de Calendário Contábil**:
  - Abertura de exercícios e períodos mensais (ex: Jan/2026 a Dez/2026).
  - Status de período: *Aberto*, *Em Fechamento*, *Bloqueado/Encerrado*.

---

### 8. Diferenciais Técnicos e de Usabilidade

1. **Interface Moderna e de Alta Performance**: Desenvolvida com tecnologias modernas (React, TypeScript, Tailwind CSS, TanStack Router), garantindo transições ultra-rápidas e operação sem engasgos.
2. **Sistema Integrado de Tutoriais e Ajuda Contextual**: Modal interativo em cada módulo com guias passo a passo operacionais, regras US GAAP associadas e dicas de auditoria contábil.
3. **Validação Matemática Rigorosa**: Impossibilidade de desbalanceamento no diário contábil, garantindo a solidez das demonstrações contábeis.
4. **Exportação de Dados**: Geração de relatórios, balancetes e extratos prontos para exportação e apresentação a investidores, bancos ou conselhos de administração.

---

### 9. Matriz de Entregáveis por Módulo (Resumo para Proposta Comercial)

| Módulo / Funcionalidade | Descrição do Escopo Entregue | Perfil de Usuário |
| :--- | :--- | :--- |
| **Dashboard Executivo** | KPIs de liquidez, runway, EBITDA, balanço do ledger e alertas de vencimentos | Todos os Perfis |
| **Contas a Receber (AR)** | Faturamento, alíquotas de imposto, controle de recebimentos e baixas bancárias | Staff / Admins |
| **Contas a Pagar (AP)** | Gestão de notas de despesa, vencimentos, centro de custo e liquidação | Staff / Admins |
| **Estoque & Custeio (COGS)** | Catálogo de itens, métodos PEPS / Média e baixa automática de CPV | Staff / Admins |
| **Gestão de Projetos** | Apuração de custos, receitas e margem bruta individualizada por contrato | Staff / Admins |
| **Livro Diário (Journals)** | Lançamentos manuais, estornos automáticos e partidas dobradas estritas | Contadores / Admins |
| **Plano de Contas & Balancete** | Estrutura de contas US GAAP e Trial Balance com drill-down | Contadores / Admins |
| **Demonstrações (DRE, BP, DFC)** | Demonstrações contábeis oficiais automatizadas e comparativas | Todos (incl. Portal Cliente) |
| **Conciliação Bancária** | Importação de extratos (OFX/CSV), pareamento e staging | Staff / Contadores |
| **Trilha de Auditoria** | Registro imutável de eventos operacionais, IPs, horários e alterações | Admins / Auditores |
| **Parâmetros Globais** | Controle multi-moeda, jurisdições de impostos, prazos e períodos fiscais | Admins da Plataforma |
