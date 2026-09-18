"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/language-provider";
import { StatusStamp } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FolderOpen,
  FolderUp,
  FilePlus2,
  Download,
  Trash2,
  MessageCircle,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  History,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DossierResponse {
  dossier: {
    pdf_link: string | null;
    status: string;
    source_type: "ajout" | "creation" | null;
    source_demande_id: string | null;
    source_ref_number: string | null;
  };
  creation_price: number;
  add_price: number;
  whatsapp_url: string;
  demandes_add: {
    _id: string;
    ref_number: string;
    status: string;
    message_on_failed: string | null;
    createdAt: string;
    confirmed_at: string | null;
    cancelled_by: "user" | "admin" | null;
    cancelled_at: string | null;
    price: number;
  }[];
  demandes_create: {
    _id: string;
    ref_number: string;
    status: string;
    price: number;
    traduction_price: number;
    dossier_ready_at: string | null;
    completed_at: string | null;
    createdAt: string;
    payed_at: string | null;
    cancelled_by: "user" | "admin" | null;
    cancelled_at: string | null;
    dossier_pdf_link: string | null;
  }[];
  deletion_history: {
    _id: string;
    deleted_at: string;
    source_type: "ajout" | "creation" | null;
    source_ref_number: string | null;
    dossier_pdf_link: string | null;
  }[];
}

function getStatusLabel(t: (key: string) => string, d: { status: string; cancelled_by?: "user" | "admin" | null }) {
  switch (d.status) {
    case "en_attente":
      return t("dossier.statusAwaitingPayment");
    case "en_cours_de_revision":
      return t("dossier.statusUnderReview");
    case "confirmed":
      return t("dossier.statusConfirmed");
    case "rejected":
      return t("dossier.statusRejected");
    case "cancelled":
      return d.cancelled_by === "admin" ? t("dossier.statusCancelledByAdmin") : t("dossier.statusCancelledByUser");
    case "payed":
      return t("dossier.statusPaidAwaitingCreation");
    case "in_creation":
      return t("dossier.statusPaidInCreation");
    case "completed":
      return t("dossier.statusCompleted");
    default:
      return t(`statuses.${d.status}`);
  }
}

function getStatusVariant(d: { status: string; cancelled_by?: "user" | "admin" | null }): "green" | "blue" | "ink" | "red" | "gold" {
  switch (d.status) {
    case "confirmed":
    case "completed":
      return "green";
    case "en_attente":
    case "payed":
    case "in_creation":
      return "blue";
    case "en_cours_de_revision":
      return "ink";
    case "rejected":
    case "cancelled":
      return "red";
    default:
      return "ink";
  }
}

function getPriceLabel(t: (key: string) => string, d: { status: string; price: number; traduction_price: number }) {
  const total = d.price + (d.traduction_price || 0);
  if (d.status === "en_attente") {
    return `${total} $ ${t("dossier.priceToPay")}`;
  }
  return `${total} $ ${t("dossier.pricePaid")}`;
}

function getAddPriceLabel(t: (key: string) => string, d: { status: string; price: number }) {
  if (d.status === "en_attente" || d.status === "en_cours_de_revision") {
    return `${d.price} $ ${t("dossier.priceToPay")}`;
  }
  return `${d.price} $ ${t("dossier.pricePaid")}`;
}

export default function DossierPage() {
  const { t } = useI18n();
  const { confirmApp, alertApp } = useAppPopup();
  const { toast } = useToast();

  const [data, setData] = useState<DossierResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(() => {
    apiFetch<DossierResponse>("/api/dossier")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    const ok = await confirmApp(t("dossier.deleteDossierConfirmMessage"), {
      title: t("dossier.deleteDossierConfirmTitle"),
      destructive: true,
      confirmLabel: t("dossier.deleteDossier"),
    });
    if (!ok) return;
    try {
      await apiFetch("/api/dossier", { method: "DELETE" });
      toast({ title: t("common.deletedSuccess") });
      load();
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  if (loading) {
    return <div className="h-40 animate-pulse rounded-sm bg-muted" />;
  }
  if (!data) return null;

  const hasDossier = Boolean(data.dossier.pdf_link);
  const activeAdd = data.demandes_add.find((d) => d.status === "en_attente" || d.status === "en_cours_de_revision");
  const activeCreate = data.demandes_create.find((d) => d.status === "en_attente" || d.status === "payed" || d.status === "in_creation");

  // Determine active request for the top bar
  const activeRequest = activeCreate || activeAdd;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Vertrag.ma — {t("dossier.title")}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("dossier.title")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("dossier.subtitle")}</p>
      </div>

      {/* ── Active request bar ────────────────────────────────────────────── */}
      {activeRequest && (
        <div className="form-sheet flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-[#1e4475]/30 bg-[#1e4475]/5 p-4">
          <div className="flex items-center gap-3">
            {activeCreate ? (
              <FilePlus2 className="h-5 w-5 shrink-0 text-[#1e4475]" />
            ) : (
              <FolderUp className="h-5 w-5 shrink-0 text-[#1e4475]" />
            )}
            <div>
              <p className="text-sm font-medium">
                {t("dossier.activeRequestBar")} <span className="aktenzeichen">({activeRequest.ref_number})</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {getStatusLabel(t, activeRequest)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {activeCreate && activeCreate.status === "en_attente" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const ok = await confirmApp(t("demandes.cancelConfirmMessage"), {
                      title: t("demandes.cancelConfirmTitle"),
                      destructive: true,
                      confirmLabel: t("demandes.cancel"),
                    });
                    if (!ok) return;
                    try {
                      await apiFetch(`/api/dossier/demandes-creation/${activeCreate._id}/cancel`, {
                        method: "POST",
                      });
                      toast({ title: t("common.operationSuccess") });
                      load();
                    } catch (err) {
                      await alertApp(err instanceof Error ? err.message : "Erreur");
                    }
                  }}
                >
                  {t("demandes.cancel")}
                </Button>
                <Button asChild size="sm">
                  <a href={data.whatsapp_url} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-1.5 h-4 w-4" />
                    {t("common.whatsapp")}
                  </a>
                </Button>
              </>
            )}
            {activeAdd && activeAdd.status === "en_attente" && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const ok = await confirmApp(t("demandes.cancelConfirmMessage"), {
                    title: t("demandes.cancelConfirmTitle"),
                    destructive: true,
                    confirmLabel: t("demandes.cancel"),
                  });
                  if (!ok) return;
                  try {
                    await apiFetch(`/api/dossier/demandes-ajout/${activeAdd._id}/cancel`, {
                      method: "POST",
                    });
                    toast({ title: t("common.operationSuccess") });
                    load();
                  } catch (err) {
                    await alertApp(err instanceof Error ? err.message : "Erreur");
                  }
                }}
              >
                {t("demandes.cancel")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Current dossier state ───────────────────────────────────────── */}
      <div
        className={cn(
          "form-sheet p-6",
          hasDossier ? "border-[#2f6b4a]/40" : "border-[#d9a441]/50 bg-[#d9a441]/5"
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border-2",
                hasDossier
                  ? "border-[#2f6b4a]/50 bg-[#2f6b4a]/10 text-[#2f6b4a]"
                  : "border-[#d9a441]/50 bg-[#d9a441]/10 text-[#8a6a1f]"
              )}
            >
              {hasDossier ? <CheckCircle2 className="h-6 w-6" /> : <FolderOpen className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-bold">
                  {hasDossier ? t("dossier.statusActive") : t("dossier.statusMissing")}
                </h2>
                <StatusStamp
                  status={hasDossier ? "active" : "en_attente"}
                  label={hasDossier ? t("statuses.active") : t("statuses.en_attente")}
                />
              </div>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {hasDossier
                  ? t("dossier.statusActiveDesc")
                  : activeAdd
                    ? t("dossier.statusAwaitingReview")
                    : activeCreate
                      ? getStatusLabel(t, activeCreate)
                      : t("dossier.statusMissingDesc")}
              </p>
              {hasDossier && data.dossier.source_type && (
                <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
                  {t("dossier.sourceAdd") === "Ajout" ? <FolderUp className="h-3 w-3" /> : <FilePlus2 className="h-3 w-3" />}
                  {t(data.dossier.source_type === "ajout" ? "dossier.sourceAdd" : "dossier.sourceCreation")} : {data.dossier.source_ref_number}
                </p>
              )}
            </div>
          </div>
          {hasDossier && (
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" asChild>
                <a href={data.dossier.pdf_link!} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-1.5 h-4 w-4" />
                  {t("dossier.downloadDossier")}
                </a>
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                {t("dossier.deleteDossier")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Two options (when no dossier) ───────────────────────────────── */}
      {!hasDossier && (
        <>
          {activeAdd && (
            <div className="form-sheet flex items-center gap-3 border-[#1e4475]/30 bg-[#1e4475]/5 p-4">
              <FolderUp className="h-5 w-5 shrink-0 text-[#1e4475]" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t("dossier.uploadSuccess")} <span className="aktenzeichen">({activeAdd.ref_number})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {getStatusLabel(t, activeAdd)} — {getAddPriceLabel(t, activeAdd)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const ok = await confirmApp(t("demandes.cancelConfirmMessage"), {
                    title: t("demandes.cancelConfirmTitle"),
                    destructive: true,
                    confirmLabel: t("demandes.cancel"),
                  });
                  if (!ok) return;
                  try {
                    await apiFetch(`/api/dossier/demandes-ajout/${activeAdd._id}/cancel`, {
                      method: "POST",
                    });
                    toast({ title: t("common.operationSuccess") });
                    load();
                  } catch (err) {
                    await alertApp(err instanceof Error ? err.message : "Erreur");
                  }
                }}
              >
                {t("demandes.cancel")}
              </Button>
            </div>
          )}

          {activeCreate && (
            <div className="form-sheet flex items-center gap-3 border-[#1e4475]/30 bg-[#1e4475]/5 p-4">
              <FilePlus2 className="h-5 w-5 shrink-0 text-[#1e4475]" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {getStatusLabel(t, activeCreate)} <span className="aktenzeichen">({activeCreate.ref_number})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {getPriceLabel(t, activeCreate)}
                </p>
                {activeCreate.dossier_ready_at && (activeCreate.status === "payed" || activeCreate.status === "in_creation") && (
                  <p className="text-xs text-muted-foreground">
                    {t("dossier.readyAt")} : {new Date(activeCreate.dossier_ready_at).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>
              {activeCreate.status === "en_attente" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const ok = await confirmApp(t("demandes.cancelConfirmMessage"), {
                        title: t("demandes.cancelConfirmTitle"),
                        destructive: true,
                        confirmLabel: t("demandes.cancel"),
                      });
                      if (!ok) return;
                      try {
                        await apiFetch(`/api/dossier/demandes-creation/${activeCreate._id}/cancel`, {
                          method: "POST",
                        });
                        toast({ title: t("common.operationSuccess") });
                        load();
                      } catch (err) {
                        await alertApp(err instanceof Error ? err.message : "Erreur");
                      }
                    }}
                  >
                    {t("demandes.cancel")}
                  </Button>
                  <Button asChild size="sm">
                    <a href={data.whatsapp_url} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      {t("common.whatsapp")}
                    </a>
                  </Button>
                </>
              )}
            </div>
          )}

          {!activeAdd && !activeCreate && (
            <>
              <p className="eyebrow">{t("dossier.optionsTitle")}</p>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Option 1: upload own dossier */}
                <div className="form-sheet flex flex-col p-6">
                  <div className="mb-3 flex items-center justify-between">
                    <FolderUp className="h-6 w-6 text-[#1e4475]" />
                    <span className="stamp stamp-green stamp-flat">{t("dossier.optionAddPrice")}</span>
                  </div>
                  <h3 className="font-display text-lg font-bold">{t("dossier.optionAddTitle")}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {t("dossier.optionAddDesc")}
                  </p>
                  <Button className="mt-4 font-semibold" onClick={() => setUploadOpen(true)}>
                    <Upload className="mr-1.5 h-4 w-4" />
                    {t("dossier.optionAddCta")}
                  </Button>
                </div>

                {/* Option 2: request creation */}
                <div className="form-sheet flex flex-col border-[#1e4475]/40 p-6">
                  <div className="mb-3 flex items-center justify-between">
                    <FilePlus2 className="h-6 w-6 text-[#1e4475]" />
                    <span className="stamp stamp-blue stamp-flat">
                      {data.creation_price} $
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold">{t("dossier.optionCreateTitle")}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {t("dossier.optionCreateDesc")}
                  </p>
                  <Button
                    variant="secondary"
                    className="mt-4 font-semibold"
                    onClick={() => setCreateOpen(true)}
                  >
                    <MessageCircle className="mr-1.5 h-4 w-4" />
                    {t("dossier.optionCreateCta")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── History ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Add requests history */}
        <div className="form-sheet">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">{t("dossier.historyAdd")}</h2>
          </div>
          <div className="max-h-72 overflow-y-auto scroll-slim">
            {data.demandes_add.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {t("common.noData")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.demandes_add.map((d) => (
                  <li key={d._id} className="space-y-1.5 px-5 py-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="aktenzeichen">{d.ref_number}</span>
                      <StatusStamp
                        status={getStatusVariant(d)}
                        label={getStatusLabel(t, d)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
                      <span>{new Date(d.createdAt).toLocaleDateString("fr-FR")}</span>
                      <span className="num">{getAddPriceLabel(t, d)}</span>
                    </div>
                    {d.status === "confirmed" && data.dossier.pdf_link && (
                      <a
                        href={data.dossier.pdf_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#1e4475] hover:underline"
                      >
                        {t("dossier.downloadDossier")} →
                      </a>
                    )}
                    {d.status === "rejected" && d.message_on_failed && (
                      <p className="rounded-sm bg-[#b3391f]/5 px-2.5 py-1.5 text-xs text-[#b3391f]">
                        {d.message_on_failed}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Create requests history */}
        <div className="form-sheet">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">{t("dossier.historyCreate")}</h2>
          </div>
          <div className="max-h-72 overflow-y-auto scroll-slim">
            {data.demandes_create.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {t("common.noData")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.demandes_create.map((d) => (
                  <li key={d._id} className="space-y-1.5 px-5 py-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="aktenzeichen">{d.ref_number}</span>
                      <StatusStamp
                        status={getStatusVariant(d)}
                        label={getStatusLabel(t, d)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
                      <span>{new Date(d.createdAt).toLocaleDateString("fr-FR")}</span>
                      <span className="num">{getPriceLabel(t, d)}</span>
                    </div>
                    {d.dossier_ready_at && (d.status === "payed" || d.status === "in_creation") && (
                      <p className="text-xs text-muted-foreground">
                        {t("dossier.readyAt")} : {new Date(d.dossier_ready_at).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                    {d.status === "completed" && d.dossier_pdf_link && (
                      <a
                        href={d.dossier_pdf_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#1e4475] hover:underline"
                      >
                        {t("dossier.downloadDossier")} →
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Deletion History ───────────────────────────────────────────── */}
      {data.deletion_history && data.deletion_history.length > 0 && (
        <div className="form-sheet">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold flex items-center gap-2">
              <History className="h-4 w-4" />
              {t("dossier.historyDeletion")}
            </h2>
          </div>
          <div className="max-h-72 overflow-y-auto scroll-slim">
            <ul className="divide-y divide-border">
              {data.deletion_history.map((d) => (
                <li key={d._id} className="space-y-1.5 px-5 py-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#b3391f]">
                      {t("dossier.deleteDossier")} — {new Date(d.deleted_at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
                    <span>
                      {d.source_type === "ajout"
                        ? `${t("dossier.sourceAdd")} : ${d.source_ref_number || "—"}`
                        : d.source_type === "creation"
                        ? `${t("dossier.sourceCreation")} : ${d.source_ref_number || "—"}`
                        : t("common.noData")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Upload dialog ───────────────────────────────────────────────── */}
      <UploadDossierDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={load}
      />

      {/* ── Create request dialog ───────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{t("dossier.createConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("dossier.createConfirmDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="font-semibold"
              onClick={async () => {
                try {
                  const res = await apiFetch<{ whatsapp_url: string; demande: { ref_number: string } }>(
                    "/api/dossier/request-creation",
                    { method: "POST" }
                  );
                  toast({ title: t("dossier.createSuccess") });
                  setCreateOpen(false);
                  load();
                  window.open(res.whatsapp_url, "_blank");
                } catch (err) {
                  await alertApp(err instanceof Error ? err.message : "Erreur");
                }
              }}
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              {t("dossier.createConfirmCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UploadDossierDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}) {
  const { t } = useI18n();
  const { alertApp } = useAppPopup();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/dossier/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erreur d'envoi");
      }
      onOpenChange(false);
      setFile(null);
      onUploaded();
      alertApp(
        `${t("dossier.uploadSuccess")}\n\n${t("dossier.uploadSubtitle")}`,
        t("dossier.uploadTitle")
      );
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{t("dossier.uploadTitle")}</DialogTitle>
          <DialogDescription>{t("dossier.uploadSubtitle")}</DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed p-8 text-center transition-colors",
            dragActive ? "border-[#1e4475] bg-[#1e4475]/5" : "border-border bg-[#fafaf6]"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && dropped.type === "application/pdf") setFile(dropped);
          }}
        >
          <Upload className={cn("h-8 w-8", file ? "text-[#2f6b4a]" : "text-muted-foreground")} />
          {file ? (
            <div>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="aktenzeichen mt-0.5">
                {t("dossier.uploadSelected", {
                  name: "",
                  size: Math.round(file.size / 1024).toLocaleString("fr-FR"),
                }).replace(/^ — /, "")}
              </p>
            </div>
          ) : (
            <label className="cursor-pointer text-sm font-medium text-[#1e4475] hover:underline">
              {t("dossier.uploadChoose")}
              <input
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button className="font-semibold" disabled={!file || uploading} onClick={handleUpload}>
            {uploading ? t("common.loading") : t("dossier.uploadSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}