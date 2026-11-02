-- Unsubscribe bookkeeping for reminder and digest emails. Server (service role) only.
CREATE TABLE public.email_unsubscribe_tokens (
  email text PRIMARY KEY CHECK (email = lower(email)),
  token text NOT NULL UNIQUE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.suppressed_emails (
  email text PRIMARY KEY CHECK (email = lower(email)),
  reason text NOT NULL DEFAULT 'unsubscribe',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_unsubscribe_tokens, public.suppressed_emails FROM anon, authenticated;
GRANT ALL ON public.email_unsubscribe_tokens, public.suppressed_emails TO service_role;
