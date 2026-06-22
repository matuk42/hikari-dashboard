import { NextResponse } from 'next/server'
import { createAdminClient, runMorningCron } from '@/lib/hikari-brain'
import { runVaultSync } from '@/app/api/vault-sync/route'

type SyncDb = Parameters<typeof runVaultSync>[0]

// Vercel sends `Authorization: Bearer {CRON_SECRET}` when CRON_SECRET env var is set.
// Same header works for manual invocations (curl, Insomnia, the home-page refresh button).
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)

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

  // Pull fresh vault data BEFORE the brain runs, so Gemini reasons over today's
  // synced priorities/cascade instead of stale data. Chaining (vs. a separate
  // earlier cron) guarantees ordering — the sync finishes before runMorningCron
  // starts. Sync failures are recorded but don't block the brain (it degrades to
  // whatever is already in Supabase). Needs GITHUB_TOKEN; absent → sync skipped.
  const token = process.env.GITHUB_TOKEN

  const results: Record<string, unknown> = { today }
  for (const profile of profiles) {
    const pid = profile.id as string
    const out: Record<string, unknown> = {}
    if (token) {
      try {
        out.vaultSync = await runVaultSync(db as unknown as SyncDb, pid, token)
      } catch (e) {
        out.vaultSync = { error: String(e) }
      }
    } else {
      out.vaultSync = { skipped: 'GITHUB_TOKEN not set' }
    }
    try {
      out.brain = await runMorningCron(db, pid, today)
    } catch (e) {
      out.brain = { error: String(e) }
    }
    results[pid] = out
  }

  return NextResponse.json({ ok: true, ...results })
}
