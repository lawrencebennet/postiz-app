'use client';

// Client credentials in the portal: password login (/portal/login), the forced change after a temporary
// password (/portal/password) and the account page (/portal/account). Rules and numbers:
// neptive/docs/client-credentials.md. All requests go through useFetch, so the session cookie (or the
// neptive-portal header in NOT_SECURED dev) is handled exactly as for the other portal calls.
import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useNeptivePortalMe } from '@gitroom/frontend/components/neptive/neptive.hooks';
import { NeptiveAuthShell } from '@gitroom/frontend/components/neptive/brand/auth-shell';
import { NeptiveBadge, formatWhen } from '@gitroom/frontend/components/neptive/neptive.ui';

const MIN_LENGTH = 10;

const PASSWORD_ERRORS: Record<string, string> = {
  PASSWORD_TOO_SHORT: `La password deve avere almeno ${MIN_LENGTH} caratteri.`,
  PASSWORD_TOO_LONG: 'La password è troppo lunga: al massimo 72 caratteri (meno se usi lettere accentate).',
  PASSWORD_IS_EMAIL: 'Non usare la tua email come password.',
  PASSWORD_TOO_COMMON: 'È una password troppo facile da indovinare. Scegline un’altra.',
  PASSWORD_SAME_AS_CURRENT: 'È uguale alla password attuale: scegline una nuova.',
  CURRENT_PASSWORD_WRONG: 'La password attuale non è corretta.',
};

const minutes = (seconds?: number) => {
  const value = Math.max(1, Math.ceil((seconds || 60) / 60));
  return value === 1 ? '1 minuto' : `${value} minuti`;
};

async function readBody(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

const ErrorBox = ({ children }: { children: ReactNode }) => (
  <div
    role="alert"
    className="mt-[18px] rounded-[var(--nx-r)] border border-[color:var(--nx-bad)] bg-[var(--nx-bad-bg)] px-[14px] py-[11px] text-[14px] leading-[1.45] text-[var(--nx-bad)]"
  >
    {children}
  </div>
);

const Field = ({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) => (
  <label className="flex flex-col gap-[8px] min-w-0">
    <span className="flex items-center justify-between gap-[8px]">
      <span className="nx-label">{label}</span>
      {aside}
    </span>
    {children}
  </label>
);

const PasswordInput = ({
  value,
  onChange,
  autoComplete,
  name,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  name: string;
  invalid?: boolean;
}) => (
  <input
    className="nx-input"
    type="password"
    name={name}
    autoComplete={autoComplete}
    value={value}
    aria-invalid={invalid || undefined}
    onChange={(event) => onChange(event.target.value)}
  />
);

// ------------------------------------------------------------------ /portal/login

export const PortalLogin = () => {
  const fetch = useFetch();
  const router = useRouter();
  const { data: me } = useNeptivePortalMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ account: string; label: string }>>([]);

  // already signed in on this device (magic link or password): straight in
  useEffect(() => {
    if (me) {
      router.replace(me.passwordChangeRequired ? '/portal/password' : '/portal');
    }
  }, [me, router]);

  const submit = useCallback(
    async (account?: string) => {
      setError('');
      if (!email.trim() || !password) {
        setError('Inserisci email e password.');
        return;
      }
      setBusy(true);
      try {
        const response = await fetch('/neptive/portal-auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password, ...(account ? { account } : {}) }),
        });
        const body = await readBody(response);
        if (response.ok && body.chooseAccount) {
          setAccounts(body.chooseAccount);
          setBusy(false);
          return;
        }
        if (response.ok) {
          window.location.href = body.passwordChangeRequired ? '/portal/password' : '/portal';
          return;
        }
        setAccounts([]);
        if (response.status === 401) {
          setError('Email o password non corretti.');
        } else if (response.status === 429) {
          setError(
            `Troppi tentativi non riusciti. Per sicurezza l’accesso con password è sospeso: riprova tra ${minutes(body.retryAfter)}, oppure chiedi a Neptive un link di accesso.`
          );
        } else if (response.status === 403) {
          setError('Accesso non riuscito. Ricarica la pagina e riprova.');
        } else {
          setError('Accesso non riuscito. Riprova tra qualche istante.');
        }
      } catch {
        setError('Il server non risponde. Controlla la connessione e riprova.');
      }
      setBusy(false);
    },
    [fetch, email, password]
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  return (
    <NeptiveAuthShell
      eyebrow="[ Portale clienti ]"
      tag="[ Portale clienti ]"
      title={
        <>
          Il tuo
          <br />
          portale.
        </>
      }
      intro="Il piano editoriale, le anteprime dei post e le approvazioni, in un unico posto."
    >
      {accounts.length ? (
        <div className="flex-1 flex flex-col">
          <h2 className="nx-heading text-[30px] md:text-[34px]">Quale spazio apri?</h2>
          <p className="mt-[12px] text-[15px] leading-[1.5] text-[var(--nx-text-muted)]">
            Con questa email e questa password hai accesso a più aziende. Scegli quella da aprire.
          </p>
          <ul className="mt-[22px] flex flex-col gap-[8px]">
            {accounts.map((row) => (
              <li key={row.account}>
                <button
                  type="button"
                  className="nx-btn w-full !justify-between"
                  disabled={busy}
                  onClick={() => submit(row.account)}
                >
                  <span className="truncate">{row.label}</span>
                  <span className="nx-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-[16px] nx-label nx-link self-start hover:!text-[var(--nx-text)]"
            onClick={() => {
              setAccounts([]);
              setPassword('');
            }}
          >
            ← Torna indietro
          </button>
        </div>
      ) : (
        <form className="flex-1 flex flex-col" onSubmit={onSubmit} noValidate>
          <div className="flex items-baseline justify-between gap-[12px]">
            <h2 className="nx-heading text-[30px] md:text-[34px]">Accedi</h2>
            <span className="nx-label">[ Cliente ]</span>
          </div>
          <p className="mt-[8px] text-[14px] leading-[1.45] text-[var(--nx-text-muted)]">
            Entra con la tua email e la tua password.
          </p>
          <div className="mt-[24px] flex flex-col gap-[16px]">
            <Field label="Email">
              <input
                className="nx-input"
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                placeholder="nome@azienda.it"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Password">
              <PasswordInput name="password" autoComplete="current-password" value={password} onChange={setPassword} invalid={!!error} />
            </Field>
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button type="submit" data-variant="primary" className="nx-btn mt-[24px] w-full" disabled={busy}>
            {busy ? 'Accesso in corso…' : 'Accedi'}
            {!busy && (
              <span className="nx-arrow" aria-hidden="true">
                ↗
              </span>
            )}
          </button>
          <div className="mt-[22px] pt-[16px] nx-rule flex flex-col gap-[6px] text-[14px] leading-[1.45] text-[var(--nx-text-muted)]">
            <p>
              Non hai ancora una password, o l’hai dimenticata?{' '}
              <a className="nx-link text-[var(--nx-text)]" href="mailto:info@neptive.com?subject=Link%20di%20accesso%20al%20portale">
                Chiedi a Neptive un link di accesso
              </a>
              .
            </p>
            <p className="nx-label">Dal link potrai poi impostare la tua password.</p>
          </div>
        </form>
      )}
    </NeptiveAuthShell>
  );
};

// ------------------------------------------------------------------ shared password form

const PasswordForm = ({
  email,
  needsCurrent,
  submitLabel,
  onDone,
}: {
  email?: string;
  needsCurrent: boolean;
  submitLabel: string;
  onDone: () => void;
}) => {
  const fetch = useFetch();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (needsCurrent && !current) {
      setError('Inserisci la password attuale.');
      return;
    }
    if ([...next].length < MIN_LENGTH) {
      setError(PASSWORD_ERRORS.PASSWORD_TOO_SHORT);
      return;
    }
    if (email && next.trim().toLowerCase() === email.toLowerCase()) {
      setError(PASSWORD_ERRORS.PASSWORD_IS_EMAIL);
      return;
    }
    if (next !== repeat) {
      setError('Le due password non coincidono.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/neptive/portal/account/password', {
        method: 'POST',
        body: JSON.stringify({ ...(needsCurrent ? { currentPassword: current } : {}), newPassword: next }),
      });
      const body = await readBody(response);
      if (response.ok) {
        setCurrent('');
        setNext('');
        setRepeat('');
        onDone();
        setBusy(false);
        return;
      }
      const code = typeof body.message === 'string' ? body.message : '';
      if (response.status === 429) {
        setError(`Troppi tentativi con la password attuale sbagliata. Riprova tra ${minutes(body.retryAfter)}.`);
      } else if (PASSWORD_ERRORS[code]) {
        setError(PASSWORD_ERRORS[code]);
      } else {
        setError('Non è stato possibile salvare la password. Riprova.');
      }
    } catch {
      setError('Il server non risponde. Controlla la connessione e riprova.');
    }
    setBusy(false);
  };

  return (
    <form className="flex flex-col" onSubmit={onSubmit} noValidate>
      {/* lets password managers attach the new password to the right account */}
      {email && <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />}
      <div className="flex flex-col gap-[16px]">
        {needsCurrent && (
          <Field label="Password attuale">
            <PasswordInput name="current-password" autoComplete="current-password" value={current} onChange={setCurrent} />
          </Field>
        )}
        <Field label="Nuova password" aside={<span className="nx-label">min. {MIN_LENGTH} caratteri</span>}>
          <PasswordInput name="new-password" autoComplete="new-password" value={next} onChange={setNext} />
        </Field>
        <Field label="Ripeti la nuova password">
          <PasswordInput name="repeat-password" autoComplete="new-password" value={repeat} onChange={setRepeat} />
        </Field>
      </div>
      <p className="mt-[12px] text-[13px] leading-[1.45] text-[var(--nx-text-muted)]">
        Usa almeno {MIN_LENGTH} caratteri, non la tua email né parole ovvie. Una frase breve va benissimo.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <button type="submit" data-variant="primary" className="nx-btn mt-[20px] w-full" disabled={busy}>
        {busy ? 'Salvataggio…' : submitLabel}
      </button>
    </form>
  );
};

// ------------------------------------------------------------------ /portal/password (forced)

export const PortalForcedPassword = () => {
  const router = useRouter();
  const { data: me, mutate } = useNeptivePortalMe();
  const logout = usePortalLogout();
  useEffect(() => {
    if (me && !me.passwordChangeRequired) {
      router.replace('/portal');
    }
  }, [me, router]);

  return (
    <NeptiveAuthShell
      eyebrow="[ Primo accesso ]"
      tag="[ Portale clienti ]"
      title={
        <>
          La tua
          <br />
          password.
        </>
      }
      intro="Hai usato una password temporanea. Prima di continuare scegline una tua: la conoscerai solo tu."
    >
      <div className="flex-1 flex flex-col min-w-0">
        <h2 className="nx-heading text-[30px] md:text-[34px]">Scegli la tua password</h2>
        <p className="mt-[10px] mb-[22px] text-[14px] leading-[1.45] text-[var(--nx-text-muted)]">
          {me?.email ? (
            <>
              Per <span className="text-[var(--nx-text)]">{me.email}</span>. La password temporanea smetterà di funzionare.
            </>
          ) : (
            'La password temporanea smetterà di funzionare.'
          )}
        </p>
        <PasswordForm
          email={me?.email}
          needsCurrent={false}
          submitLabel="Salva e continua"
          onDone={async () => {
            await mutate();
            window.location.href = '/portal';
          }}
        />
        <button
          type="button"
          className="mt-[16px] nx-label nx-link self-start hover:!text-[var(--nx-text)]"
          onClick={logout}
        >
          Esci
        </button>
      </div>
    </NeptiveAuthShell>
  );
};

// ------------------------------------------------------------------ /portal/logout (shared by the shell)

export const usePortalLogout = () => {
  const fetch = useFetch();
  return useCallback(async () => {
    try {
      await fetch('/neptive/portal-auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch {}
    document.cookie = 'neptive_portal=; path=/; max-age=-1';
    window.location.href = '/portal/login';
  }, [fetch]);
};

// ------------------------------------------------------------------ /portal/account

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="py-[12px] grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-[4px] sm:gap-[16px] border-b border-[var(--nx-line)] last:border-b-0">
    <span className="nx-label">{label}</span>
    <span className="text-[15px] break-words min-w-0">{children}</span>
  </div>
);

export const PortalAccount = ({ header }: { header: ReactNode }) => {
  const { data: me, mutate } = useNeptivePortalMe();
  const logout = usePortalLogout();
  const [saved, setSaved] = useState('');

  const passwordLine = !me
    ? ''
    : me.passwordTemporary
    ? 'Stai usando una password temporanea data da Neptive: sostituiscila con una tua.'
    : me.hasPassword
    ? me.passwordUpdatedAt
      ? `Ultima modifica ${formatWhen(me.passwordUpdatedAt)}.`
      : 'Puoi entrare con email e password.'
    : 'Non hai ancora una password: oggi entri solo con il link. Impostane una per entrare quando vuoi con email e password.';

  return (
    <div className="flex flex-col gap-[16px] md:gap-[20px]">
      {header}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[16px] md:gap-[20px] items-start">
        <section className="nx-card p-[18px] md:p-[28px] min-w-0">
          <h2 className="nx-heading text-[22px] md:text-[26px]">Profilo</h2>
          <div className="mt-[12px]">
            <Row label="Nome">{me?.name || '—'}</Row>
            <Row label="Email">{me?.email || '—'}</Row>
            <Row label="Password">
              <span className="flex flex-col gap-[8px] items-start">
                <NeptiveBadge tone={me?.hasPassword && !me?.passwordTemporary ? 'good' : 'warn'}>
                  {me?.passwordTemporary ? 'Temporanea' : me?.hasPassword ? 'Impostata' : 'Non impostata'}
                </NeptiveBadge>
                <span className="text-[14px] leading-[1.45] text-[var(--nx-text-muted)]">{passwordLine}</span>
              </span>
            </Row>
          </div>
          <div className="mt-[22px] pt-[18px] nx-rule flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[12px]">
            <p className="text-[14px] leading-[1.45] text-[var(--nx-text-muted)]">Chiudi la sessione su questo dispositivo.</p>
            <button type="button" className="nx-btn" onClick={logout}>
              Esci
            </button>
          </div>
        </section>
        <section className="nx-card p-[18px] md:p-[28px] min-w-0">
          <h2 className="nx-heading text-[22px] md:text-[26px]">
            {me?.hasPassword ? 'Cambia la password' : 'Imposta una password'}
          </h2>
          <p className="mt-[8px] mb-[20px] text-[14px] leading-[1.45] text-[var(--nx-text-muted)]">
            {me?.hasPassword
              ? 'Dopo il cambio resti collegato qui; sugli altri dispositivi dovrai accedere di nuovo.'
              : 'Da quel momento potrai accedere da /portal/login con la tua email. I link di Neptive continueranno a funzionare.'}
          </p>
          {saved && (
            <div role="status" className="mb-[16px] rounded-[var(--nx-r)] bg-[var(--nx-good-bg)] px-[14px] py-[11px] text-[14px] text-[var(--nx-good)]">
              {saved}
            </div>
          )}
          {me && (
            <PasswordForm
              key={me.hasPassword ? 'change' : 'set'}
              email={me.email}
              needsCurrent={!!me.hasPassword}
              submitLabel={me.hasPassword ? 'Cambia la password' : 'Imposta la password'}
              onDone={async () => {
                setSaved(me.hasPassword ? 'Password cambiata. Gli altri dispositivi sono stati disconnessi.' : 'Password impostata. Da ora puoi accedere con email e password.');
                await mutate();
              }}
            />
          )}
        </section>
      </div>
      <p className="nx-label">
        Password dimenticata? Chiedi a Neptive un link di accesso:{' '}
        <Link className="nx-link hover:!text-[var(--nx-text)]" href="mailto:info@neptive.com">
          info@neptive.com
        </Link>
      </p>
    </div>
  );
};
