import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, RefreshCw, ChevronDown, Check } from "lucide-react";

export interface CurrencyConfig {
  key: string;
  name: string;
  pairLabel: string;
  countryCode: string;
  flagEmoji: string;
  symbol: string;
}

export const SUPPORTED_CURRENCY_PAIRS: CurrencyConfig[] = [
  {
    key: "USDBRL",
    name: "Dólar Comercial",
    pairLabel: "USD / BRL",
    countryCode: "us",
    flagEmoji: "🇺🇸",
    symbol: "R$",
  },
  {
    key: "EURUSD",
    name: "Euro / Dólar",
    pairLabel: "EUR / USD",
    countryCode: "eu",
    flagEmoji: "🇪🇺",
    symbol: "$",
  },
  {
    key: "GBPUSD",
    name: "Libra / Dólar",
    pairLabel: "GBP / USD",
    countryCode: "gb",
    flagEmoji: "🇬🇧",
    symbol: "$",
  },
  {
    key: "USDJPY",
    name: "Dólar / Iene",
    pairLabel: "USD / JPY",
    countryCode: "jp",
    flagEmoji: "🇯🇵",
    symbol: "¥",
  },
  {
    key: "CADUSD",
    name: "Dólar Canadense",
    pairLabel: "CAD / USD",
    countryCode: "ca",
    flagEmoji: "🇨🇦",
    symbol: "$",
  },
  {
    key: "CHFUSD",
    name: "Franco Suíço",
    pairLabel: "CHF / USD",
    countryCode: "ch",
    flagEmoji: "🇨🇭",
    symbol: "$",
  },
  {
    key: "EURBRL",
    name: "Euro / Real",
    pairLabel: "EUR / BRL",
    countryCode: "eu",
    flagEmoji: "🇪🇺",
    symbol: "R$",
  },
  {
    key: "GBPBRL",
    name: "Libra / Real",
    pairLabel: "GBP / BRL",
    countryCode: "gb",
    flagEmoji: "🇬🇧",
    symbol: "R$",
  },
  {
    key: "BTCUSD",
    name: "Bitcoin / USD",
    pairLabel: "BTC / USD",
    countryCode: "us",
    flagEmoji: "₿",
    symbol: "$",
  },
];

interface AwesomeApiResponseItem {
  code: string;
  codein: string;
  name: string;
  high: string;
  low: string;
  varBid: string;
  pctChange: string;
  bid: string;
  ask: string;
  timestamp: string;
  create_date: string;
}

interface CurrencyRateTickerProps {
  baseCurrency?: string;
}

export function CurrencyRateTicker({ baseCurrency = "USD" }: CurrencyRateTickerProps) {
  const [rates, setRates] = useState<Record<string, AwesomeApiResponseItem>>({});
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    try {
      return localStorage.getItem("preferred_fx_pair") || "USDBRL";
    } catch {
      return "USDBRL";
    }
  });
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchRates = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const pairsQuery = "USD-BRL,EUR-USD,GBP-USD,USD-JPY,CAD-USD,CHF-USD,EUR-BRL,GBP-BRL,BTC-USD";
      const res = await fetch(`https://economia.awesomeapi.com.br/last/${pairsQuery}`);
      if (!res.ok) throw new Error("Falha ao consultar API de câmbio");
      const data = await res.json();
      setRates(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.warn("Erro ao buscar variações cambiais públicas:", err);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    // Atualização a cada 2 minutos
    const interval = setInterval(fetchRates, 120000);
    return () => clearInterval(interval);
  }, []);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectPair = (key: string) => {
    setSelectedKey(key);
    try {
      localStorage.setItem("preferred_fx_pair", key);
    } catch {
      // ignore
    }
    setIsOpen(false);
  };

  const selectedConfig =
    SUPPORTED_CURRENCY_PAIRS.find((c) => c.key === selectedKey) || SUPPORTED_CURRENCY_PAIRS[0];
  const currentRate = rates[selectedConfig.key];

  // Helper para formatar valor numérico
  const formatRateValue = (valStr?: string, symbol = "") => {
    if (!valStr) return "--";
    const num = parseFloat(valStr);
    if (isNaN(num)) return "--";
    if (num >= 1000) {
      return `${symbol} ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${symbol} ${num.toLocaleString("pt-BR", { minimumFractionDigits: num < 1 ? 4 : 2, maximumFractionDigits: 4 })}`;
  };

  // Helper de variação percentual
  const getVariationData = (rateItem?: AwesomeApiResponseItem) => {
    if (!rateItem) return { pct: 0, isUp: false, isDown: false, formattedPct: "0.00%", text: "Estável" };
    const pct = parseFloat(rateItem.pctChange);
    const isUp = pct > 0;
    const isDown = pct < 0;
    const formattedPct = `${isUp ? "+" : ""}${pct.toFixed(2)}%`;
    const text = isUp ? "Alta" : isDown ? "Queda" : "Estável";
    return { pct, isUp, isDown, formattedPct, text };
  };

  const currentVar = getVariationData(currentRate);

  return (
    <div className="relative" ref={containerRef}>
      {/* Botão Gatilho no Header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Clique para selecionar e visualizar variações cambiais de hoje"
        className="flex items-center gap-2 rounded-lg bg-white/80 px-2.5 py-1.5 text-left ring-1 ring-line hover:bg-white transition-all shadow-2xs group"
      >
        {/* Identificador Base */}
        <div className="hidden sm:flex items-center gap-1 border-r border-line/70 pr-2 mr-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink3">Base:</span>
          <span className="font-mono text-[11px] font-bold text-ink">{baseCurrency}</span>
        </div>

        {/* Bandeira */}
        <div className="relative flex items-center shrink-0">
          <img
            src={`https://flagcdn.com/w40/${selectedConfig.countryCode}.png`}
            alt={selectedConfig.name}
            className="h-3.5 w-5 rounded-[2px] object-cover ring-1 ring-black/10 shadow-2xs"
            onError={(e) => {
              // Fallback se a imagem falhar
              (e.currentTarget as HTMLElement).style.display = "none";
              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = "inline";
            }}
          />
          <span className="hidden text-xs leading-none" style={{ display: "none" }}>
            {selectedConfig.flagEmoji}
          </span>
        </div>

        {/* Moeda & Cotação */}
        <div className="leading-tight flex flex-col items-start">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-ink tracking-tight">
              {selectedConfig.pairLabel}
            </span>
            <span className="font-mono text-[11.5px] font-semibold text-ink2">
              {isLoading && !currentRate
                ? "..."
                : formatRateValue(currentRate?.bid, selectedConfig.symbol)}
            </span>
          </div>

          {/* Variação em Alta ou Queda */}
          <div className="flex items-center gap-1 mt-0.5">
            {currentVar.isUp ? (
              <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9.5px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="size-2.5 stroke-[2.5]" />
                {currentVar.formattedPct} Alta
              </span>
            ) : currentVar.isDown ? (
              <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9.5px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <TrendingDown className="size-2.5 stroke-[2.5]" />
                {currentVar.formattedPct} Queda
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9.5px] font-medium bg-ink/5 text-ink3">
                {currentVar.formattedPct} Estável
              </span>
            )}
          </div>
        </div>

        {/* Chevron Dropdown */}
        <ChevronDown
          className={`size-3.5 text-ink3 ml-1 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-brand" : "group-hover:text-ink"
          }`}
        />
      </button>

      {/* Popover Dropdown de Variações Cambiais */}
      {isOpen && (
        <div className="absolute right-0 top-12 w-80 sm:w-96 rounded-xl bg-white p-2.5 shadow-xl ring-1 ring-line z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Cabeçalho do Dropdown */}
          <div className="flex items-center justify-between border-b border-line/60 pb-2 px-1">
            <div>
              <p className="text-[12px] font-semibold text-ink">Variações Cambiais de Hoje</p>
              <p className="text-[10px] text-ink3">
                {lastUpdated
                  ? `Atualizado às ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : "Consultando cotações públicas..."}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fetchRates();
              }}
              disabled={isLoading}
              title="Atualizar cotações agora"
              className="flex items-center gap-1 rounded-md p-1.5 text-ink3 hover:text-ink hover:bg-ink/5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin text-brand" : ""}`} />
            </button>
          </div>

          {/* Contexto da Moeda Base */}
          <div className="mt-2 mb-1.5 flex items-center justify-between rounded-lg bg-ink/[0.03] px-2.5 py-1.5 text-[11px] border border-line/50">
            <span className="text-ink3">Moeda Base do Tenant:</span>
            <span className="font-semibold text-ink flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-brand" />
              {baseCurrency} (US Dollar)
            </span>
          </div>

          <p className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink3">
            Selecione a moeda para fixar no cabeçalho
          </p>

          {/* Lista de Moedas e Cotações */}
          <div className="max-h-72 overflow-y-auto space-y-1 [scrollbar-width:thin] pr-0.5">
            {SUPPORTED_CURRENCY_PAIRS.map((pair) => {
              const rateData = rates[pair.key];
              const isSelected = pair.key === selectedKey;
              const { isUp, isDown, formattedPct, text } = getVariationData(rateData);

              return (
                <button
                  key={pair.key}
                  type="button"
                  onClick={() => handleSelectPair(pair.key)}
                  className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-[11.5px] transition-colors ${
                    isSelected
                      ? "bg-brand/10 ring-1 ring-brand/30 font-medium"
                      : "hover:bg-panel hover:ring-1 hover:ring-line/60"
                  }`}
                >
                  {/* Lado Esquerdo: Bandeira + Nome */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={`https://flagcdn.com/w40/${pair.countryCode}.png`}
                      alt={pair.name}
                      className="h-3.5 w-5 rounded-[2px] object-cover ring-1 ring-black/10 shadow-2xs shrink-0"
                    />
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-ink">{pair.pairLabel}</span>
                        {isSelected && <Check className="size-3 text-brand stroke-[2.5]" />}
                      </div>
                      <p className="text-[10px] text-ink3 truncate">{pair.name}</p>
                    </div>
                  </div>

                  {/* Lado Direito: Cotação + Variação Alta/Queda */}
                  <div className="text-right shrink-0">
                    <p className="font-mono text-[11.5px] font-semibold text-ink">
                      {rateData ? formatRateValue(rateData.bid, pair.symbol) : "..."}
                    </p>
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      {isUp ? (
                        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <TrendingUp className="size-2.5 stroke-[2.5]" />
                          {formattedPct} Alta
                        </span>
                      ) : isDown ? (
                        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                          <TrendingDown className="size-2.5 stroke-[2.5]" />
                          {formattedPct} Queda
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-medium bg-ink/5 text-ink3">
                          {formattedPct} {text}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Rodapé informativo */}
          <div className="mt-2 border-t border-line/50 pt-2 px-1 flex items-center justify-between text-[9.5px] text-ink3">
            <span>Fonte: API Pública (AwesomeAPI / BCB)</span>
            {hasError && <span className="text-rose-500 font-medium">Reconectando...</span>}
            {!hasError && <span>Atualização contínua</span>}
          </div>
        </div>
      )}
    </div>
  );
}
