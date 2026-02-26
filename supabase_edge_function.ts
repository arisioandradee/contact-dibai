import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configurações do Supabase (A service_role é recomendada para bypassar RLS interna)
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

Deno.serve(async (req) => {
    try {
        const payload = await req.json();
        console.log("Recebido Webhook Z-API:", payload);

        // Z-API envia notificações de vários tipos (enviada, recebida, lida, etc)
        // Queremos apenas as RECEBIDAS (fromMe: false) e que contenham TEXTO
        if (payload.fromMe === false && payload.text?.message) {
            const { data, error } = await supabase
                .from("respostas")
                .insert({
                    instance_id: payload.instanceId,
                    phone: payload.phone.replace(/\D/g, ''), // Limpa para 5588999999999
                    message_id: payload.messageId,
                    text_content: payload.text.message,
                    raw_payload: payload
                })
                .schema("whatsapp_disparo"); // Usando o schema customizado

            if (error) throw error;
            console.log("Resposta salva com sucesso!");
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
        });
    } catch (err) {
        console.error("Erro no Webhook:", err.message);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { "Content-Type": "application/json" },
            status: 500,
        });
    }
});
