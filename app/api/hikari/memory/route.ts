import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// POST /api/hikari/memory — approve or reject a Hikari-proposed memory rule.
// Body: { id: string, action: 'approve' | 'reject' }.
//   approve → status='active',  approved_at=now  (used by future AI invocations)
//   reject  → status='rejected', rejected_at=now (filtered from the proposals card)
// Only touches rows that are still 'proposed' and belong to the signed-in profile.
export async function POST(request: Request) {
  const { id, action } = await request.json().catch(() => ({})) as { id?: string; action?: string }
  if (!id || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'id and action (approve|reject) required' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles').select('id').eq('auth_user_id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const now = new Date().toISOString()
  const patch = action === 'approve'
    ? { status: 'active',   approved_at: now }
    : { status: 'rejected', rejected_at: now }

  const { error } = await db.from('hikari_memory')
    .update(patch)
    .eq('id', id).eq('profile_id', profile.id).eq('status', 'proposed')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: patch.status })
}
