# Guía de Despliegue y Migración - HelixNOC v1.0

¡Felicidades por llegar a la versión 1.0! Esta guía te indica cómo llevar el sistema **con todos tus datos actuales** a tu nuevo servidor.

## 1. Archivos que debes llevarte
Copia estas carpetas y archivos desde tu computadora actual y pásalos al nuevo servidor:
- Carpeta `backend/` completa
- Carpeta `frontend/` completa
- Archivo `docker-compose.prod.yml`
- Archivo `helix_db_backup.dump` (Acabo de generarlo, contiene toda tu base de datos actual con clientes, ONU, y perfiles).

*Nota: No necesitas copiar las carpetas `node_modules` ni la carpeta de postgres original.*

## 2. Iniciar el Sistema en el Nuevo Servidor
Abre una terminal en tu nuevo servidor, ve a la carpeta donde pegaste los archivos y ejecuta este comando para construir y arrancar los contenedores en modo producción:

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```
Espera a que los contenedores estén corriendo y la base de datos se inicie por primera vez.

## 3. Restaurar tu Base de Datos (Tus clientes, OLT y perfiles)
Una vez que el contenedor `helix_db_prod` esté corriendo en el nuevo servidor, necesitamos inyectarle tu archivo `.dump` para que recupere toda tu información.
Ejecuta estos dos comandos en el servidor nuevo:

1. Copia el archivo `.dump` adentro del nuevo contenedor de base de datos:
```bash
docker cp helix_db_backup.dump helix_db_prod:/tmp/helix_db_backup.dump
```

2. Restaura toda tu información:
```bash
docker exec -it helix_db_prod pg_restore -U helix_user -d helix_db -1 /tmp/helix_db_backup.dump
```
Si te muestra mensajes de advertencia sobre "role does not exist" no te preocupes, es normal, tu información ya estará restaurada.

## 4. IP o Localhost (El detalle que mencionaste)
Como me confirmaste que será "local", el `docker-compose.prod.yml` tiene la URL configurada como `http://localhost:8000`. 
- Si entras a la interfaz desde el navegador **del propio servidor**, funcionará perfecto.
- **Sin embargo**, si el servidor está en una IP (ej. `192.168.1.50`) y tú entras desde tu laptop digitando `http://192.168.1.50:3000`, la pantalla cargará pero los datos no (intentará buscar la API en tu propia laptop).
- **Solución si eso pasa:** Abre el archivo `docker-compose.prod.yml`, cambia la línea `NEXT_PUBLIC_API_URL: http://localhost:8000` por `NEXT_PUBLIC_API_URL: http://192.168.1.50:8000` (poniendo la IP real del server), y corres de nuevo `docker-compose -f docker-compose.prod.yml up -d`.

¡Listo! Tu HelixNOC v1.0 estará en línea de forma segura, optimizada y con todos los datos que ya tenías guardados.
