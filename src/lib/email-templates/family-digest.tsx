import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

export interface DigestItem {
  kind: 'premium' | 'maturity' | 'expiry'
  title: string
  member?: string | null
  dueDate: string
  daysUntil: number
  amount?: number | null
}

interface Props {
  memberName?: string
  items?: DigestItem[]
  weekOf?: string
}

const fmtMoney = (n?: number | null) => {
  if (n == null) return ''
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
  } catch { return `₹${n}` }
}

const dueLabel = (n: number) =>
  n < 0 ? `${-n}d overdue` : n === 0 ? 'due today' : n === 1 ? 'due tomorrow' : `in ${n} days`

const kindLabel = (k: DigestItem['kind']) =>
  k === 'premium' ? 'Premium' : k === 'maturity' ? 'Maturity' : 'Document'

const Digest = ({ memberName, items = [], weekOf }: Props) => {
  const overdue = items.filter((i) => i.daysUntil < 0)
  const upcoming = items.filter((i) => i.daysUntil >= 0)

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${overdue.length} overdue · ${upcoming.length} due this week`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Family Vault — weekly reminders</Heading>
          <Text style={text}>Hi {memberName ?? 'family'},</Text>
          <Text style={text}>
            Here's what needs attention {weekOf ? `for the week of ${weekOf}` : 'in the next 7 days'}.
          </Text>

          {overdue.length > 0 && (
            <Section style={cardOverdue}>
              <Text style={cardLabelRed}>Overdue · {overdue.length}</Text>
              {overdue.map((it, i) => (
                <Text key={i} style={row}>
                  <strong>{kindLabel(it.kind)}:</strong> {it.title}
                  {it.member ? ` (${it.member})` : ''} — {dueLabel(it.daysUntil)}
                  {' · '}{it.dueDate}
                  {it.amount ? ` · ${fmtMoney(it.amount)}` : ''}
                </Text>
              ))}
            </Section>
          )}

          {upcoming.length > 0 && (
            <Section style={cardUpcoming}>
              <Text style={cardLabelAmber}>Due within 7 days · {upcoming.length}</Text>
              {upcoming.map((it, i) => (
                <Text key={i} style={row}>
                  <strong>{kindLabel(it.kind)}:</strong> {it.title}
                  {it.member ? ` (${it.member})` : ''} — {dueLabel(it.daysUntil)}
                  {' · '}{it.dueDate}
                  {it.amount ? ` · ${fmtMoney(it.amount)}` : ''}
                </Text>
              ))}
            </Section>
          )}

          {items.length === 0 && (
            <Section style={cardOk}>
              <Text style={cardLabelGreen}>All clear</Text>
              <Text style={row}>No overdue or upcoming items in the next 7 days.</Text>
            </Section>
          )}

          <Text style={text}>Sign in to Family Vault to review or update these items.</Text>
          <Text style={muted}>You're getting this weekly digest because you're on the family list.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Digest,
  subject: (d: Record<string, any>) => {
    const items = (d.items ?? []) as DigestItem[]
    const overdue = items.filter((i) => i.daysUntil < 0).length
    const upcoming = items.length - overdue
    if (overdue === 0 && upcoming === 0) return 'Family Vault — all clear this week'
    const parts: string[] = []
    if (overdue) parts.push(`${overdue} overdue`)
    if (upcoming) parts.push(`${upcoming} due this week`)
    return `Family Vault reminders — ${parts.join(', ')}`
  },
  displayName: 'Family weekly digest',
  previewData: {
    memberName: 'Alex',
    weekOf: '2026-07-01',
    items: [
      { kind: 'premium', title: 'Life insurance', member: 'Alex', dueDate: '2026-07-05', daysUntil: 4, amount: 42428 },
      { kind: 'expiry', title: 'Passport', member: 'Sam', dueDate: '2026-06-29', daysUntil: -2 },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '620px', margin: '0 auto' }
const h1 = { fontSize: '20px', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#1f2937', lineHeight: '1.6', margin: '0 0 12px' }
const muted = { fontSize: '13px', color: '#6b7280', marginTop: '24px' }
const row = { fontSize: '14px', color: '#1f2937', margin: '4px 0', lineHeight: '1.5' }
const cardOverdue = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px 20px', margin: '16px 0' }
const cardUpcoming = { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px 20px', margin: '16px 0' }
const cardOk = { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px 20px', margin: '16px 0' }
const cardLabelRed = { fontSize: '12px', color: '#dc2626', fontWeight: 600, textTransform: 'uppercase' as const, margin: '0 0 8px', letterSpacing: '0.04em' }
const cardLabelAmber = { fontSize: '12px', color: '#b45309', fontWeight: 600, textTransform: 'uppercase' as const, margin: '0 0 8px', letterSpacing: '0.04em' }
const cardLabelGreen = { fontSize: '12px', color: '#15803d', fontWeight: 600, textTransform: 'uppercase' as const, margin: '0 0 8px', letterSpacing: '0.04em' }
