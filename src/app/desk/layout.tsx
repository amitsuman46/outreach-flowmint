import { DeskShell } from "@/components/desk-shell";
import { aiReady } from "@/lib/ai";
import { mailReady } from "@/lib/mail";
import { deskCounts } from "@/lib/present";
import { demoBaseUrl, netlifyReady } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const counts = await deskCounts();
  return (
    <DeskShell
      counts={counts}
      readiness={{
        ai: aiReady(),
        mail: mailReady(),
        netlify: netlifyReady(),
        netlifyUrl: demoBaseUrl(),
      }}
    >
      {children}
    </DeskShell>
  );
}
