import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, HelpCircle } from "lucide-react";

export type ModalTone = "info" | "success" | "warning" | "error";

export interface AlertOptions {
  title?: string;
  message: React.ReactNode;
  tone?: ModalTone;
  confirmText?: string;
}

export interface ConfirmOptions {
  title?: string;
  message: React.ReactNode;
  tone?: ModalTone;
  confirmText?: string;
  cancelText?: string;
}

export interface PromptOptions {
  title?: string;
  message: React.ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

interface ModalContextType {
  showAlert: (options: AlertOptions | string) => Promise<void>;
  showConfirm: (options: ConfirmOptions | string) => Promise<boolean>;
  showPrompt: (options: PromptOptions | string) => Promise<string | null>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

type ModalState =
  | {
      type: "alert";
      title?: string;
      message: React.ReactNode;
      tone: ModalTone;
      confirmText: string;
      resolve: () => void;
    }
  | {
      type: "confirm";
      title?: string;
      message: React.ReactNode;
      tone: ModalTone;
      confirmText: string;
      cancelText: string;
      resolve: (value: boolean) => void;
    }
  | {
      type: "prompt";
      title?: string;
      message: React.ReactNode;
      defaultValue: string;
      placeholder?: string;
      confirmText: string;
      cancelText: string;
      resolve: (value: string | null) => void;
    };

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const showAlert = useCallback((options: AlertOptions | string): Promise<void> => {
    return new Promise((resolve) => {
      const opts: AlertOptions =
        typeof options === "string" ? { message: options } : options;
      setModal({
        type: "alert",
        title: opts.title || (opts.tone === "error" ? "Aviso do Sistema" : "Notificação"),
        message: opts.message,
        tone: opts.tone || "info",
        confirmText: opts.confirmText || "OK",
        resolve: () => {
          setModal(null);
          resolve();
        },
      });
    });
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise((resolve) => {
      const opts: ConfirmOptions =
        typeof options === "string" ? { message: options } : options;
      setModal({
        type: "confirm",
        title: opts.title || "Confirmar Ação",
        message: opts.message,
        tone: opts.tone || "warning",
        confirmText: opts.confirmText || "Confirmar",
        cancelText: opts.cancelText || "Cancelar",
        resolve: (val) => {
          setModal(null);
          resolve(val);
        },
      });
    });
  }, []);

  const showPrompt = useCallback((options: PromptOptions | string): Promise<string | null> => {
    return new Promise((resolve) => {
      const opts: PromptOptions =
        typeof options === "string" ? { message: options } : options;
      const initialVal = opts.defaultValue || "";
      setPromptInput(initialVal);
      setModal({
        type: "prompt",
        title: opts.title || "Entrada de Dados",
        message: opts.message,
        defaultValue: initialVal,
        placeholder: opts.placeholder || "",
        confirmText: opts.confirmText || "Confirmar",
        cancelText: opts.cancelText || "Cancelar",
        resolve: (val) => {
          setModal(null);
          resolve(val);
        },
      });
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    });
  }, []);

  const getToneIconBadge = (tone: ModalTone, isPrompt = false) => {
    if (isPrompt) {
      return (
        <div className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20 shrink-0">
          <HelpCircle className="size-5" />
        </div>
      );
    }
    switch (tone) {
      case "success":
        return (
          <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 shrink-0">
            <CheckCircle2 className="size-5" />
          </div>
        );
      case "warning":
        return (
          <div className="grid size-10 place-items-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/25 shrink-0">
            <AlertTriangle className="size-5" />
          </div>
        );
      case "error":
        return (
          <div className="grid size-10 place-items-center rounded-xl bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 shrink-0">
            <AlertCircle className="size-5" />
          </div>
        );
      case "info":
      default:
        return (
          <div className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20 shrink-0">
            <Info className="size-5" />
          </div>
        );
    }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}

      <AlertDialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open && modal) {
            if (modal.type === "confirm") modal.resolve(false);
            else if (modal.type === "prompt") modal.resolve(null);
            else modal.resolve();
            setModal(null);
          }
        }}
      >
        {modal && (
          <AlertDialogContent className="max-w-md rounded-2xl border border-line bg-white p-6 shadow-2xl shadow-black/10 ring-1 ring-black/5">
            <AlertDialogHeader className="space-y-3">
              <div className="flex items-start gap-3.5">
                {modal.type === "prompt"
                  ? getToneIconBadge("info", true)
                  : getToneIconBadge(modal.tone)}
                <div className="space-y-1.5 text-left pt-0.5">
                  <AlertDialogTitle className="text-[16px] font-semibold tracking-tight text-ink">
                    {modal.title}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-[13px] text-ink2 leading-relaxed whitespace-pre-line">
                    {modal.message}
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>

            {modal.type === "prompt" && (
              <div className="mt-4">
                <input
                  ref={inputRef}
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder={modal.placeholder}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      modal.resolve(promptInput.trim());
                    }
                  }}
                  className="w-full rounded-lg border border-line bg-canvas/80 px-3.5 py-2 text-[13px] text-ink outline-none ring-1 ring-transparent focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all shadow-inner"
                />
              </div>
            )}

            <AlertDialogFooter className="mt-6 flex flex-row items-center justify-end gap-2.5">
              {modal.type === "confirm" && (
                <AlertDialogCancel
                  onClick={() => modal.resolve(false)}
                  className="rounded-lg border border-line bg-white px-4 py-2 text-[12.5px] font-medium text-ink2 hover:bg-panel hover:text-ink transition-colors cursor-pointer shadow-2xs"
                >
                  {modal.cancelText}
                </AlertDialogCancel>
              )}
              {modal.type === "prompt" && (
                <AlertDialogCancel
                  onClick={() => modal.resolve(null)}
                  className="rounded-lg border border-line bg-white px-4 py-2 text-[12.5px] font-medium text-ink2 hover:bg-panel hover:text-ink transition-colors cursor-pointer shadow-2xs"
                >
                  {modal.cancelText}
                </AlertDialogCancel>
              )}

              {modal.type === "alert" && (
                <AlertDialogAction
                  onClick={() => modal.resolve()}
                  className="rounded-lg bg-brand px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90 transition-all shadow-xs cursor-pointer"
                >
                  {modal.confirmText}
                </AlertDialogAction>
              )}

              {modal.type === "confirm" && (
                <AlertDialogAction
                  onClick={() => modal.resolve(true)}
                  className={`rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition-all shadow-xs cursor-pointer ${
                    modal.tone === "error"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : modal.tone === "warning"
                        ? "bg-amber-600 hover:bg-amber-700"
                        : "bg-brand hover:bg-brand/90"
                  }`}
                >
                  {modal.confirmText}
                </AlertDialogAction>
              )}

              {modal.type === "prompt" && (
                <AlertDialogAction
                  onClick={() => modal.resolve(promptInput.trim())}
                  className="rounded-lg bg-brand px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90 transition-all shadow-xs cursor-pointer"
                >
                  {modal.confirmText}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
}
