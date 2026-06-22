import type { NextConfig } from "next";
import { assertSupabaseEnvFromProcess } from "./src/lib/env/supabase-env";

// D-014 build-time invariant: fail the build if this deployment points at the wrong Supabase project for
// its environment (PRODUCTION must NOT be the demo project; PREVIEW/DEVELOPMENT MUST be the demo project).
// Env vars are loaded by Next before next.config is evaluated, so this runs against the real configuration.
assertSupabaseEnvFromProcess();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
