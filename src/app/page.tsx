// src/app/page.tsx — placeholder landing. Replaced by the authenticated app shell + login
// flow in the next M2 slice (auth, org/role gating, nav, audit log).
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium tracking-widest text-neutral-500 uppercase">
          CapEasy
        </p>
        <h1 className="mt-2 text-3xl font-semibold">vCFO · MIS Engine</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">
          Internal virtual-CFO engine. Authentication, multi-tenant client workspaces, and the
          analyst shell are being wired in (M2).
        </p>
      </div>
    </main>
  );
}
