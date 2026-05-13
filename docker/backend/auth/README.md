# NexusOps Authentication Module

Este modulo sera responsable de:

- login
- registro
- JWT
- sesiones
- roles
- multiusuario
- permisos
- tenants

---

# Objetivo

Permitir que NexusOps soporte:
- multiples clientes
- multiples proyectos
- ownership de stacks
- autenticacion segura
- dashboard privado

---

# Estructura futura

```plaintext
/auth
├── routes.py
├── models.py
├── schemas.py
├── security.py
├── jwt.py
└── services.py
```

---

# Roles futuros

- superadmin
- admin
- client
- support

---

# Integraciones futuras

- OAuth
- Google login
- GitHub login
- API tokens
- session refresh
