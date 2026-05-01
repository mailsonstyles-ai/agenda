-- Adiciona a coluna de logo na tabela de configurações
ALTER TABLE configuracoes 
ADD COLUMN IF NOT EXISTS logo_url TEXT;
