# API de Libros

`books` es el catálogo de libros compartido por todos los usuarios. Cada libro se identifica de forma única por su ISBN-13 (y su ISBN-10, si existe). Normalmente los libros se añaden al catálogo de forma automática al añadirlos a una biblioteca ([`POST /libraries/:id/books`](libraries.md#post-librariesidbooks)).

Atributos de un libro:

| Campo       | Tipo        | Descripción                                          |
| ----------- | ----------- | ---------------------------------------------------- |
| `title`     | string      | Título                                               |
| `authors`   | string[]    | Autores                                              |
| `isbn13`    | string      | ISBN-13                                              |
| `isbn10`    | string/null | ISBN-10 (no todos los libros lo tienen)              |
| `coverUrl`  | string/null | URL de la portada (Google Books u Open Library)      |
| `createdAt` | date        | Fecha de creación                                    |
| `updatedAt` | date        | Fecha de la última modificación                      |

## POST /books

Añade un libro al catálogo.

### Body

```json
{
  "title": "Rossiya",
  "authors": ["Alex Shishin"],
  "isbn13": "9780595385294",
  "isbn10": "059538529X",
  "cover": {
    "source": "open_library",
    "value": "1304487"
  }
}
```

| Campo          | Tipo        | Requerido | Descripción                                                       |
| -------------- | ----------- | --------- | ----------------------------------------------------------------- |
| `title`        | string      | Sí        | Título del libro                                                  |
| `authors`      | string[]    | Sí        | Autores del libro                                                 |
| `isbn13`       | string/null | No*       | ISBN-13 válido. Se eliminan guiones y espacios                    |
| `isbn10`       | string/null | No*       | ISBN-10 válido. Se eliminan guiones y espacios                    |
| `cover`        | object      | No        | Portada del libro. Por defecto `{ "source": null, "value": null }` |
| `cover.source` | string/null | Sí        | Fuente de la portada: `google_books` u `open_library`             |
| `cover.value`  | string/null | Sí        | Identificador de la portada en la fuente                          |

\* Es obligatorio indicar al menos uno de los dos ISBN. Si se indican ambos, deben corresponder al mismo libro. Si solo se indica uno, el otro se calcula automáticamente cuando es posible.

### Respuestas

#### 201 Created

```json
{
  "results": {
    "type": "books",
    "id": "01J9KKFS6CKTSVY0ETH9A7PHXW",
    "attributes": {
      "title": "Rossiya",
      "authors": ["Alex Shishin"],
      "isbn13": "9780595385294",
      "isbn10": "059538529X",
      "coverUrl": "https://covers.openlibrary.org/b/id/1304487-M.jpg",
      "createdAt": "2024-10-10T22:30:16.908Z",
      "updatedAt": "2024-10-10T22:30:16.908Z"
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
      "message": "isbn13 must be a valid ISBN-13",
      "path": ["isbn13"]
    }
  ]
}
```

#### 409 Conflict

Ya existe un libro con ese ISBN.

```json
{
  "statusCode": 409,
  "errorCode": "CONFLICT ERROR",
  "message": "there is already a book with isbn13 9780595385294"
}
```

---

## GET /books/:id

Obtiene un libro del catálogo.

### Respuestas

#### 200 OK

Mismo formato que la respuesta de [`POST /books`](#post-books).

#### 404 Not Found

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "book with id 01J9KKFS6CKTSVY0ETH9A7PHXW not found"
}
```

---

## GET /books

Lista los libros del catálogo. Admite [paginación](../index.md#paginacion).

### Query Params

- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "books",
      "id": "01J9KKFS6CKTSVY0ETH9A7PHXW",
      "attributes": {
        "title": "Rossiya",
        "authors": ["Alex Shishin"],
        "isbn13": "9780595385294",
        "isbn10": "059538529X",
        "coverUrl": "https://covers.openlibrary.org/b/id/1304487-M.jpg",
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

---

## Notas de implementación

- Semanalmente se ejecuta una tarea que intenta completar los libros sin autores o sin portada consultando las fuentes externas; los cambios se propagan a los [user books](user-books.md).
