# API de Etiquetas

Este documento describe los endpoints para gestionar etiquetas. Las etiquetas sirven para clasificar las [bibliotecas](libraries.md) y filtrarlas con [`GET /libraries?tags=`](libraries.md#get-libraries). Hay dos tipos:

- **Personales:** las crea un usuario y solo las ve y usa él.
- **Globales** (`userId: null`): las ven y usan todos los usuarios, pero ninguno puede modificarlas ni borrarlas. Están previstas para que las cree un administrador; todavía no hay endpoints para hacerlo.

Atributos de una etiqueta:

| Campo       | Tipo           | Descripción                                                         |
| ----------- | -------------- | ------------------------------------------------------------------- |
| `name`      | string         | Nombre de la etiqueta                                               |
| `color`     | string         | Clave del color, de una paleta cerrada (ver [Colores](#colores))    |
| `userId`    | string \| null | ID del usuario propietario, o `null` si es una etiqueta global      |
| `createdAt` | date           | Fecha de creación                                                   |
| `updatedAt` | date           | Fecha de la última modificación                                     |

## Colores

`color` solo admite estas claves: `red`, `orange`, `yellow`, `lime`, `green`, `teal`, `cyan`, `blue`, `indigo`, `purple`, `pink` y `grey`. Cada cliente decide los tonos exactos de cada clave.

## Nombres

- Entre 2 y 20 caracteres. Se eliminan los espacios al principio y al final, y varios espacios seguidos cuentan como uno («Novela   negra» se guarda como «Novela negra»).
- Un usuario no puede tener dos etiquetas con el mismo nombre, ni una personal con el nombre de una global. La comparación no distingue mayúsculas y minúsculas, pero sí tildes: «Ficcion» y «Ficción» son nombres distintos.
- Dos usuarios distintos sí pueden tener etiquetas con el mismo nombre.

---

## GET /tags

Lista las etiquetas que puede usar el usuario autenticado: las suyas y las globales, ordenadas por nombre. Admite [paginación](../index.md#paginacion).

### Query Params

- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados

Un usuario tiene como máximo 10 etiquetas personales, así que con `limit=100` basta una petición mientras no haya más de 90 globales.

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "tags",
      "id": "01JZTAG0000000000000000004",
      "attributes": {
        "name": "Clásicos",
        "color": "purple",
        "userId": null,
        "createdAt": "2000-01-01T00:00:00.000Z",
        "updatedAt": "2000-01-01T00:00:00.000Z"
      }
    },
    {
      "type": "tags",
      "id": "01JZTAG0000000000000000001",
      "attributes": {
        "name": "Novela",
        "color": "green",
        "userId": "01J9BHWZ8N4B1JBSAFCBKQGERS",
        "createdAt": "2000-01-01T00:00:00.000Z",
        "updatedAt": "2000-01-01T00:00:00.000Z"
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

Parámetros de paginación no válidos.

---

## POST /tags

Crea una etiqueta personal para el usuario autenticado.

### Body

```json
{
  "name": "Novela negra",
  "color": "red"
}
```

| Campo   | Tipo   | Requerido | Descripción                                        |
| ------- | ------ | --------- | -------------------------------------------------- |
| `name`  | string | Sí        | Nombre de la etiqueta (ver [Nombres](#nombres))    |
| `color` | string | Sí        | Clave del color (ver [Colores](#colores))          |

### Respuestas

#### 201 Created

```json
{
  "results": {
    "type": "tags",
    "id": "01JZTAG0000000000000000005",
    "attributes": {
      "name": "Novela negra",
      "color": "red",
      "userId": "01J9BHWZ8N4B1JBSAFCBKQGERS",
      "createdAt": "2026-11-08T10:00:00.000Z",
      "updatedAt": "2026-11-08T10:00:00.000Z"
    }
  }
}
```

#### 400 Bad Request

Body no válido: falta algún campo, el nombre no tiene entre 2 y 20 caracteres o el color no es una clave de la paleta.

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION ERROR",
  "message": "invalid body",
  "validationError": [
    {
      "received": "#ff0000",
      "code": "invalid_enum_value",
      "options": ["red", "orange", "yellow", "lime", "green", "teal", "cyan", "blue", "indigo", "purple", "pink", "grey"],
      "path": ["color"],
      "message": "Invalid enum value. Expected 'red' | 'orange' | 'yellow' | 'lime' | 'green' | 'teal' | 'cyan' | 'blue' | 'indigo' | 'purple' | 'pink' | 'grey', received '#ff0000'"
    }
  ]
}
```

#### 409 Conflict

El usuario ya tiene una etiqueta con ese nombre, o existe una global con ese nombre:

```json
{
  "statusCode": 409,
  "errorCode": "CONFLICT ERROR",
  "message": "there is already a tag with name Novela"
}
```

El usuario ya tiene 10 etiquetas personales:

```json
{
  "statusCode": 409,
  "errorCode": "TAG LIMIT REACHED",
  "message": "a user cannot have more than 10 tags"
}
```

---

## PATCH /tags/:id

Cambia el nombre o el color de una etiqueta personal. Solo puede hacerlo su propietario.

### Body

Todos los campos son opcionales; solo se modifican los que se envían.

```json
{
  "name": "Prestados a amigos",
  "color": "yellow"
}
```

| Campo   | Tipo   | Requerido | Descripción                                        |
| ------- | ------ | --------- | -------------------------------------------------- |
| `name`  | string | No        | Nombre de la etiqueta (ver [Nombres](#nombres))    |
| `color` | string | No        | Clave del color (ver [Colores](#colores))          |

### Respuestas

#### 200 OK

Devuelve la etiqueta actualizada (mismo formato que en [`POST /tags`](#post-tags)).

#### 400 Bad Request

Body no válido.

#### 403 Forbidden

La etiqueta es global (`global tags cannot be modified`) o pertenece a otro usuario (`tag not found`).

```json
{
  "statusCode": 403,
  "errorCode": "PERMISSION ERROR",
  "message": "global tags cannot be modified"
}
```

#### 404 Not Found

La etiqueta no existe.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "tag not found"
}
```

#### 409 Conflict

El usuario ya tiene otra etiqueta con ese nombre, o existe una global con ese nombre. Cambiar solo las mayúsculas del nombre de la propia etiqueta sí está permitido.

---

## DELETE /tags/:id

Borra una etiqueta personal y la quita de todas las bibliotecas de su propietario. Solo puede hacerlo su propietario.

### Respuestas

#### 204 No Content

Etiqueta borrada.

#### 403 Forbidden

La etiqueta es global o pertenece a otro usuario.

#### 404 Not Found

La etiqueta no existe.
