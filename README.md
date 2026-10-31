# Outreach desk

Private desk for cold email. Upload an Apollo export, review each homepage, build a concept page and a PDF proposal, approve a draft, and send it from a Hostinger business mailbox.

## Setup

```bash
cp .env.example .env
npm install
npx playwright install chromium
npm run db:push
npm run dev
```

Open http://localhost:3010 and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Hostinger

Cold mail uses its own mailbox, separate from any website-enquiry alerts:

- SMTP `smtp.hostinger.com` port `465`
- IMAP `imap.hostinger.com` port `993`
- `OUTREACH_SMTP_USER` is the full address, and `OUTREACH_SMTP_PASSWORD` is that mailbox password

Nothing is sent until you click Approve and send. Every draft includes an opt-out line.

## Prepare

Prepare takes the next five people who are imported, a fit, reviewed, or drafted without a concept. For each one it:

1. classifies against the prompt in `src/lib/fit-prompt.ts`
2. screenshots and reviews the homepage (sites that block automated browsers move to Rejected)
3. builds a concept homepage and a PDF proposal (drawbacks, improvements, expected results)
4. drafts the email

At the end of the batch it publishes the concept pages to Netlify. It stops before send.

## Concept site

Concepts use the hand-built template at `https://<NETLIFY_SITE>.netlify.app`, personalised with `?for=<key>`, for example `?for=bodycurious`.

- Hand-written practices live in `js/practices.js`. The desk never edits that file.
- Generated practices go in `js/leads.js`, which merges them into `PRACTICES`. The desk adds one `<script src="js/leads.js">` tag to `index.html`, after `practices.js`.
- PDF proposals are published at `/proposals/<key>.pdf`.
- Before every build and publish, the desk pulls the live template into `storage/site/` and checks each file against Netlify's SHA1. Template changes you deploy yourself are kept.
- Keys never reuse one from `practices.js`. Fields the lead's site doesn't list stay as `[Phone]`-style placeholders, as in the template, and the lead page warns about them.

Rebuild one lead from the lead page, or from the shell:

```bash
node --env-file=.env --import tsx scripts/build-proposal.ts <prospectId>
```

## Sending

The review screen shows the email exactly as it will arrive: the message, the concept and PDF links, and the FlowMint signature. Attaching the PDF is a per-email switch and off by default, since attachments on a first email can lower inbox placement. Each sent email is copied into the Hostinger Sent folder. If that copy fails, the desk says so instead of hiding it.

## Follow-ups

Nothing is sent automatically. The Follow-ups page lists, for each step, the leads who are still marked Sent (no reply) and are due: follow-up 1 a set number of days after the first email (3 by default), and follow-up 2 a set number of days after the first email (7 by default) and only once follow-up 1 has gone out.

- Press "Send follow-up N" to send that step to everyone on its list. The desk syncs the mailbox first, so anyone who replied drops off, then sends one at a time in the background. You can leave the page, or press Stop.
- Each follow-up goes out as a reply in the same thread (`Re:` subject, `In-Reply-To` and `References` headers), with the signature and opt-out line.
- A failed send stays on the list, so sending again retries it. After 3 failures in a row the batch stops, since that usually means a mailbox problem.
- The days and text for each step are set on the same page. `{firstName}` and `{company}` are filled in per lead.
