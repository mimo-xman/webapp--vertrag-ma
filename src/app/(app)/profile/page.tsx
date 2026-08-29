"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import { StatusStamp } from "@/components/stamp";
import {
  KeyRound,
  ShieldCheck,
  ShieldOff,
  QrCode,
  Eye,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";

interface MeResponse {
  user: {
    _id: string;
    full_name: string;
    email: string;
    date_of_birth: string | null;
    role: string;
    two_factor_enabled: boolean;
    has_backup_codes: boolean;
    createdAt: string;
  };
}

export default function ProfilePage() {
  const { t } = useI18n();
  const { confirmApp, alertApp } = useAppPopup();
  const { toast } = useToast();

  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // 2FA
  const [setupData, setSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  // Delete account
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteCode, setDeleteCode] = useState("");

  const load = () => {
    apiFetch<MeResponse>("/api/auth/me")
      .then((data) => {
        setMe(data.user);
        setFullName(data.user.full_name);
        setDateOfBirth(data.user.date_of_birth ? data.user.date_of_birth.slice(0, 10) : "");
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
     
  }, []);

  const saveInfo = async () => {
    setSavingInfo(true);
    try {
      await apiFetch("/api/auth/me", {
        method: "PUT",
        body: JSON.stringify({ full_name: fullName, date_of_birth: dateOfBirth || null }),
      });
      toast({ title: t("common.savedSuccess") });
      load();
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingInfo(false);
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      await alertApp("Les mots de passe ne correspondent pas.");
      return;
    }
    setSavingPassword(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      toast({ title: t("profile.passwordSuccess") });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingPassword(false);
    }
  };

  const start2FASetup = async () => {
    try {
      const data = await apiFetch<{ secret: string; qrDataUrl: string }>("/api/auth/2fa/setup", {
        method: "POST",
      });
      setSetupData(data);
      setTotpCode("");
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const confirm2FASetup = async () => {
    try {
      const data = await apiFetch<{ backupCodes: string[] }>("/api/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ code: totpCode }),
      });
      setSetupData(null);
      setBackupCodes(data.backupCodes);
      load();
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const disable2FA = async () => {
    try {
      await apiFetch("/api/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      toast({ title: t("profile.twoFADisabled") });
      setDisablePassword("");
      setDisableCode("");
      load();
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const revealBackupCodes = async () => {
    try {
      const data = await apiFetch<{ backupCodes: string[] }>("/api/auth/2fa/backup-codes", {
        method: "POST",
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      setBackupCodes(data.backupCodes);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const regenerateBackupCodes = async () => {
    try {
      const data = await apiFetch<{ backupCodes: string[] }>(
        "/api/auth/2fa/regenerate-backup-codes",
        {
          method: "POST",
          body: JSON.stringify({ password: disablePassword, code: disableCode }),
        }
      );
      setBackupCodes(data.backupCodes);
      toast({ title: t("common.operationSuccess") });
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const requestDeleteAccount = async () => {
    const ok = await confirmApp(t("profile.deleteAccountFinalMessage"), {
      title: t("profile.deleteAccountCta"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiFetch("/api/auth/request-delete-account", {
        method: "POST",
        body: JSON.stringify({
          password: deletePassword,
          ...(deleteCode ? { two_factor_code: deleteCode } : {}),
        }),
      });
      await alertApp(t("profile.deleteAccountConfirm"));
      setDeletePassword("");
      setDeleteCode("");
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  if (!me) {
    return <div className="h-40 animate-pulse rounded-sm bg-muted" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Vertrag.ma — {t("profile.title")}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("profile.title")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("profile.subtitle")}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Personal info ─────────────────────────────────── */}
        <div className="form-sheet">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">{t("profile.infoTitle")}</h2>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <span className="eyebrow">AKTE</span>
              <span className="aktenzeichen">{me._id.slice(-12).toUpperCase()}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fullname">{t("auth.fullName")}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input value={me.email} disabled className="bg-muted font-mono text-sm" />
              <p className="text-xs text-muted-foreground">{t("profile.emailUnchangeable")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dob">{t("auth.dateOfBirth")}</Label>
              <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <Button onClick={saveInfo} disabled={savingInfo} className="font-semibold">
              {savingInfo ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </div>

        {/* ── Password ──────────────────────────────────────── */}
        <div className="form-sheet">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">{t("profile.passwordTitle")}</h2>
          </div>
          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="current">{t("profile.currentPassword")}</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new">{t("profile.newPassword")}</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-new">{t("profile.confirmPassword")}</Label>
              <Input
                id="confirm-new"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </div>
            <Button
              onClick={changePassword}
              disabled={savingPassword || !currentPassword || newPassword.length < 6}
              className="font-semibold"
            >
              <KeyRound className="mr-1.5 h-4 w-4" />
              {savingPassword ? t("common.loading") : t("profile.passwordCta")}
            </Button>
          </div>
        </div>

        {/* ── 2FA ───────────────────────────────────────────── */}
        <div className="form-sheet">
          <div className="sheet-band flex items-center justify-between px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">{t("profile.twoFATitle")}</h2>
            <StatusStamp
              status={me.two_factor_enabled ? "active" : "en_attente"}
              label={me.two_factor_enabled ? t("profile.twoFAEnabled") : t("profile.twoFADisabled")}
            />
          </div>
          <div className="space-y-4 p-5">
            <p className="text-sm text-muted-foreground">{t("profile.twoFADesc")}</p>

            {!me.two_factor_enabled ? (
              <Button onClick={start2FASetup} className="font-semibold">
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                {t("profile.twoFAEnable")}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t("profile.currentPassword")}</Label>
                  <Input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="destructive"
                    onClick={disable2FA}
                    disabled={!disablePassword || disableCode.length < 6}
                  >
                    <ShieldOff className="mr-1.5 h-4 w-4" />
                    {t("profile.twoFADisable")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={revealBackupCodes}
                    disabled={!disablePassword || disableCode.length < 6}
                  >
                    <Eye className="mr-1.5 h-4 w-4" />
                    {t("profile.twoFAReveal")}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={regenerateBackupCodes}
                  disabled={!disablePassword || disableCode.length < 6}
                  className="w-full"
                >
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  {t("profile.twoFARegenerate")}
                </Button>
              </div>
            )}

            {me.two_factor_enabled && (
              <div className="space-y-1.5">
                <Label>{t("auth.twoFACode")}</Label>
                <Input
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="123456"
                  className="font-mono tracking-widest"
                  maxLength={6}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Danger zone ───────────────────────────────────── */}
        <div className="form-sheet border-[#b3391f]/40">
          <div className="sheet-band flex items-center gap-2 px-5 py-3.5">
            <TriangleAlert className="h-4 w-4 text-[#b3391f]" />
            <h2 className="font-display text-sm font-bold text-[#b3391f]">
              {t("profile.dangerZone")}
            </h2>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-sm text-muted-foreground">{t("profile.deleteAccountDesc")}</p>
            <div className="space-y-1.5">
              <Label>{t("profile.deleteAccountPassword")}</Label>
              <Input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>
            {me.two_factor_enabled && (
              <div className="space-y-1.5">
                <Label>{t("auth.twoFACode")}</Label>
                <Input
                  value={deleteCode}
                  onChange={(e) => setDeleteCode(e.target.value)}
                  placeholder="123456"
                  className="font-mono tracking-widest"
                />
              </div>
            )}
            <Button
              variant="destructive"
              onClick={requestDeleteAccount}
              disabled={!deletePassword}
              className="font-semibold"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {t("profile.deleteAccountCta")}
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2FA setup dialog (QR + code) ────────────────────── */}
      <Dialog open={Boolean(setupData)} onOpenChange={(o) => !o && setSetupData(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-lg">
              <QrCode className="h-5 w-5 text-[#1e4475]" />
              {t("profile.twoFAEnable")}
            </DialogTitle>
            <DialogDescription>{t("profile.twoFAScan")}</DialogDescription>
          </DialogHeader>
          {setupData && (
            <div className="space-y-4">
              <div className="flex justify-center rounded-sm border border-border bg-white p-3">
                { }
                <img src={setupData.qrDataUrl} alt="QR Code 2FA" className="h-44 w-44" />
              </div>
              <div className="rounded-sm bg-[#fafaf6] p-2.5 text-center">
                <p className="eyebrow mb-1">SECRET</p>
                <p className="font-mono text-xs break-all">{setupData.secret}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("profile.twoFAEnterCode")}</Label>
                <Input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  className="font-mono tracking-widest text-center text-lg"
                  maxLength={6}
                />
              </div>
              <Button
                onClick={confirm2FASetup}
                disabled={totpCode.length !== 6}
                className="w-full font-semibold"
              >
                {t("auth.twoFACta")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Backup codes dialog ─────────────────────────────── */}
      <Dialog open={Boolean(backupCodes)} onOpenChange={(o) => !o && setBackupCodes(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{t("profile.twoFABackupCodes")}</DialogTitle>
            <DialogDescription>{t("profile.twoFABackupCodesDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {backupCodes?.map((code) => (
              <div
                key={code}
                className="rounded-sm border border-border bg-[#fafaf6] px-3 py-2 text-center font-mono text-sm font-semibold tracking-wider"
              >
                {code}
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={() => setBackupCodes(null)} className="w-full">
            {t("common.close")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
