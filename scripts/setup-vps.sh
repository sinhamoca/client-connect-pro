#!/bin/bash
set -e

# ============================================================
#  GestãoPro - Script de Instalação Completa para VPS
#  
#  Requisitos: Ubuntu 20.04+ / Debian 11+
#  
#  O que este script faz:
#    1. Instala Docker, Docker Compose, Node.js, Nginx
#    2. Clona o repositório
#    3. Configura o Supabase self-hosted (Docker)
#    4. Gera chaves JWT, anon key, service role key
#    5. Gera a ENCRYPTION_KEY (AES-256)
#    6. Compila o frontend
#    7. Configura o Nginx (porta 4060)
#    8. Cria o usuário administrador
#    9. Faz deploy das edge functions
#
#  Uso:
#    chmod +x scripts/setup-vps.sh
#    sudo ./scripts/setup-vps.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║      GestãoPro - Instalação VPS          ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
  echo ""
}

print_step() {
  echo ""
  echo -e "${GREEN}▶ $1${NC}"
  echo "────────────────────────────────────────"
}

print_warn() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
  echo -e "${RED}✖ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✔ $1${NC}"
}

# ============================================================
# PRE-FLIGHT CHECKS
# ============================================================
if [ "$EUID" -ne 0 ]; then
  print_error "Execute como root: sudo ./scripts/setup-vps.sh"
  exit 1
fi

print_banner

# ============================================================
# CONFIGURAÇÕES INTERATIVAS
# ============================================================
print_step "Configuração inicial"

# Domínio ou IP
read -p "Domínio ou IP público da VPS (ex: gestao.meusite.com ou 123.45.67.89): " DOMAIN
if [ -z "$DOMAIN" ]; then
  print_error "Domínio/IP é obrigatório"
  exit 1
fi

# Porta do frontend
read -p "Porta para o frontend [4060]: " FRONTEND_PORT
FRONTEND_PORT=${FRONTEND_PORT:-4060}

# Senha do banco de dados
read -sp "Senha para o banco de dados PostgreSQL: " DB_PASSWORD
echo ""
if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD=$(openssl rand -hex 16)
  print_warn "Senha gerada automaticamente: $DB_PASSWORD"
fi

# Encryption Key
echo ""
echo -e "${CYAN}Chave de Criptografia AES-256 para proteger dados sensíveis.${NC}"
echo -e "${CYAN}Você pode gerar uma com: openssl rand -hex 32${NC}"
read -p "ENCRYPTION_KEY (deixe vazio para gerar automaticamente): " ENCRYPTION_KEY
if [ -z "$ENCRYPTION_KEY" ]; then
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  print_warn "Chave gerada: $ENCRYPTION_KEY"
fi

# Admin credentials
echo ""
read -p "E-mail do administrador: " ADMIN_EMAIL
read -sp "Senha do administrador (mín. 6 caracteres): " ADMIN_PASSWORD
echo ""
if [ ${#ADMIN_PASSWORD} -lt 6 ]; then
  print_error "Senha deve ter no mínimo 6 caracteres"
  exit 1
fi

# ============================================================
# DIRETÓRIO DE INSTALAÇÃO
# ============================================================
INSTALL_DIR="/opt/gestaopro"
SUPABASE_DIR="$INSTALL_DIR/supabase-docker"
REPO_DIR="$INSTALL_DIR/app"
BACKUP_DIR="$INSTALL_DIR/backups"

mkdir -p "$INSTALL_DIR" "$BACKUP_DIR"

# ============================================================
# 1. INSTALAR DEPENDÊNCIAS
# ============================================================
print_step "1/9 - Instalando dependências do sistema"

apt-get update -qq

# Docker
if ! command -v docker &> /dev/null; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  print_success "Docker instalado"
else
  print_success "Docker já instalado"
fi

# Docker Compose
if ! command -v docker compose &> /dev/null; then
  echo "Instalando Docker Compose plugin..."
  apt-get install -y -qq docker-compose-plugin
  print_success "Docker Compose instalado"
else
  print_success "Docker Compose já instalado"
fi

# Node.js 20+
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 20 ]; then
  echo "Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  print_success "Node.js instalado: $(node -v)"
else
  print_success "Node.js já instalado: $(node -v)"
fi

# Nginx
if ! command -v nginx &> /dev/null; then
  echo "Instalando Nginx..."
  apt-get install -y -qq nginx
  systemctl enable nginx
  print_success "Nginx instalado"
else
  print_success "Nginx já instalado"
fi

# Ferramentas auxiliares
apt-get install -y -qq git jq openssl > /dev/null 2>&1

# ============================================================
# 2. CLONAR REPOSITÓRIO
# ============================================================
print_step "2/9 - Clonando repositório"

if [ -d "$REPO_DIR" ]; then
  print_warn "Repositório já existe em $REPO_DIR, atualizando..."
  cd "$REPO_DIR" && git pull
else
  git clone https://github.com/sinhamoca/client-connect-pro.git "$REPO_DIR"
fi
cd "$REPO_DIR"
print_success "Repositório pronto em $REPO_DIR"

# ============================================================
# 3. CONFIGURAR SUPABASE SELF-HOSTED
# ============================================================
print_step "3/9 - Configurando Supabase (Docker)"

if [ ! -d "$SUPABASE_DIR" ]; then
  git clone --depth 1 https://github.com/supabase/supabase.git "$SUPABASE_DIR-tmp"
  mv "$SUPABASE_DIR-tmp/docker" "$SUPABASE_DIR"
  rm -rf "$SUPABASE_DIR-tmp"
fi

cd "$SUPABASE_DIR"

# Gerar JWT Secret
JWT_SECRET=$(openssl rand -hex 32)

# Gerar Anon Key e Service Role Key usando JWT
generate_jwt() {
  local role=$1
  local payload=$(echo -n "{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$(date +%s),\"exp\":$(($(date +%s) + 315360000))}" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
  local header=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 -w 0 | tr '+/' '-_' | tr -d '=')
  local signature=$(echo -n "$header.$payload" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64 -w 0 | tr '+/' '-_' | tr -d '=')
  echo "$header.$payload.$signature"
}

ANON_KEY=$(generate_jwt "anon")
SERVICE_ROLE_KEY=$(generate_jwt "service_role")

# Configurar .env do Supabase
cp -f .env.example .env 2>/dev/null || true

VAULT_ENC_KEY=$(openssl rand -hex 32)
SECRET_KEY_BASE=$(openssl rand -hex 64)
LOGFLARE_API_KEY=$(openssl rand -hex 32)
PG_META_CRYPTO_KEY=$(openssl rand -hex 32)

cat > .env << ENVFILE
############
# Secrets
############
POSTGRES_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$ADMIN_PASSWORD
VAULT_ENC_KEY=$VAULT_ENC_KEY
SECRET_KEY_BASE=$SECRET_KEY_BASE
PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY

############
# Database
############
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432

############
# Pooler (Supavisor)
############
POOLER_TENANT_ID=default
POOLER_DB_POOL_SIZE=20
POOLER_MAX_CLIENT_CONN=100
POOLER_DEFAULT_POOL_SIZE=20
POOLER_PROXY_PORT_TRANSACTION=6543

############
# API
############
SITE_URL=http://$DOMAIN:$FRONTEND_PORT
API_EXTERNAL_URL=http://$DOMAIN:8000
SUPABASE_PUBLIC_URL=http://$DOMAIN:8000

############
# Kong
############
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443

############
# Auth (GoTrue)
############
GOTRUE_SITE_URL=http://$DOMAIN:$FRONTEND_PORT
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=true
GOTRUE_SMS_AUTOCONFIRM=false
GOTRUE_DISABLE_SIGNUP=false
JWT_EXPIRY=3600
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_ANONYMOUS_USERS=false
DISABLE_SIGNUP=false
ADDITIONAL_REDIRECT_URLS=
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify
MAILER_URLPATHS_INVITE=/auth/v1/verify
SMTP_ADMIN_EMAIL=admin@localhost
SMTP_HOST=supabase-mail
SMTP_PORT=2500
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=GestãoPro

############
# PostgREST
############
PGRST_DB_SCHEMAS=public,storage,graphql_public

############
# Storage
############
REGION=local
S3_PROTOCOL_ACCESS_KEY_ID=storage-key-id
S3_PROTOCOL_ACCESS_KEY_SECRET=storage-key-secret
GLOBAL_S3_BUCKET=stub
STORAGE_TENANT_ID=stub

############
# Edge Functions
############
SUPABASE_EDGE_RUNTIME_ENCRYPTION_KEY=$ENCRYPTION_KEY
FUNCTIONS_VERIFY_JWT=false

############
# Logflare
############
LOGFLARE_PUBLIC_ACCESS_TOKEN=$LOGFLARE_API_KEY
LOGFLARE_PRIVATE_ACCESS_TOKEN=$LOGFLARE_API_KEY

############
# Docker
############
DOCKER_SOCKET_LOCATION=/var/run/docker.sock

############
# Studio (Supabase Dashboard)
############
STUDIO_DEFAULT_ORGANIZATION=GestãoPro
STUDIO_DEFAULT_PROJECT=GestãoPro
STUDIO_PORT=3000

############
# Other
############
IMGPROXY_ENABLE_WEBP_DETECTION=true
ENVFILE

print_success "Supabase configurado"

# ============================================================
# 4. SUBIR SUPABASE
# ============================================================
print_step "4/9 - Iniciando Supabase (Docker)"

docker compose up -d

echo "Aguardando serviços iniciarem..."
sleep 15

# Verificar se está rodando
if docker compose ps --format json 2>/dev/null | grep -qi "running\|healthy\|Up" || docker compose ps 2>/dev/null | grep -qi "Up\|running\|healthy"; then
  print_success "Supabase rodando!"
else
  print_error "Erro ao iniciar Supabase. Execute 'docker compose logs' em $SUPABASE_DIR"
  exit 1
fi

SUPABASE_URL="http://localhost:8000"

# ============================================================
# 5. CONFIGURAR FRONTEND (.env)
# ============================================================
print_step "5/9 - Configurando frontend"

cd "$REPO_DIR"

cat > .env << FRONTENV
VITE_SUPABASE_URL=http://$DOMAIN:8000
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=self-hosted
FRONTENV

print_success "Arquivo .env do frontend criado"

# ============================================================
# 6. COMPILAR FRONTEND
# ============================================================
print_step "6/9 - Compilando frontend"

npm install --legacy-peer-deps
npm run build

if [ -d "dist" ]; then
  print_success "Frontend compilado em $REPO_DIR/dist"
else
  print_error "Erro na compilação. Verifique os logs acima."
  exit 1
fi

# ============================================================
# 7. CONFIGURAR NGINX
# ============================================================
print_step "7/9 - Configurando Nginx"

cat > /etc/nginx/sites-available/gestaopro << NGINXCONF
server {
    listen $FRONTEND_PORT;
    server_name $DOMAIN;

    root $REPO_DIR/dist;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # SPA routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache de assets estáticos
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Proxy para API Supabase (opcional, evita CORS)
    location /rest/ {
        proxy_pass http://localhost:8000/rest/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /auth/ {
        proxy_pass http://localhost:8000/auth/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /functions/ {
        proxy_pass http://localhost:8000/functions/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINXCONF

ln -sf /etc/nginx/sites-available/gestaopro /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
print_success "Nginx configurado na porta $FRONTEND_PORT"

# ============================================================
# 8. APLICAR MIGRATIONS + CRIAR ADMIN
# ============================================================
print_step "8/9 - Aplicando migrations e criando administrador"

# Aplicar migrations (se houver arquivos SQL na pasta)
if [ -d "$REPO_DIR/supabase/migrations" ]; then
  echo "Aplicando migrations..."
  for migration in "$REPO_DIR/supabase/migrations"/*.sql; do
    if [ -f "$migration" ]; then
      echo "  → $(basename $migration)"
      docker exec -i supabase-db psql -U postgres -d postgres < "$migration" 2>/dev/null || true
    fi
  done
  print_success "Migrations aplicadas"
fi

# Aguardar API estar pronta
echo "Aguardando API ficar disponível..."
for i in {1..30}; do
  if curl -s "$SUPABASE_URL/rest/v1/" -H "apikey: $ANON_KEY" > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Criar admin
echo "Criando usuário administrador..."
SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY" node "$REPO_DIR/scripts/adminpass.js" << ADMININPUT
$ADMIN_EMAIL
$ADMIN_PASSWORD
ADMININPUT

print_success "Administrador criado"

# ============================================================
# 9. CONFIGURAR EDGE FUNCTIONS
# ============================================================
print_step "9/9 - Configurando Edge Functions"

# Criar arquivo de secrets para edge functions
EDGE_SECRETS_FILE="$SUPABASE_DIR/volumes/functions/secrets.env"
mkdir -p "$(dirname $EDGE_SECRETS_FILE)"

cat > "$EDGE_SECRETS_FILE" << EDGESECRETS
SUPABASE_URL=http://kong:8000
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_ANON_KEY=$ANON_KEY
ENCRYPTION_KEY=$ENCRYPTION_KEY
EDGESECRETS

# Copiar edge functions para o volume do Supabase
FUNCTIONS_DIR="$SUPABASE_DIR/volumes/functions"
mkdir -p "$FUNCTIONS_DIR"

for func_dir in "$REPO_DIR/supabase/functions"/*/; do
  if [ -d "$func_dir" ]; then
    func_name=$(basename "$func_dir")
    if [ "$func_name" != "_shared" ]; then
      cp -r "$func_dir" "$FUNCTIONS_DIR/$func_name"
      echo "  → $func_name"
    fi
  fi
done

# Reiniciar edge-functions container para carregar as novas funções
docker compose restart functions 2>/dev/null || true
print_success "Edge Functions configuradas"

# ============================================================
# SALVAR BACKUP DAS CHAVES
# ============================================================
print_step "Salvando backup de segurança"

KEYS_FILE="$BACKUP_DIR/keys-$(date +%Y%m%d-%H%M%S).txt"
cat > "$KEYS_FILE" << KEYSBACKUP
╔══════════════════════════════════════════════════╗
║  GestãoPro - Chaves de Segurança                ║
║  Gerado em: $(date)                ║
║                                                  ║
║  ⚠️  GUARDE ESTE ARQUIVO EM LOCAL SEGURO!        ║
║  ⚠️  NÃO COMPARTILHE COM NINGUÉM!               ║
╚══════════════════════════════════════════════════╝

── Banco de Dados ──
POSTGRES_PASSWORD=$DB_PASSWORD

── JWT ──
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY

── Criptografia (AES-256) ──
ENCRYPTION_KEY=$ENCRYPTION_KEY

── Administrador ──
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD

── URLs ──
FRONTEND: http://$DOMAIN:$FRONTEND_PORT
SUPABASE API: http://$DOMAIN:8000
SUPABASE STUDIO: http://$DOMAIN:3000

── Diretórios ──
App: $REPO_DIR
Supabase: $SUPABASE_DIR
Backups: $BACKUP_DIR
KEYSBACKUP

chmod 600 "$KEYS_FILE"
print_success "Chaves salvas em: $KEYS_FILE"

# ============================================================
# RESUMO FINAL
# ============================================================
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         ✅ INSTALAÇÃO CONCLUÍDA!                 ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}🌐 Frontend:${NC}       http://$DOMAIN:$FRONTEND_PORT"
echo -e "  ${GREEN}🔌 API Supabase:${NC}   http://$DOMAIN:8000"
echo -e "  ${GREEN}📊 Studio:${NC}         http://$DOMAIN:3000"
echo ""
echo -e "  ${GREEN}👤 Admin:${NC}          $ADMIN_EMAIL"
echo -e "  ${GREEN}🔐 Painel Admin:${NC}   http://$DOMAIN:$FRONTEND_PORT/admin"
echo ""
echo -e "  ${YELLOW}📁 Backup chaves:${NC}  $KEYS_FILE"
echo -e "  ${YELLOW}⚠️  GUARDE O ARQUIVO DE BACKUP EM LOCAL SEGURO!${NC}"
echo ""
echo -e "  ${CYAN}Comandos úteis:${NC}"
echo -e "    Logs Supabase:   cd $SUPABASE_DIR && docker compose logs -f"
echo -e "    Reiniciar:       cd $SUPABASE_DIR && docker compose restart"
echo -e "    Rebuild frontend: cd $REPO_DIR && npm run build && systemctl reload nginx"
echo ""
