import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Eye, EyeOff, Mail, ShieldCheck, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import { authCode, authErrorMessage, emailProblem, inboxLink, nameProblem, passwordProblem, readLastSignIn, suggestEmail, type AuthMode, type AuthRequest, type LastSignIn } from '../../lib/auth';
import '../../styles/auth.css';

type Props = {
  open: boolean; request: AuthRequest; user: User | null; busy: boolean; onClose: () => void;
  onGoogle: () => Promise<void>; onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name: string) => Promise<void>;
  onReset: (email: string) => Promise<void>; onResend: () => Promise<void>;
  onRefresh: () => Promise<User | null>; onLogout: () => Promise<void>;
};

const TITLES: Record<AuthMode, string> = { signin: 'Welcome back.', signup: 'Create your free account.', reset: 'Reset your password.' };
const INTRO = 'Save plans, pick your emails and claim your organization. Free, and no spam.';

/** Google's four-colour G, so the button reads as Google at a glance. */
function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>;
}

export function AuthDialog({ open, request, user, busy, onClose, onGoogle, onSignIn, onSignUp, onReset, onResend, onRefresh, onLogout }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [show, setShow] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [cooldown, setCooldown] = useState(0);
  const [last, setLast] = useState<LastSignIn | null>(null);
  useEffect(() => { const el=dialog.current; if(open&&!el?.open)el?.showModal(); if(!open&&el?.open)el.close(); }, [open]);
  // Each opening starts on the form the page asked for. Without one, people this
  // browser has seen before get "sign in" with their email; newcomers get "create".
  useEffect(() => {
    if (!open) return;
    const remembered = readLastSignIn(); setLast(remembered);
    setMode(request.mode ?? (remembered ? 'signin' : 'signup'));
    setEmail(e => request.email?.trim() || e || (remembered?.method === 'email' ? remembered.email ?? '' : ''));
    setName(n => request.name?.trim() || n);
    setPassword(''); setError(''); setNotice('');
  }, [open, request]);
  const verified = user?.emailVerified;
  // People verify in their mail app, then come back: check again as soon as this tab is in view.
  useEffect(() => {
    if (!open || !user || verified) return;
    const check = () => { if (document.visibilityState === 'visible') void onRefresh().then(r => { if (r?.emailVerified) onClose(); }).catch(() => {}); };
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [open, user, verified, onRefresh, onClose]);
  useEffect(() => { if (!cooldown) return; const id=window.setInterval(()=>setCooldown(v=>Math.max(0,v-1)),1000); return()=>window.clearInterval(id); }, [cooldown]);

  const switchMode = (next: AuthMode) => { setMode(next); setError(''); setNotice(''); setPassword(''); };
  const run = async (action: () => Promise<void>) => { setError(''); setNotice(''); try { await action(); } catch (e) {
    // Signing up with an email that already has an account: send them to sign in, email kept.
    if (mode === 'signup' && authCode(e) === 'auth/email-already-in-use') { switchMode('signin'); setNotice('You already have a CalgaryWatch account with this email. Sign in below, or use Google if that’s how you joined.'); return; }
    setError(authErrorMessage(e));
  } };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'signup') { const np = nameProblem(name); if (np) { setError(np); return; } }
    const ep = emailProblem(email); if (ep) { setError(ep); return; }
    if (mode === 'reset') { void run(async () => { await onReset(email.trim()); setNotice('If an account exists for this email, we’ve sent reset instructions. The link brings you back here.'); }); return; }
    const pp = passwordProblem(password); if (pp) { setError(pp); return; }
    void run(() => mode === 'signup' ? onSignUp(email.trim(), password, name.trim()) : onSignIn(email.trim(), password));
  };
  const resend = () => void run(async()=>{await onResend();setCooldown(45);setNotice('Verification email sent. Check your inbox and junk folder.');});
  const typo = suggestEmail(email);
  const inbox = user?.email ? inboxLink(user.email) : null;
  const title = mode !== 'reset' && request.title ? request.title : TITLES[mode];
  const intro = mode === 'reset' ? 'Enter your email and we’ll send a link to choose a new password.' : request.intro || INTRO;

  return <dialog ref={dialog} className="auth-dialog" aria-labelledby="auth-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}>
    <div className="auth-shell">
      <button className="auth-close" type="button" aria-label="Close sign in" onClick={onClose}><X size={20}/></button>
      {user && !verified ? <section className="auth-verify">
        <span className="auth-mark"><Mail size={26}/></span><p className="auth-kicker">Last step</p><h2 id="auth-title">Check your inbox.</h2>
        <p>We sent a link to <strong>{user.email}</strong>. Tap it and this page updates by itself. Verifying lets you claim an organization, apply to markets and share listings.</p>
        <p className="auth-hint">Not there in a minute? It comes from CalgaryWatch (noreply), so check junk or promotions.</p>
        {error?<p className="auth-error" role="alert">{error}</p>:null}{notice?<p className="auth-notice" role="status">{notice}</p>:null}
        {inbox ? <a className="auth-primary" href={inbox.href} target="_blank" rel="noreferrer">{inbox.label} <ArrowUpRight size={17} aria-hidden="true"/></a> : null}
        <button className={inbox?'auth-secondary':'auth-primary'} type="button" disabled={busy} onClick={()=>void run(async()=>{const refreshed=await onRefresh();if(refreshed?.emailVerified)onClose();else setNotice('We haven’t seen the verification yet. Open the link in your email, then check again.');})}>{busy?'Checking…':'I’ve verified — check again'}</button>
        <button className="auth-secondary" type="button" disabled={busy||cooldown>0} onClick={resend}>{cooldown?`Resend in ${cooldown}s`:'Resend verification email'}</button>
        <div className="auth-switch"><button type="button" onClick={onClose}>Keep browsing for now</button><button type="button" onClick={()=>void onLogout()}>Use a different account</button></div>
      </section> : <section>
        <p className="auth-kicker">CalgaryWatch account</p><h2 id="auth-title">{title}</h2>
        <p className="auth-intro">{intro}</p>
        {mode!=='reset'?<>
          <button className="auth-google" type="button" disabled={busy} onClick={()=>void run(onGoogle)}><GoogleMark/>Continue with Google{last?.method==='google'?<span className="auth-last">Last used</span>:null}</button>
          <div className="auth-or"><span>or use email</span></div>
        </>:null}
        <form onSubmit={submit} noValidate>
          {mode==='signup'?<label>Your name<input autoComplete="name" autoCapitalize="words" enterKeyHint="next" value={name} onChange={e=>setName(e.target.value)} /></label>:null}
          <label>Email address {last?.method==='email'&&mode==='signin'&&email===last.email?<span className="auth-last">Last used</span>:null}<input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} /></label>
          {typo?<p className="auth-typo">Did you mean <button type="button" onClick={()=>setEmail(typo)}>{typo}</button>?</p>:null}
          {mode!=='reset'?<label>Password <span className="auth-password"><input type={show?'text':'password'} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} /><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?'Hide password':'Show password'}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></span>{mode==='signup'?<small>At least 6 characters. Tap the eye to check it.</small>:null}</label>:null}
          {error?<p className="auth-error" role="alert">{error}{mode==='signin'&&authCodeIsCredential(error)?<> <button type="button" className="auth-inline" onClick={()=>switchMode('reset')}>Reset it now</button></>:null}</p>:null}
          {notice?<p className="auth-notice" role="status">{notice}</p>:null}
          <button className="auth-primary" type="submit" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create free account':mode==='reset'?'Send reset link':'Sign in'}</button>
        </form>
        <div className="auth-switch">{mode==='signin'?<><button type="button" onClick={()=>switchMode('reset')}>Forgot password?</button><button type="button" onClick={()=>switchMode('signup')}>New here? Create an account</button></>:<button type="button" onClick={()=>switchMode('signin')}>{mode==='signup'?'I already have an account':'Back to sign in'}</button>}</div>
        <p className="auth-trust"><ShieldCheck size={15}/> Protected by Firebase Authentication. CalgaryWatch never sees or stores your password.</p>
      </section>}
    </div>
  </dialog>;
}

/** The wrong-password message offers a one-tap reset right where the error is. */
function authCodeIsCredential(message: string): boolean {
  return message === authErrorMessage(Object.assign(new Error(), { code: 'auth/invalid-credential' }));
}
