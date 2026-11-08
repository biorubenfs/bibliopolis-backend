# API Imports

Importación de libros a una biblioteca existente a partir de un fichero CSV con una columna de ISBN. La importación se procesa en segundo plano, fila a fila, y al terminar queda un informe guardado con el resultado de cada fila.

Todos los endpoints son solo para el propietario de la importación. Un administrador no tiene bibliotecas y recibe un `403` (`must be a regular user`) en todos ellos. Las importaciones y sus filas se borran junto con su biblioteca.

## Entidad Import

| Atributo     | Tipo        | Descripción                                                           |
| ------------ | ----------- | --------------------------------------------------------------------- |
| `userId`     | string      | ID del propietario                                                    |
| `libraryId`  | string      | ID de la biblioteca de destino                                        |
| `fileName`   | string      | Nombre del fichero subido                                             |
| `status`     | string      | `queued`, `running`, `completed` o `failed`                           |
| `counts`     | object      | Contadores de las filas. Se calculan al leer                          |
| `createdAt`  | string      | Fecha de creación (ISO 8601)                                          |
| `updatedAt`  | string      | Fecha de la última actualización (ISO 8601)                           |
| `finishedAt` | string/null | Fecha de finalización (ISO 8601). `null` mientras no ha terminado     |

Campos de `counts`:

| Campo              | Descripción                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `total`            | Filas no vacías del fichero                                                 |
| `processed`        | Filas con un resultado (`total - queued`)                                   |
| `queued`           | Filas esperando                                                             |
| `added`            | Filas con resultado `added`                                                 |
| `alreadyInLibrary` | Filas con resultado `already_in_library`                                    |
| `duplicateInFile`  | Filas con resultado `duplicate_in_file`                                     |
| `notFound`         | Filas con resultado `not_found`                                             |
| `invalidIsbn`      | Filas con resultado `invalid_isbn`                                          |
| `missingIsbn`      | Filas con resultado `missing_isbn`                                          |
| `sourceError`      | Filas con resultado `source_error`                                          |
| `internalError`    | Filas con resultado `internal_error`                                        |
| `pending`          | Filas pendientes (ver [Entidad Import Item](#entidad-import-item))          |
| `retryable`        | Filas que [`POST /imports/:id/retry`](#post-importsidretry) volvería a poner en cola |

## Entidad Import Item

Una fila no vacía del fichero. El número de fila es el que muestra una hoja de cálculo, contando la cabecera y las filas vacías.

| Atributo     | Tipo        | Descripción                                                                           |
| ------------ | ----------- | ------------------------------------------------------------------------------------- |
| `importId`   | string      | ID de la importación                                                                  |
| `row`        | number      | Número de fila en el fichero                                                          |
| `rawIsbn`    | string/null | Valor original de la columna de ISBN (máx. 64 caracteres)                             |
| `isbn13`     | string/null | ISBN-13 normalizado. Un ISBN-10 válido se convierte. `null` si no hay un ISBN válido  |
| `outcome`    | string      | Resultado de la fila (ver la tabla siguiente)                                         |
| `bookTitle`  | string/null | Título del libro del catálogo, si se ha encontrado                                    |
| `resolution` | string/null | `dismissed` (descartada), `manual` (añadida a mano) o `null`                          |
| `pending`    | boolean     | Si la fila sigue pendiente                                                            |

| `outcome`            | Significado                                    | ¿Requiere acción?         |
| -------------------- | ---------------------------------------------- | ------------------------- |
| `queued`             | Esperando                                      | No                        |
| `added`              | Añadido a la biblioteca                        | No                        |
| `already_in_library` | Ya estaba en la biblioteca                     | No                        |
| `duplicate_in_file`  | Repetido en el fichero                         | No                        |
| `not_found`          | Ninguna fuente lo tiene                        | Sí                        |
| `invalid_isbn`       | ISBN con formato incorrecto                    | Sí                        |
| `missing_isbn`       | Fila sin ISBN                                  | Sí                        |
| `source_error`       | Fuentes externas no disponibles                | Sí, se puede reintentar   |
| `internal_error`     | Fallo inesperado                               | Sí, se puede reintentar   |

Una fila está **pendiente** si requiere acción, su `resolution` es `null` y su `isbn13` no está en la biblioteca. Esto último se comprueba al leer, así que un libro que entra en la biblioteca por otra vía deja de estar pendiente, aunque conserva su `outcome`.

## Formato del fichero

- Límites: **200 filas** sin contar la cabecera ni las filas vacías, y **5 MB**.
- Codificación: UTF-8, con o sin BOM, o windows-1252.
- Separador: `,`, `;` o tabulador. Se detecta en la cabecera.
- La primera fila no vacía es siempre la cabecera. No se admiten ficheros sin cabecera.

Solo se usan las columnas de ISBN; las demás se ignoran, y el resto de los datos de cada libro se obtiene del catálogo o de las fuentes externas. Las columnas de ISBN se reconocen por su nombre en minúsculas, sin acentos y solo con letras y números, de forma que `ISBN-13`, `Isbn 13` e `isbn_13` son `isbn13`. Los nombres admitidos son, por prioridad: `isbn13`, `ean13`, `isbn`, `ean` e `isbn10`.

El ISBN de cada fila es el primer valor no vacío de las columnas de ISBN, en ese orden. Se admite el formato `="9788408292609"` y se ignoran los guiones y los espacios. Son válidos los ISBN-10 y los ISBN-13 con prefijo `978` o `979`. El CSV que exporta [`GET /user-books/download`](user-books.md) se puede importar tal cual.

## POST /imports

Crea una importación. Responde en cuanto la importación queda en cola: el progreso se consulta con [`GET /imports/:id`](#get-importsid). Con `?dryRun=true` analiza el fichero sin escribir nada.

Un usuario solo puede tener una importación activa (`queued` o `running`).

### Query Params

- `dryRun`: `true` o `false` (opcional, `false` por defecto) — Solo analiza el fichero. Se aplican las mismas validaciones de la biblioteca y del fichero, salvo las de la columna de ISBN y las filas válidas: el resultado permite elegir otra columna.

### Body

`multipart/form-data`:

| Campo         | Tipo     | Requerido | Descripción                                                                                    |
| ------------- | -------- | --------- | ---------------------------------------------------------------------------------------------- |
| `file`        | fichero  | Sí        | El CSV                                                                                         |
| `libraryId`   | string   | Sí        | Biblioteca existente del usuario                                                               |
| `isbnColumns` | number   | No        | Índice de una columna de ISBN, por orden de preferencia. Campo repetible. Si falta, se usan las detectadas |

### Respuestas

#### 200 OK

Solo con `dryRun=true`. Sin columna de ISBN detectada ni indicada, `isbnColumns` está vacío y todas las filas cuentan como `missingIsbn`.

```json
{
  "results": {
    "type": "import-analysis",
    "attributes": {
      "columns": [
        { "index": 0, "name": "Título" },
        { "index": 1, "name": "Autor/es" },
        { "index": 2, "name": "Isbn-13" },
        { "index": 3, "name": "Isbn-10" }
      ],
      "isbnColumns": [2, 3],
      "counts": {
        "rows": 5,
        "valid": 1,
        "invalidIsbn": 1,
        "missingIsbn": 1,
        "duplicateInFile": 1,
        "alreadyInLibrary": 1
      },
      "sample": [
        { "row": 2, "isbn": "9780306406157" }
      ]
    }
  }
}
```

| Campo                   | Descripción                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `counts.rows`           | Filas no vacías                                                          |
| `counts.valid`          | Filas que se buscarán para añadirlas                                     |
| `counts.alreadyInLibrary` | Filas con un ISBN que ya está en la biblioteca                         |
| `sample`                | Primeras 5 filas. `isbn` es el valor original                            |

#### 202 Accepted

Sin `dryRun`.

```json
{
  "results": {
    "type": "imports",
    "id": "01KBQ5X3Y0Q4Z8N6M2T7V9R1HC",
    "attributes": {
      "userId": "01J9BHWZ8N4B1JBSAFCBKQGERS",
      "libraryId": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
      "fileName": "libros.csv",
      "status": "queued",
      "counts": {
        "total": 4,
        "processed": 3,
        "queued": 1,
        "added": 0,
        "alreadyInLibrary": 0,
        "duplicateInFile": 1,
        "notFound": 0,
        "invalidIsbn": 1,
        "missingIsbn": 1,
        "sourceError": 0,
        "internalError": 0,
        "pending": 2,
        "retryable": 0
      },
      "createdAt": "2026-11-07T10:00:00.000Z",
      "updatedAt": "2026-11-07T10:00:00.000Z",
      "finishedAt": null
    }
  }
}
```

#### 400 Bad Request

| `errorCode`                  | `message`                                                  | Causa                                         |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| `VALIDATION ERROR`           | `invalid body`                                             | `libraryId` ausente o `isbnColumns` no válido |
| `INVALID IMPORT FILE`        | `a csv file is required`                                   | Falta el fichero                              |
| `INVALID IMPORT FILE`        | `the file is not a readable csv`                           | El fichero no se puede leer como CSV          |
| `INVALID IMPORT FILE`        | `the file has no rows`                                     | El fichero no tiene filas                     |
| `INVALID IMPORT FILE`        | `the file has no column with index 5`                      | `isbnColumns` indica una columna inexistente  |
| `IMPORT TOO MANY ROWS`       | `the file has 201 rows and the limit is 200`               | Demasiadas filas                              |
| `IMPORT WITHOUT ISBN COLUMN` | `no isbn column has been detected or selected`             | Sin columna de ISBN. No ocurre con `dryRun`   |
| `IMPORT WITHOUT VALID ISBN`  | `the file has no row with a valid isbn`                    | Ninguna fila válida. No ocurre con `dryRun`   |

```json
{
  "statusCode": 400,
  "errorCode": "IMPORT TOO MANY ROWS",
  "message": "the file has 201 rows and the limit is 200"
}
```

#### 403 Forbidden

La biblioteca es de otro usuario. Mismo comportamiento que [`GET /libraries/:id`](libraries.md).

#### 404 Not Found

La biblioteca no existe.

#### 409 Conflict

| `errorCode`             | `message`                                       | Causa                                    |
| ----------------------- | ----------------------------------------------- | ---------------------------------------- |
| `IMPORT ALREADY ACTIVE` | `user has already an import in progress`        | El usuario ya tiene una importación activa. No ocurre con `dryRun` |

#### 413 Payload Too Large

```json
{
  "statusCode": 413,
  "errorCode": "IMPORT FILE TOO LARGE",
  "message": "the file exceeds the limit of 5 MB"
}
```

## GET /imports

Lista las importaciones de una biblioteca, de la más reciente a la más antigua.

### Query Params

- `libraryId`: string (requerido) — ID de la biblioteca.
- `skip`, `limit`: [paginación](../index.md#paginacion).

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "imports",
      "id": "01KBQ5X3Y0Q4Z8N6M2T7V9R1HC",
      "attributes": { }
    }
  ],
  "paginationInfo": {
    "skip": 0,
    "limit": 10,
    "total": 1
  }
}
```

Los atributos son los de la [entidad Import](#entidad-import).

#### 400 Bad Request

Falta `libraryId` o la paginación no es válida.

#### 403 Forbidden

La biblioteca es de otro usuario.

#### 404 Not Found

La biblioteca no existe.

## GET /imports/:id

Devuelve el estado y los contadores de una importación.

### Respuestas

#### 200 OK

Con la [entidad Import](#entidad-import), en el mismo formato que la respuesta `202` de [`POST /imports`](#post-imports).

#### 403 Forbidden

La importación es de otro usuario.

```json
{
  "statusCode": 403,
  "errorCode": "PERMISSION ERROR",
  "message": "import not found"
}
```

#### 404 Not Found

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "import not found"
}
```

## GET /imports/:id/items

Lista las filas de una importación, ordenadas por número de fila.

### Query Params

- `outcome`: string (opcional, repetible) — Filtra por resultado.
- `pending`: `true` o `false` (opcional) — Filtra por filas pendientes o no pendientes.
- `skip`, `limit`: [paginación](../index.md#paginacion).

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "import-items",
      "id": "01KBQ5X3Y1A2B3C4D5E6F7G8H9",
      "attributes": {
        "importId": "01KBQ5X3Y0Q4Z8N6M2T7V9R1HC",
        "row": 2,
        "rawIsbn": "978-0-306-40615-7",
        "isbn13": "9780306406157",
        "outcome": "not_found",
        "bookTitle": null,
        "resolution": null,
        "pending": true
      }
    }
  ],
  "paginationInfo": {
    "skip": 0,
    "limit": 10,
    "total": 1
  }
}
```

#### 400 Bad Request

Un `outcome` o `pending` no válido, o una paginación no válida.

#### 403 Forbidden

La importación es de otro usuario.

#### 404 Not Found

La importación no existe.

## PATCH /imports/:id/items/:itemId

Marca una fila como descartada o como añadida a mano, o lo deshace. Solo admite filas cuyo resultado requiere acción.

### Body

```json
{
  "resolution": "dismissed"
}
```

| Campo        | Tipo        | Requerido | Descripción                                 |
| ------------ | ----------- | --------- | ------------------------------------------- |
| `resolution` | string/null | Sí        | `dismissed`, `manual`, o `null` para deshacer |

### Respuestas

#### 200 OK

Con la fila actualizada, en el formato de la [entidad Import Item](#entidad-import-item).

#### 400 Bad Request

`resolution` no es válido.

#### 403 Forbidden

La importación es de otro usuario.

#### 404 Not Found

La importación o la fila no existen.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "import item not found"
}
```

#### 409 Conflict

El resultado de la fila no requiere acción.

```json
{
  "statusCode": 409,
  "errorCode": "CONFLICT ERROR",
  "message": "a row with outcome added cannot be resolved"
}
```

## POST /imports/:id/retry

Vuelve a poner en cola las filas con resultado `source_error` o `internal_error` que no se han resuelto, y la importación con ellas. Una importación en estado `failed` también retoma las filas que seguían en cola.

### Respuestas

#### 202 Accepted

Con la [entidad Import](#entidad-import), en estado `queued`.

#### 403 Forbidden

La importación es de otro usuario.

#### 404 Not Found

La importación no existe.

#### 409 Conflict

| `errorCode`             | `message`                                | Causa                                      |
| ----------------------- | ---------------------------------------- | ------------------------------------------ |
| `IMPORT ALREADY ACTIVE` | `user has already an import in progress` | El usuario ya tiene una importación activa |
| `CONFLICT ERROR`        | `the import has no rows to retry`        | No hay filas que reintentar                |
