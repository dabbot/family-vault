import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/unsubscribe')({
  component: UnsubscribePage,
})

type State = 'loading' | 'valid' | 'done' | 'invalid' | 'already' | 'error'

function UnsubscribePage() {
  const [state, setState] = useState<State>('loading')
  const [email, setEmail] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    if (!t) { setState('invalid'); return }
    setToken(t)
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) { setState('invalid'); return }
        if (j.already_unsubscribed) { setState('already'); setEmail(j.email ?? null); return }
        setEmail(j.email ?? null)
        setState('valid')
      })
      .catch(() => setState('error'))
  }, [])

  const confirm = async () => {
    if (!token) return
    setState('loading')
    const r = await fetch('/email/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    setState(r.ok ? 'done' : 'error')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground mb-2">Email preferences</h1>
        {state === 'loading' && <p className="text-muted-foreground">Loading…</p>}
        {state === 'invalid' && <p className="text-muted-foreground">This unsubscribe link is invalid or expired.</p>}
        {state === 'error' && <p className="text-destructive">Something went wrong. Please try again.</p>}
        {state === 'already' && <p className="text-muted-foreground">{email ?? 'You'} is already unsubscribed.</p>}
        {state === 'valid' && (
          <>
            <p className="text-muted-foreground mb-6">
              Unsubscribe {email ?? 'this address'} from Family Vault emails?
            </p>
            <button
              onClick={confirm}
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90"
            >
              Confirm unsubscribe
            </button>
          </>
        )}
        {state === 'done' && <p className="text-foreground">You've been unsubscribed.</p>}
      </div>
    </main>
  )
}
