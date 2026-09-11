import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  HelpCircle,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Scale,
  ExternalLink,
  BookOpen,
  Layers,
  ChevronRight,
} from "lucide-react";
import {
  MODULE_TUTORIALS,
  getTutorialForPath,
  type ModuleTutorial,
  type TutorialDetailStep,
} from "@/lib/module-tutorials-data";
import { Link } from "@tanstack/react-router";

interface ModuleTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  autoOpenOnNavigate?: boolean;
  onToggleAutoOpen?: (enabled: boolean) => void;
}

export function ModuleTutorialModal({
  isOpen,
  onClose,
  currentPath,
  autoOpenOnNavigate = true,
  onToggleAutoOpen,
}: ModuleTutorialModalProps) {
  const [selectedTutorialKey, setSelectedTutorialKey] = useState<string>(currentPath);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  // Sincroniza o tutorial com a rota atual quando o modal abre
  useEffect(() => {
    if (isOpen) {
      const initialTutorial = getTutorialForPath(currentPath);
      setSelectedTutorialKey(initialTutorial.path);
      setActiveStepIndex(0);
    }
  }, [isOpen, currentPath]);

  const tutorial: ModuleTutorial =
    MODULE_TUTORIALS[selectedTutorialKey] || getTutorialForPath(selectedTutorialKey);

  const totalSteps = tutorial.steps.length;
  const fallbackStep: TutorialDetailStep = {
    stepNumber: 1,
    title: tutorial.title,
    actionSummary: tutorial.summary,
    howToOperate: ["Explore os recursos disponíveis nesta tela."],
    auditTips: "Mantenha registros consistentes para conformidade.",
  };
  const currentStep = tutorial.steps[activeStepIndex] ?? tutorial.steps[0] ?? fallbackStep;

  // Navegação por teclado com setas
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        setActiveStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
      } else if (e.key === "ArrowLeft") {
        setActiveStepIndex((prev) => Math.max(prev - 1, 0));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, totalSteps]);

  // Agrupamento de módulos para o seletor
  const groupedModules = Object.values(MODULE_TUTORIALS).reduce<Record<string, ModuleTutorial[]>>(
    (acc, mod) => {
      const list = acc[mod.category] ?? [];
      list.push(mod);
      acc[mod.category] = list;
      return acc;
    },
    {}
  );

  const handleNext = () => {
    if (activeStepIndex < totalSteps - 1) {
      setActiveStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (activeStepIndex > 0) {
      setActiveStepIndex((prev) => prev - 1);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0 bg-white/98 text-ink border-line/90 shadow-2xl backdrop-blur-md sm:rounded-2xl">
        {/* Cabeçalho do Modal */}
        <DialogHeader className="p-5 pb-4 border-b border-line/60 bg-gradient-to-b from-brand/5 to-transparent shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand/10 text-brand">
                  <BookOpen className="size-3" />
                  Tutorial do Módulo · {tutorial.category}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-ink/[0.04] text-ink2">
                  {tutorial.badge}
                </span>
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
                {tutorial.title}
              </DialogTitle>
              <p className="text-[12.5px] text-ink2 mt-0.5">{tutorial.subtitle}</p>
            </div>

            {/* Seletor rápido de módulo */}
            <div className="flex items-center gap-1.5 self-start sm:self-center">
              <label htmlFor="module-selector" className="text-[11px] font-medium text-ink3">
                Módulo:
              </label>
              <select
                id="module-selector"
                value={tutorial.path}
                onChange={(e) => {
                  setSelectedTutorialKey(e.target.value);
                  setActiveStepIndex(0);
                }}
                className="text-[12px] bg-white border border-line rounded-lg px-2.5 py-1.5 font-medium text-ink shadow-2xs focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer hover:border-brand/50 transition-colors max-w-[210px]"
              >
                {Object.entries(groupedModules).map(([category, modules]) => (
                  <optgroup key={category} label={category}>
                    {modules.map((m) => (
                      <option key={m.path} value={m.path}>
                        {m.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        </DialogHeader>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 [scrollbar-width:thin]">
          {/* Resumo do Módulo */}
          <div className="rounded-xl border border-brand/20 bg-brand/[0.02] p-4 text-[13px] text-ink leading-relaxed">
            <p className="font-semibold text-brand mb-1 flex items-center gap-1.5 text-[12px]">
              <Sparkles className="size-3.5" />
              Visão Geral do Funcionamento
            </p>
            {tutorial.summary}
          </div>

          {/* Diagrama de Fluxo com Setas Conectoras (Workflow Pipeline) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold uppercase tracking-wider text-ink3 flex items-center gap-1.5">
                <Layers className="size-3.5 text-brand" />
                Fluxo Contábil & Operacional em Setas
              </span>
              <span className="text-[11px] text-ink3 italic">
                Clique nas etapas para explorar
              </span>
            </div>

            <div className="relative overflow-x-auto pb-2 [scrollbar-width:none]">
              <div className="flex items-center gap-2 min-w-[620px]">
                {tutorial.workflow.map((wStep, idx) => {
                  const isCurrent = idx === activeStepIndex;
                  const isCompleted = idx < activeStepIndex;

                  return (
                    <React.Fragment key={wStep.id}>
                      {/* Caixa de Etapa */}
                      <button
                        type="button"
                        onClick={() => setActiveStepIndex(Math.min(idx, totalSteps - 1))}
                        className={`flex-1 min-w-[130px] text-left p-3 rounded-xl border transition-all cursor-pointer relative group ${
                          isCurrent
                            ? "bg-brand/10 border-brand ring-2 ring-brand/20 shadow-sm"
                            : isCompleted
                            ? "bg-up/5 border-up/30 hover:border-up/60"
                            : "bg-ink/[0.02] border-line hover:border-line/80 hover:bg-ink/[0.04]"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              isCurrent
                                ? "bg-brand text-white"
                                : isCompleted
                                ? "bg-up/15 text-up font-bold"
                                : "bg-ink/10 text-ink3"
                            }`}
                          >
                            {wStep.stageBadge}
                          </span>
                          {isCompleted && <CheckCircle2 className="size-3.5 text-up" />}
                        </div>
                        <p
                          className={`text-[12px] font-bold leading-tight ${
                            isCurrent ? "text-brand" : "text-ink"
                          }`}
                        >
                          {wStep.title}
                        </p>
                        <p className="text-[10.5px] text-ink3 mt-1 leading-snug line-clamp-2">
                          {wStep.shortDesc}
                        </p>
                      </button>

                      {/* Seta Conectora com Estilo Moderno */}
                      {idx < tutorial.workflow.length - 1 && (
                        <div className="shrink-0 flex items-center justify-center px-0.5 text-brand/60">
                          <div className="flex items-center gap-0.5">
                            <span className="w-2.5 h-[2px] bg-gradient-to-r from-brand/20 to-brand/80 rounded-full" />
                            <ChevronRight className="size-4 text-brand" />
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Área de Detalhamento da Etapa com Navegação de Setas */}
          <div className="rounded-2xl border border-line bg-canvas/30 p-5 space-y-4">
            {/* Cabeçalho da Etapa com Indicador e Setas */}
            <div className="flex items-center justify-between border-b border-line/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-brand text-white font-mono text-xs font-bold shadow-2xs">
                  {currentStep.stepNumber}
                </span>
                <div>
                  <span className="text-[10.5px] uppercase tracking-wider font-semibold text-brand">
                    Etapa {activeStepIndex + 1} de {totalSteps}
                  </span>
                  <h3 className="text-[15px] font-bold text-ink leading-tight">
                    {currentStep.title}
                  </h3>
                </div>
              </div>

              {/* Botões direcionais com setas rápidas */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={activeStepIndex === 0}
                  className="p-1.5 rounded-lg border border-line bg-white text-ink hover:bg-panel disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs"
                  title="Etapa anterior (Seta esquerda)"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <div className="text-[11.5px] font-mono text-ink2 px-1">
                  {activeStepIndex + 1} / {totalSteps}
                </div>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={activeStepIndex === totalSteps - 1}
                  className="p-1.5 rounded-lg border border-line bg-white text-ink hover:bg-panel disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs"
                  title="Próxima etapa (Seta direita)"
                >
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>

            {/* Resumo da Ação da Etapa */}
            <div className="text-[13px] text-ink leading-relaxed font-medium">
              {currentStep.actionSummary}
            </div>

            {/* Passo a Passo Prático na Tela */}
            <div className="rounded-xl bg-white p-4 border border-line/80 shadow-2xs space-y-2">
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-ink2 flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-brand" />
                Como Operar na Tela (Passo a Passo)
              </p>
              <ul className="space-y-2 mt-2">
                {currentStep.howToOperate.map((instruction, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-ink leading-snug">
                    <span className="flex items-center justify-center size-4 rounded-full bg-brand/10 text-brand text-[10px] font-bold shrink-0 mt-0.5">
                      →
                    </span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Impacto Contábil e Regra US GAAP */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Box US GAAP */}
              {currentStep.usGaapRule ? (
                <div className="rounded-xl border border-brand/20 bg-brand/[0.015] p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-brand text-[11px] font-bold uppercase tracking-wider">
                    <Scale className="size-3.5" />
                    {currentStep.usGaapRule.standard}
                  </div>
                  <p className="text-[12px] text-ink leading-relaxed">
                    {currentStep.usGaapRule.ruleDescription}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-white/80 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-ink2 text-[11px] font-bold uppercase tracking-wider">
                    <Scale className="size-3.5" />
                    Regra US GAAP Aplicada
                  </div>
                  <p className="text-[12px] text-ink3 leading-relaxed">
                    Operação padronizada em conformidade com as diretrizes do FASB e práticas contábeis norte-americanas.
                  </p>
                </div>
              )}

              {/* Box Débito & Crédito */}
              {currentStep.accountingImpact ? (
                <div className="rounded-xl border border-line bg-white p-3.5 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-ink text-[11px] font-bold uppercase tracking-wider">
                    <span className="size-2 rounded-full bg-up" />
                    Lançamento Contábil no Razão
                  </div>
                  <div className="font-mono text-[11px] space-y-1 bg-ink/[0.02] p-2 rounded border border-line/60">
                    <p className="text-up font-semibold">
                      DR: {currentStep.accountingImpact.debit}
                    </p>
                    <p className="text-brand font-semibold">
                      CR: {currentStep.accountingImpact.credit}
                    </p>
                  </div>
                  <p className="text-[10.5px] text-ink3">
                    {currentStep.accountingImpact.description}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-line/60 bg-white/60 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-ink2 text-[11px] font-bold uppercase tracking-wider">
                    <ShieldCheck className="size-3.5 text-brand" />
                    Controle Interno & Registro
                  </div>
                  <p className="text-[12px] text-ink3 leading-relaxed">
                    Todas as ações são registradas com timestamp e identificação de usuário no Audit Trail Log (SOX 404).
                  </p>
                </div>
              )}
            </div>

            {/* Dica de Auditoria e Conformidade */}
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-[12px] text-amber-950">
              <ShieldCheck className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-800 mr-1">Recomendação de Auditoria:</span>
                {currentStep.auditTips}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com Navegação em Setas e Ações */}
        <div className="p-4 border-t border-line/70 bg-panel/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-ink3">Navegue pelas setas:</span>
              {tutorial.steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveStepIndex(i)}
                  className={`size-2 rounded-full transition-all cursor-pointer ${
                    i === activeStepIndex
                      ? "bg-brand w-5"
                      : "bg-line hover:bg-ink3"
                  }`}
                  title={`Ir para etapa ${i + 1}`}
                />
              ))}
            </div>

            {onToggleAutoOpen && (
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-ink2 hover:text-ink select-none border-l border-line/70 pl-3">
                <input
                  type="checkbox"
                  checked={autoOpenOnNavigate}
                  onChange={(e) => onToggleAutoOpen(e.target.checked)}
                  className="rounded border-line text-brand focus:ring-brand size-3.5 cursor-pointer accent-brand"
                />
                <span>Abrir tutorial ao navegar pelos menus</span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Botão Anterior */}
            <button
              type="button"
              onClick={handlePrev}
              disabled={activeStepIndex === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-white text-[12.5px] font-medium text-ink hover:bg-panel disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs"
            >
              <ArrowLeft className="size-3.5" />
              Anterior
            </button>

            {/* Botão Próximo ou Ir para Tela */}
            {activeStepIndex < totalSteps - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand text-white text-[12.5px] font-semibold hover:bg-brand/90 transition-colors shadow-2xs"
              >
                Próxima Etapa
                <ArrowRight className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-up text-white text-[12.5px] font-semibold hover:bg-up/90 transition-colors shadow-2xs"
              >
                <CheckCircle2 className="size-3.5" />
                Concluir Tutorial
              </button>
            )}

            {/* Botão para navegar até o módulo caso não esteja nele */}
            {tutorial.path !== currentPath && (
              <Link
                to={tutorial.path}
                onClick={onClose}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/5 text-[12px] font-semibold text-brand hover:bg-brand/10 transition-colors"
              >
                Ir para a tela
                <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
