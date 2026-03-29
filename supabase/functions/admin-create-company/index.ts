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

    // Verify caller is platform admin
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
    const { companyName, ownerEmail, ownerPassword, ownerFullName, plan, maxUsers } = body;

    if (!companyName || !ownerEmail || !ownerPassword) {
      return new Response(JSON.stringify({ error: "اسم الشركة والبريد وكلمة المرور مطلوبة" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers.users.find(
      (entry) => entry.email?.toLowerCase() === String(ownerEmail).toLowerCase(),
    );

    let newUser: { user: any };
    let createError: any = null;

    if (existingUser) {
      // Update password for existing user
      const { error: updateErr } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password: ownerPassword,
        email_confirm: true,
      });
      if (updateErr) {
        console.error("Password update error:", updateErr);
      }
      newUser = { user: existingUser };
    } else {
      const result = await supabase.auth.admin.createUser({
        email: ownerEmail,
        password: ownerPassword,
        email_confirm: true,
        user_metadata: { full_name: ownerFullName || ownerEmail },
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

    // Check if trigger created profile, if not create it
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from("profiles").insert({
        user_id: userId,
        full_name: ownerFullName || ownerEmail,
      });
    }

    const { data: existingAnyRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingUser && existingAnyRole) {
      return new Response(JSON.stringify({ error: "هذا البريد مرتبط بالفعل بحساب شركة موجود" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if trigger created company, update it or create new one
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_user_id", userId)
      .maybeSingle();

    let companyId: string;

    if (existingCompany) {
      // Update the auto-created company
      await supabase
        .from("companies")
        .update({
          name: companyName,
          status: "active",
          plan: plan || "basic",
          max_users: maxUsers || 5,
        })
        .eq("id", existingCompany.id);
      companyId = existingCompany.id;
    } else {
      // Create company directly
      const { data: newCompany, error: companyError } = await supabase
        .from("companies")
        .insert({
          owner_user_id: userId,
          name: companyName,
          status: "active",
          plan: plan || "basic",
          max_users: maxUsers || 5,
        })
        .select("id")
        .single();

      if (companyError || !newCompany) {
        console.error("Company creation error:", companyError);
        return new Response(JSON.stringify({ error: "فشل إنشاء الشركة" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      companyId = newCompany.id;
    }

    // Check if trigger created role, if not create it
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!existingRole) {
      await supabase.from("user_roles").insert({
        user_id: userId,
        role: "owner",
        company_id: companyId,
        is_active: true,
      });
    }

    // Create default fund if not exists
    const { data: existingFund } = await supabase
      .from("funds")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingFund) {
      await supabase.from("funds").insert({
        user_id: userId,
        name: "الصندوق النقدي",
        type: "cash",
        balance: 0,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      reused_existing_user: !!existingUser,
      company_id: companyId,
      user_id: userId,
      email: newUser.user.email,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Admin create company error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
