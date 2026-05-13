# NexusOps Frontend

Frontend oficial de NexusOps construido con Next.js.

## Objetivo

El frontend funciona como:
- dashboard operativo
- panel de despliegues
- interfaz SaaS
- monitoreo Docker
- gestion de stacks
- futura administracion multiusuario

---

# Desarrollo local

## Instalar dependencias

```bash
npm install
```

## Ejecutar frontend

```bash
npm run dev
```

Frontend disponible en:

```plaintext
http://localhost:3000
```

---

# Variables de entorno

Crear archivo:

```plaintext
.env.local
```

Ejemplo:

```env
NEXT_PUBLIC_API_URL=/api
```

---

# Arquitectura API

El frontend consume el backend mediante:

```plaintext
/api
```

NGINX se encarga de:
- proxy reverso
- forwarding
- manejo de servicios internos Docker

---

# Estructura futura

```plaintext
frontend/
├── app/
├── components/
├── lib/
├── services/
├── dashboard/
├── auth/
└── templates/
```

---

# Objetivos futuros

- autenticacion
- dashboard SaaS
- multiusuario
- monitoreo avanzado
- despliegues automatizados
- marketplace de templates
