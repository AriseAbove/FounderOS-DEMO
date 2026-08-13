import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Privacy Policy — Founder OS · Arise Above Construction' };

const UPDATED = 'August 12, 2026';

export default function PrivacyPage() {
  return (
    <div className="max-w-[760px]">
      <PageHeader eyebrow={`last updated ${UPDATED}`} title="Privacy Policy" />
      <div className="space-y-5 text-[13.5px] leading-relaxed text-os-muted">
        <p>
          Founder OS is an internal operating dashboard built for Arise Above Construction
          (&quot;AAC,&quot; &quot;we,&quot; &quot;us&quot;). It is used by AAC&apos;s owner and staff to view the
          company&apos;s own business data — leads, jobs, communications, and finances — pulled from the tools AAC
          already uses. It is not a public product and does not collect data from, or about, the general public.
        </p>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-os-text">What data we access</h2>
          <p>
            When AAC connects a third-party account (for example QuickBooks Online) to Founder OS, the app reads
            data from that account on AAC&apos;s behalf, using credentials AAC authorizes directly with the
            provider. For QuickBooks Online specifically, this includes company information and accounting data
            such as invoices, payments received, and purchase transactions, used to display AAC&apos;s income,
            expenses, and outstanding invoices inside the app.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-os-text">How we use it</h2>
          <p>
            Data pulled from connected accounts is used only to render it back to AAC&apos;s own staff inside
            Founder OS. We do not sell, rent, or share this data with third parties, and we do not use it for
            advertising. Access tokens are stored to keep a connection authorized between visits and are never
            written to source control or shared outside the application&apos;s own database.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-os-text">Data retention &amp; deletion</h2>
          <p>
            Connected-account data is cached only as needed to render the dashboard and is not retained beyond
            what the app needs to function. Disconnecting an integration (for example, QuickBooks, from the
            Connections page) revokes the stored authorization and deletes the locally stored tokens.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-os-text">Security</h2>
          <p>
            The application runs over HTTPS. Credentials and tokens are stored server-side and are never exposed
            to the browser or logged in plaintext.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-os-text">Contact</h2>
          <p>
            Questions about this policy can be sent to{' '}
            <a className="text-os-accent underline" href="mailto:sean@ariseaboveconstruction.com">
              sean@ariseaboveconstruction.com
            </a>{' '}
            or (248) 717-1417. Arise Above Construction, 440 Burroughs St, Suite #125, Detroit, MI 48202.
          </p>
        </section>
      </div>
    </div>
  );
}
