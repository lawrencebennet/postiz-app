import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { brandText, neptiveEmail } from './brand';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';

// Renders every email the backend sends through the real EmailService.sendEmailSync path (with a capturing
// provider instead of Resend/SES/SMTP: nothing is sent) and writes them to neptive/dev/.data/emails/*.html
// for review. Subjects and bodies are the ones of the upstream and Neptive callers named in `from`.
const EMAILS: Array<{ file: string; from: string; subject: string; html: string }> = [
  {
    file: 'activate-account',
    from: 'apps/backend/src/services/auth/auth.service.ts (register, resendActivationEmail)',
    subject: 'Activate your account',
    html: 'Click <a href="http://localhost:4200/auth/activate/TOKEN">here</a> to activate your account',
  },
  {
    file: 'reset-password',
    from: 'apps/backend/src/services/auth/auth.service.ts (forgot)',
    subject: 'Reset your password',
    html: 'You have requested to reset your password. <br />Click <a href="http://localhost:4200/auth/forgot/TOKEN">here</a> to reset your password<br />The link will expire in 20 minutes',
  },
  {
    file: 'login-changed',
    from: 'libraries/nestjs-libraries/src/database/prisma/users/users.service.ts',
    subject: 'Your Postiz login was changed',
    html: 'An administrator changed the login for your Postiz account. You can now sign in using a@b.c. Your subscription and plan were not changed by this switch.',
  },
  {
    file: 'team-invite',
    from: 'libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts',
    subject: 'Lorenzo invited you to join "Neptive"',
    html: 'Lorenzo (admin@neptive.com) has invited you to join the "Neptive" team.<br /><a href="http://localhost:4200/?org=X">Accept the invitation</a> to get started.<br />The link will expire in 2 days.',
  },
  {
    file: 'subscription-cancel',
    from: 'apps/backend/src/api/routes/billing.controller.ts',
    subject: 'Your Postiz subscription is set to cancel',
    html: 'Your subscription will end on 1 Jan 2027 (UTC), the end of your current billing cycle. Until then you can keep using Postiz as usual. Read more at https://postiz.com/pricing',
  },
  {
    file: 'notification',
    from: 'libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts',
    subject: 'Post published',
    html: 'Your post was published on Instagram: <a href="https://instagram.com/p/x">open it</a>',
  },
  {
    file: 'portal-magic-link',
    from: 'libraries/nestjs-libraries/src/neptive/services/client.service.ts',
    subject: 'Il tuo accesso al portale clienti Neptive',
    html: 'Da qui trovi il piano editoriale, le anteprime dei post e le approvazioni che ti chiediamo.<br /><br /><a href="http://localhost:4200/portal/magic/TOKEN">Apri il portale clienti</a><br /><br />Il link è personale, vale una sola volta e scade tra 30 giorni.',
  },
];

describe('Neptive brand: text', () => {
  it('replaces user-visible brand words and links, never identifiers', () => {
    expect(brandText('Logout from Postiz')).toBe('Logout from Neptive');
    expect(brandText('Can I trust Gitroom?')).toBe('Can I trust Neptive?');
    expect(brandText('see https://docs.postiz.com/public-api for details')).toBe('see https://neptive.com for details');
    for (const id of ['x-postiz-org', 'POSTIZ_API_KEY', '@postiz/wallets', 'postiz://auth/callback', 'PostizAdapter']) {
      expect(brandText(id)).toBe(id);
    }
  });
});

describe('Neptive brand: emails', () => {
  const out = join(__dirname, '../../../../../neptive/dev/.data/emails');
  const sent: Array<{ subject: string; html: string; fromName: string }> = [];
  const service = new EmailService({} as any);
  service.emailService = {
    name: 'capture',
    validateEnvKeys: [],
    sendEmail: async (_to: string, subject: string, html: string, fromName: string) => {
      sent.push({ subject, html, fromName });
      return { ok: true };
    },
  } as any;

  beforeAll(() => {
    process.env.EMAIL_FROM_ADDRESS = 'noreply@neptive.local';
    process.env.EMAIL_FROM_NAME = 'Postiz';
    process.env.FRONTEND_URL = 'http://localhost:4200';
    mkdirSync(out, { recursive: true });
  });

  it.each(EMAILS)('$file goes out branded', async (email) => {
    sent.length = 0;
    await service.sendEmailSync('client@example.com', email.subject, email.html);
    expect(sent).toHaveLength(1);
    const [mail] = sent;
    writeFileSync(join(out, `${email.file}.html`), mail.html);
    writeFileSync(join(out, `${email.file}.meta.txt`), `from: ${mail.fromName}\nsubject: ${mail.subject}\nsource: ${email.from}\n`);
    expect(`${mail.subject} ${mail.fromName} ${mail.html}`).not.toMatch(/postiz|gitroom/i);
    expect(mail.html).toContain('Neptive');
  });

  it('keeps the layout when called directly', () => {
    const { html, subject } = neptiveEmail({ subject: 'Ciao', html: '<p>x</p>' });
    expect(subject).toBe('Ciao');
    expect(html).toContain('<p>x</p>');
  });
});
