# API de Libros

`books` es el catálogo de libros compartido por todos los usuarios. Cada libro se identifica de forma única por su ISBN-13 (y su ISBN-10, si existe). Los usuarios añaden libros al catálogo de forma automática al añadirlos a una biblioteca ([`POST /libraries/:id/books`](libraries.md#post-librariesidbooks)). Los administradores pueden darlos de alta y corregirlos desde el backoffice.

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

Da de alta un libro en el catálogo. **Solo administradores.** El body indica la forma del alta con `mode`:

- `sources`: el servidor consulta las fuentes externas con el ISBN y guarda lo que devuelven, portada incluida. No acepta datos del cliente. Una fuente puede devolver los datos de otra edición, con otro ISBN.
- `manual`: el administrador escribe el ISBN, el título y los autores. El libro se crea **sin portada** (`{ "source": null, "value": null }`); la [tarea semanal](#notas-de-implementacion) la añadirá si alguna fuente la tiene, o el administrador puede elegirla con [`PATCH /books/:id`](#patch-booksid).

Antes de consultar las fuentes se comprueba que el libro (por cualquiera de sus dos ISBN) no esté ya en el catálogo.

### Body

Desde las fuentes:

```json
{
  "mode": "sources",
  "isbn": "978-0-595-38529-4"
}
```

A mano:

```json
{
  "mode": "manual",
  "isbn": "059538529X",
  "title": "Rossiya",
  "authors": ["Alex Shishin"]
}
```

| Campo     | Tipo     | Requerido         | Descripción                                                                 |
| --------- | -------- | ----------------- | --------------------------------------------------------------------------- |
| `mode`    | string   | Sí                | `sources` o `manual`                                                        |
| `isbn`    | string   | Sí                | ISBN-10 o ISBN-13 válido. Se eliminan guiones y espacios. El otro ISBN se calcula cuando es posible |
| `title`   | string   | Solo en `manual`  | Título. Se eliminan los espacios de los extremos; no puede quedar vacío     |
| `authors` | string[] | Solo en `manual`  | Al menos un autor. Cada uno, sin espacios en los extremos y no vacío        |

No se admite ningún otro campo: en particular, un `cover` se rechaza con un `400`.

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

Body no válido: `mode` desconocido, ISBN no válido, título vacío, sin autores en el alta manual o campos no admitidos.

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION ERROR",
  "message": "invalid body",
  "validationError": [
    {
      "code": "custom",
      "message": "Invalid ISBN-10 or ISBN-13",
      "path": ["isbn"]
    }
  ]
}
```

#### 403 Forbidden

El usuario autenticado no es administrador (`must be admin`).

#### 404 Not Found

Solo en `sources`: ninguna fuente tiene el libro. El cliente puede ofrecer el alta manual.

```json
{
  "statusCode": 404,
  "errorCode": "BOOKS API ERROR",
  "message": "Book not found in any source"
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

#### 503 Service Unavailable

Solo en `sources`: ninguna fuente ha devuelto el libro y al menos una ha fallado.

```json
{
  "statusCode": 503,
  "errorCode": "SOURCES UNAVAILABLE ERROR",
  "message": "Book sources are currently unavailable"
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

Lista los libros del catálogo, del añadido más recientemente al más antiguo. Admite [paginación](../index.md#paginacion) y búsqueda.

### Query Params

- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados
- `search`: string (opcional, máx. 100 caracteres) — Si es un ISBN-10 o ISBN-13 válido (con o sin guiones), busca el libro con ese ISBN exacto. Si no, busca el texto en el título o en los autores, sin distinguir mayúsculas y de forma literal

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

#### 400 Bad Request

Query params no válidos.

---

## GET /books/:id/covers

Consulta todas las fuentes externas y devuelve la portada que tiene cada una para el libro, para que el administrador elija. **Solo administradores.** Cada fuente se consulta con el ISBN-13 y, si no tiene portada, con el ISBN-10. Las portadas van en el orden de prioridad de las fuentes y solo aparecen las fuentes que tienen una. Una fuente que falla se omite.

### Respuestas

#### 200 OK

```json
{
  "results": {
    "type": "book-covers",
    "attributes": {
      "covers": [
        {
          "source": "google_books",
          "value": "kZ2TAAAACAAJ",
          "coverUrl": "http://books.google.com/books/content?id=kZ2TAAAACAAJ&printsec=frontcover&img=1&zoom=1"
        },
        {
          "source": "open_library",
          "value": "1304487",
          "coverUrl": "https://covers.openlibrary.org/b/id/1304487-L.jpg"
        }
      ]
    }
  }
}
```

`covers` es una lista vacía si ninguna fuente tiene portada.

#### 403 Forbidden

El usuario autenticado no es administrador (`must be admin`).

#### 404 Not Found

El libro no existe.

#### 503 Service Unavailable

Han fallado todas las fuentes (`SOURCES UNAVAILABLE ERROR`).

---

## PATCH /books/:id

Corrige el título, los autores o la portada de un libro. **Solo administradores.** Los ISBN no se pueden modificar. Los cambios se copian, en la misma transacción, a los [user books](user-books.md) de todos los usuarios que tienen el libro (`bookTitle`, `bookAuthors` y la portada); el `updatedAt` de los user books no cambia.

La portada no se envía como valor: se indica una fuente en `coverSource` y el servidor le pide la portada de ese libro. Así solo se guardan portadas reales de las fuentes. Con `null`, el libro se queda sin portada.

### Body

```json
{
  "title": "Rossiya",
  "authors": ["Alex Shishin"],
  "coverSource": "open_library"
}
```

| Campo         | Tipo        | Requerido | Descripción                                                              |
| ------------- | ----------- | --------- | ------------------------------------------------------------------------ |
| `title`       | string      | No*       | Título. Se eliminan los espacios de los extremos; no puede quedar vacío  |
| `authors`     | string[]    | No*       | Autores. Cada uno, sin espacios en los extremos y no vacío. Puede ser una lista vacía |
| `coverSource` | string/null | No*       | `google_books`, `open_library` o `null` (sin portada)                    |

\* Hay que indicar al menos uno. No se admite ningún otro campo: un ISBN o un `cover` se rechazan con un `400`.

### Respuestas

#### 200 OK

Devuelve el libro actualizado, con el mismo formato que [`POST /books`](#post-books).

#### 400 Bad Request

Body no válido: sin campos, título o autor vacío, fuente desconocida o campos no admitidos.

#### 403 Forbidden

El usuario autenticado no es administrador (`must be admin`).

#### 404 Not Found

El libro no existe.

#### 422 Unprocessable Entity

La fuente elegida no tiene portada para el libro. No se guarda ningún cambio.

```json
{
  "statusCode": 422,
  "errorCode": "COVER NOT AVAILABLE",
  "message": "source open_library has no cover for this book"
}
```

#### 503 Service Unavailable

La fuente elegida ha fallado (`SOURCES UNAVAILABLE ERROR`). No se guarda ningún cambio.

---

## Notas de implementación

- Semanalmente se ejecuta una tarea que intenta completar los libros sin autores o sin portada consultando las fuentes externas. Solo rellena lo que falta, así que no pisa las correcciones de un administrador; pero si un administrador deja un libro sin autores o sin portada, la tarea puede volver a rellenarlo. Los cambios se propagan a los [user books](user-books.md) en la misma transacción, como en [`PATCH /books/:id`](#patch-booksid).
