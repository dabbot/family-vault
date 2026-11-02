-- Family Vault: complete database schema.
--
-- Family members and shared folders are rows in public.family_members, added by the
-- admin in the app. The first person to sign up becomes the admin; after that only
-- the email addresses listed in family_members can sign up.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.9
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'member'
);


--
-- Name: enforce_family_allowlist(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_family_allowlist() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- The first person to sign up becomes the admin and sets up the family.
  IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
    RETURN NEW;
  END IF;
  IF NEW.email IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.email = lower(NEW.email)
  ) THEN
    RAISE EXCEPTION 'Access denied: % is not an authorized family member.', NEW.email
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  user_count int;
  alias_part text;
BEGIN
  SELECT count(*) INTO user_count FROM public.profiles;
  alias_part := lower(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    '[^a-z0-9]+', '', 'g'
  ));
  IF alias_part = '' THEN alias_part := 'member'; END IF;

  INSERT INTO public.profiles (id, full_name, avatar_url, inbound_alias)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    alias_part || '.' || substr(NEW.id::text, 1, 6)
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN user_count = 0 THEN 'admin'::app_role ELSE 'member'::app_role END);

  RETURN NEW;
END $$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;


--
-- Name: is_family_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_family_member(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.family_members fm ON fm.email = lower(u.email)
    WHERE u.id = _user_id
  ) OR public.has_role(_user_id, 'admin'::app_role);
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    icon text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    citations jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: document_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    view_count integer DEFAULT 0 NOT NULL,
    last_viewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    version_no integer NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    category_id uuid,
    title text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    size_bytes bigint,
    doc_type text,
    doc_number text,
    issuer text,
    issue_date date,
    expiry_date date,
    notes text,
    is_favorite boolean DEFAULT false NOT NULL,
    source text DEFAULT 'web'::text NOT NULL,
    ai_processed boolean DEFAULT false NOT NULL,
    ai_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    member_name text,
    deleted_at timestamp with time zone,
    ocr_text text,
    snoozed_until date,
    needs_review boolean DEFAULT false NOT NULL,
    is_private boolean DEFAULT false NOT NULL,
    family_slot text NOT NULL,
    folder_id uuid,
    remote_file_id text
);

ALTER TABLE ONLY public.documents REPLICA IDENTITY FULL;



--
-- Name: family_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_members (
    slug text NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'person'::text NOT NULL,
    email text,
    sort_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT family_members_slug_format CHECK ((slug ~ '^[a-z0-9][a-z0-9_-]{0,39}$'::text)),
    CONSTRAINT family_members_kind_check CHECK ((kind = ANY (ARRAY['person'::text, 'shared'::text]))),
    CONSTRAINT family_members_email_lower CHECK (((email IS NULL) OR (email = lower(email)))),
    CONSTRAINT family_members_person_email CHECK (((kind = 'shared'::text) OR (email IS NOT NULL)))
);


--
-- Name: family_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    title text,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: family_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_settings (
    id boolean DEFAULT true NOT NULL,
    family_alias text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT family_alias_format CHECK ((family_alias ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'::text)),
    CONSTRAINT family_settings_id_check CHECK (id)
);


--
-- Name: folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_slot text NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_oauth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_oauth_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    google_email text,
    refresh_token text NOT NULL,
    access_token text,
    expires_at timestamp with time zone,
    scope text,
    calendar_id text DEFAULT 'primary'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inbound_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbound_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alias text,
    matched_owner uuid,
    document_id uuid,
    status text DEFAULT 'received'::text NOT NULL,
    raw_payload jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: insurance_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    policy_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    paid_on date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date NOT NULL,
    previous_due_date date,
    next_due_date date,
    amount numeric,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: insurance_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    family_slot text,
    member_name text,
    policy_name text NOT NULL,
    policy_number text,
    provider text,
    policy_type text,
    premium_amount numeric(12,2),
    premium_frequency text,
    premium_due_date date,
    sum_assured numeric(14,2),
    maturity_date date,
    maturity_amount numeric(14,2),
    start_date date,
    notes text,
    source_document_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    maturity_received_at timestamp with time zone,
    maturity_note text
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    avatar_url text,
    inbound_alias text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    inbound_from_emails text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    fires_at date NOT NULL,
    kind text NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: synced_calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.synced_calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_kind text NOT NULL,
    source_id uuid NOT NULL,
    event_date date NOT NULL,
    google_event_id text NOT NULL,
    calendar_id text DEFAULT 'primary'::text NOT NULL,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT synced_calendar_events_source_kind_check CHECK ((source_kind = ANY (ARRAY['doc_expiry'::text, 'policy_premium'::text, 'policy_maturity'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: document_shares document_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_shares
    ADD CONSTRAINT document_shares_pkey PRIMARY KEY (id);


--
-- Name: document_shares document_shares_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_shares
    ADD CONSTRAINT document_shares_token_key UNIQUE (token);


--
-- Name: document_versions document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);



--
-- Name: family_members family_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_pkey PRIMARY KEY (slug);

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_email_key UNIQUE (email);


--
-- Name: family_notes family_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_notes
    ADD CONSTRAINT family_notes_pkey PRIMARY KEY (id);


--
-- Name: family_settings family_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_settings
    ADD CONSTRAINT family_settings_pkey PRIMARY KEY (id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: google_oauth_tokens google_oauth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_oauth_tokens
    ADD CONSTRAINT google_oauth_tokens_pkey PRIMARY KEY (id);


--
-- Name: google_oauth_tokens google_oauth_tokens_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_oauth_tokens
    ADD CONSTRAINT google_oauth_tokens_user_id_key UNIQUE (user_id);


--
-- Name: inbound_events inbound_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_events
    ADD CONSTRAINT inbound_events_pkey PRIMARY KEY (id);


--
-- Name: insurance_payments insurance_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_payments
    ADD CONSTRAINT insurance_payments_pkey PRIMARY KEY (id);


--
-- Name: insurance_policies insurance_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_inbound_alias_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_inbound_alias_key UNIQUE (inbound_alias);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: synced_calendar_events synced_calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_calendar_events
    ADD CONSTRAINT synced_calendar_events_pkey PRIMARY KEY (id);


--
-- Name: synced_calendar_events synced_calendar_events_user_id_source_kind_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_calendar_events
    ADD CONSTRAINT synced_calendar_events_user_id_source_kind_source_id_key UNIQUE (user_id, source_kind, source_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: chat_messages_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_user_created_idx ON public.chat_messages USING btree (user_id, created_at);


--
-- Name: document_shares_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_shares_doc_idx ON public.document_shares USING btree (document_id);


--
-- Name: document_shares_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_shares_token_idx ON public.document_shares USING btree (token);


--
-- Name: document_versions_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_versions_doc_idx ON public.document_versions USING btree (document_id, version_no DESC);


--
-- Name: documents_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_deleted_at_idx ON public.documents USING btree (deleted_at);


--
-- Name: documents_remote_file_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX documents_remote_file_id_key ON public.documents USING btree (remote_file_id) WHERE (remote_file_id IS NOT NULL);


--
-- Name: documents_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_expiry_idx ON public.documents USING btree (expiry_date) WHERE (expiry_date IS NOT NULL);


--
-- Name: documents_family_slot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_family_slot_idx ON public.documents USING btree (family_slot);


--
-- Name: documents_folder_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_folder_id_idx ON public.documents USING btree (folder_id);


--
-- Name: documents_needs_review_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_needs_review_idx ON public.documents USING btree (owner_id, needs_review) WHERE (deleted_at IS NULL);


--
-- Name: documents_ocr_text_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_ocr_text_trgm ON public.documents USING gin (ocr_text extensions.gin_trgm_ops);


--
-- Name: documents_owner_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_owner_created_idx ON public.documents USING btree (owner_id, created_at DESC);


--
-- Name: documents_owner_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_owner_deleted_idx ON public.documents USING btree (owner_id, deleted_at);


--
-- Name: documents_owner_favorite_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_owner_favorite_idx ON public.documents USING btree (owner_id, is_favorite) WHERE (is_favorite = true);


--
-- Name: family_notes_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX family_notes_created_at_idx ON public.family_notes USING btree (created_at DESC);


--
-- Name: idx_insurance_policies_maturity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_policies_maturity ON public.insurance_policies USING btree (maturity_date);


--
-- Name: idx_insurance_policies_premium_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_policies_premium_due ON public.insurance_policies USING btree (premium_due_date);


--
-- Name: idx_insurance_policies_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_policies_slot ON public.insurance_policies USING btree (family_slot);


--
-- Name: idx_synced_calendar_events_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_synced_calendar_events_user ON public.synced_calendar_events USING btree (user_id);


--
-- Name: insurance_payments_policy_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insurance_payments_policy_id_idx ON public.insurance_payments USING btree (policy_id, paid_on DESC);


--
-- Name: reminders_fires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_fires_idx ON public.reminders USING btree (fires_at) WHERE (sent_at IS NULL);


--
-- Name: family_notes family_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_notes_updated_at BEFORE UPDATE ON public.family_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: family_settings family_settings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_settings_set_updated_at BEFORE UPDATE ON public.family_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: folders folders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: google_oauth_tokens set_google_oauth_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_google_oauth_tokens_updated_at BEFORE UPDATE ON public.google_oauth_tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: synced_calendar_events set_synced_calendar_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_synced_calendar_events_updated_at BEFORE UPDATE ON public.synced_calendar_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: documents trg_documents_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles trg_profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: insurance_policies update_insurance_policies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_insurance_policies_updated_at BEFORE UPDATE ON public.insurance_policies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: document_shares document_shares_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_shares
    ADD CONSTRAINT document_shares_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_versions document_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: documents documents_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: documents documents_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;


--
-- Name: documents documents_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: folders folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: google_oauth_tokens google_oauth_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_oauth_tokens
    ADD CONSTRAINT google_oauth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: inbound_events inbound_events_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_events
    ADD CONSTRAINT inbound_events_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: inbound_events inbound_events_matched_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_events
    ADD CONSTRAINT inbound_events_matched_owner_fkey FOREIGN KEY (matched_owner) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: insurance_payments insurance_payments_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_payments
    ADD CONSTRAINT insurance_payments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.insurance_policies(id) ON DELETE CASCADE;


--
-- Name: insurance_policies insurance_policies_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: insurance_policies insurance_policies_source_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: synced_calendar_events synced_calendar_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.synced_calendar_events
    ADD CONSTRAINT synced_calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: family_settings Admins can insert family settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert family settings" ON public.family_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));



--
-- Name: family_settings Admins can update family settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update family settings" ON public.family_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins update any profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: inbound_events Admins view inbound events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view inbound events" ON public.inbound_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: family_settings Anyone authenticated can read family settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can read family settings" ON public.family_settings FOR SELECT TO authenticated USING (true);


--
-- Name: family_notes Author delete own note; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Author delete own note" ON public.family_notes FOR DELETE TO authenticated USING ((author_id = auth.uid()));


--
-- Name: family_notes Author update own note; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Author update own note" ON public.family_notes FOR UPDATE TO authenticated USING ((author_id = auth.uid())) WITH CHECK ((author_id = auth.uid()));


--
-- Name: categories Categories viewable by signed-in users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Categories viewable by signed-in users" ON public.categories FOR SELECT TO authenticated USING (true);


--
-- Name: insurance_payments Family can view all insurance payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family can view all insurance payments" ON public.insurance_payments FOR SELECT TO authenticated USING (public.is_family_member(auth.uid()));


--
-- Name: documents Family delete documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family delete documents" ON public.documents FOR DELETE TO authenticated USING ((public.is_family_member(auth.uid()) AND ((is_private = false) OR (owner_id = auth.uid()))));


--
-- Name: folders Family delete folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family delete folders" ON public.folders FOR DELETE TO authenticated USING (public.is_family_member(auth.uid()));


--
-- Name: documents Family insert documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family insert documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.is_family_member(auth.uid()));


--
-- Name: folders Family insert folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family insert folders" ON public.folders FOR INSERT TO authenticated WITH CHECK ((public.is_family_member(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: family_notes Family insert own note; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family insert own note" ON public.family_notes FOR INSERT TO authenticated WITH CHECK ((public.is_family_member(auth.uid()) AND (author_id = auth.uid())));


--
-- Name: insurance_policies Family members can delete policies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family members can delete policies" ON public.insurance_policies FOR DELETE TO authenticated USING (public.is_family_member(auth.uid()));


--
-- Name: insurance_policies Family members can insert policies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family members can insert policies" ON public.insurance_policies FOR INSERT TO authenticated WITH CHECK ((public.is_family_member(auth.uid()) AND (owner_id = auth.uid())));


--
-- Name: insurance_policies Family members can update policies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family members can update policies" ON public.insurance_policies FOR UPDATE TO authenticated USING (public.is_family_member(auth.uid())) WITH CHECK (public.is_family_member(auth.uid()));


--
-- Name: insurance_policies Family members can view all policies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family members can view all policies" ON public.insurance_policies FOR SELECT TO authenticated USING (public.is_family_member(auth.uid()));


--
-- Name: family_members Family members can view family member list; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family members can view family member list" ON public.family_members FOR SELECT TO authenticated USING (public.is_family_member(auth.uid()));


--
-- Name: documents Family read documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family read documents" ON public.documents FOR SELECT TO authenticated USING (((owner_id = auth.uid()) OR (public.is_family_member(auth.uid()) AND (is_private = false))));


--
-- Name: folders Family read folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family read folders" ON public.folders FOR SELECT TO authenticated USING (public.is_family_member(auth.uid()));


--
-- Name: family_notes Family read notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family read notes" ON public.family_notes FOR SELECT TO authenticated USING (public.is_family_member(auth.uid()));


--
-- Name: document_versions Family read versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family read versions" ON public.document_versions FOR SELECT TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.is_family_member(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.id = document_versions.document_id) AND (COALESCE(d.is_private, false) = false)))))));


--
-- Name: documents Family update documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family update documents" ON public.documents FOR UPDATE TO authenticated USING ((public.is_family_member(auth.uid()) AND ((is_private = false) OR (owner_id = auth.uid())))) WITH CHECK (public.is_family_member(auth.uid()));


--
-- Name: folders Family update folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Family update folders" ON public.folders FOR UPDATE TO authenticated USING (public.is_family_member(auth.uid())) WITH CHECK (public.is_family_member(auth.uid()));


--
-- Name: reminders Members delete own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members delete own reminders" ON public.reminders FOR DELETE TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: reminders Members insert own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members insert own reminders" ON public.reminders FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id));


--
-- Name: reminders Members update own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members update own reminders" ON public.reminders FOR UPDATE TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: reminders Members view own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view own reminders" ON public.reminders FOR SELECT TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: user_roles Only admins delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Only admins insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Only admins update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: document_versions Owners and admins delete versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins delete versions" ON public.document_versions FOR DELETE TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: document_shares Owners and admins manage shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins manage shares" ON public.document_shares TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: insurance_payments Owners can insert their insurance payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can insert their insurance payments" ON public.insurance_payments FOR INSERT TO authenticated WITH CHECK (((auth.uid() = owner_id) AND public.is_family_member(auth.uid())));


--
-- Name: insurance_payments Owners can update their insurance payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can update their insurance payments" ON public.insurance_payments FOR UPDATE TO authenticated USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));


--
-- Name: document_versions Owners insert own versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners insert own versions" ON public.document_versions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id));


--
-- Name: insurance_payments Owners or admins can delete insurance payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners or admins can delete insurance payments" ON public.insurance_payments FOR DELETE TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles Users insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: chat_messages Users manage own chat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own chat" ON public.chat_messages TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: google_oauth_tokens Users manage their own google tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage their own google tokens" ON public.google_oauth_tokens TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: synced_calendar_events Users manage their own synced events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage their own synced events" ON public.synced_calendar_events TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_roles Users read own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles Users update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--
-- Name: profiles Users view own profile or admins view all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own profile or admins view all" ON public.profiles FOR SELECT TO authenticated USING (((auth.uid() = id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: family_members admins manage members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage members" ON public.family_members TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: document_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: document_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;


--
-- Name: family_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

--
-- Name: family_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.family_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: family_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.family_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

--
-- Name: google_oauth_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: inbound_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbound_events ENABLE ROW LEVEL SECURITY;

--
-- Name: insurance_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insurance_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: insurance_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: synced_calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.synced_calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: FUNCTION enforce_family_allowlist(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_family_allowlist() FROM PUBLIC;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
-- Name: FUNCTION is_family_member(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_family_member(_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_family_member(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_family_member(_user_id uuid) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;




--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;


--
-- Name: TABLE document_shares; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.document_shares TO authenticated;
GRANT ALL ON TABLE public.document_shares TO service_role;


--
-- Name: TABLE document_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.document_versions TO authenticated;
GRANT ALL ON TABLE public.document_versions TO service_role;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;



--
-- Name: TABLE family_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.family_members TO authenticated;
GRANT ALL ON TABLE public.family_members TO service_role;


--
-- Name: TABLE family_notes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.family_notes TO authenticated;
GRANT ALL ON TABLE public.family_notes TO service_role;


--
-- Name: TABLE family_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.family_settings TO authenticated;
GRANT ALL ON TABLE public.family_settings TO service_role;


--
-- Name: TABLE folders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.folders TO authenticated;
GRANT ALL ON TABLE public.folders TO service_role;


--
-- Name: TABLE google_oauth_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.google_oauth_tokens TO authenticated;
GRANT ALL ON TABLE public.google_oauth_tokens TO service_role;


--
-- Name: TABLE inbound_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.inbound_events TO authenticated;
GRANT ALL ON TABLE public.inbound_events TO service_role;


--
-- Name: TABLE insurance_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.insurance_payments TO authenticated;
GRANT ALL ON TABLE public.insurance_payments TO service_role;


--
-- Name: TABLE insurance_policies; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.insurance_policies TO authenticated;
GRANT ALL ON TABLE public.insurance_policies TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE reminders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reminders TO authenticated;
GRANT ALL ON TABLE public.reminders TO service_role;


--
-- Name: TABLE synced_calendar_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.synced_calendar_events TO authenticated;
GRANT ALL ON TABLE public.synced_calendar_events TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- PostgreSQL database dump complete
--

--
-- Each document, folder and insurance policy belongs to a family member or shared folder.
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_family_slot_fkey FOREIGN KEY (family_slot) REFERENCES public.family_members(slug) ON UPDATE CASCADE;

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_family_slot_fkey FOREIGN KEY (family_slot) REFERENCES public.family_members(slug) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_family_slot_fkey FOREIGN KEY (family_slot) REFERENCES public.family_members(slug) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Supabase-managed parts: sign-up triggers, file storage, realtime.
--

CREATE TRIGGER enforce_family_allowlist_trigger BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.enforce_family_allowlist();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins delete any files" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'documents'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Admins read all files" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Admins update any files" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'documents'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Admins upload any files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'documents'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Family members can read shared documents" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR (EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.storage_path = objects.name) AND (d.deleted_at IS NULL) AND (d.is_private = false) AND public.is_family_member(auth.uid())))))));
CREATE POLICY "Family members can read shared documents in storage" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND public.is_family_member(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.documents d
  WHERE ((d.storage_path = objects.name) AND (d.deleted_at IS NULL) AND ((d.is_private IS NOT TRUE) OR (d.owner_id = auth.uid())))))));
CREATE POLICY "Members delete own files" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Members read own files" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Members update own files" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Members upload own files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Family members can receive realtime" ON realtime.messages FOR SELECT TO authenticated USING (public.is_family_member((SELECT auth.uid())));

--
-- Starting data: document categories and the family settings row.
--

INSERT INTO public.categories VALUES ('71710d5e-be20-4fd5-9e3e-faecd34c550f', 'identity', 'Identity', 'IdCard', 1);
INSERT INTO public.categories VALUES ('d8129646-b90e-4941-93ee-1d79387976b2', 'vehicle', 'Vehicle', 'Car', 2);
INSERT INTO public.categories VALUES ('cfe6b038-f8e6-4b2f-ae24-9a7a3ef31d4c', 'insurance', 'Insurance', 'ShieldCheck', 3);
INSERT INTO public.categories VALUES ('f7fa78aa-c8ff-4734-a91d-9b87f8103505', 'tax', 'Tax & Finance', 'Receipt', 4);
INSERT INTO public.categories VALUES ('828c8f45-4da0-4dcb-a6ee-0884f8f1d08d', 'health', 'Health', 'HeartPulse', 5);
INSERT INTO public.categories VALUES ('d1bf93ec-051e-415d-a761-a1cb72146f91', 'inbox', 'Inbox', 'Inbox', 6);
INSERT INTO public.categories VALUES ('77dfa002-d0e1-425b-9a6c-6914aa13434f', 'other', 'Other', 'Folder', 99);

INSERT INTO public.family_settings (id, family_alias) VALUES (true, 'family') ON CONFLICT (id) DO NOTHING;
