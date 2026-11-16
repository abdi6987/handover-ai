import Link from "next/link";
import { getT } from "@/lib/i18n";
import { ResetForm } from "@/components/auth";
import { findReset } from "@/lib/verify";

export default async function Reset({ params }: { params: Promise<{ token: string }> }) {
  const t = await getT();
  const { token } = await params;
  const ok = !!findReset(token);
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="h1">{t("Choose a new password")}</h1>
      {ok ? <div className="card"><ResetForm token={token} /></div> : (
        <div className="card space-y-2">
          <p>{t("This reset link has expired or was already used. Ask for a new one.")}</p>
          <Link href="/forgot-password" className="btn-primary">{t("Send a new link")}</Link>
        </div>
      )}
    </div>
  );
}
