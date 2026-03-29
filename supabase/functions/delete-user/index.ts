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

    // Check if caller is platform admin
    const { data: platformAdmin } = await supabase
      .from("platform_admins")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isPlatformAdmin = !!platformAdmin;

    // Check caller's company role
    const { data: callerRole } = await supabase
      .from("user_roles")
      .select("role, is_active, company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isCompanyAdmin = callerRole?.is_active && (callerRole?.role === "admin" || callerRole?.role === "owner");

    if (!isPlatformAdmin && !isCompanyAdmin) {
      return new Response(JSON.stringify({ error: "يجب أن تكون مديراً أو مالكاً لحذف المستخدمين" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { targetUserId, action } = await req.json();

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "معرف المستخدم مطلوب" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetUserId === user.id) {
      return new Response(JSON.stringify({ error: "لا يمكنك حذف حسابك بنفسك" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetRole } = await supabase
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!isPlatformAdmin) {
      // Company admin: must be in same company
      if (!targetRole || targetRole.company_id !== callerRole?.company_id) {
        return new Response(JSON.stringify({ error: "المستخدم غير موجود في شركتك" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cannot delete company owner
      const { data: company } = await supabase
        .from("companies")
        .select("owner_user_id")
        .eq("id", callerRole!.company_id)
        .maybeSingle();

      if (company?.owner_user_id === targetUserId) {
        return new Response(JSON.stringify({ error: "لا يمكن حذف حساب المالك" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "delete") {
      // Remove user_permissions
      await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", targetUserId);

      // Remove user_roles
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", targetUserId);

      // Remove profile
      await supabase
        .from("profiles")
        .delete()
        .eq("user_id", targetUserId);

      // Delete auth user
      const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUserId);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Delete user error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
