"use client";

import { Chip } from "@heroui/react";

import { useUrlFlash } from "../../core/data";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr } from "../../ui/Data";
import { GlassSection, PageHeader } from "../../ui/Page";
import { EmptyBlock, Loadable } from "../../ui/States";
import { usePgData } from "./data";
import { ConnectionNoticeBar, ReadError } from "./PgNotice";
import type { InboundsData } from "./types";

function Details({ details }: { details: NonNullable<InboundsData["details"]> }) {
  if (!details.rows.length) {
    return (
      <pre dir="ltr" className="inset-tile max-w-full overflow-x-auto rounded-lg p-4 text-xs leading-6 break-words whitespace-pre-wrap text-muted">
        {details.text}
      </pre>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-start text-xs text-muted">
            <th scope="col" className="border-b border-border px-3 py-2 text-start font-medium">
              کلید
            </th>
            <th scope="col" className="border-b border-border px-3 py-2 text-start font-medium">
              مقدار
            </th>
          </tr>
        </thead>
        <tbody>
          {details.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="border-b border-border/60 px-3 py-2 text-start align-top font-normal">
                <Ltr>{row.key}</Ltr>
              </th>
              <td className="max-w-[480px] border-b border-border/60 px-3 py-2 align-top break-words text-muted">
                <Ltr>{row.value}</Ltr>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InboundsContent() {
  const inbounds = usePgData<InboundsData>("/api/panel/pg/inbounds");
  useUrlFlash();
  return (
    <>
      <PageHeader icon="solar:routing-bold" tone="blue" title="اینباندها" description="تگ‌های اینباند پاسارگارد برای ساخت گروه و هاست" />
      <div className="flex flex-col gap-6">
        <Loadable state={inbounds} rows={3}>
          {(data) => (
            <>
              <ConnectionNoticeBar notice={data.notice} onRetry={inbounds.reload} />
              <ReadError message={data.error} />
              <GlassSection title="تگ‌های اینباند" description="برای ساخت گروه و هاست از همین تگ‌ها استفاده کنید.">
                {data.tags.length ? (
                  <ul className="flex flex-wrap gap-2" aria-label="تگ‌های اینباند">
                    {data.tags.map((tag, index) => (
                      <li key={`${tag}-${index}`}>
                        <Chip variant="soft">
                          <Chip.Label>
                            <Ltr>{tag}</Ltr>
                          </Chip.Label>
                        </Chip>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyBlock icon="solar:routing-bold" title="اینباندی نیست." />
                )}
              </GlassSection>
              {data.details ? (
                <GlassSection title="جزئیات">
                  <Details details={data.details} />
                </GlassSection>
              ) : null}
            </>
          )}
        </Loadable>
      </div>
    </>
  );
}

export function InboundsPage() {
  return (
    <PanelShell title="اینباندهای پاسارگارد">
      <InboundsContent />
    </PanelShell>
  );
}
