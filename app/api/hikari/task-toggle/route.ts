import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// POST /api/hikari/task-toggle — toggle a daily task's done state.
// Body: { key: "hlavni-0" | "vedlejsi-1" | "bonus-0", date: "YYYY-MM-DD" }.
// Stores the set of done keys in ai_daily_brief.done_keys (preserved across vault
// sync / cron — they write disjoint columns). Called by the home task rows.
export async function POST(request: Request) {
  const { key, date } = await request.json().catch(() => ({})) as { key?: string; date?: string }
  if (!key || !date) {
    return NextResponse.json({ error: 'key and date required' }, { status: 400 })
  }

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

  const { data: row } = await db.from('ai_daily_brief')
    .select('done_keys').eq('profile_id', profile.id).eq('date', date).maybeSingle()

  const current: string[] = (row?.done_keys as string[] | null) ?? []
  const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key]

  // Upsert only profile_id/date/done_keys — leaves tasks + nudge/reasoning intact.
  const { error } = await db.from('ai_daily_brief')
    .upsert({ profile_id: profile.id, date, done_keys: next }, { onConflict: 'profile_id,date' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, done_keys: next })
}
