"use client";

// Custom popup system replacing native alert() / confirm() / prompt().
// App-styled via Dialog + promise-based API:
//   await alertApp("Message")                     → OK
//   const ok = await confirmApp("Message")        → true / false
//   const v = await promptApp("Message", "def")   → string | null

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TriangleAlert, CircleHelp } from "lucide-react";

type PopupKind = "alert" | "confirm" | "destructive" | "prompt";

interface PopupRequest {
  kind: PopupKind;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: unknown) => void;
}

interface AppPopupContextValue {
  alertApp: (message: string, title?: string) => Promise<void>;
  confirmApp: (
    message: string,
    options?: { title?: string; destructive?: boolean; confirmLabel?: string; cancelLabel?: string }
  ) => Promise<boolean>;
  promptApp: (
    message: string,
    options?: { title?: string; placeholder?: string; defaultValue?: string }
  ) => Promise<string | null>;
}

const AppPopupContext = createContext<AppPopupContextValue | null>(null);

export function AppPopupProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PopupRequest | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((value: unknown) => void) | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(
    (value: unknown) => {
      setOpen(false);
      resolveRef.current?.(value);
      resolveRef.current = null;
      // Clear the request after the close animation — but cancel this timer
      // if a new popup is opened in the meantime (alert right after confirm).
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        clearTimerRef.current = null;
        setRequest((current) => {
          // Only clear if no new popup took over.
          return current && current.resolve === null ? current : null;
        });
      }, 150);
    },
    []
  );

  // Opening a new popup always cancels any pending clear timer.
  const openPopup = useCallback((req: PopupRequest) => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    setRequest(req);
    setOpen(true);
  }, []);

  const alertApp = useCallback(
    (message: string, title?: string) =>
      new Promise<void>((resolve) => {
        resolveRef.current = resolve as (value: unknown) => void;
        openPopup({ kind: "alert", title: title || "Information", message, resolve: resolve as never });
      }),
    [openPopup]
  );

  const confirmApp = useCallback(
    (
      message: string,
      options?: {
        title?: string;
        destructive?: boolean;
        confirmLabel?: string;
        cancelLabel?: string;
      }
    ) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve as (value: unknown) => void;
        openPopup({
          kind: options?.destructive ? "destructive" : "confirm",
          title: options?.title || "Confirmation",
          message,
          confirmLabel: options?.confirmLabel,
          cancelLabel: options?.cancelLabel,
          resolve: resolve as never,
        });
      }),
    [openPopup]
  );

  const promptApp = useCallback(
    (
      message: string,
      options?: { title?: string; placeholder?: string; defaultValue?: string }
    ) =>
      new Promise<string | null>((resolve) => {
        resolveRef.current = resolve as (value: unknown) => void;
        setInputValue(options?.defaultValue || "");
        openPopup({
          kind: "prompt",
          title: options?.title || "Saisie",
          message,
          placeholder: options?.placeholder,
          defaultValue: options?.defaultValue,
          resolve: resolve as never,
        });
      }),
    [openPopup]
  );

  const isDestructive = request?.kind === "destructive";
  const isPrompt = request?.kind === "prompt";

  return (
    <AppPopupContext.Provider value={{ alertApp, confirmApp, promptApp }}>
      {children}
      <Dialog open={open} onOpenChange={(o) => !o && close(isPrompt ? null : false)}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader className="items-start text-left">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border ${
                  isDestructive
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-primary/30 bg-primary/10 text-primary"
                }`}
              >
                {isDestructive ? (
                  <TriangleAlert className="h-5 w-5" />
                ) : (
                  <CircleHelp className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <DialogTitle className="font-display text-lg font-bold tracking-tight">
                  {request?.title}
                </DialogTitle>
                {request?.message && (
                  <DialogDescription className="mt-1.5 max-h-[55vh] overflow-y-auto break-all text-sm leading-relaxed whitespace-pre-line">
                    {request.message}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>

          {isPrompt && (
            <Input
              autoFocus
              value={inputValue}
              placeholder={request?.placeholder}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") close(inputValue);
              }}
              className="mt-2"
            />
          )}

          <DialogFooter className="mt-2 gap-2">
            {request?.kind !== "alert" && (
              <Button variant="outline" onClick={() => close(isPrompt ? null : false)}>
                {request?.cancelLabel || "Annuler"}
              </Button>
            )}
            <Button
              variant={isDestructive ? "destructive" : "default"}
              onClick={() => close(isPrompt ? inputValue : true)}
            >
              {request?.confirmLabel ||
                (request?.kind === "alert" ? "OK" : isDestructive ? "Supprimer" : "Confirmer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPopupContext.Provider>
  );
}

export function useAppPopup(): AppPopupContextValue {
  const context = useContext(AppPopupContext);
  if (!context) throw new Error("useAppPopup must be used inside AppPopupProvider");
  return context;
}
