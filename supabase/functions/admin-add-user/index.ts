import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: adminCheck } = await supabase
      .from("platform_admins")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!adminCheck) {
      return new Response(JSON.stringify({ error: "صلاحيات المسؤول العام مطلوبة" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { companyId, email, password, fullName, role } = body;

    if (!companyId || !email || !password) {
      return new Response(JSON.stringify({ error: "معرف الشركة والبريد وكلمة المرور مطلوبة" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify company exists
    const { data: company } = await supabase
      .from("companies")
      .select("id, max_users")
      .eq("id", companyId)
      .maybeSingle();

    if (!company) {
      return new Response(JSON.stringify({ error: "الشركة غير موجودة" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check user count
    const { count } = await supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    if (count !== null && count >= company.max_users) {
      return new Response(JSON.stringify({ error: "تم الوصول للحد الأقصى من المستخدمين" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = ["admin", "accountant", "shipping_staff", "viewer"];
    const assignRole = validRoles.includes(role) ? role : "viewer";

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers.users.find(
      (entry) => entry.email?.toLowerCase() === String(email).toLowerCase(),
    );

    let newUser: { user: any };
    let createError: any = null;

    if (existingUser) {
      // Update password for existing user
      const { error: updateErr } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
      });
      if (updateErr) {
        console.error("Password update error:", updateErr);
      }
      newUser = { user: existingUser };
    } else {
      const result = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName || email },
      });
      newUser = result.data as any;
      createError = result.error;
    }

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!newUser.user) {
      return new Response(JSON.stringify({ error: "فشل إنشاء المستخدم" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    if (!existingUser) {
      await new Promise(r => setTimeout(r, 2000));
    }

    // Ensure profile exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from("profiles").insert({
        user_id: userId,
        full_name: fullName || email,
      });
    }

    const { data: existingFund } = await supabase
      .from("funds")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "الصندوق النقدي")
      .maybeSingle();

    if (!existingFund) {
      await supabase.from("funds").insert({
        user_id: userId,
        name: "الصندوق النقدي",
        type: "cash",
        balance: 0,
      });
    }

    // Delete any auto-created company and role from trigger
    const { data: autoCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_user_id", userId)
      .maybeSingle();

    if (autoCompany) {
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("company_id", autoCompany.id);
      await supabase.from("funds").delete().eq("user_id", userId);
      await supabase.from("companies").delete().eq("id", autoCompany.id);
    }

    // Remove any existing roles for this user (cleanup)
    await supabase.from("user_roles").delete().eq("user_id", userId);

    // Assign to target company
    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: assignRole,
      company_id: companyId,
      is_active: true,
    });

    if (roleError) {
      console.error("Role insert error:", roleError);
      return new Response(JSON.stringify({ error: "فشل تعيين الدور: " + roleError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      reused_existing_user: !!existingUser,
      user_id: userId,
      email: newUser.user.email,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Admin add user error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
