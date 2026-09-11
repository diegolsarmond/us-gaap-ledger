export interface TutorialWorkflowStep {
  id: string;
  title: string;
  shortDesc: string;
  stageBadge: string;
  iconName?: string;
}

export interface TutorialDetailStep {
  stepNumber: number;
  title: string;
  actionSummary: string;
  howToOperate: string[];
  accountingImpact?: {
    debit: string;
    credit: string;
    description: string;
  };
  usGaapRule?: {
    standard: string;
    ruleDescription: string;
  };
  auditTips: string;
}

export interface ModuleTutorial {
  id: string;
  path: string;
  category: "Operations" | "General Ledger" | "Financial Statements" | "Banking & Governance" | "System Parameters";
  title: string;
  subtitle: string;
  badge: string;
  summary: string;
  workflow: TutorialWorkflowStep[];
  steps: TutorialDetailStep[];
}

export const MODULE_TUTORIALS: Record<string, ModuleTutorial> = {
  "/": {
    id: "dashboard",
    path: "/",
    category: "Operations",
    title: "Dashboard Executivo e Financeiro",
    subtitle: "Visão consolidada de KPIs, liquidez, margens e integridade contábil",
    badge: "Visão Geral",
    summary: "O Dashboard reúne os principais indicadores econômico-financeiros da empresa em tempo real, alertando sobre faturas a vencer, despesas críticas, status do período e balanço do razão.",
    workflow: [
      { id: "kpis", title: "1. Monitoramento de KPIs", shortDesc: "Acompanhe Runway, EBITDA e Caixa", stageBadge: "Entrada" },
      { id: "alerts", title: "2. Alertas Operacionais", shortDesc: "Identifique faturas e contas pendentes", stageBadge: "Triagem" },
      { id: "balance", title: "3. Equilíbrio do Ledger", shortDesc: "Valide se Débitos = Créditos", stageBadge: "Controle" },
      { id: "actions", title: "4. Ações Rápidas", shortDesc: "Dispare lançamentos ou relatórios", stageBadge: "Execução" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Leitura dos Indicadores de Liquidez e Rentabilidade",
        actionSummary: "Analise os cartões superiores de Caixa Disponível, Receita Mensal, Despesas Operacionais e Margem Bruta.",
        howToOperate: [
          "Verifique a posição de caixa consolidada e compare com as metas do trimestre.",
          "Examine o gráfico de tendências de receita para detectar sazonalidades ou variações atípicas.",
          "Confira o indicador de 'Runway' para planejar a necessidade de capital de giro."
        ],
        usGaapRule: {
          standard: "US GAAP Framework",
          ruleDescription: "Métricas gerenciais devem refletir o regime de competência (Accrual Basis), reconciliando resultados com o fluxo de caixa efetivo."
        },
        auditTips: "Valide se os números do dashboard coincidem rigorosamente com o Balancete (Trial Balance) antes de reuniões com stakeholders."
      },
      {
        stepNumber: 2,
        title: "Atenção aos Alertas de Contas a Receber e a Pagar",
        actionSummary: "Identifique títulos vencidos ou com vencimento nos próximos 7 dias.",
        howToOperate: [
          "Consulte o painel de 'Próximos Vencimentos de Clientes' e faça follow-up preventivo.",
          "Verifique as contas a pagar para evitar juros e penalidades por atraso.",
          "Clique diretamente nos cards para abrir os módulos de Invoices ou Bills já filtrados."
        ],
        usGaapRule: {
          standard: "ASC 450 - Contingencies",
          ruleDescription: "Obrigações e perdas prováveis devem ser provisionadas e monitoradas ativamente."
        },
        auditTips: "Monitore inadimplências recorrentes para ajustar a provisão de perdas esperadas (CECL)."
      },
      {
        stepNumber: 3,
        title: "Verificação da Saúde do Ledger (Débitos vs Créditos)",
        actionSummary: "Confirme se o widget 'Ledger Balance' no menu lateral ou dashboard exibe status equilibrado.",
        howToOperate: [
          "Se o status estiver 'Balanced (Δ $0.00)', o sistema garante a integridade matemática das partidas dobradas.",
          "Caso ocorra discrepância (UNBALANCED), consulte imediatamente o Trial Balance para isolar o lote divergente."
        ],
        accountingImpact: {
          debit: "Total de Ativos + Despesas",
          credit: "Total de Passivos + PL + Receitas",
          description: "O somatório de todos os lançamentos debitados deve ser idêntico ao dos creditados."
        },
        auditTips: "Nunca realize o fechamento do período sem certificar-se do balanço exato com delta zero."
      }
    ]
  },

  "/invoices": {
    id: "invoices",
    path: "/invoices",
    category: "Operations",
    title: "Invoices & Contas a Receber (AR)",
    subtitle: "Emissão de faturas, aplicação do ASC 606 e controle de recebimentos",
    badge: "Faturamento",
    summary: "Gerencie o faturamento de clientes, geração de títulos a receber, alíquotas automáticas de Sales Tax e reconhecimento de receita segundo a norma ASC 606.",
    workflow: [
      { id: "draft", title: "1. Criação da Fatura", shortDesc: "Cliente, Itens e Alíquota de Sales Tax", stageBadge: "Elaboração" },
      { id: "rev-rec", title: "2. Critério ASC 606", shortDesc: "Obrigações de desempenho satisfeitas", stageBadge: "Contábil" },
      { id: "post", title: "3. Lançamento no Razão", shortDesc: "Geração de AR e Receita no Ledger", stageBadge: "Registro" },
      { id: "collect", title: "4. Baixa e Cobrança", shortDesc: "Recebimento e conciliação bancária", stageBadge: "Liquidação" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Emissão de Nova Fatura de Venda",
        actionSummary: "Preencha cliente, condições de pagamento (Payment Terms) e produtos/serviços.",
        howToOperate: [
          "Clique no botão '+ Nova Fatura' no topo direito da tela.",
          "Selecione o cliente cadastrado e o prazo de pagamento (ex: Net 30).",
          "Adicione os itens de serviço ou mercadoria, especificando quantidade, preço unitário e jurisdição de imposto."
        ],
        usGaapRule: {
          standard: "ASC 606 - Revenue from Contracts with Customers",
          ruleDescription: "A receita só deve ser reconhecida quando o controle dos bens ou serviços for transferido ao cliente (satisfação da obrigação de performance)."
        },
        auditTips: "Anexe o pedido de compra (PO) ou contrato assinado para resguardo em auditorias fiscais estaduais."
      },
      {
        stepNumber: 2,
        title: "Lançamento Contábil Automático de Faturamento",
        actionSummary: "Ao aprovar a fatura, o sistema gera o lançamento contábil em partidas dobradas.",
        howToOperate: [
          "Revise os totais antes de finalizar.",
          "Ao salvar com status 'Aprovada' ou 'Enviada', o título passa a compor a carteira de recebíveis."
        ],
        accountingImpact: {
          debit: "1100 - Accounts Receivable (Valor Total Bruto)",
          credit: "4000 - Service / Sales Revenue (Receita Líquida) + 2150 - Sales Tax Payable (Imposto Retido)",
          description: "Reconhecimento do direito de receber e da obrigação de recolhimento de impostos perante o estado."
        },
        auditTips: "Certifique-se de que a jurisdição do cliente foi selecionada corretamente para evitar bitributação ou autuação por falta de Sales Tax."
      },
      {
        stepNumber: 3,
        title: "Recebimento e Baixa de Pagamento",
        actionSummary: "Registre o pagamento total ou parcial do cliente quando o valor for compensado no banco.",
        howToOperate: [
          "Localize a fatura na lista e clique em 'Registrar Pagamento'.",
          "Selecione a conta de banco de destino, data do depósito e valor recebido.",
          "O status da fatura migrará para 'Paga' ou 'Parcialmente Paga'."
        ],
        accountingImpact: {
          debit: "1010 - Operating Bank Account (Entrada de Caixa)",
          credit: "1100 - Accounts Receivable (Baixa do Título)",
          description: "Conversão do ativo de recebíveis em disponibilidade imediata de caixa."
        },
        auditTips: "Confronte os depósitos com o extrato bancário no módulo 'Bank Feeds & Staging' para evitar duplicidades."
      }
    ]
  },

  "/payables": {
    id: "payables",
    path: "/payables",
    category: "Operations",
    title: "Bills & Contas a Pagar (AP)",
    subtitle: "Registro de despesas, faturas de fornecedores e controle de fluxo de saída",
    badge: "Contas a Pagar",
    summary: "Controle as obrigações com fornecedores, despesas operacionais recorrentes, prazos de pagamento e integração com centros de custo e categorias contábeis.",
    workflow: [
      { id: "bill-entry", title: "1. Entrada da Conta", shortDesc: "Fornecedor, vencimento e categoria", stageBadge: "Entrada" },
      { id: "approval", title: "2. Aprovação de Despesa", shortDesc: "Validação de centro de custo e orçamento", stageBadge: "Compliance" },
      { id: "accrual", title: "3. Registro Contábil", shortDesc: "Lançamento em Despesa e AP Passivo", stageBadge: "Registro" },
      { id: "payment", title: "4. Liquidação e Baixa", shortDesc: "Pagamento bancário e baixa do passivo", stageBadge: "Execução" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Inclusão de Bill (Fatura de Fornecedor)",
        actionSummary: "Cadastre as faturas recebidas de fornecedores com data de competência e vencimento.",
        howToOperate: [
          "Clique em '+ Nova Bill / Despesa' e informe o fornecedor e o número do invoice recebido.",
          "Selecione a Categoria de Despesa (ex: Software, Consultoria, Aluguel) e o Centro de Custo.",
          "Defina o vencimento conforme as condições acordadas (ex: Net 15, Net 30)."
        ],
        usGaapRule: {
          standard: "Accrual Accounting (Regime de Competência)",
          ruleDescription: "As despesas devem ser reconhecidas no período em que os serviços foram prestados ou bens consumidos, independentemente da data do pagamento."
        },
        auditTips: "Verifique se o CNPJ/EIN do fornecedor e o formulário W-9 estão arquivados para declarações anuais 1099-MISC/NEC."
      },
      {
        stepNumber: 2,
        title: "Lançamento Contábil no Razão de Passivos",
        actionSummary: "Ao salvar a Bill, o sistema debita a despesa na DRE e credita o passivo de contas a pagar.",
        howToOperate: [
          "Acompanhe o valor da conta integrando os relatórios de P&L e Fluxo de Caixa.",
          "Em caso de despesas antecipadas (ex: seguro anual), direcione para conta de Ativo Circulante (Prepaid Expenses)."
        ],
        accountingImpact: {
          debit: "5000+ - Operating Expense (Conta de Resultado na DRE)",
          credit: "2000 - Accounts Payable (Passivo Circulante)",
          description: "Reconhecimento da obrigação a pagar perante o fornecedor."
        },
        auditTips: "Não deixe contas sem categoria específica para evitar distorções no fechamento mensal da DRE."
      },
      {
        stepNumber: 3,
        title: "Programação e Baixa de Pagamento",
        actionSummary: "Efetue o pagamento via transferência bancária, cartão corporativo ou ACH e registre a baixa.",
        howToOperate: [
          "Selecione a Bill e clique em 'Pagar Conta'.",
          "Escolha a conta bancária pagadora e a data exata da transação.",
          "O saldo de contas a pagar diminui e a conta passa ao status 'Quitada'."
        ],
        accountingImpact: {
          debit: "2000 - Accounts Payable (Eliminação do Passivo)",
          credit: "1010 - Bank Account (Saída de Disponibilidade)",
          description: "Liquidação definitiva da dívida com o fornecedor."
        },
        auditTips: "Guarde comprovantes de transferência ou cheques compensados para comprovação em auditorias."
      }
    ]
  },

  "/inventory": {
    id: "inventory",
    path: "/inventory",
    category: "Operations",
    title: "Inventory Catalog & Custeio de Estoque",
    subtitle: "Gestão de itens, avaliação pelo menor entre custo e mercado e cálculo do CMV/COGS",
    badge: "Estoque",
    summary: "Acompanhe níveis de estoque, valorização de ativos físicos, métodos de custeio FIFO (PEPS) ou Média Ponderada e baixa automática para Custo das Mercadorias Vendidas (COGS).",
    workflow: [
      { id: "catalog", title: "1. Cadastro de SKUs", shortDesc: "Definição de código, custo base e método", stageBadge: "Cadastro" },
      { id: "inbound", title: "2. Entrada de Mercadorias", shortDesc: "Recebimento com incremento no Ativo", stageBadge: "Entrada" },
      { id: "cogs", title: "3. Baixa por Venda (COGS)", shortDesc: "Cálculo automático de FIFO ou Média", stageBadge: "Custeio" },
      { id: "valuation", title: "4. Teste de Impairment", shortDesc: "Lower of Cost or Net Realizable Value", stageBadge: "Avaliação" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Cadastro de Produtos e Política de Custeio",
        actionSummary: "Defina os SKUs do catálogo, unidade de medida, preço sugerido e custo unitário.",
        howToOperate: [
          "Cadastre novos itens informando SKU, descrição e estoque mínimo de segurança.",
          "Verifique se o método de custeio da empresa (FIFO ou Weighted Average) está ativo nas configurações."
        ],
        usGaapRule: {
          standard: "ASC 330 - Inventory",
          ruleDescription: "Sob o US GAAP, o estoque deve ser mensurado pelo menor valor entre o custo histórico e o valor realizável líquido (Lower of Cost and Net Realizable Value)."
        },
        auditTips: "Lembre-se que o método LIFO (UEPS) possui restrições e não deve ser misturado com regras de IFRS se houver consolidação internacional."
      },
      {
        stepNumber: 2,
        title: "Entrada de Compras e Formação de Custo",
        actionSummary: "Ao registrar o recebimento de faturas com itens de estoque, o saldo de mercadorias é atualizado.",
        howToOperate: [
          "Importe o pedido de compras ou dê entrada manual nas quantidades recebidas.",
          "O custo de frete (Freight-in) e seguros de transporte devem ser agregados ao custo do item."
        ],
        accountingImpact: {
          debit: "1200 - Inventory Asset (Ativo Circulante)",
          credit: "2000 - Accounts Payable ou 1010 - Bank Account",
          description: "Capitalização do custo dos bens adquiridos para revenda ou produção."
        },
        auditTips: "Realize inventários físicos periódicos (contagem cíclica) para auditar eventuais quebras ou desvios de mercadorias."
      },
      {
        stepNumber: 3,
        title: "Baixa Automática de Custo na Venda (CMV / COGS)",
        actionSummary: "Quando uma fatura de cliente é emitida contendo itens de estoque, o sistema calcula o COGS.",
        howToOperate: [
          "A quantidade em estoque é deduzida automaticamente da prateleira.",
          "A margem bruta do produto é apurada instantaneamente na DRE."
        ],
        accountingImpact: {
          debit: "5010 - Cost of Goods Sold (Conta de Custo na DRE)",
          credit: "1200 - Inventory Asset (Redução do Ativo)",
          description: "Princípio do confronto de despesas com receitas (Matching Principle)."
        },
        auditTips: "Verifique relatórios de rotatividade de estoque para identificar itens obsoletos que demandam write-down."
      }
    ]
  },

  "/projects": {
    id: "projects",
    path: "/projects",
    category: "Operations",
    title: "Projects & Rentabilidade por Contrato",
    subtitle: "Acompanhamento de custos diretos, receitas dedicadas e margem de contribuição",
    badge: "Projetos",
    summary: "Monitore a lucratividade de cada contrato ou cliente em tempo real, atribuindo receitas faturadas, despesas alocadas e horas de trabalho dedicadas.",
    workflow: [
      { id: "setup", title: "1. Abertura do Projeto", shortDesc: "Cliente, orçamento e prazo previsto", stageBadge: "Planejamento" },
      { id: "allocation", title: "2. Alocação de Custos", shortDesc: "Vínculo de faturas de compra e horas", stageBadge: "Execução" },
      { id: "billing", title: "3. Faturamento Dedicado", shortDesc: "Emissão de faturas vinculadas ao código", stageBadge: "Faturamento" },
      { id: "margin", title: "4. Análise de Margem", shortDesc: "Apuração do resultado e margem real", stageBadge: "Controle" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Criação e Parametrização do Projeto",
        actionSummary: "Cadastre o projeto associando ao cliente contratante e definindo o teto orçamentário.",
        howToOperate: [
          "Clique em '+ Novo Projeto' e atribua um código único.",
          "Informe o valor total contratado, data de início e previsão de término.",
          "Defina se o faturamento será por marco (Milestones), preço fixo ou horas trabalhadas (Time & Materials)."
        ],
        usGaapRule: {
          standard: "ASC 606-10-55 - Over Time vs Point in Time",
          ruleDescription: "Contratos de longo prazo exigem método de mensuração do progresso (Input Method ou Output Method) para reconhecimento contínuo de receita."
        },
        auditTips: "Documente detalhadamente as medições de entrega aprovadas pelo cliente antes de reconhecer receitas parciais."
      },
      {
        stepNumber: 2,
        title: "Apropriação de Custos Diretos e Indiretos",
        actionSummary: "Ao lançar despesas no AP ou apontamento de horas, selecione o código do projeto correspondente.",
        howToOperate: [
          "Certifique-se de que a equipe informe a tag do projeto em todas as despesas reembolsáveis.",
          "O sistema atualiza a barra de consumo orçamentário imediatamente."
        ],
        accountingImpact: {
          debit: "5200 - Direct Project Expenses (Custo do Projeto)",
          credit: "2000 - Accounts Payable ou 1010 - Bank Account",
          description: "Apropriação do custo diretamente ao contrato gerador."
        },
        auditTips: "Compare mensalmente o custo incorrido versus o previsto para evitar estouro de orçamento imprevisto."
      }
    ]
  },

  "/journals": {
    id: "journals",
    path: "/journals",
    category: "General Ledger",
    title: "Journal Entries (Livro Diário Contábil)",
    subtitle: "Lançamentos manuais e automáticos em partidas dobradas com controle de auditoria",
    badge: "Razão Geral",
    summary: "O coração do sistema contábil. Todos os eventos econômicos convergem para lançamentos do diário onde o total debitado deve ser estritamente igual ao total creditado.",
    workflow: [
      { id: "entry-setup", title: "1. Cabeçalho do Diário", shortDesc: "Data, referência e motivo do lançamento", stageBadge: "Origem" },
      { id: "lines", title: "2. Linhas de Débito e Crédito", shortDesc: "Seleção de contas contábeis e valores", stageBadge: "Partidas" },
      { id: "balance-check", title: "3. Validação de Balanço", shortDesc: "Garantia de que Total Débito = Crédito", stageBadge: "Consistência" },
      { id: "post", title: "4. Efetivação no Razão", shortDesc: "Postagem irreversível no log de auditoria", stageBadge: "Postagem" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Criação de Novo Lançamento Contábil",
        actionSummary: "Utilizado para ajustes contábeis, depreciação, amortização e provisões de fechamento de mês.",
        howToOperate: [
          "Clique em '+ Novo Lançamento Manual (Journal Entry)'.",
          "Informe a data contábil (deve pertencer a um período que esteja aberto).",
          "Adicione uma descrição clara e objetiva para fundamentação de auditoria."
        ],
        usGaapRule: {
          standard: "Double-Entry Accounting System",
          ruleDescription: "Princípio fundamental contábil onde todo débito requer um ou mais créditos de valor rigorosamente idêntico."
        },
        auditTips: "Lançamentos manuais sofrem escrutínio intensivo por auditores independentes; sempre anexe memorial de cálculo."
      },
      {
        stepNumber: 2,
        title: "Composição das Linhas de Partidas Dobradas",
        actionSummary: "Adicione as contas contábeis correspondentes do plano de contas US GAAP.",
        howToOperate: [
          "Para cada linha, selecione a conta contábil (ex: 1010, 5100).",
          "Informe o valor na coluna Débito ou Crédito.",
          "O indicador de 'Desbalanceamento (Difference)' deve atingir exatamente $0.00 antes que a postagem seja permitida."
        ],
        accountingImpact: {
          debit: "Exemplo: 5300 - Depreciation Expense",
          credit: "Exemplo: 1690 - Accumulated Depreciation",
          description: "Exemplo de lançamento de ajuste mensal de depreciação de imobilizado."
        },
        auditTips: "Se o período estiver bloqueado pelo CPA, o sistema impedirá lançamentos sem justificativa formal prévia."
      }
    ]
  },

  "/accounts": {
    id: "accounts",
    path: "/accounts",
    category: "General Ledger",
    title: "Chart of Accounts (Plano de Contas US GAAP)",
    subtitle: "Estrutura hierárquica padronizada de contas ativas, passivas, PL, receitas e custos",
    badge: "Plano de Contas",
    summary: "O Chart of Accounts organiza todas as contas da organização no padrão numérico norte-americano (1000 Ativo, 2000 Passivo, 3000 Patrimônio Líquido, 4000 Receitas, 5000+ Despesas).",
    workflow: [
      { id: "structure", title: "1. Estrutura Numérica", shortDesc: "Hierarquia 1000 a 8000 padronizada", stageBadge: "Norma" },
      { id: "add-account", title: "2. Cadastro de Subcontas", shortDesc: "Criação de contas sintéticas e analíticas", stageBadge: "Configuração" },
      { id: "balance-view", title: "3. Consulta de Saldos", shortDesc: "Saldo atual e histórico de movimentações", stageBadge: "Consulta" },
      { id: "mapping", title: "4. Mapeamento nos Relatórios", shortDesc: "Vínculo com Balanço e P&L", stageBadge: "Integração" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Navegação na Estrutura do Plano de Contas",
        actionSummary: "Compreenda a distribuição por classes de contas segundo o US GAAP.",
        howToOperate: [
          "1000 - Assets (Ativos Circulantes e Não Circulantes).",
          "2000 - Liabilities (Passivos Circulantes e Exigível a Longo Prazo).",
          "3000 - Equity (Capital Social, Reservas e Lucros Retidos).",
          "4000 - Revenue (Receitas de Vendas e Serviços).",
          "5000 a 7000 - COGS e Despesas Operacionais (SG&A)."
        ],
        usGaapRule: {
          standard: "FASB Accounting Standards Codification (ASC)",
          ruleDescription: "A padronização permite comparabilidade de demonstrações financeiras entre diferentes entidades corporativas."
        },
        auditTips: "Não exclua contas que já possuam movimentações históricas no razão; em vez disso, marque-as como inativas."
      },
      {
        stepNumber: 2,
        title: "Criação de Nova Conta Contábil",
        actionSummary: "Adicione novas subcontas para acomodar novas linhas de negócio ou centros de custos.",
        howToOperate: [
          "Clique em '+ Nova Conta' no canto superior da tabela.",
          "Informe o código (ex: 1015), o nome da conta e o tipo contábil correspondente.",
          "Defina a natureza do saldo (Normal Balance: Débito para Ativos/Despesas, Crédito para Passivos/PL/Receitas)."
        ],
        auditTips: "Mantenha a granularidade das contas alinhada com as necessidades da declaração de imposto de renda da empresa (Form 1120 / 1120-S)."
      }
    ]
  },

  "/trial-balance": {
    id: "trial-balance",
    path: "/trial-balance",
    category: "General Ledger",
    title: "Trial Balance (Balancete de Verificação)",
    subtitle: "Conferência matemática e contábil de todos os saldos devedores e credores",
    badge: "Balancete",
    summary: "O Balancete lista todas as contas ativas com seus respectivos saldos de débito e crédito no período, garantindo a integridade antes da emissão das demonstrações financeiras.",
    workflow: [
      { id: "period-filter", title: "1. Seleção do Período", shortDesc: "Escolha do mês fiscal ou acumulado", stageBadge: "Filtro" },
      { id: "balance-calc", title: "2. Totalização Automática", shortDesc: "Soma de todos os débitos e créditos", stageBadge: "Cálculo" },
      { id: "variance", title: "3. Verificação de Divergência", shortDesc: "Identificação de delta ou anomalias", stageBadge: "Auditoria" },
      { id: "export", title: "4. Exportação para o CPA", shortDesc: "Download em Excel/PDF para fechamento", stageBadge: "Relatório" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Análise dos Saldos por Classe Contábil",
        actionSummary: "Filtre o período fiscal desejado e revise a coluna de saldos devedores e credores.",
        howToOperate: [
          "Verifique se o rodapé apresenta: 'Total Débitos = Total Créditos' com diferença igual a zero.",
          "Contas de Ativos e Despesas devem apresentar saldo predominantemente Devedor.",
          "Contas de Passivos, PL e Receitas devem apresentar saldo Credor."
        ],
        usGaapRule: {
          standard: "Trial Balance Equilibrium",
          ruleDescription: "O equilíbrio aritmético é condição sine qua non para o fechamento dos relatórios oficiais (Balanço e DRE)."
        },
        auditTips: "Se uma conta de Ativo apresentar saldo credor inesperado (ex: Caixa negativo), investigue erros de conciliação ou lançamentos invertidos."
      }
    ]
  },

  "/dre": {
    id: "dre",
    path: "/dre",
    category: "Financial Statements",
    title: "Income Statement (P&L / DRE)",
    subtitle: "Demonstração do Resultado do Exercício com EBITDA, Margens e Lucro Líquido",
    badge: "DRE / P&L",
    summary: "Demonstra o desempenho econômico da companhia ao longo de um período, deduzindo custos e despesas das receitas brutas para apurar a rentabilidade operacional e líquida.",
    workflow: [
      { id: "gross-rev", title: "1. Receita Bruta", shortDesc: "Total de vendas e faturamento líquido", stageBadge: "Receita" },
      { id: "cogs-margin", title: "2. Custo e Margem Bruta", shortDesc: "Dedução do COGS / CMV", stageBadge: "Custos" },
      { id: "opex-ebitda", title: "3. Despesas e EBITDA", shortDesc: "Gastos gerais, administrativos e vendas", stageBadge: "Operação" },
      { id: "net-income", title: "4. Lucro Líquido Final", shortDesc: "Resultado pós juros e impostos", stageBadge: "Resultado" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Estrutura do P&L (Regime de Competência)",
        actionSummary: "Navegue pelas camadas sucessivas de resultado da empresa.",
        howToOperate: [
          "Receita Operacional Bruta (Gross Revenue) deduzida de devoluções e descontos.",
          "Menos: Custos dos Produtos Vendidos (COGS) = Lucro Bruto (Gross Profit).",
          "Menos: Despesas Operacionais (OPEX: SG&A, P&D, Marketing) = Resultado Operacional (EBIT / EBITDA).",
          "Menos: Despesas Financeiras e Provisão para Impostos (Income Tax) = Lucro Líquido (Net Income)."
        ],
        usGaapRule: {
          standard: "ASC 220 - Income Statement",
          ruleDescription: "Exige apresentação clara dos componentes das receitas e despesas ordinárias versus extraordinárias."
        },
        auditTips: "Compare o percentual de margem bruta mês a mês; oscilações drásticas sinalizam custos não apropriados adequadamente."
      }
    ]
  },

  "/balance-sheet": {
    id: "balance-sheet",
    path: "/balance-sheet",
    category: "Financial Statements",
    title: "Balance Sheet (Balanço Patrimonial)",
    subtitle: "Posição patrimonial segundo a equação fundamental: Ativos = Passivos + Patrimônio Líquido",
    badge: "Balanço",
    summary: "Fotografia estática da situação patrimonial da empresa em uma data de corte específica, demonstrando a solvência, ativos tangíveis/intangíveis e obrigações.",
    workflow: [
      { id: "assets", title: "1. Ativos (Assets)", shortDesc: "Circulante (Caixa, AR, Estoque) e Fixo", stageBadge: "Bens e Direitos" },
      { id: "liabilities", title: "2. Passivos (Liabilities)", shortDesc: "Contas a pagar, empréstimos e tributos", stageBadge: "Obrigações" },
      { id: "equity", title: "3. Patrimônio Líquido (Equity)", shortDesc: "Capital social e lucros acumulados", stageBadge: "Capital Próprio" },
      { id: "equation", title: "4. Equação Fundamental", shortDesc: "Ativos = Passivos + PL perfeitamente zerado", stageBadge: "Conformidade" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Aferição da Equação Contábil Fundamental",
        actionSummary: "Garanta que a regra de ouro do balanço esteja sempre respeitada.",
        howToOperate: [
          "Verifique a seção de Ativos Totais (Total Assets).",
          "Verifique a seção de Passivos Totais + Patrimônio Líquido (Total Liabilities & Equity).",
          "A diferença deve ser exatamente $0.00."
        ],
        usGaapRule: {
          standard: "ASC 210 - Balance Sheet",
          ruleDescription: "Exige a classificação segregada entre curto prazo (circulante: realização em até 12 meses) e longo prazo (não circulante)."
        },
        auditTips: "O lucro líquido apurado no P&L do período é transportado automaticamente para a conta de 'Retained Earnings' (Lucros Acumulados) no PL."
      }
    ]
  },

  "/cash-flow": {
    id: "cash-flow",
    path: "/cash-flow",
    category: "Financial Statements",
    title: "Cash Flow & Forecast (Fluxo de Caixa)",
    subtitle: "Demonstração dos fluxos operacionais, de investimento e de financiamento",
    badge: "Fluxo de Caixa",
    summary: "Reconcilia o lucro contábil em regime de competência com as entradas e saídas efetivas de dinheiro nas contas bancárias, permitindo projeções de solvência.",
    workflow: [
      { id: "cfo", title: "1. Atividades Operacionais (CFO)", shortDesc: "Caixa gerado pela operação do negócio", stageBadge: "Operacional" },
      { id: "cfi", title: "2. Atividades de Investimento (CFI)", shortDesc: "Compra/venda de ativos fixos e imobilizado", stageBadge: "Investimento" },
      { id: "cff", title: "3. Atividades de Financiamento (CFF)", shortDesc: "Aportes, dívidas bancárias e dividendos", stageBadge: "Financiamento" },
      { id: "net-cash", title: "4. Variação Líquida de Caixa", shortDesc: "Saldo inicial + Variação = Saldo final", stageBadge: "Liquidez" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Interpretação das 3 Seções do ASC 230",
        actionSummary: "Compreenda a origem e aplicação dos recursos da organização.",
        howToOperate: [
          "Operacional (CFO): Entradas de clientes menos pagamentos a fornecedores e salários.",
          "Investimento (CFI): Desembolsos em CAPEX (equipamentos, softwares capitalizados).",
          "Financiamento (CFF): Captação de empréstimos, repagamento de principal e distribuição de lucros."
        ],
        usGaapRule: {
          standard: "ASC 230 - Statement of Cash Flows",
          ruleDescription: "Obrigatória para reportes a investidores, bancos e CPAs; pode ser apresentada pelo método direto ou indireto."
        },
        auditTips: "Empresas com lucro contábil positivo podem quebrar por falta de fluxo de caixa operacional; monitore o CFO continuamente."
      }
    ]
  },

  "/taxes": {
    id: "taxes",
    path: "/taxes",
    category: "Financial Statements",
    title: "Sales Tax Summary (Tributos sobre Vendas nos EUA)",
    subtitle: "Apuração de impostos estaduais, locais e controle de nexos econômicos",
    badge: "Fiscal / Tributário",
    summary: "Monitore os valores de impostos retidos nas faturas por estado americano (ex: CA, NY, FL, TX), alíquotas combinadas e prazos de repasse aos órgãos estaduais.",
    workflow: [
      { id: "nexus", title: "1. Nexo Econômico", shortDesc: "Volume de vendas e transações por estado", stageBadge: "Enquadramento" },
      { id: "calculation", title: "2. Cálculo Automático", shortDesc: "Alíquota estadual + distrital na fatura", stageBadge: "Retenção" },
      { id: "liability", title: "3. Provisão de Passivo", shortDesc: "Acúmulo na conta 2150 - Sales Tax Payable", stageBadge: "Contábil" },
      { id: "remittance", title: "4. Recolhimento ao Estado", shortDesc: "Pagamento da guia e liquidação da obrigação", stageBadge: "Liquidação" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Acompanhamento de Impostos Retidos",
        actionSummary: "Consulte o total a recolher agrupado por jurisdição fiscal estadual.",
        howToOperate: [
          "Filtre o relatório pelo mês fiscal vigente.",
          "Confira o valor total faturado tributável versus isento.",
          "Verifique se o saldo da conta 2150 - Sales Tax Payable confere com o relatório deste módulo."
        ],
        usGaapRule: {
          standard: "South Dakota v. Wayfair (Economic Nexus)",
          ruleDescription: "Vendas interestaduais que ultrapassem o limite de nexo econômico de cada estado (frequentemente $100.000 ou 200 transações) obrigam o recolhimento de Sales Tax."
        },
        auditTips: "O imposto sobre vendas não é receita nem despesa da empresa; é um recurso transitório em custódia a ser repassado ao fisco estadual."
      }
    ]
  },

  "/receivables": {
    id: "receivables",
    path: "/receivables",
    category: "Financial Statements",
    title: "AR Aging Position (Envelhecimento de Contas a Receber)",
    subtitle: "Classificação de inadimplência por faixas de dias e provisão de perdas esperadas",
    badge: "Aging de Títulos",
    summary: "Classifica os títulos em aberto dos clientes em faixas temporais (Corrente, 1-30 dias, 31-60 dias, 61-90 dias, >90 dias) e calcula a provisão para perdas (CECL / ASC 326).",
    workflow: [
      { id: "aging-buckets", title: "1. Faixas de Envelhecimento", shortDesc: "Separação dos títulos por atraso", stageBadge: "Triagem" },
      { id: "risk-analysis", title: "2. Análise de Risco", shortDesc: "Identificação de clientes inadimplentes", stageBadge: "Cobrança" },
      { id: "cecl-provision", title: "3. Provisão CECL", shortDesc: "Cálculo de perda de crédito esperada", stageBadge: "Norma" },
      { id: "write-off", title: "4. Baixa de Inadimplência", shortDesc: "Write-off de créditos incobráveis", stageBadge: "Ajuste" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Operação da Régua de Cobrança por Faixa de Vencimento",
        actionSummary: "Identifique clientes com títulos acima de 60 e 90 dias para medidas de cobrança extrajudicial.",
        howToOperate: [
          "Examine a coluna '> 90 Dias' para priorizar ligações e notificações formais de cobrança.",
          "Verifique a concentração de recebíveis por cliente para evitar risco excessivo de contraparte."
        ],
        usGaapRule: {
          standard: "ASC 326 - Current Expected Credit Losses (CECL)",
          ruleDescription: "Exige que as empresas estimem perdas futuras esperadas de crédito com base em dados históricos, condições atuais e projeções razoáveis."
        },
        auditTips: "Auditorias avaliam rigorosamente se a provisão de devedores duvidosos é compatível com o histórico de perdas da empresa."
      }
    ]
  },

  "/statements": {
    id: "statements",
    path: "/statements",
    category: "Banking & Governance",
    title: "Bank Feeds & Staging (Extratos e Conciliação)",
    subtitle: "Importação de extratos OFX/CSV, correspondência de transações e conciliação bancária",
    badge: "Conciliação",
    summary: "Conecte o extrato oficial do banco com os lançamentos do sistema. Cada centavo registrado no banco deve encontrar uma contrapartida idêntica no razão contábil.",
    workflow: [
      { id: "import", title: "1. Importação de Extrato", shortDesc: "Upload de arquivo OFX/QBO/CSV bancário", stageBadge: "Importação" },
      { id: "staging", title: "2. Área de Staging", shortDesc: "Transações pendentes de conferência", stageBadge: "Triagem" },
      { id: "match", title: "3. Conciliação Automática", shortDesc: "Cruzamento com faturas e despesas", stageBadge: "Matching" },
      { id: "reconciliation", title: "4. Fechamento de Saldo", shortDesc: "Saldo do Banco = Saldo do Razão Contábil", stageBadge: "Fechamento" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Importação e Tratamento do Extrato Bancário",
        actionSummary: "Faça o upload do extrato bancário oficial fornecido pela instituição financeira.",
        howToOperate: [
          "Arraste ou selecione o arquivo OFX ou CSV do banco na área de upload.",
          "As transações carregarão na tabela de Staging aguardando correspondência.",
          "O sistema sugere automaticamente pares com faturas de clientes ou contas a pagar existentes."
        ],
        usGaapRule: {
          standard: "Bank Reconciliation Protocol",
          ruleDescription: "A conciliação bancária mensal é o controle interno primordial exigido por qualquer auditor para validar a existência física do caixa."
        },
        auditTips: "Diferenças de centavos não devem ser ignoradas; identifique tarifas bancárias ou variações de câmbio não registradas."
      }
    ]
  },

  "/audit-log": {
    id: "audit-log",
    path: "/audit-log",
    category: "Banking & Governance",
    title: "Audit Trail Log (Trilha de Auditoria SOX 404)",
    subtitle: "Registro imutável de todas as ações, edições, cancelamentos e alterações de dados",
    badge: "Compliance",
    summary: "Histórico detalhado e à prova de adulteração contendo data/hora, usuário, endereço IP, ação executada e dados anteriores vs novos para atender aos requisitos da Lei Sarbanes-Oxley (SOX).",
    workflow: [
      { id: "event-capture", title: "1. Captura de Eventos", shortDesc: "Gravação automática de cada alteração", stageBadge: "Automático" },
      { id: "user-tagging", title: "2. Identificação de Usuário", shortDesc: "Vínculo ao usuário e perfil de acesso", stageBadge: "Identificação" },
      { id: "diff-logging", title: "3. Registro Antes vs Depois", shortDesc: "Visualização do que foi alterado", stageBadge: "Rastreio" },
      { id: "cpa-review", title: "4. Inspeção do Auditor", shortDesc: "Filtros avançados para perícia contábil", stageBadge: "Auditoria" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Investigação e Rastreamento de Alterações",
        actionSummary: "Pesquise por data, tipo de operação (INSERT, UPDATE, DELETE) ou usuário.",
        howToOperate: [
          "Utilize a barra de pesquisa para localizar um número de fatura ou lote contábil.",
          "Inspecione a coluna de justificativa de auditoria em casos de desbloqueio de período ou estorno.",
          "Exporte o log em formato CSV auditável para envio ao comitê de auditoria."
        ],
        usGaapRule: {
          standard: "Sarbanes-Oxley Act (SOX Section 404)",
          ruleDescription: "Exige que os controles internos sobre os relatórios financeiros impeçam e detectem fraudes ou alterações não autorizadas em registros contábeis."
        },
        auditTips: "Os registros da trilha de auditoria são somente leitura e não podem ser apagados por nenhum usuário do sistema."
      }
    ]
  },

  "/access": {
    id: "access",
    path: "/access",
    category: "Banking & Governance",
    title: "Roles & Tenants (Permissões e Multi-Empresa)",
    subtitle: "Controle de acesso granular baseado em função (RBAC) e segregação de clientes",
    badge: "Segurança",
    summary: "Gerencie perfis de acesso (CPA, Controller, Operador Financeiro, Auditor, Portal do Cliente) e garanta o isolamento estrito de dados entre diferentes empresas contratantes.",
    workflow: [
      { id: "tenant-isolation", title: "1. Isolamento de Tenant", shortDesc: "Separação estrita de dados por empresa", stageBadge: "Isolamento" },
      { id: "role-definition", title: "2. Perfis de Função (RBAC)", shortDesc: "Definição de privilégios e alçadas", stageBadge: "Políticas" },
      { id: "segregation", title: "3. Segregação de Funções", shortDesc: "Quem cria a conta não aprova o pagamento", stageBadge: "Controle" },
      { id: "testing", title: "4. Teste de Personas", shortDesc: "Simulação de visões de usuários no sistema", stageBadge: "Validação" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Segregação de Funções (Segregation of Duties - SoD)",
        actionSummary: "Assegure que usuários operacionais não possuam privilégios de fechamento contábil.",
        howToOperate: [
          "Verifique no cabeçalho o seletor 'Switch Test Persona' para validar a experiência de cada papel.",
          "Usuários do Portal do Cliente têm acesso restrito aos relatórios de DRE e balancete da sua empresa.",
          "Apenas administradores e CPAs podem executar o fechamento definitivo de período (Lock Period)."
        ],
        usGaapRule: {
          standard: "COSO Internal Control Framework",
          ruleDescription: "A segregação adequada de funções é fundamental para mitigar riscos de conluio, pagamentos indevidos ou maquiagem de resultados."
        },
        auditTips: "Revise a cada trimestre a lista de usuários com privilégios de administrador da plataforma."
      }
    ]
  },

  "/parameters": {
    id: "parameters",
    path: "/parameters",
    category: "System Parameters",
    title: "Modules Overview (Painel Geral de Parâmetros)",
    subtitle: "Central de controle das configurações globais, tabelas básicas e cadastros do sistema",
    badge: "Parâmetros",
    summary: "Ponto de partida para parametrização do sistema, reunindo atalhos e status das tabelas de apoio: moedas, jurisdições de impostos, condições de pagamento, centros de custo, categorias e exercícios fiscais.",
    workflow: [
      { id: "overview", title: "1. Diagnóstico de Parâmetros", shortDesc: "Verificação dos cadastros essenciais", stageBadge: "Painel" },
      { id: "select", title: "2. Seleção do Cadastro", shortDesc: "Navegação para a tabela desejada", stageBadge: "Navegação" },
      { id: "maintenance", title: "3. Manutenção e CRUD", shortDesc: "Inclusão, edição e ativação de registros", stageBadge: "Operação" },
      { id: "impact", title: "4. Propagação nas Telas", shortDesc: "Uso imediato nos módulos operacionais", stageBadge: "Integração" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Utilização do Painel de Parâmetros",
        actionSummary: "Acesse rapidamente qualquer módulo de parametrização.",
        howToOperate: [
          "Selecione um dos cartões de parâmetros para configurar as regras de negócio da empresa.",
          "Parâmetros configurados aqui abastecem automaticamente os formulários de faturamento e despesas.",
          "Mantenha as tabelas básicas limpas e organizadas para facilitar o preenchimento diário."
        ],
        auditTips: "Alterações estruturais em categorias de despesas e centros de custo devem ser alinhadas previamente com a controladoria."
      }
    ]
  },

  "/parameters/currencies": {
    id: "currencies",
    path: "/parameters/currencies",
    category: "System Parameters",
    title: "Currencies & FX Rates (Câmbio e Moedas Estrangeiras)",
    subtitle: "Cotações cambiais em tempo real, moedas suportadas e apuração de ganhos/perdas cambiais",
    badge: "Câmbio",
    summary: "Gerencie as moedas operacionais do sistema, consulte cotações ao vivo integradas via API e garanta a correta conversão de demonstrações financeiras segundo a norma ASC 830.",
    workflow: [
      { id: "base-currency", title: "1. Moeda Funcional", shortDesc: "USD definida como moeda base da empresa", stageBadge: "Moeda Base" },
      { id: "live-fx", title: "2. Cotações em Tempo Real", shortDesc: "Atualização automática de taxas cambiais", stageBadge: "API Feed" },
      { id: "manual-override", title: "3. Ajuste de Taxas", shortDesc: "Definição de taxas spot ou contratuais", stageBadge: "Ajuste" },
      { id: "asc-830", title: "4. Ganho/Perda Cambial", shortDesc: "Reconhecimento de FX Gain/Loss na DRE", stageBadge: "Contábil" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Operação e Consulta de Taxas Cambiais",
        actionSummary: "Visualize as cotações em tempo real de USD, BRL, EUR, GBP e outras moedas.",
        howToOperate: [
          "Clique em 'Atualizar Cotações' para buscar os valores mais recentes do mercado financeiro.",
          "Cadastre novas moedas para transações internacionais de clientes ou fornecedores.",
          "Acompanhe o Ticker de cotações posicionado no topo direito do sistema."
        ],
        usGaapRule: {
          standard: "ASC 830 - Foreign Currency Matters",
          ruleDescription: "Transações em moeda estrangeira devem ser convertidas pela taxa spot na data da transação, e os saldos a receber/pagar reavaliados a cada encerramento de mês."
        },
        accountingImpact: {
          debit: "Exemplo: 5600 - Foreign Exchange Loss (Perda Cambial)",
          credit: "2000 - Accounts Payable (Ajuste do Passivo)",
          description: "Reconhecimento de variação cambial desfavorável no período."
        },
        auditTips: "Guarde as evidências das taxas cambiais oficiais utilizadas no último dia útil do mês fiscal."
      }
    ]
  },

  "/parameters/tax-jurisdictions": {
    id: "tax-jurisdictions",
    path: "/parameters/tax-jurisdictions",
    category: "System Parameters",
    title: "Tax Jurisdictions (Jurisdições Fiscais e Alíquotas)",
    subtitle: "Cadastro de estados e municípios para cálculo automatizado de impostos sobre vendas",
    badge: "Jurisdições Fiscais",
    summary: "Configure as jurisdições fiscais dos Estados Unidos onde a empresa possui nexo ou clientes, definindo alíquotas estaduais e distritais de Sales Tax.",
    workflow: [
      { id: "jurisdiction-add", title: "1. Cadastro da Jurisdição", shortDesc: "Estado, código e alíquota combinada", stageBadge: "Cadastro" },
      { id: "nexus-check", title: "2. Definição de Nexo", shortDesc: "Marcação de presença tributável ativa", stageBadge: "Enquadramento" },
      { id: "invoice-apply", title: "3. Aplicação na Fatura", shortDesc: "Cálculo automático nos itens de venda", stageBadge: "Operação" },
      { id: "settlement", title: "4. Reconciliação Estadual", shortDesc: "Confronto com apuração de impostos", stageBadge: "Relatório" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Manutenção de Alíquotas Tributárias",
        actionSummary: "Mantenha as alíquotas estaduais atualizadas conforme legislação vigente de cada estado.",
        howToOperate: [
          "Clique em '+ Nova Jurisdição' para adicionar estados onde a empresa iniciou operações.",
          "Informe a alíquota percentual (ex: 8.875% para NY - New York City).",
          "Ao emitir faturas para clientes desse estado, o cálculo de imposto será aplicado instantaneamente."
        ],
        auditTips: "Verifique anualmente se houve mudanças legislativas nas alíquotas distritais dos seus principais mercados."
      }
    ]
  },

  "/parameters/payment-terms": {
    id: "payment-terms",
    path: "/parameters/payment-terms",
    category: "System Parameters",
    title: "Payment Terms (Condições e Prazos de Pagamento)",
    subtitle: "Prazos de recebimento e pagamento (Net 15, Net 30, Net 60, Due on Receipt)",
    badge: "Prazos de Pagamento",
    summary: "Defina as condições padrão de faturamento de clientes e pagamentos a fornecedores. As datas de vencimento são calculadas automaticamente com base nesses parâmetros.",
    workflow: [
      { id: "term-setup", title: "1. Criação do Prazo", shortDesc: "Nome da condição e quantidade de dias", stageBadge: "Cadastro" },
      { id: "discount-rule", title: "2. Regra de Desconto", shortDesc: "Desconto por pronto pagamento (ex: 2/10 Net 30)", stageBadge: "Incentivo" },
      { id: "default-assign", title: "3. Associação Padrão", shortDesc: "Vínculo ao cadastro de clientes/fornecedores", stageBadge: "Vínculo" },
      { id: "due-calc", title: "4. Projeção de Vencimento", shortDesc: "Cálculo da data fatal nas faturas emitidas", stageBadge: "Operação" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Configuração de Prazos Comerciais",
        actionSummary: "Crie ou edite condições de faturamento utilizadas no dia a dia.",
        howToOperate: [
          "Configure prazos usuais como 'Due on Receipt' (À Vista), 'Net 30' (30 dias) e 'Net 60' (60 dias).",
          "Habilite se necessário descontos por pagamento antecipado (ex: 2% se pago em 10 dias).",
          "As faturas calcularão a data de vencimento precisa a partir da data de emissão."
        ],
        auditTips: "Prazos excessivamente longos impactam o ciclo de conversão de caixa (Cash Conversion Cycle)."
      }
    ]
  },

  "/parameters/cost-centers": {
    id: "cost-centers",
    path: "/parameters/cost-centers",
    category: "System Parameters",
    title: "Cost Centers (Centros de Custo e Divisões)",
    subtitle: "Rastreamento departamental de receitas e despesas para relatórios de controladoria",
    badge: "Centros de Custo",
    summary: "Segregue as operações financeiras por departamentos ou unidades de negócio (Engenharia, Vendas, Administrativo, Suporte) para análises de margem e controle orçamentário.",
    workflow: [
      { id: "department-tree", title: "1. Estrutura Departamental", shortDesc: "Definição de códigos e gestores", stageBadge: "Organização" },
      { id: "budget-limit", title: "2. Teto Orçamentário", shortDesc: "Limite de gastos por centro de custo", stageBadge: "Controle" },
      { id: "transaction-tag", title: "3. Marcação de Despesas", shortDesc: "Atribuição em faturas e contas", stageBadge: "Alocação" },
      { id: "performance", title: "4. Relatório por Centro", shortDesc: "Análise de despesas incorridas vs orçado", stageBadge: "Relatório" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Gestão de Centros de Custo",
        actionSummary: "Cadastre unidades orçamentárias para rateio financeiro.",
        howToOperate: [
          "Clique em '+ Novo Centro de Custo' informando o nome e o código de referência.",
          "Obrigue a seleção de centro de custo nos lançamentos operacionais de despesas.",
          "Acompanhe relatórios filtrados por departamento na DRE gerencial."
        ],
        auditTips: "Evite criar centros de custo genéricos (como 'Geral' ou 'Outros') que dificultem a identificação dos responsáveis pelos gastos."
      }
    ]
  },

  "/parameters/expense-categories": {
    id: "expense-categories",
    path: "/parameters/expense-categories",
    category: "System Parameters",
    title: "Expense Categories (Categorias de Despesas)",
    subtitle: "Padronização de tipos de gastos com amarração direta ao plano de contas",
    badge: "Categorias de Despesa",
    summary: "Facilite o preenchimento de faturas para o time operacional mapeando termos comerciais amigáveis (ex: Hospedagem AWS, Viagens, Licenças de Software) diretamente para contas contábeis da DRE.",
    workflow: [
      { id: "cat-create", title: "1. Nome Amigável", shortDesc: "Descrição acessível para o usuário leigo", stageBadge: "Cadastro" },
      { id: "gl-link", title: "2. Amarração Contábil", shortDesc: "Vínculo com a conta específica 5000+ do Razão", stageBadge: "Mapeamento" },
      { id: "tax-deductible", title: "3. Dedutibilidade Fiscal", shortDesc: "Classificação para deduções de I.R. corporativo", stageBadge: "Fiscal" },
      { id: "auto-posting", title: "4. Lançamento Automático", shortDesc: "Débito correto sem exigir conhecimento técnico", stageBadge: "Automação" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Mapeamento das Despesas Operacionais",
        actionSummary: "Vincule cada categoria operacional a uma conta do plano de contas US GAAP.",
        howToOperate: [
          "Ao cadastrar a categoria 'Software & Cloud', vincule à conta contábil '5120 - Cloud Infrastructure Expense'.",
          "Quando o assistente financeiro lançar uma conta com essa categoria, o débito contábil correto ocorrerá sem risco de erro.",
          "Classifique despesas como 100% dedutíveis ou 50% dedutíveis (ex: Meals & Entertainment sob regras do IRS)."
        ],
        auditTips: "Categorizações incorretas geram glosas fiscais perante o IRS no cálculo do imposto de renda corporativo (Form 1120)."
      }
    ]
  },

  "/parameters/fiscal-periods": {
    id: "fiscal-periods",
    path: "/parameters/fiscal-periods",
    category: "System Parameters",
    title: "Fiscal Periods (Períodos Fiscais e Fechamento)",
    subtitle: "Abertura, encerramento de exercícios e bloqueio de lançamentos contábeis",
    badge: "Fechamento Contábil",
    summary: "Gerencie o calendário contábil da empresa. O fechamento e bloqueio de período (Period Lock) assegura que nenhum lançamento pretérito seja inserido ou modificado após o parecer do CPA.",
    workflow: [
      { id: "calendar-setup", title: "1. Criação do Calendário", shortDesc: "Meses fiscais de Janeiro a Dezembro", stageBadge: "Abertura" },
      { id: "monthly-close", title: "2. Procedimento de Fechamento", shortDesc: "Ajustes, depreciação e conciliação bancária", stageBadge: "Checklist" },
      { id: "lock", title: "3. Bloqueio Formal (Period Lock)", shortDesc: "Impedimento de novos lançamentos no mês", stageBadge: "Segurança" },
      { id: "audit-reopen", title: "4. Reabertura Justificada", shortDesc: "Registro mandatório de motivo na trilha de auditoria", stageBadge: "Auditoria" },
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Procedimento de Fechamento Mensal (Month-End Close)",
        actionSummary: "Execute os passos de fechamento contábil antes de travar o mês.",
        howToOperate: [
          "1. Conclua todas as conciliações bancárias no módulo 'Bank Feeds'.",
          "2. Apure o resultado no P&L e verifique se o Balancete (Trial Balance) está perfeitamente equilibrado.",
          "3. Clique no botão de Bloqueio de Período para trancar o mês.",
          "4. Se for necessário reabrir um período já fechado, forneça a justificativa detalhada exigida pelo sistema para registro no log SOX."
        ],
        usGaapRule: {
          standard: "Subsequent Events & Financial Integrity",
          ruleDescription: "Demonstrações financeiras publicadas ou reportadas a sócios não podem sofrer alterações retroativas silenciosas."
        },
        auditTips: "O controle de bloqueio de período é um dos primeiros testes executados por auditores externos para testar o ambiente de controles da empresa."
      }
    ]
  }
};

export function getTutorialForPath(currentPath: string): ModuleTutorial {
  // Busca direta pela rota exata
  const exact = MODULE_TUTORIALS[currentPath];
  if (exact) {
    return exact;
  }

  // Busca por prefixo para sub-rotas
  const matchingKey = Object.keys(MODULE_TUTORIALS).find(
    (key) => key !== "/" && currentPath.startsWith(key)
  );

  if (matchingKey && MODULE_TUTORIALS[matchingKey]) {
    return MODULE_TUTORIALS[matchingKey]!;
  }

  // Fallback padrão: Dashboard
  return MODULE_TUTORIALS["/"]!;
}
