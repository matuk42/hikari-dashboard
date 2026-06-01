import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.exchangeCodeForSession(code)
      .then(r => r.data?.user ? r : supabase.auth.getUser().then(u => ({ data: u.data, error: u.error })))
      .catch(() => ({ data: { user: null }, error: null }))

    if (user) {
      // Auto-create profile on first login
      const { data: existing } = await supabase
        .from('profiles').select('id').eq('auth_user_id', user.id).single()

      if (!existing) {
        const email = user.email ?? ''
        const { data: byEmail } = await supabase
          .from('profiles').select('id').eq('google_email', email).single()

        if (byEmail) {
          await supabase.from('profiles').update({ auth_user_id: user.id }).eq('id', byEmail.id)
        } else {
          const name = (user.user_metadata?.full_name as string | undefined) ?? email.split('@')[0]
          await supabase.from('profiles').insert({
            auth_user_id: user.id,
            google_email: email,
            display_name: name,
          })
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/`)
}
