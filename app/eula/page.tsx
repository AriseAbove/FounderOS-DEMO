import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'End User License Agreement — Founder OS · Arise Above Construction' };

const UPDATED = 'August 12, 2026';

export default function EulaPage() {
  return (
    <div className="max-w-[760px]">
      <PageHeader eyebrow={`last updated ${UPDATED}`} title="End User License Agreement" />
      <div className="space-y-5 text-[13.5px] leading-relaxed text-os-muted">
        <p>
          This End User License Agreement (&quot;Agreement&quot;) governs use of Founder OS (&quot;the
          App&quot;), an internal operating dashboard developed for and operated by Arise Above Construction
          (&quot;AAC&quot;). The App is for use by AAC&apos;s owner and authorized staff only, and is not
          distributed or licensed to the general public.
        </p>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-os-text">License</h2>
          <p>
            AAC grants its authorized users a limited, non-exclusive, non-transferable right to access and use
            the App solely for AAC&apos;s internal business operations. No other rights are granted.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-os-text">Third-party connections</h2>
          <p>
            The App may connect to third-party services on AAC&apos;s behalf, including QuickBooks Online, to
            display AAC&apos;s own business data inside a single dashboard. Use of each connected service remains
            subject to that provider&apos;s own terms. See the{' '}
            <a className="text-os-accent underline" href="/privacy">
              Privacy Policy
            </a>{' '}
            for what data is accessed and how it is used.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-os-text">No warranty</h2>
          <p>
            The App is provided &quot;as is,&quot; without warranty of any kind. AAC does not guarantee
            uninterrupted or error-free operation, and figures shown are only as accurate as the connected
            source systems.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-os-text">Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, AAC shall not be liable for any indirect, incidental, or
            consequential damages arising from use of the App.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-os-text">Contact</h2>
          <p>
            <a className="text-os-accent underline" href="mailto:sean@ariseaboveconstruction.com">
              sean@ariseaboveconstruction.com
            </a>{' '}
            · (248) 717-1417 · Arise Above Construction, 440 Burroughs St, Suite #125, Detroit, MI 48202.
          </p>
        </section>
      </div>
    </div>
  );
}
