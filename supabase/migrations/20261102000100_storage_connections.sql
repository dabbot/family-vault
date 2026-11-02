-- The family's linked cloud storage (Dropbox or Google Drive).
--
-- One active connection per vault. Tokens are encrypted by the server before they are
-- stored (TOKEN_ENCRYPTION_KEY) and this table is readable only by the service role.

CREATE TABLE public.storage_connections (
    id smallint DEFAULT 1 NOT NULL,
    provider text NOT NULL,
    account_label text,
    refresh_token_enc text NOT NULL,
    access_token_enc text,
    access_expires_at timestamp with time zone,
    -- Google Drive: id of the app's root folder. Dropbox uses its app folder.
    root_folder_id text,
    -- Where incremental sync left off (Dropbox list cursor / Drive changes page token).
    cursor text,
    last_synced_at timestamp with time zone,
    last_error text,
    connected_by uuid,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT storage_connections_pkey PRIMARY KEY (id),
    CONSTRAINT storage_connections_singleton CHECK ((id = 1)),
    CONSTRAINT storage_connections_provider_check CHECK ((provider = ANY (ARRAY['dropbox'::text, 'google_drive'::text])))
);

CREATE TRIGGER storage_connections_updated_at BEFORE UPDATE ON public.storage_connections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON TABLE public.storage_connections FROM anon, authenticated;
GRANT ALL ON TABLE public.storage_connections TO service_role;
ALTER TABLE public.storage_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages storage connection" ON public.storage_connections
    FOR ALL TO service_role USING (true) WITH CHECK (true);
