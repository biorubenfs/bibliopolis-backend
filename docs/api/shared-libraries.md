# API de Bibliotecas compartidas

Este documento describe los endpoints con los que un usuario consulta las [bibliotecas](libraries.md) que otros han compartido con él. El acceso es de **solo lectura**: solo el propietario puede modificar la biblioteca y gestionar sus miembros ([`/libraries/:id/members`](libraries.md#get-librariesidmembers)).

Todos los endpoints son solo para usuarios `regular`: un administrador recibe un `403` (`must be a regular user`).

El acceso se comprueba en cada petición: cuando el propietario retira a un miembro o borra la biblioteca, deja de tener acceso de inmediato, aunque su token siga siendo válido. Una biblioteca a la que no se tiene acceso responde un `404`, igual que si no existiera. También para su propietario, que la consulta en [`/libraries`](libraries.md).

Atributos de una biblioteca compartida (su `id` es el de la biblioteca):

| Campo          | Tipo           | Descripción                                                             |
| -------------- | -------------- | ----------------------------------------------------------------------- |
| `name`         | string         | Nombre de la biblioteca                                                 |
| `description`  | string \| null | Descripción de la biblioteca, o `null` si no tiene                      |
| `ownerName`    | string         | Nombre del propietario                                                  |
| `booksCount`   | number         | Número de libros que contiene                                           |
| `shareRatings` | boolean        | Si el propietario muestra sus valoraciones a los miembros               |
| `sharedAt`     | date           | Fecha en la que se compartió con el usuario                             |

Atributos de un libro de una biblioteca compartida (su `id` es el del libro en el catálogo, [`books`](books.md)):

| Campo          | Tipo        | Descripción                                                                  |
| -------------- | ----------- | ---------------------------------------------------------------------------- |
| `bookTitle`    | string      | Título del libro                                                             |
| `bookAuthors`  | string[]    | Autores del libro                                                            |
| `bookCoverUrl` | string/null | URL de la portada                                                            |
| `bookIsbn13`   | string      | ISBN-13                                                                      |
| `bookIsbn10`   | string/null | ISBN-10                                                                      |
| `ownerRating`  | number/null | Valoración del propietario (de 1 a 10). `null` si no lo ha valorado, y siempre que `shareRatings` sea `false` |
| `own`          | object/null | Opinión del usuario autenticado, o `null` si el libro no está en ninguna de sus bibliotecas |
| `own.rating`   | number/null | Su valoración (de 1 a 10)                                                    |
| `own.notes`    | string/null | Sus notas                                                                    |

Las notas del propietario no se devuelven nunca, ni las opiniones de los demás miembros.

## GET /shared-libraries

Lista las bibliotecas compartidas con el usuario autenticado, empezando por la compartida más recientemente. Admite [paginación](../index.md#paginacion).

### Query Params

- `search`: string (opcional, máx. 100 caracteres) — Devuelve las bibliotecas cuyo nombre, descripción o nombre del propietario contienen el texto, aunque sea parte de una palabra (`fan` encuentra «Fantasía»). No busca en el email del propietario. No distingue mayúsculas y minúsculas, pero sí tildes, y se busca de forma literal. Se eliminan los espacios al principio y al final; una búsqueda vacía se ignora. El `total` de `paginationInfo` cuenta solo las bibliotecas que coinciden
- `owner`: string (opcional) — ID de uno de los propietarios ([`GET /shared-libraries/owners`](#get-shared-librariesowners)). Devuelve solo las bibliotecas que comparte con el usuario. Se combina con `search`; el ID de alguien que no comparte ninguna da 0 resultados
- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "shared-libraries",
      "id": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
      "attributes": {
        "name": "sample first library",
        "description": "description of the sample first library",
        "ownerName": "user01",
        "booksCount": 3,
        "shareRatings": false,
        "sharedAt": "2000-01-01T00:00:00.000Z"
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

Parámetros de paginación no válidos, `search` repetido o con más de 100 caracteres, u `owner` repetido o mal formado.

---

## GET /shared-libraries/owners

Lista los propietarios de las bibliotecas compartidas con el usuario autenticado, por nombre. Admite [paginación](../index.md#paginacion).

Su `id` es el del usuario y sirve para filtrar [`GET /shared-libraries`](#get-shared-libraries). Los nombres no son únicos; el email y el rol no se devuelven.

| Campo            | Tipo   | Descripción                                                |
| ---------------- | ------ | ---------------------------------------------------------- |
| `name`           | string | Nombre del propietario                                     |
| `librariesCount` | number | Número de bibliotecas que comparte con el usuario          |

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "shared-library-owners",
      "id": "01J9BHWZ8N4B1JBSAFCBKQGERS",
      "attributes": {
        "name": "user01",
        "librariesCount": 2
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

Parámetros de paginación no válidos.

---

## GET /shared-libraries/:id

Obtiene una biblioteca compartida con el usuario autenticado.

### Respuestas

#### 200 OK

```json
{
  "results": {
    "type": "shared-libraries",
    "id": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
    "attributes": {
      "name": "sample first library",
      "description": "description of the sample first library",
      "ownerName": "user01",
      "booksCount": 3,
      "shareRatings": false,
      "sharedAt": "2000-01-01T00:00:00.000Z"
    }
  }
}
```

#### 404 Not Found

La biblioteca no existe o no está compartida con el usuario.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "library not found"
}
```

---

## GET /shared-libraries/:id/books

Lista los libros de una biblioteca compartida, del añadido más recientemente al más antiguo. Admite [paginación](../index.md#paginacion) y búsqueda de texto.

### Query Params

- `search`: string (opcional, máx. 100 caracteres) — Funciona igual que en [`GET /user-books`](user-books.md#get-user-books): un ISBN exacto, o un texto contenido en el título, en algún autor o en los ISBN. No busca en las notas. El `total` de `paginationInfo` cuenta solo los libros que coinciden
- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "shared-library-books",
      "id": "01J9KKFQRP6H3F30CNT21G1DWT",
      "attributes": {
        "bookTitle": "It Never Happened",
        "bookAuthors": [],
        "bookCoverUrl": null,
        "bookIsbn13": "9781732539419",
        "bookIsbn10": "1732539413",
        "ownerRating": 4,
        "own": {
          "rating": 7,
          "notes": "a simple note about the book"
        }
      }
    },
    {
      "type": "shared-library-books",
      "id": "01J9KKFS6CKTSVY0ETH9A7PHXW",
      "attributes": {
        "bookTitle": "Rossiya",
        "bookAuthors": ["Alex Shishin"],
        "bookCoverUrl": null,
        "bookIsbn13": "9780595385294",
        "bookIsbn10": "059538529X",
        "ownerRating": 9,
        "own": null
      }
    }
  ],
  "paginationInfo": {
    "skip": 0,
    "limit": 10,
    "total": 2
  }
}
```

#### 400 Bad Request

Parámetros de paginación no válidos, o `search` repetido o con más de 100 caracteres.

#### 404 Not Found

La biblioteca no existe o no está compartida con el usuario.

---

## GET /shared-libraries/:id/download

Descarga los libros de una biblioteca compartida como fichero PDF o CSV. Los ficheros son los mismos que obtiene el propietario con [`GET /user-books/download`](user-books.md#get-user-booksdownload): solo llevan los datos del libro, sin valoraciones ni notas.

### Query Params

- `format`: string (opcional) — `pdf` (por defecto) o `csv`

### Respuestas

#### 200 OK

Devuelve el fichero como descarga (`Content-Disposition: attachment`). El nombre del fichero es el de la biblioteca, sustituyendo los caracteres no alfanuméricos por `_`.

| Formato | `Content-Type`             | Contenido                                                     |
| ------- | -------------------------- | ------------------------------------------------------------- |
| `pdf`   | `application/pdf`          | Nombre y descripción de la biblioteca y listado de sus libros |
| `csv`   | `text/csv; charset=utf-8`  | Columnas `Título`, `Autor/es`, `Isbn-13`, `Isbn-10`           |

#### 400 Bad Request

`format` no es `pdf` ni `csv`.

#### 404 Not Found

La biblioteca no existe o no está compartida con el usuario.

---

## DELETE /shared-libraries/:id

El usuario autenticado sale de una biblioteca compartida con él. La biblioteca y sus libros no cambian, y los demás miembros conservan el acceso. Para volver a entrar, el propietario debe invitarlo de nuevo. Se elimina su [notificación](notifications.md) de que se le había compartido la biblioteca.

### Respuestas

#### 204 No Content

El usuario ya no es miembro de la biblioteca.

#### 404 Not Found

La biblioteca no está compartida con el usuario.

---

## Notas de implementación

- Compartir una biblioteca no copia sus libros ni crea [user books](user-books.md): lo que el usuario ve en `/user-books` no cambia.
- La valoración es del libro y no de la biblioteca: si un libro del propietario está en dos bibliotecas y solo una comparte las valoraciones, se ve en esa y no en la otra.
- Si el usuario quita un libro de todas sus bibliotecas, `own` pasa a ser `null`, pero su opinión se conserva y reaparece cuando lo añade de nuevo a una.
