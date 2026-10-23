import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FlowMintMark } from "@/components/icons";
import { LoginForm } from "@/components/login-form";
import { COOKIE_NAME, verifySession } from "@/lib/auth-token";

export default async function LoginPage() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token && (await verifySession(token))) redirect("/desk");

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-40 -right-40 size-[560px] rounded-full bg-[radial-gradient(circle,rgba(43,179,163,0.35),transparent_68%)]" />
        <div className="relative flex items-center gap-2.5">
          <FlowMintMark size={30} />
          <span className="text-lg font-semibold tracking-tight">FlowMint</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">
            Every lead gets a concept, a proposal, and a note worth reading.
          </h2>
          <ul className="mt-8 space-y-3 text-[15px] text-slate-300">
            {["Apollo list in, fit check out", "A concept homepage on Netlify for each lead", "A PDF on drawbacks, fixes and results", "You approve every email before it leaves"].map(
              (line) => (
                <li key={line} className="flex items-center gap-3">
                  <span className="size-1.5 rounded-full bg-mint-400" />
                  {line}
                </li>
              ),
            )}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Private desk · flowmint.works</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="flex items-center gap-2.5 lg:hidden">
            <FlowMintMark size={28} />
            <span className="font-semibold">FlowMint</span>
          </div>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900 lg:mt-0">Sign in to the outreach desk</h1>
          <p className="mt-1.5 text-sm text-slate-500">Use the admin email and password from .env.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
