import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/hikari-brain'
import { runVaultSync } from '@/app/api/vault-sync/route'

// Sunday-22:00 auto vault sync (Vercel cron). Mirrors the manual "Sync s vaultem"
// button but runs server-side without a user session: it authenticates via
// CRON_SECRET, uses the service-role client (bypasses RLS) and iterates every
// profile, delegating to the shared runVaultSync core.
//
// Vercel sends `Authorization: Bearer {CRON_SECRET}`; the same header works for
// manual invocations (curl) so this is also a server-side "sync now" escape hatch.
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

type SyncDb = Parameters<typeof runVaultSync>[0]

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not set' }, { status: 500 })
  }

  let db: ReturnType<typeof createAdminClient>
  try {
    db = createAdminClient()
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  const { data: profiles } = await db.from('profiles').select('id')
  if (!profiles?.length) {
    return NextResponse.json({ ok: false, error: 'No profiles found' })
  }

  const results: Record<string, unknown> = {}
  for (const profile of profiles) {
    const pid = profile.id as string
    try {
      results[pid] = await runVaultSync(db as unknown as SyncDb, pid, token)
    } catch (e) {
      results[pid] = { error: String(e) }
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
