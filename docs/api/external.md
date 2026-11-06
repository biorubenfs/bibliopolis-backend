# API External

## GET /external

Busca los datos de un libro por ISBN. Primero se busca en el catálogo de Bibliopolis ([`books`](books.md)); si no está, se consultan las fuentes externas (Google Books y Open Library) y se combinan sus datos. Este endpoint **no** añade el libro al catálogo.

Es útil para obtener los datos de un libro antes de añadirlo a una biblioteca con [`POST /libraries/:id/books`](libraries.md#post-librariesidbooks).

### Query Params

- `isbn`: string — ISBN-13 o ISBN-10 a buscar. Se eliminan guiones y espacios.

### Respuestas

#### 200 OK

Las portadas de Open Library se devuelven en tamaño grande (`L`).

```json
{
  "results": {
    "type": "book-result",
    "attributes": {
      "title": "The Seven Habits of Highly Effective People",
      "isbn13": null,
      "isbn10": "0671708635",
      "authors": ["Stephen R. Covey", "Sean Covey"],
      "cover": {
        "source": "open_library",
        "value": "7239071"
      },
      "coverUrl": "https://covers.openlibrary.org/b/id/7239071-L.jpg"
    }
  }
}
```

| Campo      | Tipo        | Descripción                                                                                 |
| ---------- | ----------- | ------------------------------------------------------------------------------------------- |
| `title`    | string      | Título                                                                                      |
| `isbn13`   | string/null | ISBN-13                                                                                     |
| `isbn10`   | string/null | ISBN-10                                                                                     |
| `authors`  | string[]    | Autores                                                                                     |
| `cover`    | object      | Solo cuando el libro procede de fuentes externas: `{ source, value }` de la portada, en el formato que acepta `POST /libraries/:id/books` |
| `coverUrl` | string/null | URL de la portada                                                                           |

#### 400 Bad Request

Falta el ISBN o no es un ISBN-10/ISBN-13 válido.

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION ERROR",
  "message": "invalid query param",
  "validationError": [
    {
      "code": "custom",
      "message": "Invalid ISBN-10 or ISBN-13",
      "path": ["isbn"]
    }
  ]
}
```

#### 404 Not Found

El libro no está en el catálogo ni en ninguna fuente externa.

```json
{
  "statusCode": 404,
  "errorCode": "BOOKS API ERROR",
  "message": "Book not found in any source"
}
```

#### 503 Service Unavailable

El libro no se ha encontrado y al menos una fuente externa ha fallado: error de red, tiempo de espera agotado (10 s) o una respuesta que no es correcta, como un 429. No significa que el libro no exista, así que se puede reintentar más tarde. Si una fuente falla y la otra encuentra el libro, la respuesta es un `200`, con los datos de esa fuente.

```json
{
  "statusCode": 503,
  "errorCode": "SOURCES UNAVAILABLE ERROR",
  "message": "Book sources are currently unavailable"
}
```
