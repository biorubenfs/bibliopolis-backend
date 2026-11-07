# API de Bibliotecas

Este documento describe los endpoints para la gestión de bibliotecas. Una biblioteca pertenece a un usuario y contiene una lista de [user books](user-books.md) (ejemplares de libros del usuario).

Atributos de una biblioteca:

| Campo         | Tipo     | Descripción                                    |
| ------------- | -------- | ---------------------------------------------- |
| `name`        | string   | Nombre de la biblioteca                        |
| `description` | string   | Descripción de la biblioteca                   |
| `userId`      | string   | ID del usuario propietario                     |
| `books`       | string[] | IDs de los user books que contiene             |
| `createdAt`   | date     | Fecha de creación                              |
| `updatedAt`   | date     | Fecha de la última modificación                |

## POST /libraries

Crea una nueva biblioteca para el usuario autenticado.

### Body

```json
{
  "name": "Nombre de la biblioteca",
  "description": "Descripción de la biblioteca"
}
```

| Campo         | Tipo   | Requerido | Descripción                                        |
| ------------- | ------ | --------- | -------------------------------------------------- |
| `name`        | string | Sí        | Nombre de la biblioteca (entre 3 y 50 caracteres)  |
| `description` | string | Sí        | Descripción de la biblioteca (máx. 100 caracteres) |

Se eliminan los espacios al principio y al final de ambos campos.

### Respuestas

#### 201 Created

Biblioteca creada correctamente.

```json
{
  "results": {
    "type": "libraries",
    "id": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
    "attributes": {
      "name": "sample first library",
      "description": "description of the sample first library",
      "userId": "01J9BHWZ8N4B1JBSAFCBKQGERS",
      "books": [],
      "createdAt": "2024-10-10T22:30:16.908Z",
      "updatedAt": "2024-10-10T22:30:16.908Z"
    }
  }
}
```

#### 400 Bad Request

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION ERROR",
  "message": "invalid body",
  "validationError": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["name"],
      "message": "Required"
    }
  ]
}
```

#### 409 Conflict

El usuario ya tiene una biblioteca con ese nombre (la comparación no distingue mayúsculas y minúsculas).

```json
{
  "statusCode": 409,
  "errorCode": "CONFLICT ERROR",
  "message": "user has already a library with name testing"
}
```

---

## GET /libraries/:id

Obtiene una biblioteca. Solo el propietario o un administrador pueden consultarla.

### Respuestas

#### 200 OK

```json
{
  "results": {
    "type": "libraries",
    "id": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
    "attributes": {
      "name": "sample first library",
      "description": "description of the sample first library",
      "userId": "01J9BHWZ8N4B1JBSAFCBKQGERS",
      "books": [
        "01J9W9P6M5S0VRKVSRX3Q9T3W7",
        "01J9W9PGE06ANTMG3Y24KGCAFF",
        "01J9WA3W9TE5NG1H21PTK9VS4Q"
      ],
      "createdAt": "2000-01-01T00:00:00.000Z",
      "updatedAt": "2000-01-01T00:00:00.000Z"
    }
  }
}
```

#### 403 Forbidden

La biblioteca pertenece a otro usuario.

```json
{
  "statusCode": 403,
  "errorCode": "PERMISSION ERROR",
  "message": "library not found"
}
```

#### 404 Not Found

La biblioteca no existe.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "library not found"
}
```

---

## GET /libraries

Lista las bibliotecas del usuario autenticado (o todas si es administrador), ordenadas por fecha de creación. Admite [paginación](../index.md#paginacion) y búsqueda de texto.

### Query Params

- `search`: string (opcional, máx. 100 caracteres) — Devuelve las bibliotecas cuyo nombre o descripción contienen el texto, aunque sea parte de una palabra (`fan` encuentra «Fantasía»). No distingue mayúsculas y minúsculas, pero sí tildes. Se eliminan los espacios al principio y al final; una búsqueda vacía se ignora. El `total` de `paginationInfo` cuenta solo las bibliotecas que coinciden
- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "libraries",
      "id": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
      "attributes": {
        "name": "sample first library",
        "description": "description of the sample first library",
        "userId": "01J9BHWZ8N4B1JBSAFCBKQGERS",
        "books": [
          "01J9W9P6M5S0VRKVSRX3Q9T3W7",
          "01J9W9PGE06ANTMG3Y24KGCAFF",
          "01J9WA3W9TE5NG1H21PTK9VS4Q"
        ],
        "createdAt": "2000-01-01T00:00:00.000Z",
        "updatedAt": "2000-01-01T00:00:00.000Z"
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

Parámetros de paginación no válidos, `search` repetido o con más de 100 caracteres.

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION ERROR",
  "message": "invalid query params",
  "validationError": [
    {
      "code": "too_big",
      "maximum": 100,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "String must contain at most 100 character(s)",
      "path": ["search"]
    }
  ]
}
```

---

## PATCH /libraries/:id

Modifica el nombre y/o la descripción de una biblioteca. Solo el propietario o un administrador pueden modificarla.

### Body

Todos los campos son opcionales; solo se modifican los que se envían.

```json
{
  "name": "Nuevo nombre",
  "description": "Nueva descripción"
}
```

| Campo         | Tipo   | Requerido | Descripción                                        |
| ------------- | ------ | --------- | -------------------------------------------------- |
| `name`        | string | No        | Nombre de la biblioteca (entre 3 y 50 caracteres)  |
| `description` | string | No        | Descripción de la biblioteca (máx. 100 caracteres) |

### Respuestas

#### 200 OK

Devuelve la biblioteca actualizada (mismo formato que [`GET /libraries/:id`](#get-librariesid)).

#### 400 Bad Request

Body no válido.

#### 403 Forbidden

La biblioteca pertenece a otro usuario.

#### 404 Not Found

La biblioteca no existe.

#### 409 Conflict

El usuario ya tiene otra biblioteca con ese nombre.

---

## DELETE /libraries/:id

Elimina una biblioteca. Solo el propietario o un administrador pueden eliminarla.

Los user books de la biblioteca **no se eliminan**: solo se quita la biblioteca de su lista `libraries`.

Sus [importaciones](imports.md) y los informes de estas **sí se eliminan**.

### Respuestas

#### 204 No Content

Biblioteca eliminada correctamente.

#### 403 Forbidden

La biblioteca pertenece a otro usuario.

#### 404 Not Found

La biblioteca no existe.

---

## POST /libraries/:id/books

Añade un libro a una biblioteca del usuario autenticado. Solo el propietario de la biblioteca puede añadir libros (tampoco un administrador puede hacerlo en bibliotecas ajenas).

- Si el libro no existe en el catálogo ([`books`](books.md)), se crea con los datos enviados.
- Si el usuario ya tiene un user book de ese libro (en otra biblioteca), se reutiliza y se añade esta biblioteca a su lista `libraries`; si no, se crea uno nuevo.

Los datos del libro se pueden obtener previamente con [`GET /external`](external.md).

### Body

```json
{
  "title": "Rossiya",
  "isbn13": "9780595385294",
  "isbn10": "059538529X",
  "authors": ["Alex Shishin"],
  "cover": {
    "source": "open_library",
    "value": "1304487"
  }
}
```

| Campo          | Tipo        | Requerido | Descripción                                                        |
| -------------- | ----------- | --------- | ------------------------------------------------------------------ |
| `title`        | string      | Sí        | Título del libro                                                   |
| `isbn13`       | string/null | Sí*       | ISBN-13 válido o `null`. Se eliminan guiones y espacios            |
| `isbn10`       | string/null | Sí*       | ISBN-10 válido o `null`. Se eliminan guiones y espacios            |
| `authors`      | string[]    | No        | Autores del libro. Por defecto `[]`                                |
| `cover`        | object      | No        | Portada del libro. Por defecto `{ "source": null, "value": null }` |
| `cover.source` | string/null | Sí        | Fuente de la portada: `google_books` u `open_library`              |
| `cover.value`  | string/null | Sí        | Identificador de la portada en la fuente                           |

\* Los dos campos deben enviarse, pero al menos uno de ellos debe tener valor. Si se indican ambos, deben corresponder al mismo libro.

### Respuestas

#### 201 Created

Devuelve la biblioteca actualizada, con el ID del user book añadido a `books`.

```json
{
  "results": {
    "type": "libraries",
    "id": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
    "attributes": {
      "name": "sample first library",
      "description": "description of the sample first library",
      "userId": "01J9BHWZ8N4B1JBSAFCBKQGERS",
      "books": ["01J9W9P6M5S0VRKVSRX3Q9T3W7"],
      "createdAt": "2000-01-01T00:00:00.000Z",
      "updatedAt": "2000-01-01T00:00:00.000Z"
    }
  }
}
```

#### 400 Bad Request

Body no válido: faltan ambos ISBN, algún ISBN no es válido o los dos ISBN no corresponden al mismo libro.

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION ERROR",
  "message": "invalid body",
  "validationError": [
    {
      "code": "custom",
      "message": "Either isbn13 or isbn10 must be provided",
      "path": ["isbn13"]
    }
  ]
}
```

#### 403 Forbidden

La biblioteca pertenece a otro usuario.

#### 404 Not Found

La biblioteca no existe.

#### 409 Conflict

El libro ya está en la biblioteca.

```json
{
  "statusCode": 409,
  "errorCode": "CONFLICT ERROR",
  "message": "book with id 01J9KKFS6CKTSVY0ETH9A7PHXW already exists in library 01J9W8VR2CFZW8PJ1Q8Y4Y5WEX"
}
```

---

## DELETE /libraries/:libraryId/books/:userBookId

Quita un user book de una biblioteca del usuario autenticado. El user book **no se elimina**: solo se quita la biblioteca de su lista `libraries`.

### Respuestas

#### 204 No Content

Libro quitado correctamente de la biblioteca.

#### 403 Forbidden

La biblioteca pertenece a otro usuario.

#### 404 Not Found

La biblioteca no existe o el user book no está en ella.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "book with id 01J9W9P6M5S0VRKVSRX3Q9T3W7 not found in library 01J9W8VR2CFZW8PJ1Q8Y4Y5WEX"
}
```

---

## Notas de implementación

- Solo el propietario o un administrador pueden consultar, modificar o eliminar una biblioteca. Añadir y quitar libros está reservado al propietario.
- Los IDs de la lista `books` corresponden a [user books](user-books.md), no a libros del catálogo.
- Para listar los libros de una biblioteca con todos sus datos se usa [`GET /user-books?libraryId=<id>`](user-books.md#get-user-books), y para exportarlos [`GET /user-books/download`](user-books.md#get-user-booksdownload).
