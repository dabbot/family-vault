import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  memberName?: string
  docTitle?: string
  docType?: string
  expiryDate?: string
  daysUntil?: number
}

const ExpiryReminder = ({ memberName, docTitle, docType, expiryDate, daysUntil }: Props) => {
  const headline =
    daysUntil === 0
      ? 'Expires today'
      : daysUntil === 1
      ? 'Expires tomorrow'
      : `Expires in ${daysUntil ?? '—'} days`

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{docTitle ?? 'Document'} {headline.toLowerCase()}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Family Vault reminder</Heading>
          <Text style={text}>Hi {memberName ?? 'there'},</Text>
          <Text style={text}>
            Your <strong>{docType ?? 'document'}</strong> "{docTitle ?? 'Untitled'}" {headline.toLowerCase()}
            {expiryDate ? ` (${expiryDate})` : ''}.
          </Text>
          <Section style={card}>
            <Text style={cardLabel}>{headline}</Text>
            <Text style={cardTitle}>{docTitle ?? 'Document'}</Text>
            {expiryDate ? <Text style={cardMeta}>Expiry: {expiryDate}</Text> : null}
          </Section>
          <Text style={text}>Sign in to Family Vault to review or renew it.</Text>
          <Text style={muted}>You're getting this because the document is stored in your family's vault.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ExpiryReminder,
  subject: (d: Record<string, any>) => {
    const t = d.docTitle ?? 'Document'
    if (d.daysUntil === 0) return `Reminder: ${t} expires today`
    if (d.daysUntil === 1) return `Reminder: ${t} expires tomorrow`
    return `Reminder: ${t} expires in ${d.daysUntil ?? ''} days`
  },
  displayName: 'Document expiry reminder',
  previewData: {
    memberName: 'Alex',
    docTitle: 'Car Insurance - Honda City',
    docType: 'Insurance',
    expiryDate: '2026-07-04',
    daysUntil: 30,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#1f2937', lineHeight: '1.6', margin: '0 0 12px' }
const muted = { fontSize: '13px', color: '#6b7280', marginTop: '24px' }
const card = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', margin: '20px 0' }
const cardLabel = { fontSize: '12px', color: '#dc2626', fontWeight: 600, textTransform: 'uppercase' as const, margin: '0 0 4px', letterSpacing: '0.04em' }
const cardTitle = { fontSize: '16px', color: '#0f172a', fontWeight: 600, margin: '0 0 4px' }
const cardMeta = { fontSize: '13px', color: '#475569', margin: 0 }
