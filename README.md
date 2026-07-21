# VM Nexus Dashboard

Aplicativo interno e independente da VM Nexus Digital para administrar produtos SaaS, clientes, tenants, unidades, planos, assinaturas, suporte, métricas e auditoria.

## Separação obrigatória

- O MesaManda é um produto utilizado pelos restaurantes e suas equipes.
- A VM Nexus Dashboard é uma central privada da VM Nexus Digital.
- Usuários dos clientes nunca devem possuir acesso a esta aplicação.
- A integração futura acontece por APIs administrativas autenticadas, não por rotas internas do MesaManda.

## Plataformas

- Interface compartilhada: React + Vite.
- Aplicativo desktop: Tauri 2.
- Android: base preparada para inicialização com Tauri Mobile.

## Comandos

```powershell
npm install
npm run dev
npm run lint
npm run build
npm run desktop:dev
```

## API independente

O backend fica em `server/` e não compartilha autenticação ou rotas com o MesaManda.

```powershell
cd server
Copy-Item .env.example .env
# edite DATABASE_URL, JWT_SECRET, NEXUS_ADMIN_EMAIL e NEXUS_ADMIN_PASSWORD
npm install
npm run migrate
npm run bootstrap:admin
npm run dev
```

Endpoints iniciais:

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/tenants`
- `POST /api/tenants`

O Android exige Android Studio, SDK, NDK e configuração do ambiente. Depois dessa preparação:

```powershell
npm run android:init
npm run android:dev
```

## Próxima etapa

Criar o backend administrativo exclusivo da VM Nexus com autenticação própria, tenants, unidades, produtos, planos, assinaturas e auditoria.
