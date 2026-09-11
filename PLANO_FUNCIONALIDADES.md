# Plano de Funcionalidades do Sistema (US GAAP Ledger & ERP)

> **Documento de Especificação Funcional e Arquitetura de Negócio**  
> **Padrão Contábil**: US GAAP (*Generally Accepted Accounting Principles*) — Regime de Competência (*Accrual Basis*)  
> **Público-Alvo**: Gestão do Escritório Contábil, Contadores Responsáveis, Equipe de Operações e Clientes Finais (Portal do Cliente).

---

## 1. Visão Geral da Plataforma

O **US GAAP Ledger** é um sistema contábil e de gestão financeira multi-empresa (*multi-tenant*) desenvolvido sob medida para escritórios de contabilidade que prestam serviços para empresas com operações nos Estados Unidos. 

A plataforma substitui controles manuais e planilhas complexas em Excel, oferecendo uma alternativa proprietária e profissional a softwares de mercado como o QuickBooks.

### Pilares Fundamentais do Sistema:
1. **Partidas Dobradas Estritas (*Double-Entry Bookkeeping*)**: Nenhum lançamento no diário pode ser gravado se a soma de Débitos não for rigorosamente idêntica à soma de Créditos ($\sum \text{Débito} = \sum \text{Crédito}$).
2. **Segregação de Clientes (*Multi-Tenant*)**: O escritório gerencia múltiplos clientes (empresas) com total isolamento de planos de contas, lançamentos, saldos e relatórios.
3. **Controle de Acesso Baseado em Papéis (*RBAC*)**: Perfis distintos para Dono/Administrador da Plataforma, Gerente Contábil Sênior (CPA), Contador Operacional e Portal do Cliente (acesso somente-leitura com upload de extratos).
4. **Governança e Bloqueio de Período (*Hard Period Close*)**: Capacidade de congelar meses/anos fiscais fechados para impedir adulterações retroativas sem justificativa formal de auditoria.
5. **Tratamento Automático de Variação Cambial (*FX Gain/Loss*)**: Contabilização automática de diferenças cambiais para transações em moedas estrangeiras (GBP, EUR, MXN) contra a moeda funcional (USD).

---

## 2. Matriz de Perfis e Permissões de Acesso (RBAC)

O sistema possui 4 papéis definidos:

| Perfil / Persona | Título Exemplo | Permissões no Sistema | Acesso a Relatórios | Lançamento Manual no Razão | Fechamento de Período |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Platform Admin** | *Firm Owner & Administrator* | Acesso irrestrito a todos os clientes, configurações e gestão de usuários. | Total | Sim | Sim |
| **Accounting Admin** | *Senior Accounting Manager (CPA)* | Gestão contábil completa da carteira de clientes, aprovação de conciliações e fechamento de períodos. | Total | Sim | Sim |
| **Accounting Staff** | *Staff Accountant* | Operação diária: faturamento, contas a pagar, conciliação e lançamentos contábeis. | Total | Sim | Não |
| **Client Portal** | *Client Executive* | Visão do cliente: consulta restrita de relatórios executivos e upload de extratos bancários. Bloqueado de alterar dados. | Restrito | Não | Não |

---

## 3. Módulos e Funcionalidades Detalhadas

```
US GAAP Ledger
├── Operations (Operações Comerciais & Estoque)
│   ├── 1. Dashboard Contábil Executivo
│   ├── 2. Faturamento & Contas a Receber (Invoices & AR)
│   ├── 3. Contas a Pagar & Despesas (Bills & AP)
│   ├── 4. Catálogo de Estoque & CPV (Inventory & COGS)
│   └── 5. Gestão de Projetos & Margem (Projects & Margin)
├── General Ledger (Razão Contábil Central)
│   ├── 6. Lançamentos no Diário (Journal Entries)
│   ├── 7. Plano de Contas Padronizado (Chart of Accounts)
│   └── 8. Balancete de Verificação (Trial Balance)
├── Financial Statements (Demonstrações Contábeis & Fiscais)
│   ├── 9. Demonstração do Resultado / DRE (Income Statement / P&L)
│   ├── 10. Balanço Patrimonial (Balance Sheet)
│   ├── 11. Demonstração do Fluxo de Caixa & Forecast (Cash Flow)
│   ├── 12. Apuração de Imposto sobre Vendas (Sales Tax Summary)
│   └── 13. Posição de Envelhecimento de Crédito (AR Aging Position)
└── Banking & Governance (Bancos, Governança & Multi-Tenancy)
    ├── 14. Extratos Bancários & Triagem (Bank Feeds & Staging)
    ├── 15. Trilha de Auditoria (Audit Trail Log)
    └── 16. Gestão de Empresas & Perfis (Roles & Tenants)
```

---

### MÓDULO 1: OPERAÇÕES (OPERATIONS)

#### 3.1. Dashboard Contábil Executivo
* **Rota**: `/` | **Código-fonte**: [index.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/index.tsx)
* **Finalidade**: Central de comando com visão consolidada e em tempo real da empresa selecionada.
* **Recursos e Regras**:
  * **Indicadores Principais (KPIs)**:
    * **Disponibilidade Imediata (*Cash on Hand*)**: Somatório das contas bancárias operacionais e de reserva de liquidez.
    * **Receita Bruta (*Total Revenue*)**: Faturamento acumulado no período fiscal ativo.
    * **Lucro Bruto & Margem (*Gross Profit & Gross Margin %*)**: Receita líquida deduzida do custo de mercadorias vendidas (CPV/COGS).
    * **Despesas Operacionais (*Total OpEx*)**: Total de gastos com pessoal, instalações, tecnologia e serviços de terceiros.
    * **Lucro Líquido (*Net Income & Net Margin %*)**: Resultado final do exercício já considerando variações cambiais.
  * **Status de Equilíbrio do Razão (*Ledger Balance Check*)**: Validador visual no topo que atesta que o livro contábil está perfeitamente balanceado ($\Delta = \$0.00$).
  * **Atalhos Operacionais**: Acesso rápido para emissão de faturas (*+ New Invoice*), contas a pagar (*+ Enter Bill*) e lançamentos manuais (*+ New Journal Entry*).
  * **Lista de Atividades Recentes**: Histórico dos últimos 6 lançamentos contábeis com detalhes de débitos e créditos.

---

#### 3.2. Faturamento & Contas a Receber (*Invoices & Accounts Receivable*)
* **Rota**: `/invoices` | **Código-fonte**: [invoices.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/invoices.tsx)
* **Finalidade**: Emissão, controle e baixa de faturamento aos clientes com aplicação de impostos estaduais.
* **Recursos e Regras**:
  * **Nova Fatura (*Invoice Creation*)**:
    * Seleção do cliente e prazo contratual (*Due on Receipt, Net 15, Net 30, Net 60*).
    * Linhas de faturamento contendo produtos do estoque ou serviços avulsos, com quantidade, preço unitário e valor total.
    * Associação opcional a um projeto específico para apropriação de margem.
  * **Cálculo de Imposto (*Sales Tax*)**:
    * Aplicação da alíquota estadual correspondente à jurisdição do cliente ou isenção fiscal (*Tax-Exempt*).
    * Lançamento automático da provisão no passivo (*2200 - Sales Tax Payable*).
  * **Ciclo de Cobrança e Status**:
    * Faturas classificadas em *Draft* (Rascunho), *Open* (Em aberto), *Paid* (Paga) e *Overdue* (Vencida).
  * **Baixa Financeira Integrada**:
    * Ao liquidar uma fatura, o sistema registra automaticamente o lançamento contábil:
      * **Débito**: *1000 - Cash — Operating (Chase)*
      * **Crédito**: *1100 - Accounts Receivable (Trade)*

---

#### 3.3. Contas a Pagar & Despesas de Fornecedores (*Bills & Accounts Payable*)
* **Rota**: `/payables` | **Código-fonte**: [payables.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/payables.tsx)
* **Finalidade**: Entrada de despesas operacionais e custos com fornecedores, com controle rigoroso de vencimentos.
* **Recursos e Regras**:
  * **Entrada de Contas (*Enter Bill*)**:
    * Registro de fornecedor (*Vendor*), número do documento/fatura, data de emissão e vencimento.
    * Classificação da categoria contábil da despesa (ex.: Hospedagem em Nuvem, Aluguel, Assessoria Jurídica, Custo com Terceiros).
    * Associação opcional ao projeto do cliente para apuração de custo direto.
  * **Suporte a Múltiplas Moedas**: Possibilidade de indicar valores em moeda estrangeira (ex: GBP, MXN) e a respectiva taxa de conversão em USD.
  * **Liquidação de Pagamentos (*Record Payment*)**:
    * Baixa com indicação da conta de saída (Conta Corrente Operacional ou Cartão de Crédito Corporativo).
    * Lançamento de contrapartida automático:
      * **Débito**: *2000 - Accounts Payable (Trade)*
      * **Crédito**: *1000 - Cash Operating* ou *2100 - Credit Card Payable*

---

#### 3.4. Catálogo de Estoque & Apuração de Custo (*Inventory Catalog & COGS*)
* **Rota**: `/inventory` | **Código-fonte**: [inventory.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/inventory.tsx)
* **Finalidade**: Controle físico e financeiro das mercadorias destinadas à revenda, apuração do custo das vendas e valor patrimonial.
* **Recursos e Regras**:
  * **Cadastro e Controle de Produtos**: Código SKU, descrição, quantidade em estoque (*Qty on Hand*), custo unitário médio e preço de venda.
  * **Avaliação de Estoque conforme US GAAP**:
    * Aplicação do princípio contábil do Menor entre o Custo e o Valor Realizável Líquido (*Lower of Cost or Net Realizable Value - NRV*).
    * Manutenção do valor contábil ativo da conta *1300 - Merchandise Inventory*.
  * **Ajustes de Estoque (*Stock Adjustments*)**: Registro de quebras, inventário físico ou perdas por obsolescência com apropriação direta em despesa/custo.

---

#### 3.5. Gestão de Projetos & Rentabilidade (*Projects & Margin Analysis*)
* **Rota**: `/projects` | **Código-fonte**: [projects.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/projects.tsx)
* **Finalidade**: Contabilidade por centro de custos e contratos, permitindo avaliar a lucratividade específica de cada cliente ou projeto.
* **Recursos e Regras**:
  * **Cadastro de Projetos**: Definição do cliente responsável, orçamento contratado (*Budget*), data de início e prazo de entrega.
  * **Apuração em Tempo Real de Receitas e Custos**:
    * Todas as faturas e despesas vinculadas ao código do projeto são agregadas automaticamente.
    * Cálculo imediato da Margem Bruta e Percentual de Margem Operacional por contrato.
  * **Controle de Desvio de Orçamento**: Alertas de estouro de orçamento (*Budget Variance*) para projetos com custos superiores ao orçado.

---

### MÓDULO 2: RAZÃO CONTÁBIL CENTRAL (GENERAL LEDGER)

#### 3.6. Lançamentos no Diário (*Journal Entries*)
* **Rota**: `/journals` | **Código-fonte**: [journals.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/journals.tsx)
* **Finalidade**: Motor principal de escrituração contábil por partidas dobradas (*Double-Entry System*).
* **Recursos e Regras**:
  * **Validação Contábil em Tempo Real**:
    * Criação de lançamentos com 2 ou mais linhas (múltiplos débitos e múltiplos créditos).
    * Bloqueio estrito de salvamento enquanto $\sum \text{Débito} \neq \sum \text{Crédito}$.
  * **Proteção de Período Fechado (*Period Lock Enforcement*)**:
    * Caso o período fiscal da empresa esteja bloqueado (*Hard Close*), apenas usuários com permissão de CPA/Admin conseguem realizar lançamentos, sendo **obrigatório** preencher uma justificativa formal para a trilha de auditoria.
  * **Filtros e Visualização Detalhada**: Filtro por conta contábil, data, código do lançamento (*JE-xxxx*) e busca textual por histórico.

---

#### 3.7. Plano de Contas Padronizado (*Chart of Accounts*)
* **Rota**: `/accounts` | **Código-fonte**: [accounts.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/accounts.tsx)
* **Finalidade**: Estrutura contábil padronizada de acordo com as normas e taxonomia US GAAP.
* **Estrutura das Classes Contábeis**:
  1. **1000 – Assets (Ativos)**: Caixa e Equivalentes (1000/1050), Contas a Receber (1100), Provisão para Devedores Duvidosos (1200), Estoque (1300), Despesas Antecipadas (1400), Ativo Imobilizado e Depreciação Acumulada.
  2. **2000 – Liabilities (Passivos)**: Fornecedores (2000), Cartão de Crédito Amex (2100), Imposto sobre Vendas a Recolher (2200), Salários e Encargos a Pagar (2300).
  3. **3000 – Equity (Patrimônio Líquido)**: Capital Social Integralizado (3000), Lucros Retidos Acumulados (3100).
  4. **4000 – Revenue (Receitas)**: Venda de Mercadorias (4000), Prestação de Serviços Técnicos (4100).
  5. **5000 – Cost of Goods Sold (CPV/COGS)**: Custo direto de mercadorias e insumos vendidos.
  6. **6000 & 7000 – Operating Expenses (Despesas Operacionais)**: Salários e Pró-labore (6000), Aluguel e Ocupação (6100), Software e Nuvem (6200), Marketing e Vendas (6300), Depreciação e Amortização (7000).
  7. **8000 & 9000 – Other Income & Expenses**: Receitas Financeiras de Rendimento (8000), Despesas com Juros (9000) e Ganho/Perda Cambial Realizada (9100).
* **Recálculo Dinâmico de Saldos**: Todos os saldos das contas são derivados diretamente do somatório de lançamentos no razão contábil.

---

#### 3.8. Balancete de Verificação (*Trial Balance*)
* **Rota**: `/trial-balance` | **Código-fonte**: [trial-balance.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/trial-balance.tsx)
* **Finalidade**: Instrumento de controle que lista todas as contas do plano de contas e seus respectivos saldos devedores ou credores.
* **Recursos e Regras**:
  * Apresentação em colunas distintas de Débito (*Debit*) e Crédito (*Credit*).
  * Totalização final com selo de integridade (*Balanced Status*), assegurando que o livro contábil está matematicamente correto antes do fechamento de balanços.

---

### MÓDULO 3: DEMONSTRAÇÕES FINANCEIRAS (FINANCIAL STATEMENTS)

#### 3.9. Demonstração do Resultado / DRE (*Income Statement / P&L*)
* **Rota**: `/dre` | **Código-fonte**: [dre.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/dre.tsx)
* **Finalidade**: Apuração do resultado econômico (lucro ou prejuízo) da operação no período fiscal selecionado.
* **Estrutura em Cascata US GAAP**:
  $$\begin{aligned}
  & \text{Operating Revenue (Receita Bruta)} \\
  - & \text{Cost of Goods Sold (CPV)} \\
  = & \textbf{Gross Profit (Lucro Bruto)} \\
  - & \text{Operating Expenses (OpEx: Salários, Aluguéis, Tecnologia, etc.)} \\
  = & \textbf{Operating Income / EBIT (Lucro Operacional)} \\
  \pm & \text{Other Income / (Expense) (Juros e Variação Cambial FX)} \\
  = & \textbf{Net Income before Tax / Net Profit (Lucro Líquido Final)}
  \end{aligned}$$
* **Análise Vertical**: Exibição do percentual de impacto de cada despesa em relação à receita bruta faturada.

---

#### 3.10. Balanço Patrimonial (*Balance Sheet*)
* **Rota**: `/balance-sheet` | **Código-fonte**: [balance-sheet.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/balance-sheet.tsx)
* **Finalidade**: Demonstração da posição patrimonial estática da empresa em uma data de corte.
* **Validação da Equação Contábil Fundamental**:
  $$\textbf{Total Assets} = \textbf{Total Liabilities} + \textbf{Stockholders' Equity}$$
* **Recursos**:
  * Segregação clássica de Ativos Circulantes (*Current Assets*) e Ativos Não Circulantes (*Property, Plant & Equipment*).
  * Passivos de Curto Prazo (*Current Liabilities*) e Obrigações Futuras.
  * Lucros Acumulados (*Retained Earnings*) atualizados automaticamente a partir do lucro apurado no P&L.

---

#### 3.11. Demonstração do Fluxo de Caixa & Forecast (*Cash Flow & Forecast*)
* **Rota**: `/cash-flow` | **Código-fonte**: [cash-flow.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/cash-flow.tsx)
* **Finalidade**: Mapeamento das entradas e saídas efetivas de caixa e simulação da liquidez futura.
* **Classificação conforme US GAAP (ASC 230)**:
  * **Operating Activities (Atividades Operacionais)**: Recebimentos de clientes deduzidos de pagamentos a fornecedores e despesas operacionais.
  * **Investing Activities (Atividades de Investimento)**: Aquisições de bens de capital ou equipamentos.
  * **Financing Activities (Atividades de Financiamento)**: Aportes de capital, empréstimos ou distribuições de lucros.
* **Projeção de Caixa (*Cash Runway & Forecast*)**: Simulação baseada na taxa média de queima mensal (*Burn Rate*) e receitas contratadas.

---

#### 3.12. Apuração de Imposto sobre Vendas (*Sales Tax Summary*)
* **Rota**: `/taxes` | **Código-fonte**: [taxes.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/taxes.tsx)
* **Finalidade**: Consolidação e controle das obrigações tributárias de imposto sobre vendas por estado americano.
* **Recursos e Regras**:
  * **Apuração por Jurisdição**: Totalização do imposto recolhido por estado (ex: Califórnia, Texas, Flórida, Nova York).
  * **Guia de Recolhimento Manual**:
    * Como nos EUA o recolhimento é feito diretamente no portal governamental estadual (*State Department of Revenue*), o módulo permite registrar o comprovante de pagamento governamental e o número de confirmação oficial.
    * Ao liquidar a guia, gera o lançamento contábil:
      * **Débito**: *2200 - Sales Tax Payable*
      * **Crédito**: *1000 - Cash Operating*

---

#### 3.13. Envelhecimento de Saldos a Receber (*AR Aging Position*)
* **Rota**: `/receivables` | **Código-fonte**: [receivables.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/receivables.tsx)
* **Finalidade**: Análise de risco de crédito, inadimplência e provisão de perdas esperadas.
* **Recursos e Regras**:
  * Classificação das faturas por faixas de vencimento:
    * *Current* (A vencer)
    * *1–30 dias de atraso*
    * *31–60 dias de atraso*
    * *61–90 dias de atraso*
    * *> 90 dias de atraso*
  * **Provisão para Créditos de Liquidação Duvidosa (CECL - ASC 326)**: Cálculo da provisão contábil estimada contra a conta *1200 - Allowance for Doubtful Accounts*.

---

### MÓDULO 4: BANCOS, GOVERNANÇA & MULTI-EMPRESAS

#### 3.14. Extratos Bancários & Conciliação (*Bank Feeds & Staging*)
* **Rota**: `/statements` | **Código-fonte**: [statements.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/statements.tsx)
* **Finalidade**: Importação de arquivos de extrato bancário e conciliação assistida com o diário contábil.
* **Recursos e Regras**:
  * **Upload de Arquivos pelo Cliente ou Escritório**: Suporte a formatos bancários padronizados (**OFX**, **CSV** e **PDF** para arquivamento).
  * **Área de Triagem (*Staging Area*)**: Exibição das transações importadas que ainda não foram conciliadas no razão.
  * **Conciliação com Lançamentos Contábeis (*Match & Reconcile*)**: Associação de transações bancárias a faturas de clientes ou contas a pagar existentes.
  * **Tratamento Automático de Variação Cambial (*FX Gain/Loss*)**:
    * Para pagamentos internacionais liquidados pelo banco em moeda estrangeira (ex: GBP ou MXN), o sistema calcula a diferença entre o valor registrado na emissão e o valor efetivamente debitado no extrato.
    * A diferença é automaticamente lançada na conta *9100 - Realized Foreign Exchange Gain/Loss*, garantindo que a conta bancária feche em $0.00 de divergência.

---

#### 3.15. Trilha de Auditoria & Conformidade (*Audit Trail Log*)
* **Rota**: `/audit-log` | **Código-fonte**: [audit-log.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/audit-log.tsx)
* **Finalidade**: Registro imutável de todas as ações sensíveis realizadas no sistema para conformidade com normas SOC 1 / SOX.
* **Informações Registradas**:
  * Data e hora exatas com fuso horário (*Timestamp*).
  * Identificação do usuário e papel (*User Persona*).
  * Tipo de ação (Criação de fatura, estorno de lançamento, liquidação de guia fiscal, bloqueio de período fiscal).
  * Detalhamento com endereço de IP de origem e justificativas fornecidas.

---

#### 3.16. Gestão de Empresas & Perfis (*Roles & Tenants*)
* **Rota**: `/access` | **Código-fonte**: [access.tsx](file:///d:/GIT/us-gaap-ledger/src/routes/access.tsx)
* **Finalidade**: Gestão multi-empresa e simulação de perfis de usuário.
* **Recursos e Regras**:
  * **Alternância Instantânea de Empresa (*Tenant Switcher*)**: O contador pode alternar entre empresas clientes no menu superior, trocando instantaneamente todo o contexto de dados.
  * **Simulador de Perfil (*Role Switcher*)**: Permite visualizar o sistema exatamente como um cliente enxergaria (*Client Portal*) ou como a equipe operacional.
  * **Cadastro de Novas Empresas**: Configuração de nome empresarial, moeda funcional padrão (USD) e período fiscal de abertura.

---

#### 3.17. Bloqueio e Encerramento de Período Contábil (*Hard Period Close*)
* **Componente**: [app-shell.tsx](file:///d:/GIT/us-gaap-ledger/src/components/app-shell.tsx) & [modal-provider.tsx](file:///d:/GIT/us-gaap-ledger/src/components/modal-provider.tsx)
* **Finalidade**: Garantir a imutabilidade dos números contábeis após o fechamento do mês ou ano fiscal.
* **Recursos e Regras**:
  * Botão de bloqueio de período acessível aos gestores contábeis.
  * Ao ser bloqueado, os usuários de nível operacional e clientes ficam impedidos de lançar ou modificar faturas, contas ou diários com datas daquele período.
  * Qualquer lançamento de ajuste emergencial exige aprovação de usuário CPA e registro obrigatório de justificativa de auditoria.

---

## 4. Resumo de Alinhamento com os Requisitos de Negócio

| Necessidade Apontada na Reunião | Solução Implementada no Sistema | Módulo / Rota Correspondente |
| :--- | :--- | :--- |
| **Substituir o controle de planilhas Excel por um sistema contábil próprio** | Plataforma completa em regime de competência (*Accrual Basis*) e partidas dobradas estritas | Todos os módulos |
| **Emissão de faturas (Invoices) de serviços e produtos** | Módulo de faturamento com cálculo de imposto e baixa integrada ao razão | `/invoices` |
| **Controle de estoque para empresas de mercadorias** | Catálogo com avaliação contínua por Menor entre Custo e Valor Realizável Líquido (NRV) | `/inventory` |
| **Contas a pagar e despesas com fornecedores** | Gestão de contas a pagar com controle de vencimentos e baixa por banco ou cartão | `/payables` |
| **Relatórios fiscais e contábeis: DRE, Balancete, Balanço e Fluxo de Caixa** | Demonstrações no padrão US GAAP com recálculo em tempo real | `/dre`, `/balance-sheet`, `/trial-balance`, `/cash-flow` |
| **Impostos nos EUA informados manualmente e apurados por estado** | Módulo de apuração de Sales Tax com registro manual de guias pagas ao governo estadual | `/taxes` |
| **Portal do cliente com acesso restrito a relatórios e envio de extratos** | Perfil *Client Portal* com bloqueio de escrituração e liberação de relatórios e upload | `/statements` e seletor de perfil |
| **Importação de extratos bancários (OFX, CSV, PDF)** | Módulo de conciliação com área de triagem (*staging*) | `/statements` |
| **Tratamento de pagamentos multimoedas e variação cambial automática** | Lançamento automático das diferenças de câmbio na conta *9100 - Realized FX Gain/Loss* | `/statements` e `/journals` |
| **Multi-clientes (multi-tenant) no mesmo escritório** | Cada empresa cliente possui sua própria base contábil com troca instantânea | `/access` e seletor de empresa |
