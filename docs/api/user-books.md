# API de User Books

Un user book es el ejemplar de un libro que tiene un usuario. Se crea al añadir un libro a una biblioteca ([`POST /libraries/:id/books`](libraries.md#post-librariesidbooks)) y puede pertenecer a varias bibliotecas del mismo usuario. Guarda una copia de los datos del libro (título, autores, portada e ISBN) junto con la valoración y las notas del usuario. Cuando un administrador corrige un libro ([`PATCH /books/:id`](books.md#patch-booksid)), el título, los autores y la portada se actualizan en todos sus user books; su `updatedAt` no cambia.

Todos los endpoints son solo para usuarios `regular`: un administrador recibe un `403` (`must be a regular user`).

Atributos de un user book:

| Campo          | Tipo        | Descripción                                      |
| -------------- | ----------- | ------------------------------------------------ |
| `libraries`    | string[]    | IDs de las bibliotecas que lo contienen          |
| `bookId`       | string      | ID del libro en el catálogo ([books](books.md))  |
| `bookTitle`    | string      | Título del libro                                 |
| `bookAuthors`  | string[]    | Autores del libro                                |
| `bookCoverUrl` | string/null | URL de la portada                                |
| `bookIsbn13`   | string      | ISBN-13                                          |
| `bookIsbn10`   | string/null | ISBN-10                                          |
| `rating`       | number/null | Valoración del usuario (de 1 a 10)               |
| `notes`        | string/null | Notas del usuario                                |
| `userId`       | string      | ID del usuario propietario                       |
| `createdAt`    | date        | Fecha de creación                                |
| `updatedAt`    | date        | Fecha de la última modificación                  |

## GET /user-books

Lista los user books. Admite [paginación](../index.md#paginacion), filtros por biblioteca y por usuario, y búsqueda de texto.

- Un usuario normal solo puede listar sus propios user books de sus bibliotecas. Si no indica `libraryId`, se listan los de todas sus bibliotecas.

Los resultados se ordenan por ID de forma descendente, es decir, del añadido más recientemente al más antiguo, también con `search`.

### Query Params

- `libraryId`: string (opcional, se puede repetir) — Acota la búsqueda a una o varias bibliotecas (`?libraryId=A&libraryId=B`)
- `userId`: string (opcional) — Acota el listado a los user books de un usuario. Un usuario normal solo puede indicar su propio ID
- `search`: string (opcional, máx. 100 caracteres) — Si es un ISBN-10 o ISBN-13 válido (con o sin guiones), busca los user books con ese ISBN exacto. Si no, devuelve los que contienen el texto en el título, en algún autor o en los ISBN, aunque sea parte de una palabra (`ossi` encuentra «Rossiya»). Se busca de forma literal y sin distinguir mayúsculas y minúsculas, pero sí tildes. Se eliminan los espacios al principio y al final; una búsqueda vacía se ignora. Se combina con `libraryId`, y el `total` de `paginationInfo` cuenta solo los user books que coinciden
- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "user-books",
      "id": "01J9W9P6M5S0VRKVSRX3Q9T3W7",
      "attributes": {
        "libraries": ["01J9W8VR2CFZW8PJ1Q8Y4Y5WEX"],
        "bookId": "01J9KKFS6CKTSVY0ETH9A7PHXW",
        "bookTitle": "Rossiya",
        "bookAuthors": ["Alex Shishin"],
        "bookCoverUrl": "https://covers.openlibrary.org/b/id/1304487-M.jpg",
        "bookIsbn13": "9780595385294",
        "bookIsbn10": "059538529X",
        "rating": 5,
        "notes": "Lorem ipsum",
        "userId": "01J9BHWZ8N4B1JBSAFCBKQGERS",
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

Parámetros de paginación no válidos, o `search` repetido o con más de 100 caracteres.

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

#### 403 Forbidden

Un usuario normal intenta listar los user books de otro usuario o de una biblioteca que no es suya.

```json
{
  "statusCode": 403,
  "errorCode": "PERMISSION ERROR",
  "message": "user can only list books from own libraries"
}
```

---

## GET /user-books/download

Descarga los libros de una biblioteca del usuario autenticado como fichero PDF o CSV.

### Query Params

- `libraryId`: string — ID de la biblioteca a exportar
- `format`: string (opcional) — `pdf` (por defecto) o `csv`

### Respuestas

#### 200 OK

Devuelve el fichero como descarga (`Content-Disposition: attachment`). El nombre del fichero es el de la biblioteca, sustituyendo los caracteres no alfanuméricos por `_`.

| Formato | `Content-Type`             | Contenido                                                     |
| ------- | -------------------------- | ------------------------------------------------------------- |
| `pdf`   | `application/pdf`          | Listado de los libros de la biblioteca                        |
| `csv`   | `text/csv; charset=utf-8`  | Columnas `Título`, `Autor/es`, `Isbn-13`, `Isbn-10`           |

#### 400 Bad Request

Falta `libraryId` o `format` no es `pdf` ni `csv`.

#### 403 Forbidden

La biblioteca pertenece a otro usuario.

#### 404 Not Found

La biblioteca no existe.

---

## GET /user-books/:id

Obtiene un user book del usuario autenticado.

### Respuestas

#### 200 OK

```json
{
  "results": {
    "type": "user-books",
    "id": "01J9WA3W9TE5NG1H21PTK9VS4Q",
    "attributes": {
      "libraries": ["01J9W8VR2CFZW8PJ1Q8Y4Y5WEX"],
      "bookId": "01J9KKFQRP6H3F30CNT21G1DWT",
      "bookTitle": "It Never Happened",
      "bookAuthors": [],
      "bookCoverUrl": "https://covers.openlibrary.org/b/id/12861662-M.jpg",
      "bookIsbn13": "9781732539419",
      "bookIsbn10": null,
      "rating": 10,
      "notes": null,
      "userId": "01J9BHWZ8N4B1JBSAFCBKQGERS",
      "createdAt": "2000-01-01T00:00:00.000Z",
      "updatedAt": "2000-01-01T00:00:00.000Z"
    }
  }
}
```

#### 404 Not Found

El user book no existe o pertenece a otro usuario.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "user book not found"
}
```

---

## PATCH /user-books/:id

Modifica la valoración y las notas de un user book del usuario autenticado. Solo se pueden modificar los campos `rating` y `notes`, y ambos son obligatorios (se puede enviar `null` para borrarlos).

### Body

```json
{
  "rating": 5,
  "notes": "a simple note about the book"
}
```

| Campo    | Tipo        | Requerido | Descripción                                  |
| -------- | ----------- | --------- | -------------------------------------------- |
| `rating` | number/null | Sí        | Valoración del libro: entero de 1 a 10       |
| `notes`  | string/null | Sí        | Notas sobre el libro (máx. 150 caracteres)   |

### Respuestas

#### 200 OK

Devuelve el user book actualizado.

```json
{
  "results": {
    "type": "user-books",
    "id": "01J9WA3W9TE5NG1H21PTK9VS4Q",
    "attributes": {
      "libraries": ["01J9W8VR2CFZW8PJ1Q8Y4Y5WEX"],
      "bookId": "01J9KKFQRP6H3F30CNT21G1DWT",
      "bookTitle": "It Never Happened",
      "bookAuthors": [],
      "bookCoverUrl": "https://covers.openlibrary.org/b/id/12861662-M.jpg",
      "bookIsbn13": "9781732539419",
      "bookIsbn10": null,
      "rating": 5,
      "notes": "a simple note about the book",
      "userId": "01J9BHWZ8N4B1JBSAFCBKQGERS",
      "createdAt": "2000-01-01T00:00:00.000Z",
      "updatedAt": "2000-01-01T00:00:00.000Z"
    }
  }
}
```

#### 400 Bad Request

Errores de validación en el body de la petición.

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION ERROR",
  "message": "invalid body",
  "validationError": [
    {
      "received": 0,
      "code": "invalid_enum_value",
      "options": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "path": ["rating"],
      "message": "Invalid enum value. Expected 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, received '0'"
    }
  ]
}
```

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
      "path": ["notes"],
      "message": "Required"
    }
  ]
}
```

#### 404 Not Found

El user book no existe o pertenece a otro usuario.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "user book not found"
}
```

---

## Notas de implementación

- Los datos del libro (título, autores, portada, ISBN) se copian del catálogo al crear el user book y se mantienen sincronizados por la tarea semanal que completa autores y portadas.
- Quitar un libro de una biblioteca o eliminar la biblioteca no borra el user book: solo se quita la biblioteca de su lista `libraries`.
