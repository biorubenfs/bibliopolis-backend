# API de Bibliotecas públicas

Este documento describe el listado de las [bibliotecas](libraries.md) que otros usuarios han hecho públicas. El propietario hace pública una biblioteca con `isPublic` en [`PATCH /libraries/:id`](libraries.md#patch-librariesid), y desde entonces cualquier usuario la puede ver en **solo lectura**, sin invitación.

Una biblioteca pública se consulta con los mismos endpoints que una compartida: [`GET /shared-libraries/:id`](shared-libraries.md#get-shared-librariesid), [`GET /shared-libraries/:id/books`](shared-libraries.md#get-shared-librariesidbooks) y [`GET /shared-libraries/:id/download`](shared-libraries.md#get-shared-librariesiddownload). Quien no es miembro nunca ve las valoraciones del propietario.

Todos los endpoints son solo para usuarios `regular`: un administrador recibe un `403` (`must be a regular user`).

Atributos de una biblioteca pública (su `id` es el de la biblioteca):

| Campo          | Tipo           | Descripción                                        |
| -------------- | -------------- | -------------------------------------------------- |
| `name`         | string         | Nombre de la biblioteca                            |
| `description`  | string \| null | Descripción de la biblioteca, o `null` si no tiene |
| `ownerName`    | string         | Nombre del propietario                             |
| `booksCount`   | number         | Número de libros que contiene                      |
| `publishedAt`  | date           | Fecha en la que se hizo pública por última vez     |

## GET /public-libraries

Lista las bibliotecas públicas de otros usuarios, empezando por la publicada más recientemente. No incluye las del usuario autenticado, que están en [`GET /libraries`](libraries.md#get-libraries), pero sí las públicas que además están compartidas con él. Admite [paginación](../index.md#paginacion).

### Query Params

- `search`: string (opcional, máx. 100 caracteres) — Devuelve las bibliotecas cuyo nombre, descripción o nombre del propietario contienen el texto, aunque sea parte de una palabra (`fan` encuentra «Fantasía»). No busca en el email del propietario. No distingue mayúsculas y minúsculas, pero sí tildes, y se busca de forma literal. Se eliminan los espacios al principio y al final; una búsqueda vacía se ignora. El `total` de `paginationInfo` cuenta solo las bibliotecas que coinciden
- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "public-libraries",
      "id": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
      "attributes": {
        "name": "sample first library",
        "description": "description of the sample first library",
        "ownerName": "user01",
        "booksCount": 3,
        "publishedAt": "2026-11-27T10:00:00.000Z"
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

## Notas de implementación

- Hacer pública una biblioteca no la comparte: no añade miembros, y sus miembros conservan el acceso (y las valoraciones, si el propietario las muestra) aunque vuelva a ser privada.
- Al hacerla privada desaparece del listado, y quien no es miembro recibe un `404` al consultarla.
