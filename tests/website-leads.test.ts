import { describe, expect, test } from 'vitest';
import { parseFormSubmitEmail } from '@/lib/connectors/website-leads';

/**
 * Fixture bodies below reproduce the exact `| Field | Value |` shape and
 * field names confirmed against real FormSubmit.co notification emails
 * (2026-08-14) for both of AAC's live forms — with synthetic names/contact
 * info standing in for real customer data, which never belongs in this repo.
 */

const BOOKING_FORM_BODY = ` Easy form endpoints for your HTML forms

Someone just submitted your form on https://book.ariseaboveconstruction.com/.

Here's what they had to say:

| Name | Value |
|---|---|

| Full Name | Jane Doe |

| Phone | 3135550100 |

| Email | jane.doe@example.com |

| Project Type | 203K Rehab |

| Project Address | 123 Example St, Detroit, Michigan |

| Timeline | ASAP – within 30 days |

| Budget Range | $100,000+ |

| Priority | — |

| How Found AAC | Referred by a friend or family |

Submitted at Tue, Aug 11, 2026 2:40 PM (UTC)

[Sponsor](https://formsubmit.co/sponsor)

Your friends from,
[*FormSubmit Team*](https://formsubmit.co)`;

const CONTACT_FORM_BODY = ` Easy form endpoints for your HTML forms

Someone just submitted your form on https://ariseaboveconstruction.com/.

Here's what they had to say:

| Name | Value |
|---|---|

| firstName | John |

| lastName | Smith |

| phone | 2485550199 |

| email | john.smith@example.com |

| projectAddress | 456 Sample Ave |

| serviceType | kitchen |

| description | Looking to remodel a kitchen, roughly 200 sq ft. |

| heardAbout | google-search |

| contactMethod | email |

Submitted at Thu, Aug 13, 2026 7:27 PM (UTC)

Your friends from,
[*FormSubmit Team*](https://formsubmit.co)`;

const NAME_ONLY_BODY = ` Someone just submitted your form on https://ariseaboveconstruction.com/.

| Name | Value |
|---|---|

| firstName | Ghost |

| lastName | Submission |

| description | no way to reach them |

Submitted at Thu, Aug 13, 2026 8:00 PM (UTC)`;

describe('parseFormSubmitEmail', () => {
  test('parses the book.ariseaboveconstruction.com estimate form', () => {
    const lead = parseFormSubmitEmail({
      id: 'inbox-1-101',
      from: 'submissions@formsubmit.co',
      subject: 'New Estimate Request — Jane Doe — 203K Rehab',
      text: BOOKING_FORM_BODY,
      receivedAt: '2026-08-11T14:40:32Z',
    });
    expect(lead).toEqual({
      id: 'inbox-1-101',
      name: 'Jane Doe',
      phone: '3135550100',
      email: 'jane.doe@example.com',
      projectType: '203K Rehab',
      address: '123 Example St, Detroit, Michigan',
      timeline: 'ASAP – within 30 days',
      budget: '$100,000+',
      howFound: 'Referred by a friend or family',
      description: null,
      formSite: 'book.ariseaboveconstruction.com',
      receivedAt: '2026-08-11T14:40:32Z',
    });
  });

  test('parses the main-site contact form (different field names)', () => {
    const lead = parseFormSubmitEmail({
      id: 'inbox-1-102',
      from: 'submissions@formsubmit.co',
      subject: 'New Estimate Request — Arise Above Construction',
      text: CONTACT_FORM_BODY,
      receivedAt: '2026-08-13T19:27:25Z',
    });
    expect(lead?.name).toBe('John Smith');
    expect(lead?.phone).toBe('2485550199');
    expect(lead?.email).toBe('john.smith@example.com');
    expect(lead?.projectType).toBe('kitchen');
    expect(lead?.address).toBe('456 Sample Ave');
    expect(lead?.howFound).toBe('google-search');
    expect(lead?.description).toBe('Looking to remodel a kitchen, roughly 200 sq ft.');
    expect(lead?.formSite).toBe('ariseaboveconstruction.com');
  });

  test('the "—" placeholder for an unanswered field is dropped, not kept as a value', () => {
    const lead = parseFormSubmitEmail({
      id: 'inbox-1-101',
      from: 'submissions@formsubmit.co',
      subject: 'x',
      text: BOOKING_FORM_BODY,
      receivedAt: '2026-08-11T14:40:32Z',
    });
    expect(lead?.timeline).not.toBe('—');
  });

  test('not a FormSubmit email at all — returns null', () => {
    const lead = parseFormSubmitEmail({
      id: 'inbox-1-999',
      from: 'someone@gmail.com',
      subject: 'Hey Sean',
      text: 'Just a regular email, no table here.',
      receivedAt: '2026-08-11T14:40:32Z',
    });
    expect(lead).toBeNull();
  });

  test('a submission with a name but no phone or email is not reachable — dropped', () => {
    const lead = parseFormSubmitEmail({
      id: 'inbox-1-103',
      from: 'submissions@formsubmit.co',
      subject: 'x',
      text: NAME_ONLY_BODY,
      receivedAt: '2026-08-13T20:00:00Z',
    });
    expect(lead).toBeNull();
  });

  test('a vendor-pitch submission still parses if it has real contact info — filtering that out is a human/agent judgment call, not this parser\'s job', () => {
    const pitchBody = `Someone just submitted your form on https://ariseaboveconstruction.com/.

| Name | Value |
|---|---|

| firstName | Pitch |

| lastName | Sender |

| phone | 3025551234 |

| email | pitch@example.com |

| description | I offer estimation services for contractors... |

Submitted at Thu, Aug 13, 2026 7:27 PM (UTC)`;
    const lead = parseFormSubmitEmail({
      id: 'inbox-1-104',
      from: 'submissions@formsubmit.co',
      subject: 'x',
      text: pitchBody,
      receivedAt: '2026-08-13T19:27:25Z',
    });
    expect(lead).not.toBeNull();
    expect(lead?.name).toBe('Pitch Sender');
  });
});
