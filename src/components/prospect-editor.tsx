"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONCEPT_LINK,
  hasConceptLink,
  renderEmailHtml,
  renderProposalEmailHtml,
  TEMPLATE_LINK,
  titleCase,
  type Signature,
} from "@/lib/email-template";
import { AREA_LABEL } from "@/lib/labels";
import type { ProspectDetail } from "@/lib/schemas";
import { IconAlert, IconCheck, IconExternal, IconEye, IconPaperclip, IconPencil, IconSend, IconSparkles, IconX } from "./icons";
import { ProposalPanel } from "./proposal-panel";
import { useToast } from "./toast";
import { Badge, Button, Card, CardHeader, cx, Notice, Skeleton } from "./ui";

const field =
  "w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-mint-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

export function ProspectEditor({
  prospect,
  mailReady,
  netlifyReady,
  signature,
  templateUrl,
}: {
  prospect: ProspectDetail;
  mailReady: boolean;
  netlifyReady: boolean;
  signature: Signature;
  /** The shared template site, for "Without PPT" leads. */
  templateUrl: string | null;
}) {
  const template = prospect.mode === "template";
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-5">
        <SiteReview prospect={prospect} />
        <LeadFacts prospect={prospect} />
      </div>
      <div className="space-y-5 lg:sticky lg:top-4">
        {template ? (
          <TemplateSiteInfo templateUrl={templateUrl} />
        ) : prospect.audit && !prospect.audit.reachable ? (
          <Card>
            <CardHeader
              icon={<IconAlert size={16} />}
              title="No concept for this lead"
              description="Their website couldn't be opened, so there's nothing to build a concept or PDF from. The email below is written for that case."
            />
          </Card>
        ) : (
          <ProposalPanel
            prospectId={prospect.id}
            proposal={prospect.proposal}
            canBuild={Boolean(prospect.audit?.reachable) && prospect.status !== "rejected"}
            netlifyReady={netlifyReady}
          />
        )}
        {/* Remount when the draft changes, e.g. after a background refresh, so the fields show the new text. */}
        <EmailEditor
          key={prospect.draft?.updatedAt ?? "none"}
          prospect={prospect}
          mailReady={mailReady}
          signature={signature}
          templateUrl={templateUrl}
        />
      </div>
    </div>
  );
}

function SiteReview({ prospect }: { prospect: ProspectDetail }) {
  const [loaded, setLoaded] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const url = prospect.audit?.pageUrl ?? prospect.website;

  // A cached image can finish before React attaches onLoad, so check once on mount.
  useEffect(() => {
    if (image.current?.complete) setLoaded(true);
  }, []);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-slate-200" />
          <span className="size-2.5 rounded-full bg-slate-200" />
          <span className="size-2.5 rounded-full bg-slate-200" />
        </span>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 font-mono text-xs text-slate-600 ring-1 ring-slate-200 hover:text-mint-700">
            <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
            <IconExternal size={12} className="shrink-0" />
          </a>
        ) : (
          <span className="ml-2 text-xs text-slate-400">No website</span>
        )}
      </div>
      {prospect.audit?.hasScreenshot ? (
        <div className="relative aspect-1280/900 bg-slate-100">
          {!loaded ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
          {/* Served by our own authenticated route. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={image}
            src={`/api/prospects/${prospect.id}/screenshot`}
            alt={`Homepage of ${prospect.company}`}
            onLoad={() => setLoaded(true)}
            className={cx("absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")}
          />
        </div>
      ) : (
        <div className="flex aspect-1280/900 items-center justify-center bg-slate-50 text-sm text-slate-400">
          No screenshot yet. Run Prepare from the overview.
        </div>
      )}
      <div className="p-5">
        <h2 className="text-[15px] font-semibold text-slate-900">Site review</h2>
        {prospect.audit && !prospect.audit.reachable ? (
          <Notice tone="warn" className="mt-3">
            {prospect.audit.unreachableReason === "blocked"
              ? "Their site blocks automated browsers, so it couldn't be reviewed. The email is a short introduction and doesn't mention the site."
              : `Their site didn't load: ${(prospect.audit.unreachableReason ?? "").replace(/^down:\s*/, "").replace(/^Their website did not load \((.*)\)\.$/, "$1")}. The email kindly mentions it didn't load, which is often a reason for them to reply.`}
          </Notice>
        ) : null}
        <div className="mt-3 space-y-2.5">
          {(prospect.audit?.findings ?? []).map((finding, index) => (
            <div key={`${finding.area}-${index}`} className="rounded-xl border border-slate-100 p-3.5">
              <Badge tone="sky">{AREA_LABEL[finding.area]}</Badge>
              <p className="mt-2 text-[13px] leading-5 text-slate-800">{finding.observation}</p>
              <p className="mt-1.5 flex gap-1.5 text-[13px] leading-5 text-slate-500">
                <IconCheck size={14} className="mt-0.5 shrink-0 text-mint-600" />
                {finding.suggestion}
              </p>
            </div>
          ))}
          {prospect.audit?.reachable && prospect.audit.findings.length === 0 ? (
            <p className="text-sm text-slate-500">The review did not return findings.</p>
          ) : null}
          {!prospect.audit ? <p className="text-sm text-slate-500">Not reviewed yet.</p> : null}
        </div>
      </div>
    </Card>
  );
}

function LeadFacts({ prospect }: { prospect: ProspectDetail }) {
  const facts: [string, string | null][] = [
    ["Email", prospect.email],
    ["Email status", prospect.emailStatus],
    ["Title", prospect.title],
    ["Seniority", prospect.seniority],
    ["Location", prospect.location || null],
    ["Industry", prospect.industry],
    ["Employees", prospect.employees],
    ["Revenue", prospect.annualRevenue],
    ["Qualify Contact", prospect.qualifyContact],
  ];
  return (
    <Card>
      <CardHeader title="Lead details" description="From the Apollo export." />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 p-5 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-0.5 truncate text-slate-800" title={value ?? undefined}>{value || "—"}</dd>
          </div>
        ))}
        {prospect.linkedin ? (
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">LinkedIn</dt>
            <dd className="mt-0.5">
              <a href={prospect.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-mint-700 hover:underline">
                Open profile <IconExternal size={12} />
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

function TemplateSiteInfo({ templateUrl }: { templateUrl: string | null }) {
  return (
    <Card>
      <CardHeader
        icon={<IconSparkles size={16} />}
        title="Without PPT · template only"
        description="No concept or PDF. The proposal is written into the email, with a button to the template site."
      />
      <div className="p-5">
        {templateUrl ? (
          <a
            href={templateUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 font-mono text-[13px] text-slate-700 hover:bg-slate-100"
          >
            <span className="truncate">{templateUrl.replace(/^https?:\/\//, "")}</span>
            <IconExternal size={14} className="shrink-0 text-slate-400" />
          </a>
        ) : (
          <Notice tone="warn">Add the template site link on the Without PPT overview before sending.</Notice>
        )}
      </div>
    </Card>
  );
}

function EmailEditor({
  prospect,
  mailReady,
  signature,
  templateUrl,
}: {
  prospect: ProspectDetail;
  mailReady: boolean;
  signature: Signature;
  templateUrl: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const template = prospect.mode === "template";
  const proposal = prospect.proposal;
  const live = Boolean(proposal && !proposal.needsDeploy);
  const [subject, setSubject] = useState(prospect.draft?.subject ?? "");
  const [body, setBody] = useState(prospect.draft?.body ?? "");
  // The designed email is the point of the template workflow, so it opens on the preview.
  const [view, setView] = useState<"edit" | "preview">(prospect.mode === "template" ? "preview" : "edit");
  const [includeDemo, setIncludeDemo] = useState(live);
  const [attachPdf, setAttachPdf] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState<"save" | "send" | "rewrite" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const linkMarker = hasConceptLink(body);
  const canEdit = prospect.status === "drafted" && prospect.draft?.status === "draft";
  const dirty = subject !== (prospect.draft?.subject ?? "") || body !== (prospect.draft?.body ?? "");

  const preview = useMemo(
    () =>
      template
        ? renderProposalEmailHtml({ body, signature, company: prospect.company, templateUrl })
        : renderEmailHtml({
            body,
            signature,
            company: prospect.company,
            demoUrl: includeDemo && proposal ? proposal.demoUrl : null,
            pdfUrl: includeDemo && proposal?.hasPdf ? proposal.pdfUrl : null,
            pdfAttached: attachPdf,
          }),
    [template, body, signature, prospect.company, templateUrl, includeDemo, proposal, attachPdf],
  );

  async function save() {
    setPending("save");
    try {
      const response = await fetch(`/api/prospects/${prospect.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) toast("error", "Could not save the draft", data.error);
      else {
        toast("success", "Draft saved");
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  async function rewrite() {
    setPending("rewrite");
    try {
      const response = await fetch(`/api/prospects/${prospect.id}/redraft`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        subject?: string;
        body?: string;
        problems?: string[];
      };
      if (!response.ok) {
        toast("error", "Could not rewrite the draft", data.error);
        return;
      }
      setSubject(data.subject ?? "");
      setBody(data.body ?? "");
      setView("edit");
      if (data.problems?.length) toast("warn", "Rewritten, but check it", `It still ${data.problems.join(", ")}.`);
      else toast("success", "Draft rewritten");
      router.refresh();
    } catch {
      toast("error", "Could not reach the desk server");
    } finally {
      setPending(null);
    }
  }

  async function send() {
    setPending("send");
    setConfirming(false);
    const form = new FormData();
    form.set("subject", subject);
    form.set("body", body);
    form.set("includeDemo", includeDemo ? "1" : "0");
    form.set("attachProposal", attachPdf ? "1" : "0");
    for (const file of files) form.append("files", file);
    try {
      const response = await fetch(`/api/prospects/${prospect.id}/send`, { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!response.ok) {
        toast("error", "Not sent", data.error);
        return;
      }
      if (data.warning) toast("warn", `Sent to ${prospect.email}`, data.warning);
      else toast("success", `Sent to ${prospect.email}`, "A copy is in the Hostinger Sent folder.");
      router.refresh();
    } catch {
      toast("error", "Could not reach the desk server");
    } finally {
      setPending(null);
    }
  }

  if (!prospect.draft) {
    return (
      <Card>
        <CardHeader icon={<IconPencil size={16} />} title="Email" description="Prepare writes a draft after the site review." />
        <p className="p-5 text-sm text-slate-500">No draft yet.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        icon={<IconSend size={16} />}
        title={canEdit ? "Review and send" : "Email"}
        description={canEdit ? `To ${prospect.email}. Nothing is sent until you approve.` : undefined}
        action={
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(["edit", "preview"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cx(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium capitalize",
                  view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
                )}
              >
                {key === "edit" ? <IconPencil size={12} /> : <IconEye size={12} />}
                {key}
              </button>
            ))}
          </div>
        }
      />
      <div className="space-y-3 p-5">
        {prospect.draft.sentAt ? (
          <Notice tone="success">
            Sent {new Date(prospect.draft.sentAt).toLocaleString()} to {prospect.email}.
          </Notice>
        ) : null}
        {prospect.draft.sentCopyError ? <Notice tone="warn">{prospect.draft.sentCopyError}</Notice> : null}
        {canEdit && proposal && prospect.draft.updatedAt < proposal.builtAt ? (
          <Notice tone="warn">
            <span>The concept was rebuilt after this email was written, so it may not match. </span>
            <button type="button" onClick={rewrite} disabled={pending !== null} className="font-medium underline underline-offset-2">
              Rewrite the email
            </button>
          </Notice>
        ) : null}
        {prospect.draft.error && !prospect.draft.sentAt ? <Notice tone="error">{prospect.draft.error}</Notice> : null}
        {prospect.lastError ? <Notice tone="warn">{prospect.lastError}</Notice> : null}

        {view === "edit" ? (
          <div className="space-y-3 animate-fade-in">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Subject</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                onBlur={() => setSubject(titleCase(subject))}
                disabled={!canEdit}
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Message</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={!canEdit}
                rows={13}
                className={`${field} leading-6`}
              />
              <span className="mt-1 flex justify-between gap-3 text-[11px] text-slate-400">
                <span>
                  {template ? (
                    <>
                      <code className="font-mono text-slate-500">## Heading</code>, <code className="font-mono text-slate-500">- **Title**: text</code>{" "}
                      and <code className="font-mono text-slate-500">{TEMPLATE_LINK}</code> become the designed layout
                    </>
                  ) : linkMarker ? (
                    <>
                      <code className="font-mono text-slate-500">{CONCEPT_LINK}</code> becomes 👉 the concept link
                    </>
                  ) : (
                    "The concept link is added below the message"
                  )}
                </span>
                <span className="tabular-nums">
                  {body.replace(CONCEPT_LINK, "").trim().split(/\s+/).filter(Boolean).length} words · signature added
                </span>
              </span>
            </label>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-200 animate-fade-in">
            <div className="space-y-0.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
              <p>
                <span className="inline-block w-14">To</span>
                <span className="text-slate-800">{prospect.email}</span>
              </p>
              <p>
                <span className="inline-block w-14">Subject</span>
                <span className="font-medium text-slate-800">{titleCase(subject)}</span>
              </p>
              {attachPdf || files.length ? (
                <p className="flex items-center">
                  <span className="inline-block w-14">Files</span>
                  <span className="flex flex-wrap gap-1.5 text-slate-700">
                    {attachPdf ? <Badge tone="slate"><IconPaperclip size={11} /> {prospect.company} - FlowMint proposal.pdf</Badge> : null}
                    {files.map((file) => (
                      <Badge key={file.name} tone="slate"><IconPaperclip size={11} /> {file.name}</Badge>
                    ))}
                  </span>
                </p>
              ) : null}
            </div>
            <iframe
              title="Email preview"
              srcDoc={preview.replace("<body style=\"margin:0;padding:0;\">", "<body style=\"margin:0;padding:18px 20px;\">")}
              sandbox=""
              className="h-110 w-full bg-white"
            />
          </div>
        )}

        {canEdit && template && !templateUrl ? (
          <Notice tone="warn">Add the template site link on the Without PPT overview. The button in this email needs it.</Notice>
        ) : null}
        {canEdit ? (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3.5">
            {template ? null : (
              <>
            <Toggle
              checked={includeDemo}
              onChange={setIncludeDemo}
              disabled={!live}
              label="Include concept link and PDF link"
              hint={
                live
                  ? proposal!.demoUrl.replace(/^https:\/\//, "")
                  : proposal
                    ? "Publish the concept first."
                    : "Build the concept first."
              }
            />
            <Toggle
              checked={attachPdf}
              onChange={setAttachPdf}
              disabled={!proposal?.hasPdf}
              label="Attach proposal PDF"
              hint={proposal?.hasPdf ? "Attachments on a first email can lower inbox placement." : "Build the proposal first."}
            />
              </>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[13px] text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300">
                <IconPaperclip size={13} />
                Add files
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => setFiles((list) => [...list, ...Array.from(event.target.files ?? [])].slice(0, 7))}
                />
              </label>
              {files.map((file, index) => (
                <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                  {file.name}
                  <button type="button" onClick={() => setFiles((list) => list.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>
                    <IconX size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {canEdit && !template && linkMarker && !includeDemo ? (
          <Notice tone="warn">
            The concept link is switched off, so the {CONCEPT_LINK} line will be dropped. Check that the sentence before it
            still reads well, or switch the link on.
          </Notice>
        ) : null}
        {canEdit && !mailReady ? <Notice tone="warn">Add the Hostinger mailbox in .env to send.</Notice> : null}

        {canEdit ? (
          confirming ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-white animate-fade-in">
              <p className="flex items-center gap-2 text-[13px]">
                <IconAlert size={15} className="text-amber-300" />
                Send to <span className="font-medium">{prospect.email}</span>
                {attachPdf ? " with the PDF attached" : ""}?
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" className="bg-mint-500 text-ink hover:bg-mint-400" onClick={send} icon={<IconSend size={13} />}>
                  Yes, send
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setView(view === "edit" ? "preview" : "edit")}>
                  {view === "edit" ? "Preview email" : "Back to edit"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={rewrite}
                  loading={pending === "rewrite"}
                  disabled={pending !== null}
                  icon={<IconSparkles size={13} />}
                >
                  {pending === "rewrite" ? "Rewriting…" : "Rewrite"}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button onClick={save} loading={pending === "save"} disabled={pending !== null || !dirty}>
                  {pending === "save" ? "Saving…" : "Save draft"}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setConfirming(true)}
                  loading={pending === "send"}
                  disabled={pending !== null || !mailReady || !subject.trim() || !body.trim()}
                  icon={<IconSend size={15} />}
                >
                  {pending === "send" ? "Sending…" : "Approve and send"}
                </Button>
              </div>
            </div>
          )
        ) : null}
      </div>
    </Card>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <label className={cx("flex items-start gap-3", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
          checked && !disabled ? "bg-mint-600" : "bg-slate-300",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform",
            checked && !disabled && "translate-x-4",
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-slate-800">{label}</span>
        {hint ? <span className="block truncate text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}
