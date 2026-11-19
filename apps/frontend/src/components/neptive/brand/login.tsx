'use client';

// Neptive sign-in form. Swapped in (next config resolveAlias) for '@gitroom/frontend/components/auth/login'.
// Same request and the same outcomes as the upstream form (POST /auth/login; a 400 shows the error or the
// "not activated" notice; on success the backend answers with the `reload` header and layout.context
// redirects), without the sign-up pitch and without third-party buttons that are not configured: generic
// OAuth, Apple and Farcaster appear only when their settings exist. The brand check warns when the
// upstream login.tsx changes, so a new upstream login feature (2FA, captcha...) is not missed.
import { useForm, SubmitHandler, FormProvider } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { OauthProvider } from '@gitroom/frontend/components/auth/providers/oauth.provider';
import { AppleProvider } from '@gitroom/frontend/components/auth/providers/apple.provider';
import { FarcasterProvider } from '@gitroom/frontend/components/auth/providers/farcaster.provider';
import { useVariables } from '@gitroom/react/helpers/variable.context';

type Inputs = {
  email: string;
  password: string;
  providerToken: '';
  provider: 'LOCAL';
};

const ERRORS: Record<string, string> = {
  'Invalid user name or password': 'Email o password non corretti.',
  'User not found': 'Email o password non corretti.',
};

export function Login() {
  const [loading, setLoading] = useState(false);
  const [notActivated, setNotActivated] = useState(false);
  const [error, setError] = useState('');
  const { isGeneral, neynarClientId, appleClientId, genericOauth } = useVariables();
  const resolver = useMemo(() => classValidatorResolver(LoginUserDto), []);
  const form = useForm<Inputs>({
    resolver,
    defaultValues: { providerToken: '', provider: 'LOCAL' },
  });
  const fetchData = useFetch();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    setNotActivated(false);
    setError('');
    try {
      const login = await fetchData('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ ...data, provider: 'LOCAL' }),
      });
      if (login.status === 400) {
        const message = await login.text();
        if (message === 'User is not activated') {
          setNotActivated(true);
        } else {
          setError(ERRORS[message] || message || 'Accesso non riuscito. Riprova.');
        }
        setLoading(false);
      } else if (!login.ok) {
        setError('Accesso non riuscito. Riprova tra qualche istante.');
        setLoading(false);
      }
    } catch {
      setError('Il server non risponde. Controlla la connessione e riprova.');
      setLoading(false);
    }
  };

  const fieldError = (name: 'email' | 'password') =>
    form.formState.errors[name]
      ? name === 'email'
        ? 'Inserisci un indirizzo email valido.'
        : 'Inserisci la password.'
      : '';

  const providers = [
    isGeneral && genericOauth ? <OauthProvider key="oauth" /> : null,
    appleClientId ? <AppleProvider key="apple" /> : null,
    neynarClientId ? <FarcasterProvider key="farcaster" /> : null,
  ].filter(Boolean);

  return (
    <FormProvider {...form}>
      <form className="flex-1 flex flex-col" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="flex items-baseline justify-between gap-[12px]">
          <h2 className="nx-heading text-[30px] md:text-[34px]">Accedi</h2>
          <span className="nx-label">[ 01 ]</span>
        </div>
        <p className="mt-[8px] text-[14px] leading-[1.45] text-[var(--nx-text-muted)]">
          Area di lavoro del team Neptive. I clienti entrano dal link personale ricevuto via email.
        </p>

        <div className="mt-[26px] flex flex-col gap-[16px]">
          <label className="flex flex-col gap-[8px]">
            <span className="nx-label">Email</span>
            <input
              className="nx-input"
              type="email"
              autoComplete="username"
              inputMode="email"
              placeholder="nome@neptive.com"
              aria-invalid={!!fieldError('email')}
              {...form.register('email')}
            />
            {fieldError('email') && <span className="text-[13px] text-[var(--nx-bad)]">{fieldError('email')}</span>}
          </label>
          <label className="flex flex-col gap-[8px]">
            <span className="flex items-center justify-between gap-[8px]">
              <span className="nx-label">Password</span>
              <Link href="/auth/forgot" className="nx-label nx-link hover:!text-[var(--nx-text)]">
                Password dimenticata?
              </Link>
            </span>
            <input
              className="nx-input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!fieldError('password')}
              {...form.register('password')}
            />
            {fieldError('password') && (
              <span className="text-[13px] text-[var(--nx-bad)]">{fieldError('password')}</span>
            )}
          </label>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-[18px] rounded-[var(--nx-r)] border border-[color:var(--nx-bad)] bg-[var(--nx-bad-bg)] px-[14px] py-[11px] text-[14px] text-[var(--nx-bad)]"
          >
            {error}
          </div>
        )}
        {notActivated && (
          <div
            role="alert"
            className="mt-[18px] rounded-[var(--nx-r)] bg-[var(--nx-warn-bg)] px-[14px] py-[11px] text-[14px] text-[var(--nx-warn)]"
          >
            L’account non è ancora attivo: controlla l’email con il link di attivazione.{' '}
            <Link href="/auth/activate" className="nx-link">
              Invia di nuovo il link
            </Link>
          </div>
        )}

        <button type="submit" data-variant="primary" className="nx-btn mt-[24px] w-full" disabled={loading}>
          {loading ? 'Accesso in corso…' : 'Accedi'}
          {!loading && <span className="nx-arrow" aria-hidden="true">↗</span>}
        </button>

        {providers.length > 0 && (
          <div className="mt-[22px] flex flex-col gap-[12px]">
            <div className="flex items-center gap-[12px] nx-label">
              <span className="h-px flex-1 bg-[var(--nx-line)]" />
              oppure
              <span className="h-px flex-1 bg-[var(--nx-line)]" />
            </div>
            <div className="flex gap-[8px]">{providers}</div>
          </div>
        )}
      </form>
    </FormProvider>
  );
}
