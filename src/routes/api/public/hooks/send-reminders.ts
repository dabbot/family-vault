import * as React from 'react'
import { render } from '@react-email/components'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'

export const Route = createFileRoute('/api/public/hooks/send-reminders')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorisedCron } = await import('@/lib/cron-auth.server')
        if (!isAuthorisedCron(request)) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { sendEmail } = await import('@/lib/email.server')

        const today = new Date().toISOString().slice(0, 10)

        const { data: dueReminders, error: remErr } = await supabaseAdmin
          .from('reminders')
          .select('id, kind, fires_at, document_id, owner_id')
          .eq('fires_at', today)
          .is('sent_at', null)
          .limit(500)

        if (remErr) return new Response(JSON.stringify({ error: remErr.message }), { status: 500 })
        if (!dueReminders?.length) return Response.json({ processed: 0, sent: 0 })

        const docIds = [...new Set(dueReminders.map((r) => r.document_id))]
        const ownerIds = [...new Set(dueReminders.map((r) => r.owner_id))]

        const [{ data: docs }, { data: profiles }, { data: usersRes }] = await Promise.all([
          supabaseAdmin.from('documents').select('id, title, doc_type, expiry_date, snoozed_until').in('id', docIds),
          supabaseAdmin.from('profiles').select('id, full_name').in('id', ownerIds),
          supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
        ])

        const docMap = new Map(docs?.map((d) => [d.id, d]) ?? [])
        const profMap = new Map(profiles?.map((p) => [p.id, p]) ?? [])
        const emailMap = new Map((usersRes?.users ?? []).map((u) => [u.id, u.email]))

        const template = TEMPLATES['expiry-reminder']
        if (!template) return new Response('template missing', { status: 500 })

        let sent = 0
        const errors: string[] = []

        for (const r of dueReminders) {
          const doc = docMap.get(r.document_id) as { id: string; title: string; doc_type: string | null; expiry_date: string | null; snoozed_until: string | null } | undefined
          const prof = profMap.get(r.owner_id)
          const email = emailMap.get(r.owner_id)
          if (!doc || !email) continue
          if (doc.snoozed_until && doc.snoozed_until >= today) {
            await supabaseAdmin.from('reminders').update({ sent_at: new Date().toISOString() }).eq('id', r.id)
            continue
          }

          const daysUntil = r.kind === 'expiry' ? 0 : r.kind === '1d' ? 1 : r.kind === '7d' ? 7 : 30

          try {
            const data = {
              memberName: prof?.full_name ?? null,
              docTitle: doc.title,
              docType: doc.doc_type ?? null,
              expiryDate: doc.expiry_date ?? null,
              daysUntil,
            }

            const element = React.createElement(template.component, data)
            const html = await render(element)
            const text = await render(element, { plainText: true })
            const subject = typeof template.subject === 'function' ? template.subject(data) : template.subject

            const r2 = await sendEmail({ to: email, subject, html, text, idempotencyKey: `reminder-${r.id}` })
            if (!r2.sent && r2.reason !== 'unsubscribed') {
              errors.push(`reminder ${r.id}: ${r2.reason}`)
              continue
            }
            await supabaseAdmin.from('reminders').update({ sent_at: new Date().toISOString() }).eq('id', r.id)
            if (r2.sent) sent++
          } catch (e) {
            errors.push(`reminder ${r.id}: ${(e as Error).message}`)
          }
        }

        return Response.json({ processed: dueReminders.length, sent, errors })
      },
    },
  },
})
