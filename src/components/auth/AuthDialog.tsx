import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import { authErrorMessage, emailProblem, passwordProblem, type AuthMode } from '../../lib/auth';
import '../../styles/auth.css';

type Props = {
  open: boolean; user: User | null; busy: boolean; onClose: () => void;
  onGoogle: () => Promise<void>; onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name?: string) => Promise<void>;
  onReset: (email: string) => Promise<void>; onResend: () => Promise<void>;
  onRefresh: () => Promise<User | null>; onLogout: () => Promise<void>;
};

export function AuthDialog({ open, user, busy, onClose, onGoogle, onSignIn, onSignUp, onReset, onResend, onRefresh, onLogout }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [name, setName] = useState('');
  const [show, setShow] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [cooldown, setCooldown] = useState(0);
  useEffect(() => { const el=dialog.current; if(open&&!el?.open)el?.showModal(); if(!open&&el?.open)el.close(); }, [open]);
  useEffect(() => { if (!cooldown) return; const id=window.setInterval(()=>setCooldown(v=>Math.max(0,v-1)),1000); return()=>window.clearInterval(id); }, [cooldown]);
  const run = async (action: () => Promise<void>) => { setError(''); setNotice(''); try { await action(); } catch (e) { setError(authErrorMessage(e)); } };
  const submit = (event: FormEvent) => { event.preventDefault(); const ep=emailProblem(email); if(ep){setError(ep);return;} if(mode==='reset'){void run(async()=>{await onReset(email.trim());setNotice('If an account exists for this email, we’ve sent password reset instructions.');});return;} const pp=passwordProblem(password); if(pp){setError(pp);return;} if(mode==='signup'&&password!==confirm){setError('Passwords do not match.');return;} void run(()=>mode==='signup'?onSignUp(email.trim(),password,name.trim()||undefined):onSignIn(email.trim(),password)); };
  const resend = () => void run(async()=>{await onResend();setCooldown(45);setNotice('Verification email sent. Check your inbox and junk folder.');});
  const verified = user?.emailVerified;
  return <dialog ref={dialog} className="auth-dialog" aria-labelledby="auth-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}>
    <div className="auth-shell">
      <button className="auth-close" type="button" aria-label="Close sign in" onClick={onClose}><X size={20}/></button>
      {user && !verified ? <section className="auth-verify">
        <span className="auth-mark"><Mail size={26}/></span><p className="auth-kicker">One quick check</p><h2 id="auth-title">Verify your email.</h2>
        <p>We sent a verification link to <strong>{user.email}</strong>. Verify your email before claiming an organization.</p>
        {error?<p className="auth-error" role="alert">{error}</p>:null}{notice?<p className="auth-notice" role="status">{notice}</p>:null}
        <button className="auth-primary" type="button" disabled={busy} onClick={()=>void run(async()=>{const refreshed=await onRefresh();if(refreshed?.emailVerified)onClose();else setNotice('We haven’t seen the verification yet. Open the link in your email, then check again.');})}>{busy?'Checking…':'I’ve verified — check again'}</button>
        <button className="auth-secondary" type="button" disabled={busy||cooldown>0} onClick={resend}>{cooldown?`Resend in ${cooldown}s`:'Resend verification email'}</button>
        <button className="auth-link" type="button" onClick={()=>void onLogout()}>Use a different account</button>
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
        <div className="auth-switch">{mode==='signin'?<><button type="button" onClick={()=>{setMode('reset');setError('');setNotice('');}}>Forgot password?</button><button type="button" onClick={()=>{setMode('signup');setError('');}}>Create an account</button></>:<button type="button" onClick={()=>{setMode('signin');setError('');setNotice('');}}>Back to sign in</button>}</div>
        <p className="auth-trust"><ShieldCheck size={15}/> Your account is protected by Firebase Authentication. CalgaryWatch never stores your password.</p>
      </section>}
    </div>
  </dialog>;
}
