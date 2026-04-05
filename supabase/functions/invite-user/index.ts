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
    
    // Get caller's role AND company_id
    const { data: callerRole } = await supabase
      .from("user_roles")
      .select("role, is_active, company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!callerRole?.is_active || (callerRole?.role !== "admin" && callerRole?.role !== "owner")) {
      return new Response(JSON.stringify({ error: "يجب أن تكون مديراً أو مالكاً لإضافة مستخدمين" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerCompanyId = callerRole.company_id;
    if (!callerCompanyId) {
      return new Response(JSON.stringify({ error: "لم يتم العثور على شركة مرتبطة بحسابك" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, password, fullName, role } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // owner role cannot be assigned via invite
    const validRoles = ["admin", "accountant", "shipping_staff", "viewer"];
    const assignRole = validRoles.includes(role) ? role : "viewer";

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers.users.find(
      (entry) => entry.email?.toLowerCase() === String(email).toLowerCase(),
    );

    let createdUserId: string | null = existingUser?.id ?? null;

    const { data: newUser, error: createError } = existingUser
      ? { data: { user: existingUser }, error: null }
      : await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (newUser.user) {
      createdUserId = newUser.user.id;

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", createdUserId)
        .maybeSingle();

      if (!existingProfile) {
        const { error: profileError } = await supabase.from("profiles").insert({
          user_id: createdUserId,
          full_name: fullName || email,
        });

        if (profileError) {
          return new Response(JSON.stringify({ error: profileError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { data: existingFund } = await supabase
        .from("funds")
        .select("id")
        .eq("user_id", createdUserId)
        .eq("name", "الصندوق النقدي")
        .maybeSingle();

      if (!existingFund) {
        const { error: fundError } = await supabase.from("funds").insert({
          user_id: createdUserId,
          name: "الصندوق النقدي",
          type: "cash",
          balance: 0,
        });

        if (fundError) {
          return new Response(JSON.stringify({ error: fundError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", createdUserId)
        .maybeSingle();

      if (existingRole) {
        const { error: roleUpdateError } = await supabase
          .from("user_roles")
          .update({ role: assignRole, company_id: callerCompanyId, is_active: true })
          .eq("id", existingRole.id);

        if (roleUpdateError) {
          return new Response(JSON.stringify({ error: roleUpdateError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const { error: roleInsertError } = await supabase.from("user_roles").insert({
          user_id: createdUserId,
          role: assignRole,
          company_id: callerCompanyId,
          is_active: true,
        });

        if (roleInsertError) {
          return new Response(JSON.stringify({ error: roleInsertError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      reused_existing_user: !!existingUser,
      user: { id: newUser.user?.id, email: newUser.user?.email } 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Invite error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
