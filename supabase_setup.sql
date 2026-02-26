-- OPÇÃO RECOMENDADA: Usar o schema public com um prefixo único
-- Isso evita o erro PGRST106 em servidores Supabase próprios sem mudar configurações complexas.

-- 1. Criar a tabela no schema public, mas com prefixo para organização
CREATE TABLE IF NOT EXISTS public.wa_disparo_respostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    message_id TEXT UNIQUE,
    text_content TEXT,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    raw_payload JSONB 
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_wa_respostas_phone ON public.wa_disparo_respostas(phone);
CREATE INDEX IF NOT EXISTS idx_wa_respostas_received_at ON public.wa_disparo_respostas(received_at);

-- 3. Permissões básicas
ALTER TABLE public.wa_disparo_respostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir inserções anônimas via API" ON public.wa_disparo_respostas FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir leitura anônima via API" ON public.wa_disparo_respostas FOR SELECT USING (true);

GRANT ALL ON TABLE public.wa_disparo_respostas TO anon;
GRANT ALL ON TABLE public.wa_disparo_respostas TO authenticated;
GRANT ALL ON TABLE public.wa_disparo_respostas TO service_role;

-- 4. Tabela de Histórico (Nova tentativa com nome reduzido e permissões de schema)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

DROP TABLE IF EXISTS public.wa_envios_per;
CREATE TABLE public.wa_envios_per (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    total INTEGER DEFAULT 0,
    success INTEGER DEFAULT 0,
    error INTEGER DEFAULT 0,
    contacts JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_wa_env_per_timestamp ON public.wa_envios_per(timestamp);

-- Permissões totais
ALTER TABLE public.wa_envios_per ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso Total" ON public.wa_envios_per FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.wa_envios_per TO anon;
GRANT ALL ON TABLE public.wa_envios_per TO authenticated;
GRANT ALL ON TABLE public.wa_envios_per TO service_role;

-- 5. Função de Salvar (RPC) - Versão Final (Sem nomes de parâmetros para evitar cache)
DROP FUNCTION IF EXISTS public.save_wa_history(payload JSONB);
DROP FUNCTION IF EXISTS public.save_history_v3(JSONB);

CREATE OR REPLACE FUNCTION public.save_history_v3(JSONB) 
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.wa_envios_per (total, success, error, contacts)
    VALUES (
        ($1->>'total')::int, 
        ($1->>'success')::int, 
        ($1->>'error')::int, 
        ($1->'contacts')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.save_history_v3(JSONB) TO anon, authenticated, service_role;

-- Recarregar cache
NOTIFY pgrst, 'reload schema';
