# API de Libros compartidos

Este documento describe los endpoints con los que un usuario consulta, de una vez, los libros de todas las [bibliotecas compartidas](shared-libraries.md) con él. Son de **solo lectura**.

Todos los endpoints son solo para usuarios `regular`: un administrador recibe un `403` (`must be a regular user`).

Cada libro aparece **una sola vez**, aunque esté en varias bibliotecas o lo compartan varias personas. El acceso se comprueba en cada petición: solo se tienen en cuenta las bibliotecas compartidas con el usuario en ese momento, nunca las demás de sus propietarios ni las propias del usuario.

Atributos de un libro compartido (su `id` es el del libro en el catálogo, [`books`](books.md)):

| Campo          | Tipo        | Descripción                                                                  |
| -------------- | ----------- | ---------------------------------------------------------------------------- |
| `bookTitle`    | string      | Título del libro                                                             |
| `bookAuthors`  | string[]    | Autores del libro                                                            |
| `bookCoverUrl` | string/null | URL de la portada                                                            |
| `bookIsbn13`   | string      | ISBN-13                                                                      |
| `bookIsbn10`   | string/null | ISBN-10                                                                      |
| `own`          | object/null | Opinión del usuario autenticado, o `null` si el libro no está en ninguna de sus bibliotecas |
| `own.rating`   | number/null | Su valoración (de 1 a 10)                                                    |
| `own.notes`    | string/null | Sus notas                                                                    |
| `libraries`    | object[]    | Solo en el listado. Bibliotecas compartidas con el usuario en las que está, por nombre: `id`, `name` y `ownerName` (nombre del propietario) |
| `people`       | object[]    | Solo en el detalle. Personas que lo comparten con el usuario, una por propietario y ordenadas por nombre |
| `people[].ownerName` | string | Nombre del propietario. No es único: dos personas pueden llamarse igual |
| `people[].sharesRatings` | boolean | Si muestra su valoración: alguna de las bibliotecas de `people[].libraries` tiene `shareRatings` a `true` |
| `people[].rating` | number/null | Su valoración (de 1 a 10). `null` si no lo ha valorado, y siempre que `sharesRatings` sea `false` |
| `people[].libraries` | object[] | Bibliotecas en las que lo comparte, por nombre: `id` y `name` |

Las notas de los propietarios no se devuelven nunca. Sus valoraciones, solo en el detalle.

## GET /shared-books

Lista los libros de las bibliotecas compartidas con el usuario autenticado, empezando por el que cualquiera de los propietarios añadió más recientemente. Admite [paginación](../index.md#paginacion) y búsqueda de texto.

### Query Params

- `search`: string (opcional, máx. 100 caracteres) — Funciona igual que en [`GET /user-books`](user-books.md#get-user-books): un ISBN exacto, o un texto contenido en el título, en algún autor o en los ISBN. No busca en las notas. El `total` de `paginationInfo` cuenta solo los libros que coinciden, cada uno una vez
- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "shared-books",
      "id": "01J9KKFQRP6H3F30CNT21G1DWT",
      "attributes": {
        "bookTitle": "It Never Happened",
        "bookAuthors": [],
        "bookCoverUrl": null,
        "bookIsbn13": "9781732539419",
        "bookIsbn10": "1732539413",
        "own": {
          "rating": 7,
          "notes": "a simple note about the book"
        },
        "libraries": [
          {
            "id": "01J9XDD1NAFHP0159FYT245D8X",
            "name": "sample first library user02",
            "ownerName": "user02"
          },
          {
            "id": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
            "name": "sample first library",
            "ownerName": "user01"
          }
        ]
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

---

## GET /shared-books/:id

Obtiene un libro de las bibliotecas compartidas con el usuario autenticado, con las personas que lo comparten y las valoraciones que muestran.

### Respuestas

#### 200 OK

```json
{
  "results": {
    "type": "shared-books",
    "id": "01J9KKFQRP6H3F30CNT21G1DWT",
    "attributes": {
      "bookTitle": "It Never Happened",
      "bookAuthors": [],
      "bookCoverUrl": null,
      "bookIsbn13": "9781732539419",
      "bookIsbn10": "1732539413",
      "own": null,
      "people": [
        {
          "ownerName": "user01",
          "sharesRatings": true,
          "rating": 9,
          "libraries": [
            {
              "id": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
              "name": "sample first library"
            }
          ]
        },
        {
          "ownerName": "user02",
          "sharesRatings": false,
          "rating": null,
          "libraries": [
            {
              "id": "01J9XDD1NAFHP0159FYT245D8X",
              "name": "sample first library user02"
            }
          ]
        }
      ]
    }
  }
}
```

#### 404 Not Found

El libro no existe o no está en ninguna biblioteca compartida con el usuario.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "shared book not found"
}
```
