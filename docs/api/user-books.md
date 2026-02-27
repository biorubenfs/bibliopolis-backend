# API de User Books

Esta entidad representa libros que el usuario ha agregado a alguna de sus bibliotecas. 

Los servicios para su gestión son los siguientes.

## GET /user-books

Devuelve todos los libros de usuario. Admite paginación y filtros por biblioteca y por usuario en el caso de usuarios administradores.

### Query Params

- `libraryId`: string (múltiple) — Acota búsqueda a una o varias bibliotecas
- `userId`: string (opcional) — Acota listado a user-books de un usuario
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

#### 403 Forbidden

```json
{
  "statusCode": 403,
  "errorCode": "PERMISSION ERROR",
  "message": "message"
}
```

---

## GET /user-books/:id

Obtiene un libro de usuario concreto.

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

#### 404 Not found

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "user book not found"
}
```

---

## PATCH /user-books/:id

Permite editar un libro de usuario. Solo permite modificar los campos `rating` y `notes`:

### Body

```json
{
  "rating": 5,
  "notes": "a simple note about the book"
}
```

| Campo    | Tipo        | Requerido | Descripción          |
| -------- | ----------- | --------- | -------------------- |
| `rating` | number/null | Sí        | Puntuación del libro |
| `notes`  | string/null | Sí        | Notas del libro      |

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

#### 400 Bad Request

Errores validación en la el body de la petición.

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

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION ERROR",
  "message": "invalid body",
  "validationError": [
    {
      "expected": "1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10",
      "received": "undefined",
      "code": "invalid_type",
      "path": ["rating"],
      "message": "Required"
    }
  ]
}
```

#### 404 Not found

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "user book not found"
}
```

---
