// src/app/page.tsx — authenticated home (analyst shell, minimal). Everything here is read
// through the ANON-key server client, so RLS decides what is visible: the signed-in user sees
// ONLY the client orgs they are a member of. This is the first end-to-end proof of auth + RLS +
// multi-tenancy. The full MIS workflow (intake → compute → pack) lands in later milestones.
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
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">CapEasy vCFO</span>
          <span className="text-xs text-neutral-500">MIS Engine</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">
            {profile?.full_name ?? profile?.email ?? user.email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 p-6">
        <h1 className="text-lg font-semibold">Client workspaces</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {orgs?.length
            ? `You have access to ${orgs.length} client ${orgs.length === 1 ? 'org' : 'orgs'} (RLS-scoped).`
            : 'No client orgs are visible to your account yet.'}
        </p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(orgs ?? []).map((o) => (
            <li
              key={o.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{o.legal_name}</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-medium tracking-wide text-neutral-600 uppercase dark:bg-neutral-800 dark:text-neutral-300">
                  {roleByOrg.get(o.id) ?? '—'}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {o.entity_type}
                {o.state ? ` · ${o.state}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
