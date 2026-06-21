// src/app/page.tsx — authenticated home (analyst shell, minimal). Everything here is read
// through the ANON-key server client, so RLS decides what is visible: the signed-in user sees
// ONLY the client orgs they are a member of. This is the first end-to-end proof of auth + RLS +
// multi-tenancy. The full MIS workflow (intake → compute → pack) lands in later milestones.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from './actions';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login'); // proxy already gates; defensive for direct render

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single();

  // RLS-scoped: orgs returns only the client orgs this user is a member of.
  const { data: orgs } = await supabase
    .from('orgs')
    .select('id, legal_name, entity_type, state')
    .order('legal_name');

  const { data: memberships } = await supabase.from('org_members').select('org_id, role');
  const roleByOrg = new Map((memberships ?? []).map((m) => [m.org_id, m.role]));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-ink">CapEasy vCFO</span>
            <span className="text-xs text-muted">MIS Engine</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">
              {profile?.full_name ?? profile?.email ?? user.email}
            </span>
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary px-3 py-1.5 text-xs">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <h1 className="text-xl font-bold text-ink">Client workspaces</h1>
        <p className="mt-1 text-sm text-muted">
          {orgs?.length
            ? `You have access to ${orgs.length} client ${orgs.length === 1 ? 'org' : 'orgs'} (RLS-scoped).`
            : 'No client orgs are visible to your account yet.'}
        </p>

        {orgs?.length ? (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orgs.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/clients/${o.id}`}
                  className="card block p-4 transition-all hover:border-line-strong hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{o.legal_name}</span>
                    <span className="badge badge-neutral">{roleByOrg.get(o.id) ?? '—'}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {o.entity_type}
                    {o.state ? ` · ${o.state}` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card mt-5 p-10 text-center text-sm text-muted">
            No client orgs are visible to your account yet. An administrator provisions access per client.
          </div>
        )}
      </main>
    </div>
  );
}
