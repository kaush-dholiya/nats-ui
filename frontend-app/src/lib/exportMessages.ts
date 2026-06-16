import type { MessageEnvelope } from '../types'

function triggerDownload(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCsv(messages: MessageEnvelope[]): string {
  const headerKeys = new Set<string>()
  for (const m of messages) {
    for (const k of Object.keys(m.headers || {})) headerKeys.add(k)
  }
  const headerCols = Array.from(headerKeys)
  const columns = ['sequence', 'subject', 'timestamp', 'matched', 'matchPath', 'payload', ...headerCols.map(h => `header:${h}`)]
  const lines = [columns.map(csvEscape).join(',')]
  for (const m of messages) {
    const row = [
      m.sequence != null ? String(m.sequence) : '',
      m.subject ?? '',
      m.timestamp != null ? String(m.timestamp) : '',
      m.matched != null ? String(m.matched) : '',
      m.matchPath ?? '',
      m.payload ?? '',
      ...headerCols.map(h => (m.headers && m.headers[h] != null ? String(m.headers[h]) : '')),
    ]
    lines.push(row.map(v => csvEscape(String(v))).join(','))
  }
  return lines.join('\n')
}

export function exportMessages(messages: MessageEnvelope[], format: 'json' | 'csv', filenamePrefix: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  if (format === 'json') {
    triggerDownload(JSON.stringify(messages, null, 2), 'application/json', `${filenamePrefix}-${ts}.json`)
  } else {
    triggerDownload(toCsv(messages), 'text/csv', `${filenamePrefix}-${ts}.csv`)
  }
}
