import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const USER_ID = process.argv[2];

if (!USER_ID) {
  console.error("Uso: node scripts/delete-user.mjs <user_id>");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const before = await admin.from("user_profiles").select("user_id, email, role, shop_id").eq("user_id", USER_ID).maybeSingle();
  if (before.error) {
    console.error("Error leyendo perfil previo:", before.error.message);
    process.exitCode = 1;
    return;
  }
  console.log("Perfil previo:", before.data ?? "NULL");

  const { error: rpcErr } = await admin.rpc("admin_cleanup_user_hard", { p_user_id: USER_ID });
  if (rpcErr) {
    console.error("admin_cleanup_user_hard falló:", rpcErr.message);
    console.error("-> Si dice 'function not found', aplicá primero la migración 094 (supabase db push).");
    process.exitCode = 1;
    return;
  }
  console.log("admin_cleanup_user_hard OK");

  const [profiles, memberships] = await Promise.all([
    admin.from("user_profiles").select("user_id").eq("user_id", USER_ID),
    admin.from("shop_memberships").select("id").eq("user_id", USER_ID),
  ]);
  console.log("profiles restantes:", profiles.count ?? 0);
  console.log("memberships restantes:", memberships.count ?? 0);

  const { error: delErr } = await admin.auth.admin.deleteUser(USER_ID);
  if (delErr) {
    console.error("deleteUser falló:", delErr.message);
    console.error("-> Borrá el auth user desde Dashboard > Authentication > Users y volvé a correr este script.");
    process.exitCode = 1;
    return;
  }
  console.log("Auth user eliminado OK");

  const { data: users, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  console.log("Usuario fuera de auth:", !(users?.users || []).some((u) => u.id === USER_ID));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});