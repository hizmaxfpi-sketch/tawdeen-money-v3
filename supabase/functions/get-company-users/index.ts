import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const body = await req.json();
    const { companyId } = body;

    // Check if platform admin
    const { data: adminCheck } = await supabase
      .from("platform_admins")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isPlatformAdmin = !!adminCheck;

    // If not platform admin, check if user is admin/owner of the requested company
    if (!isPlatformAdmin) {
      const { data: roleCheck } = await supabase
        .from("user_roles")
        .select("role, company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!roleCheck) {
        return new Response(JSON.stringify({ error: "ليس لديك صلاحية" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetCompanyId = companyId || roleCheck.company_id;

      // Must be admin or owner of the same company
      if (roleCheck.company_id !== targetCompanyId || !["admin", "owner"].includes(roleCheck.role)) {
        return new Response(JSON.stringify({ error: "ليس لديك صلاحية" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Determine which company to fetch users for
    let targetCompanyId = companyId;
    if (!targetCompanyId && !isPlatformAdmin) {
      const { data: myRole } = await supabase
        .from("user_roles")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      targetCompanyId = myRole?.company_id;
    }

    if (!targetCompanyId) {
      return new Response(JSON.stringify({ error: "معرف الشركة مطلوب" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get roles for this company
    const { data: roles } = await supabase
      .from("user_roles")
      .select("id, user_id, role, is_active")
      .eq("company_id", targetCompanyId);

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ users: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = roles.map((r) => r.user_id);

    // Get profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone")
      .in("user_id", userIds);

    // Get emails from auth.users using admin API - fetch all pages
    const authMap = new Map<string, { email: string; created_at: string; last_sign_in_at: string | null }>();
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data: authData, error: authListError } = await supabase.auth.admin.listUsers({ page, perPage });
      if (authListError) {
        console.error("listUsers error:", authListError);
        break;
      }
      if (!authData || !authData.users || authData.users.length === 0) break;
      for (const u of authData.users) {
        authMap.set(u.id, {
          email: u.email || "",
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at || null,
        });
      }
      if (authData.users.length < perPage) break;
      page++;
    }

    // Get company info
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, status, plan, max_users, owner_user_id, created_at")
      .eq("id", targetCompanyId)
      .maybeSingle();

    const users = roles.map((r) => {
      const profile = profiles?.find((p) => p.user_id === r.user_id);
      const auth = authMap.get(r.user_id);
      return {
        user_id: r.user_id,
        role_id: r.id,
        role: r.role,
        is_active: r.is_active,
        full_name: profile?.full_name || "مستخدم",
        phone: profile?.phone || null,
        email: auth?.email || null,
        created_at: auth?.created_at || null,
        last_sign_in_at: auth?.last_sign_in_at || null,
      };
    });

    return new Response(JSON.stringify({ users, company }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("get-company-users error:", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "خطأ داخلي" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
