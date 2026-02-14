# API de Bibliotecas

Este documento describe los endpoints disponibles para la gestión de bibliotecas en la aplicación Bibliopolis.

## POST /libraries

Crea una nueva biblioteca para el usuario autenticado.

### Body

```json
{
  "name": "Nombre de la biblioteca",
  "description": "Descripción de la biblioteca"
}
```

| Campo         | Tipo   | Requerido | Descripción                  |
|---------------|--------|-----------|------------------------------|
| `name`        | string | Sí        | Nombre de la biblioteca      |
| `description` | string | Sí        | Descripción de la biblioteca |

### Respuestas

#### 201 Created

Biblioteca creada correctamente.

```json
{
  "id": "library_id",
  "name": "Nombre de la biblioteca",
  "description": "Descripción de la biblioteca",
  "userId": "user_id",
  "books": [],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### 409 Conflict

Ya existe una biblioteca con ese nombre para el usuario.

---

## GET /libraries/:id

Obtiene la información de una biblioteca específica.

### Respuestas

#### 200 OK

```json
{
  "id": "library_id",
  "name": "Nombre de la biblioteca",
  "description": "Descripción de la biblioteca",
  "userId": "user_id",
  "books": ["userBook_id1", "userBook_id2"],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### 403 Forbidden

El usuario no tiene permisos para acceder a la biblioteca.

#### 404 Not Found

La biblioteca no existe.

---

## GET /libraries

Lista las bibliotecas del usuario autenticado (o todas si es admin). Permite paginación y búsqueda por nombre o descripción.

### Query Params

- `search`: string (opcional) — Término de búsqueda
- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "libraries",
      "id": "library_id",
      "attributes": {
        "name": "Nombre de la biblioteca",
        "description": "Descripción de la biblioteca",
        "userId": "user_id",
        "books": ["userBook_id1"],
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
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

## DELETE /libraries/:id

Elimina una biblioteca y todos los libros asociados a ella.

### Respuestas

#### 204 No Content

Biblioteca eliminada correctamente.

#### 403 Forbidden

El usuario no tiene permisos para eliminar la biblioteca.

#### 404 Not Found

La biblioteca no existe.

---

## POST /libraries/:id/books

Añade un libro a la biblioteca. Si el libro no existe en el sistema, se consulta en OpenLibrary y se añade.

### Body

```json
{
  "isbn": "9781234567890"
}
```

| Campo   | Tipo   | Requerido | Descripción                |
|---------|--------|-----------|----------------------------|
| `isbn`  | string | Sí        | ISBN-13 del libro a añadir |

### Respuestas

#### 201 Created

Biblioteca actualizada con el libro añadido.

#### 404 Not Found

El libro no existe o no se encuentra en OpenLibrary.

#### 409 Conflict

El libro ya existe en la biblioteca.

---

## DELETE /libraries/:libraryId/books/:userBookId

Elimina un libro de la biblioteca.

### Respuestas

#### 204 No Content

Libro eliminado correctamente de la biblioteca.

#### 404 Not Found

El libro no existe en la biblioteca.

---

## GET /libraries/:id/books

Lista los libros de una biblioteca específica (ver documentación de user-books para el formato de respuesta).

---

## Notas de implementación

- Solo el usuario propietario o un administrador puede acceder, modificar o eliminar una biblioteca.
- La búsqueda de libros utiliza OpenLibrary si el libro no existe previamente en el sistema.
- Los identificadores de libros en la biblioteca corresponden a entidades user-book.

