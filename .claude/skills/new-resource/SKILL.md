---
name: new-resource
description: Crea la estructura de un nuevo recurso REST (router, service, dao, entity, schemas, interfaces, errores y test de integración) siguiendo las capas del proyecto. Usar cuando el usuario pida añadir un recurso, colección o grupo de endpoints nuevo.
---

# Nuevo recurso

Argumento: el nombre del recurso en kebab-case y plural (p. ej. `loans`). Si no se indica, preguntarlo, junto con los campos y los endpoints.

1. Leer `src/resources/libraries/` de principio a fin: es la implementación de referencia (CRUD perteneciente a un usuario, paginación, comprobación de permisos). Leer también `src/dao.ts`, `src/entity.ts`, `src/results.ts` y `src/handler.ts`.
2. Crear `src/resources/<nombre>/` con:
   - `<nombre>.interfaces.ts` — tipo de documento `DB<Nombre>` (`_id: string` ULID, `createdAt`, `updatedAt`) y DTOs.
   - `<nombre>.schemas.ts` — esquemas zod para bodies y query params.
   - `<nombre>.entity.ts` — extiende `Entity`; `attributes()` es la forma pública (no exponer nunca campos internos).
   - `<nombre>.dao.ts` — extiende `Dao<DB<Nombre>>` y se exporta como singleton; `init()` crea los índices si hacen falta.
   - `<nombre>.error.ts` — subclases de `ApiError`, con nuevos valores de `ApiRestErrorCode` si hacen falta.
   - `<nombre>.service.ts` — lógica de negocio y comprobación de permisos por `userId` / `Role`; devuelve objetos resultado.
   - `<nombre>.router.ts` — handlers envueltos en `handler()`, con los validadores de `src/middlewares/`.
3. Registrar el router en `src/server.ts` (después de `checkJwt` salvo que sea público) y llamar a `<nombre>Dao.init()` en `src/app.ts` si tiene índices.
4. Añadir fixtures en `data/test-mock-data/` y una entrada en `MockDataSet`, y crear `src/tests/integration/<nombre>.test.ts` cubriendo los casos de éxito, 401/403/404 y los errores de validación.
5. Documentar el recurso en `docs/api/<nombre>.md` siguiendo la sección "Documentación" de `CLAUDE.md` (tomar `docs/api/libraries.md` como plantilla), añadirlo al `nav` de `mkdocs.yml` y a la tabla de recursos de `docs/index.md`, y añadir los nuevos `ApiRestErrorCode` a la tabla de errores.
6. Ejecutar `pnpm run build`, `pnpm run lint`, `pnpm run test:integration src/tests/integration/<nombre>.test.ts` y `mkdocs build --strict`. Corregir hasta que todo pase y después resumir los endpoints creados.
