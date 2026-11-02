import * as React from 'react'
import { render } from '@react-email/components'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'
import type { DigestItem } from '@/lib/email-templates/family-digest'

const WINDOW_DAYS = 7

function daysBetween(target: string, todayISO: string) {
  const a = new Date(target + 'T00:00:00Z').getTime()
  const b = new Date(todayISO + 'T00:00:00Z').getTime()
  return Math.round((a - b) / 86_400_000)
}

export const Route = createFileRoute('/api/public/hooks/send-family-digest')({
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
        const horizon = new Date()
        horizon.setUTCDate(horizon.getUTCDate() + WINDOW_DAYS)
        const horizonISO = horizon.toISOString().slice(0, 10)

        // Gather items
        const items: DigestItem[] = []

        const { data: policies } = await supabaseAdmin
          .from('insurance_policies')
          .select('policy_name, member_name, premium_due_date, premium_amount, maturity_date, maturity_amount, maturity_received_at')

        for (const p of policies ?? []) {
          if (p.premium_due_date && p.premium_due_date <= horizonISO) {
            items.push({
              kind: 'premium',
              title: p.policy_name,
              member: p.member_name,
              dueDate: p.premium_due_date,
              daysUntil: daysBetween(p.premium_due_date, today),
              amount: p.premium_amount ? Number(p.premium_amount) : null,
            })
          }
          if (p.maturity_date && !p.maturity_received_at && p.maturity_date <= horizonISO) {
            items.push({
              kind: 'maturity',
              title: p.policy_name,
              member: p.member_name,
              dueDate: p.maturity_date,
              daysUntil: daysBetween(p.maturity_date, today),
              amount: p.maturity_amount ? Number(p.maturity_amount) : null,
            })
          }
        }

        const { data: docs } = await supabaseAdmin
          .from('documents')
          .select('title, doc_type, member_name, expiry_date, snoozed_until, deleted_at')
          .not('expiry_date', 'is', null)
          .is('deleted_at', null)
          .lte('expiry_date', horizonISO)

        for (const d of docs ?? []) {
          if (d.snoozed_until && d.snoozed_until >= today) continue
          items.push({
            kind: 'expiry',
            title: `${d.title}${d.doc_type ? ` (${d.doc_type})` : ''}`,
            member: d.member_name,
            dueDate: d.expiry_date!,
            daysUntil: daysBetween(d.expiry_date!, today),
          })
        }

        items.sort((a, b) => a.daysUntil - b.daysUntil)

        // Recipients: everyone in family_members
        const { data: members, error: memErr } = await supabaseAdmin
          .from('family_members')
          .select('email, name')
        if (memErr) return new Response(JSON.stringify({ error: memErr.message }), { status: 500 })

        const template = TEMPLATES['family-digest']
        if (!template) return new Response('template missing', { status: 500 })

        let sent = 0
        const errors: string[] = []

        for (const m of members ?? []) {
          if (!m.email) continue
          const normalized = m.email.toLowerCase().trim()

          try {
            const data = {
              memberName: m.name ?? null,
              items,
              weekOf: today,
            }

            const element = React.createElement(template.component, data)
            const html = await render(element)
            const text = await render(element, { plainText: true })
            const subject = typeof template.subject === 'function' ? template.subject(data) : template.subject

            // One digest per address per calendar week.
            const weekKey = today.slice(0, 8) + String(Math.ceil(Number(today.slice(8, 10)) / 7))
            const r = await sendEmail({ to: m.email, subject, html, text, idempotencyKey: `family-digest-${weekKey}-${normalized}` })
            if (r.sent) sent++
            else if (r.reason !== 'unsubscribed') errors.push(`${m.email}: ${r.reason}`)
          } catch (e) {
            errors.push(`${m.email}: ${(e as Error).message}`)
          }
        }

        return Response.json({
          recipients: members?.length ?? 0,
          items: items.length,
          sent,
          errors,
        })
      },
    },
  },
})
