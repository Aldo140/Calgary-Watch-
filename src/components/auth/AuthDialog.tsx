import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import { authCode, authErrorMessage, emailProblem, passwordProblem, type AuthMode, type AuthRequest } from '../../lib/auth';
import '../../styles/auth.css';

type Props = {
  open: boolean; request: AuthRequest; user: User | null; busy: boolean; onClose: () => void;
  onGoogle: () => Promise<void>; onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name?: string) => Promise<void>;
  onReset: (email: string) => Promise<void>; onResend: () => Promise<void>;
  onRefresh: () => Promise<User | null>; onLogout: () => Promise<void>;
};

export function AuthDialog({ open, request, user, busy, onClose, onGoogle, onSignIn, onSignUp, onReset, onResend, onRefresh, onLogout }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [name, setName] = useState('');
  const [show, setShow] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [cooldown, setCooldown] = useState(0);
  useEffect(() => { const el=dialog.current; if(open&&!el?.open)el?.showModal(); if(!open&&el?.open)el.close(); }, [open]);
  // Each opening starts on the form the page asked for, with any email it already knows.
  useEffect(() => { if (!open) return; setMode(request.mode ?? 'signin'); setEmail(e => request.email?.trim() || e); setPassword(''); setConfirm(''); setError(''); setNotice(''); }, [open, request]);
  const verified = user?.emailVerified;
  // People verify in their mail app, then come back: check again as soon as this tab is in view.
  useEffect(() => {
    if (!open || !user || verified) return;
    const check = () => { if (document.visibilityState === 'visible') void onRefresh().then(r => { if (r?.emailVerified) onClose(); }).catch(() => {}); };
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [open, user, verified, onRefresh, onClose]);
  useEffect(() => { if (!cooldown) return; const id=window.setInterval(()=>setCooldown(v=>Math.max(0,v-1)),1000); return()=>window.clearInterval(id); }, [cooldown]);
  const switchMode = (next: AuthMode) => { setMode(next); setError(''); setNotice(''); setPassword(''); setConfirm(''); };
  const run = async (action: () => Promise<void>) => { setError(''); setNotice(''); try { await action(); } catch (e) {
    // Signing up with an email that already has an account: send them to sign in, email kept.
    if (mode === 'signup' && authCode(e) === 'auth/email-already-in-use') { switchMode('signin'); setNotice('You already have a CalgaryWatch account with this email. Sign in below, or use Google if that’s how you joined.'); return; }
    setError(authErrorMessage(e));
  } };
  const submit = (event: FormEvent) => { event.preventDefault(); const ep=emailProblem(email); if(ep){setError(ep);return;} if(mode==='reset'){void run(async()=>{await onReset(email.trim());setNotice('If an account exists for this email, we’ve sent password reset instructions.');});return;} const pp=passwordProblem(password); if(pp){setError(pp);return;} if(mode==='signup'&&password!==confirm){setError('Passwords do not match.');return;} void run(()=>mode==='signup'?onSignUp(email.trim(),password,name.trim()||undefined):onSignIn(email.trim(),password)); };
  const resend = () => void run(async()=>{await onResend();setCooldown(45);setNotice('Verification email sent. Check your inbox and junk folder.');});
  return <dialog ref={dialog} className="auth-dialog" aria-labelledby="auth-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}>
    <div className="auth-shell">
      <button className="auth-close" type="button" aria-label="Close sign in" onClick={onClose}><X size={20}/></button>
      {user && !verified ? <section className="auth-verify">
        <span className="auth-mark"><Mail size={26}/></span><p className="auth-kicker">One quick check</p><h2 id="auth-title">Verify your email.</h2>
        <p>We sent a link to <strong>{user.email}</strong>. Open it and this page updates by itself. Verifying lets you claim an organization, apply to markets and share listings.</p>
        <p className="auth-hint">Not there? It comes from CalgaryWatch (noreply), so check junk or promotions.</p>
        {error?<p className="auth-error" role="alert">{error}</p>:null}{notice?<p className="auth-notice" role="status">{notice}</p>:null}
        <button className="auth-primary" type="button" disabled={busy} onClick={()=>void run(async()=>{const refreshed=await onRefresh();if(refreshed?.emailVerified)onClose();else setNotice('We haven’t seen the verification yet. Open the link in your email, then check again.');})}>{busy?'Checking…':'I’ve verified — check again'}</button>
        <button className="auth-secondary" type="button" disabled={busy||cooldown>0} onClick={resend}>{cooldown?`Resend in ${cooldown}s`:'Resend verification email'}</button>
        <div className="auth-switch"><button type="button" onClick={onClose}>Keep browsing for now</button><button type="button" onClick={()=>void onLogout()}>Use a different account</button></div>
      </section> : <section>
        <p className="auth-kicker">CalgaryWatch account</p><h2 id="auth-title">{mode==='signup'?'Create your account.':mode==='reset'?'Reset your password.':'Welcome back.'}</h2>
        <p className="auth-intro">{mode==='reset'?'Enter your email and we’ll send reset instructions.':'Save plans, manage your preferences and securely claim your organization.'}</p>
        {mode!=='reset'?<><button className="auth-google" type="button" disabled={busy} onClick={()=>void run(onGoogle)}><span aria-hidden="true">G</span>Continue with Google</button><div className="auth-or"><span>or</span></div></>:null}
        <form onSubmit={submit} noValidate>
          {mode==='signup'?<label>Display name <small>Optional</small><input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} /></label>:null}
          <label>Email address<input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>
          {mode!=='reset'?<label>Password <span className="auth-password"><input type={show?'text':'password'} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} /><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?'Hide password':'Show password'}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></span>{mode==='signup'?<small>At least 6 characters</small>:null}</label>:null}
          {mode==='signup'?<label>Confirm password<input type={show?'text':'password'} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} /></label>:null}
          {error?<p className="auth-error" role="alert">{error}</p>:null}{notice?<p className="auth-notice" role="status">{notice}</p>:null}
          <button className="auth-primary" type="submit" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='reset'?'Send reset instructions':'Sign in with email'}</button>
        </form>
        <div className="auth-switch">{mode==='signin'?<><button type="button" onClick={()=>switchMode('reset')}>Forgot password?</button><button type="button" onClick={()=>switchMode('signup')}>Create an account</button></>:<button type="button" onClick={()=>switchMode('signin')}>{mode==='signup'?'I already have an account':'Back to sign in'}</button>}</div>
        <p className="auth-trust"><ShieldCheck size={15}/> Your account is protected by Firebase Authentication. CalgaryWatch never stores your password.</p>
      </section>}
    </div>
  </dialog>;
}
