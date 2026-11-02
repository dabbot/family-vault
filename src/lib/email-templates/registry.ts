import type { ComponentType } from 'react'
import { template as expiryReminder } from './expiry-reminder'
import { template as familyDigest } from './family-digest'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'expiry-reminder': expiryReminder,
  'family-digest': familyDigest,
}
