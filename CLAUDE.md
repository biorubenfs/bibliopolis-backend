# CLAUDE.md

Este fichero da indicaciones a Claude Code (claude.ai/code) para trabajar con el código de este repositorio.

## Visión general

Backend de Bibliopolis: una API REST (Express 4 + TypeScript, ESM) sobre MongoDB para gestionar usuarios, sus bibliotecas personales y los libros que contienen. Los metadatos de los libros se obtienen por ISBN de fuentes externas (Google Books, Open Library). El gestor de paquetes es **pnpm** (v10); Node 22 (`.nvmrc`).

## Comandos

```bash
pnpm run build            # tsc -> dist/
pnpm run start            # ejecuta dist/main.js (requiere build previo)
pnpm run start:dev        # nodemon: recompila y reinicia al cambiar src
pnpm run lint             # ts-standard (lint:fix para autocorregir)

pnpm run test             # unitarios + integración
pnpm run test:unit        # solo src/tests/unit (sin BD)
pnpm run test:integration # solo src/tests/integration (replica set de Mongo en memoria)
pnpm run test:coverage

pnpm run seed             # carga data/seed/*.json en MONGO_URI (hacer build antes)

pnpm run docs:dev         # mkdocs serve en http://127.0.0.1:8001 (el 8000 lo ocupa Portainer)
mkdocs build --strict     # comprueba la documentación (falla con enlaces rotos o páginas fuera del nav)
```

Ejecutar un único fichero de test / un único test (los scripts `test*` establecen `ENVIRONMENT=test` y `JWT_ACCESS_TOKEN_SECRET=test`, que son obligatorios):

```bash
pnpm run test:integration src/tests/integration/libraries.test.ts
pnpm run test:integration -t "should list user libraries"
```

El desarrollo local necesita un **replica set** de MongoDB (se usan transacciones); ver README.md para la configuración con docker-compose de un `rs0` de un solo nodo. Cadena de conexión: `mongodb://localhost:27018/bibliopolis`. Copiar `.env.example` a `.env`; toda la configuración se lee en `src/config.ts`.

## Estilo de código

- ts-standard (StandardJS para TS): sin punto y coma, espacio antes de los paréntesis de función, expresiones booleanas estrictas (usar comprobaciones `!= null` en lugar de truthiness).
- ESM: los imports relativos **deben** usar la extensión `.js` (`import x from './foo.js'`).

## Arquitectura

Flujo de una petición: `main.ts` → `App` (`app.ts`: conecta a Mongo, arranca `Server`, ejecuta `init()` de los DAO para índices/admin por defecto, arranca las tareas cron) → `Server` (`server.ts`: rate limit, CORS, routers, manejador de errores).

- `/auth` es público; el resto de routers pasan por `checkJwt` (`middlewares/jwt.middleware.ts`), que establece `req.userId` y `req.role` (tipados en `src/express.d.ts`). La autenticación usa un único JWT (sin refresh token): `POST /auth/login` lo devuelve en el body y el cliente lo envía en la cabecera `Authorization: Bearer`. Caducidad configurable con `JWT_EXPIRATION` (7d por defecto).

Cada recurso en `src/resources/<nombre>/` sigue la misma estructura de capas:

- `*.router.ts` — rutas. Los handlers se envuelven en `handler()` (`src/handler.ts`) y devuelven `{ status, data }`; nunca tocan `res` directamente. Validación con `bodyValidator(schema)`, `queryParamsValidator(schema)`, `queryPaginationValidator` (esquemas zod en `*.schemas.ts`).
- `*.service.ts` — lógica de negocio y comprobación de permisos (por `userId`/`Role`); devuelve objetos resultado de `src/results.ts` (`SingleResultObject`, `CollectionResultObject` con paginación, `MiscResultObject`, `TokenResultObject`, `StreamResultObject`, …). `handler()` los serializa según su clase.
- `*.dao.ts` — extiende `Dao<T>` (`src/dao.ts`); es dueño de la colección de Mongo y mapea documentos de BD a entidades. Se exporta como instancia singleton.
- `*.entity.ts` — extiende `Entity<EntityType>` (`src/entity.ts`); `attributes()` define la forma pública del JSON (`{ type, id, attributes }`).
- `*.interfaces.ts` — tipos de documentos de BD (`DB*`) y DTOs. `*.error.ts` — errores del recurso que extienden `ApiError`.

Errores: lanzar subclases de `ApiError` (`src/error/`) con un `ApiRestErrorCode`; `error-handler.ts` las convierte en `{ statusCode, errorCode, message, validationError }`. Cualquier otra cosa se convierte en un 500.

Modelo de dominio: `books` es un catálogo compartido indexado por ISBN; `user-books` son los ejemplares de un usuario, desnormalizan campos del libro (título, autores, portada, ISBNs) y listan las `libraries` a las que pertenecen; las `libraries` pertenecen a un usuario. Los IDs son ULIDs guardados como `_id` de tipo string. Las escrituras en varias colecciones usan `runInTransaction` (`src/transaction-helper.ts`).

Fuentes externas de libros: `resources/sources/sources.config.ts` lista las fuentes por orden de prioridad; para añadir una fuente nueva, hacerlo ahí. Las portadas se guardan como `{ source, value }` y se convierten en URLs con `getCoverUrl` usando las variables de entorno `*_COVER_URL_PATTERN`. Las tareas cron se registran en `src/tasks/scheduler.ts` (p. ej. la sincronización semanal de libros sin autores/portada, que se propaga a los user-books).

La búsqueda en user-books usa una etapa `$search` de Atlas Search, pero solo cuando `ENVIRONMENT` no es `local`/`test`; en esos entornos se usa una consulta normal.

Formato de las respuestas (generadas por `handler()` a partir de los objetos resultado):

```jsonc
{ "results": { "type": "books", "id": "<ulid>", "attributes": { … } } }            // único
{ "results": [ … ], "paginationInfo": { "skip": 0, "limit": 10, "total": 100 } }  // colección
{ "statusCode": 400, "errorCode": "INVALID_BODY", "message": "…", "validationError": [ … ] } // error
```

Añadir un recurso nuevo: copiar las capas de `books/` o `libraries/`, registrar el router en `src/server.ts` (después de `checkJwt` salvo que deba ser público) y, si el DAO crea índices, llamar a su `init()` en `src/app.ts`.

## Convenciones y trampas habituales

- Solo el driver nativo de MongoDB, sin Mongoose ni ORM. Mirar los DAO existentes para ver los patrones de consulta.
- IDs: paquete `ulid`, nunca `uuid` ni `ObjectId`.
- No lanzar nunca un `Error` genérico desde el código de una petición: se convierte en un 500. Usar o crear una subclase de `ApiError` en `<recurso>.error.ts`.
- El manejo de ISBN (dígito de control, conversión ISBN-10 ↔ 13) está en `src/utils/isbn.utils.ts`; reutilizarlo.
- No hay logout en el servidor ni revocación de tokens: el cliente descarta el JWT y este sigue siendo válido hasta que caduca.
- Las escrituras que afectan a más de una colección (p. ej. user-books + libraries) deben ir dentro de `runInTransaction`.

## Acuerdo de trabajo (para Claude)

- Trabajar siempre en una rama, nunca hacer commit directamente en `main`. Los nombres de rama siguen `feature/…`, `fix/…`, `refactor/…`, `chore/…`, `ci/…`, `docs/…`; los mensajes de commit usan Conventional Commits (`feat:`, `fix:`, `chore:` …).
- Los mensajes de commit tienen solo asunto (una línea), sin cuerpo ni trailers (tampoco `Co-Authored-By`), salvo que el usuario indique lo contrario.
- Antes de dar un cambio por terminado, ejecutar `pnpm run build`, `pnpm run lint` y los tests relevantes (`test:unit` / `test:integration`). Son las mismas comprobaciones que ejecuta la CI.
- Todo cambio de comportamiento o corrección de bug va acompañado de un test de integración (o unitario si es una función pura). Para un bug, escribir primero el test que falla.
- Todo cambio en la API (endpoint nuevo o eliminado, body, query params, respuesta, códigos de error, permisos) se documenta en `docs/` en la misma rama, siguiendo la sección [Documentación](#documentación). Un cambio de la API no está terminado si la documentación no está al día.
- Limitar los cambios a la tarea; proponer las refactorizaciones no relacionadas en lugar de hacerlas.
- El usuario escribe en español y las respuestas a él van en español; el código, los comentarios, los commits y los PRs van en inglés.

## Documentación

La documentación de la API está en `docs/` (MkDocs, tema `readthedocs`) y se publica en Read the Docs (`.readthedocs.yml`, dependencias en `docs/requirements.txt`). Está escrita en español.

- Una página por recurso en `docs/api/<recurso>.md`; `docs/index.md` recoge la autenticación, el formato de respuestas, la paginación y la tabla de códigos de error.
- Cada página empieza con la tabla de atributos de la entidad y, por endpoint (`## MÉTODO /ruta`), documenta: descripción y permisos, body (ejemplo JSON + tabla `Campo | Tipo | Requerido | Descripción`, con los límites de los esquemas zod), query params y respuestas (`#### <status> <texto>` con ejemplo JSON). Usar `libraries.md` como referencia.
- Los ejemplos deben salir del código real (`attributes()` de la entidad, mensajes de las clases de error), no inventarse.
- Al añadir una página nueva, incluirla en `nav` de `mkdocs.yml` y en la tabla de recursos de `docs/index.md`. Un `ApiRestErrorCode` nuevo se añade a la tabla de errores de `docs/index.md`.
- Comprobar con `mkdocs build --strict` antes de dar el cambio por terminado.

## Tests

Los tests de integración atacan el servidor HTTP real mediante `fetch` en el puerto 3001. `src/tests/setup/global-setup.ts` arranca un replica set de `mongodb-memory-server` junto con el servidor y escribe su URI en `.test-mongo-uri`; `setup-tests.ts` reconecta cada worker a esa URI (ver `src/tests/readme_es.md` para el porqué). Los tests se ejecutan en secuencia en un único fork; no activar el paralelismo. Cada suite carga fixtures con `loadDataInDb(DataSetType.Test, MockDataSet.…)` desde `data/test-mock-data/` en `beforeAll` y llama a `mongo.clean()` en `afterAll`. Usar `testUtils.login()` / `buildAuthorizationHeader()` de `src/tests/utils/utils.ts` para la autenticación.

## Despliegue

- **CI** (`.github/workflows/ci.yml`): se ejecuta en cada push y en los PRs a `main`; hace build, lint, tests unitarios y de integración. No publica nada.
- **Publicación de la imagen** (`.github/workflows/deploy.yml`): se lanza a mano (`workflow_dispatch`) y publica la imagen Docker en `ghcr.io/${{ github.repository }}`, es decir, el nombre de la imagen sale del nombre del repositorio (`biorubenfs/bibliopolis-backend`). Etiquetas: `latest` y `main-<sha>`.
- **Ejecución en el VPS**: cada entorno tiene su carpeta con copias de `docker-compose.yml` (común: imagen `ghcr.io/biorubenfs/bibliopolis-backend:latest`, `.env`, límites, healthcheck) y de su override (`docker-compose.dev.yml` / `docker-compose.prod.yml`), que fija el nombre de proyecto (`name: bibliopolis-dev` / `bibliopolis-prod`), el nombre del contenedor y el puerto (3000 dev, 3001 prod). Se despliega con los alias del VPS:

  ```bash
  deploy-dev   # docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --pull always
  deploy-prod  # docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --pull always
  ```

  Compose siempre debe lanzarse con los dos ficheros: con solo `docker-compose.yml` crea un contenedor extra (`backend-app-1`) sin puertos publicados. Para limpiar un contenedor sobrante usar `docker rm -f <nombre>`, no `docker compose down`.
Como el nombre de la imagen depende del nombre del repositorio, si se renombra el repositorio hay que actualizar `image:` en `docker-compose.yml` (aquí y en la copia del VPS).
