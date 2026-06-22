'use client';
// src/app/onboarding/create-workspace-form.tsx — first-run workspace creation, wired to the createOrg action.
import { useActionState } from 'react';
import { createOrg, type CreateOrgState } from './actions';

const initial: CreateOrgState = { error: null };

const ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'pvt_ltd', label: 'Private Limited' },
  { value: 'llp', label: 'LLP' },
  { value: 'proprietorship', label: 'Proprietorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'opc', label: 'OPC' },
  { value: 'other', label: 'Other' },
];

export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState(createOrg, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="label">Company name</span>
        <input type="text" name="legal_name" required className="input" placeholder="Acme Foods Pvt Ltd" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="label">Entity type</span>
          <select name="entity_type" required defaultValue="pvt_ltd" className="input">
            {ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">State</span>
          <input type="text" name="state" className="input" placeholder="Maharashtra" />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="label">GST filing</span>
        <select name="gst_scheme" defaultValue="" className="input">
          <option value="">Not registered / unsure</option>
          <option value="monthly">Monthly</option>
          <option value="qrmp">QRMP (quarterly)</option>
        </select>
      </label>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary mt-1 w-full">
        {pending ? 'Creating workspace…' : 'Create workspace'}
      </button>
    </form>
  );
}
