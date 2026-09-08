import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = "tutorial@gmail.com";
  const password = process.env.TUTORIAL_PASSWORD ?? "Wd10exec";

  // Delete existing user if any
  console.log("Looking for existing user...");
  const { data: existing } = await admin.auth.admin.listUsers();
  const oldUser = existing.users.find((u) => u.email === email);
  if (oldUser) {
    console.log(`Deleting old user ${oldUser.id}...`);
    await admin.auth.admin.deleteUser(oldUser.id);
    console.log("Deleted.");
  }

  // Also delete old shop if exists
  const { data: oldShop } = await admin.from("shops").select("id").eq("slug", "tutorial-test").maybeSingle();
  if (oldShop) {
    console.log("Deleting old memberships...");
    await admin.from("shop_memberships").delete().eq("shop_id", oldShop.id);
    console.log("Deleting old shop...");
    await admin.from("shops").delete().eq("id", oldShop.id);
  }

  console.log(`Creating user ${email}...`);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error("Error creating user:", error.message);
    process.exit(1);
  }

  const userId = data.user.id;
  console.log(`User created: ${userId}`);

  console.log('Creating shop "tutorial-test"...');
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .insert({ nombre: "Tutorial Test", slug: "tutorial-test", industry: "peluqueria", active: true })
    .select("id")
    .single();

  if (shopError) {
    console.error("Error creating shop:", shopError.message);
    process.exit(1);
  }

  console.log(`Shop created: ${shop.id}`);

  await admin.from("shop_memberships").insert({ user_id: userId, shop_id: shop.id, role: "owner", is_active: true });
  await admin.from("user_profiles").upsert({ user_id: userId, name: "Tutorial User", role: "owner", is_active: true });
  await admin.from("admin_allowlist").upsert({ email, role: "owner" });

  console.log("\nDone!");
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Dashboard: http://localhost:3000/dashboard/tutorial-test`);
}

main().catch((e) => { console.error(e); process.exit(1); });
