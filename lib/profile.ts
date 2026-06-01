import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

export async function getProfileId(user: User): Promise<string | null> {
  const { data: byAuth } = await supabase
    .from('profiles').select('id').eq('auth_user_id', user.id).single()
  if (byAuth) return byAuth.id

  const email = user.email ?? ''
  const { data: byEmail } = await supabase
    .from('profiles').select('id').eq('google_email', email).single()
  if (byEmail) {
    await supabase.from('profiles').update({ auth_user_id: user.id }).eq('id', byEmail.id)
    return byEmail.id
  }

  const name = (user.user_metadata?.full_name as string | undefined) ?? email.split('@')[0]
  const { data: created } = await supabase
    .from('profiles')
    .insert({ auth_user_id: user.id, google_email: email, display_name: name })
    .select('id')
    .single()
  return created?.id ?? null
}
