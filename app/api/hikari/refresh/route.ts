import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient, runMorningCron } from '@/lib/hikari-brain'

// POST /api/hikari/refresh — re-run morning cron for the signed-in user.
// Called by the "Přepočítej Hikari" button on the home page.
export async function POST() {
  const cookieStore = await cookies()
  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll:  (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles').select('id').eq('auth_user_id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  let adminDb: ReturnType<typeof createAdminClient>
  try {
    adminDb = createAdminClient()
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const result = await runMorningCron(adminDb, profile.id as string, today)

  return NextResponse.json({ ok: true, ...result })
}
