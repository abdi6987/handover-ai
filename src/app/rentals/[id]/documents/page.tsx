import { loadRental } from "@/lib/page";
import { getT } from "@/lib/i18n";
import { mediaFor } from "@/lib/rentals";
import { Form } from "@/components/client";
import { MediaGrid } from "@/components/ui";

export default async function Documents({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const { user, rental: r, names } = await loadRental(id);
  const docs = await mediaFor(r.id, "document");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card space-y-3 lg:col-span-2">
        <h2 className="h2">{t("Documents")}</h2>
        <p className="muted">{t("Lease, ID copies, receipts, inventory lists, handover forms. Shared with both sides and fingerprinted on upload.")}</p>
        <MediaGrid media={docs} names={names} canDelete={(m) => m.uploaded_by === user.id} />
      </div>
      <div className="card h-fit space-y-3">
        <h2 className="h2">{t("Upload")}</h2>
        <Form url={`/api/rentals/${r.id}/media`} multipart submitLabel={t("Upload")} extra={{ context: "document" }}>
          <div><label className="label">{t("Title")}</label><input name="title" className="input" placeholder={t("e.g. Signed lease PDF")} /></div>
          <input name="files" type="file" multiple required className="block w-full text-sm" />
        </Form>
      </div>
    </div>
  );
}
