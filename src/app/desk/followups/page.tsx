import { FollowUpHistory, FollowUpQueues, FollowUpSettingsCard, type FollowUpView } from "@/components/follow-ups";
import { PageHeader } from "@/components/ui";
import { followUpJob, followUpQueues, followUpSettings } from "@/lib/followups";
import { mailReady } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const settings = await followUpSettings();
  const [queues, recent] = await Promise.all([
    followUpQueues(settings),
    prisma.followUp.findMany({
      orderBy: { updatedAt: "desc" },
      include: { prospect: { select: { id: true, company: true, name: true, email: true } } },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mailbox"
        title="Follow-ups"
        description="Nothing goes out on its own. Each list shows the leads who haven't replied and are due. When you press send, the desk checks for replies first, then works through the list in the background."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <FollowUpQueues queues={queues} initialJob={followUpJob()} mailReady={mailReady()} />
        <FollowUpSettingsCard initial={settings.steps} />
      </div>
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-slate-900">Recent follow-ups</h2>
        <FollowUpHistory
          showLead
          empty="No follow-ups have gone out yet."
          items={recent.map(
            (row): FollowUpView => ({
              id: row.id,
              step: row.step,
              subject: row.subject,
              body: row.body,
              status: row.status as FollowUpView["status"],
              sentAt: row.sentAt?.toISOString() ?? null,
              error: row.error,
              updatedAt: row.updatedAt.toISOString(),
              prospect: row.prospect,
            }),
          )}
        />
      </section>
    </div>
  );
}
