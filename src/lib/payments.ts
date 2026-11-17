import crypto from "node:crypto";
import { db } from "./db";
import { appUrl } from "./notify";

/**
 * Payment providers.
 * - tap: Tap Payments (https://developers.tap.company). Hosted checkout shows Apple Pay on iPhone/Mac Safari,
 *   cards everywhere. The first payment saves the card (save_card) so renewals can be charged automatically
 *   with the payment agreement Tap returns.
 * - fake: a stand-in for tests and demos. Its checkout page lives in the app; no money moves.
 */
export type ChargeStatus = "paid" | "pending" | "failed";
export type Charge = {
  id: string;
  status: ChargeStatus;
  amount: number;
  currency: string;
  customerId: string | null;
  cardId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  agreementId: string | null;
  error: string | null;
};
export type Payer = { id: number; name: string; email: string; phone: string | null };

export interface PaymentProvider {
  readonly name: "tap" | "fake";
  /** Start a customer-present payment. Returns where to send the browser. */
  checkout(p: { paymentId: number; payer: Payer; amount: number; currency: string; description: string; returnUrl: string; webhookUrl: string }): Promise<{ chargeId: string; url: string }>;
  /** Ask the provider for the charge's real state (never trust what the browser or a webhook body says). */
  getCharge(id: string): Promise<Charge>;
  /** Charge a saved card without the customer present (renewals). */
  chargeSaved(p: { paymentId: number; payer: Payer; amount: number; currency: string; description: string; customerId: string; cardId: string; agreementId: string; webhookUrl: string }): Promise<Charge>;
  /** Is this webhook really from the provider? */
  verifyWebhook(headers: Headers, body: Record<string, unknown>): boolean;
}

// ---------- Tap ----------
const TAP = "https://api.tap.company/v2";

type TapCharge = {
  id: string; status: string; amount: number; currency: string;
  customer?: { id?: string }; card?: { id?: string; brand?: string; last_four?: string; scheme?: string };
  payment_agreement?: { id?: string }; transaction?: { url?: string; created?: string };
  reference?: { gateway?: string; payment?: string }; response?: { code?: string; message?: string };
};

function tapStatus(s: string): ChargeStatus {
  if (s === "CAPTURED") return "paid";
  if (s === "INITIATED" || s === "IN_PROGRESS") return "pending";
  return "failed"; // DECLINED, ABANDONED, CANCELLED, FAILED, RESTRICTED, VOID, TIMEDOUT, UNKNOWN
}

function toCharge(c: TapCharge): Charge {
  return {
    id: c.id, status: tapStatus(c.status), amount: Number(c.amount), currency: c.currency,
    customerId: c.customer?.id ?? null, cardId: c.card?.id ?? null, cardBrand: c.card?.brand ?? c.card?.scheme ?? null,
    cardLast4: c.card?.last_four ?? null, agreementId: c.payment_agreement?.id ?? null,
    error: tapStatus(c.status) === "failed" ? c.response?.message ?? c.status : null,
  };
}

const names = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return { first_name: parts[0] || "Customer", last_name: parts.slice(1).join(" ") || "-" };
};

class TapProvider implements PaymentProvider {
  readonly name = "tap" as const;
  constructor(private key: string) {}
  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(TAP + path, {
      method,
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as T & { errors?: { description?: string }[] };
    if (!res.ok) throw new Error(`Tap ${res.status}: ${json.errors?.map((e) => e.description).join("; ") || "request failed"}`);
    return json;
  }
  async checkout(p: Parameters<PaymentProvider["checkout"]>[0]) {
    const c = await this.call<TapCharge>("POST", "/charges", {
      amount: p.amount, currency: p.currency, customer_initiated: true, threeDSecure: true, save_card: true,
      description: p.description, metadata: { payment_id: String(p.paymentId) },
      reference: { transaction: `pay_${p.paymentId}`, order: `pay_${p.paymentId}` },
      receipt: { email: false, sms: false },
      customer: { ...names(p.payer.name), email: p.payer.email },
      source: { id: "src_all" }, // Tap's hosted page: Apple Pay, cards, and local methods enabled on the account
      post: { url: p.webhookUrl }, redirect: { url: p.returnUrl },
    });
    if (!c.transaction?.url) throw new Error("Tap did not return a payment page");
    return { chargeId: c.id, url: c.transaction.url };
  }
  async getCharge(id: string) {
    return toCharge(await this.call<TapCharge>("GET", `/charges/${encodeURIComponent(id)}`));
  }
  async chargeSaved(p: Parameters<PaymentProvider["chargeSaved"]>[0]) {
    // Tokens from saved cards are single-use and expire in minutes: make a fresh one for every renewal.
    const tok = await this.call<{ id: string }>("POST", "/tokens", { saved_card: { card_id: p.cardId, customer_id: p.customerId } });
    const c = await this.call<TapCharge>("POST", "/charges", {
      amount: p.amount, currency: p.currency, customer_initiated: false, save_card: false,
      payment_agreement: { id: p.agreementId }, description: p.description,
      metadata: { payment_id: String(p.paymentId) }, reference: { transaction: `pay_${p.paymentId}`, order: `pay_${p.paymentId}` },
      receipt: { email: false, sms: false }, customer: { id: p.customerId }, source: { id: tok.id },
      post: { url: p.webhookUrl }, redirect: { url: appUrl("/billing") },
    });
    return toCharge(c);
  }
  verifyWebhook(headers: Headers, b: Record<string, unknown>) {
    const got = headers.get("hashstring");
    if (!got) return false;
    const ref = (b.reference ?? {}) as { gateway?: string; payment?: string };
    const tx = (b.transaction ?? {}) as { created?: string };
    const decimals = ["BHD", "KWD", "OMR", "JOD"].includes(String(b.currency)) ? 3 : 2;
    const text = `x_id${b.id}x_amount${Number(b.amount).toFixed(decimals)}x_currency${b.currency}x_gateway_reference${ref.gateway ?? ""}x_payment_reference${ref.payment ?? ""}x_status${b.status}x_created${tx.created ?? ""}`;
    const want = crypto.createHmac("sha256", this.key).update(text).digest("hex");
    return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
  }
}

// ---------- Test stand-in ----------
/** Test card endings: 4242 pays and renews; 0341 pays now but declines renewals. */
class FakeProvider implements PaymentProvider {
  readonly name = "fake" as const;
  async checkout(p: Parameters<PaymentProvider["checkout"]>[0]) {
    const id = `fake_chg_${p.paymentId}_${crypto.randomBytes(4).toString("hex")}`;
    await db().run("INSERT INTO test_charges (id, status) VALUES (?, 'pending')", id);
    return { chargeId: id, url: appUrl(`/billing/test-checkout?charge=${id}&amount=${p.amount}&return=${encodeURIComponent(p.returnUrl)}`) };
  }
  async getCharge(id: string): Promise<Charge> {
    const r = (await db().get("SELECT * FROM test_charges WHERE id = ?", id)) as { status: ChargeStatus; card_last4: string | null } | undefined;
    if (!r) throw new Error("Unknown test charge");
    const card = r.card_last4;
    return { id, status: r.status, amount: 0, currency: "QAR", customerId: card ? "fake_cus" : null, cardId: card ? `fake_card_${card}` : null, cardBrand: card ? "VISA" : null, cardLast4: card, agreementId: card ? "fake_agreement" : null, error: r.status === "failed" ? "Declined (test)" : null };
  }
  async chargeSaved(p: Parameters<PaymentProvider["chargeSaved"]>[0]): Promise<Charge> {
    const id = `fake_chg_${p.paymentId}_${crypto.randomBytes(4).toString("hex")}`;
    const last4 = p.cardId.replace("fake_card_", "");
    const status: ChargeStatus = last4 === "0341" ? "failed" : "paid";
    await db().run("INSERT INTO test_charges (id, status, card_last4) VALUES (?,?,?)", id, status, last4);
    return this.getCharge(id);
  }
  verifyWebhook() {
    return false; // the stand-in never sends webhooks
  }
}

export function paymentProvider(): PaymentProvider {
  const which = process.env.PAYMENTS_PROVIDER || "tap";
  if (which === "fake") return new FakeProvider();
  const key = process.env.TAP_SECRET_KEY;
  if (!key) throw new Error("Payments are on but TAP_SECRET_KEY is not set");
  return new TapProvider(key);
}
