# API de Usuarios

Este documento describe los endpoints para la gestión de usuarios. Todos requieren autenticación; algunos solo están disponibles para administradores.

Atributos de un usuario:

| Campo              | Tipo   | Descripción                                                    |
| ------------------ | ------ | -------------------------------------------------------------- |
| `name`             | string | Nombre del usuario                                             |
| `email`            | string | Email del usuario, en minúsculas. Es único                     |
| `role`             | string | `regular` o `admin`                                            |
| `avatar`           | string | Imagen del avatar (PNG) codificada en base64, generada con RoboHash a partir del nombre. Puede ser una cadena vacía si no se pudo generar |
| `createdAt`        | date   | Fecha de creación                                              |
| `updatedAt`        | date   | Fecha de la última modificación                                |

## POST /users

Crea un usuario con rol `regular` y una contraseña generada por el servidor. **Solo administradores.** No hay registro público ni se pueden crear administradores.

La contraseña tiene 12 caracteres sin los que se confunden fácilmente (`0`, `O`, `1`, `l`, `I`). Se devuelve **solo en esta respuesta**, en `meta.password`: el servidor guarda únicamente su hash y no se puede volver a consultar. Hacérsela llegar al usuario queda fuera de la API.

### Body

```json
{
  "name": "user02",
  "email": "User02@email.com"
}
```

| Campo   | Tipo   | Requerido | Descripción                                                          |
| ------- | ------ | --------- | -------------------------------------------------------------------- |
| `name`  | string | Sí        | Nombre del usuario. Se eliminan los espacios de los extremos; no puede quedar vacío |
| `email` | string | Sí        | Email válido. Se guarda sin espacios en los extremos y en minúsculas |

No se admite ningún otro campo (tampoco `password` ni `role`).

### Respuestas

#### 201 Created

```json
{
  "results": {
    "type": "users",
    "id": "01KHF81YFVSR13E8ZAC3WVKNPZ",
    "attributes": {
      "name": "user02",
      "email": "user02@email.com",
      "role": "regular",
      "avatar": "iVBORw0KGgoAAAANSUhEUgAA...",
      "createdAt": "2026-02-14T23:33:56.859Z",
      "updatedAt": "2026-02-14T23:33:56.859Z"
    }
  },
  "meta": {
    "password": "k7RmWq3ZpT9x"
  }
}
```

#### 400 Bad Request

Body no válido (email con formato incorrecto, nombre vacío, campos faltantes o campos no admitidos).

#### 403 Forbidden

El usuario autenticado no es administrador.

```json
{
  "statusCode": 403,
  "errorCode": "PERMISSION ERROR",
  "message": "must be admin"
}
```

#### 409 Conflict

Ya existe un usuario con ese email (sin distinguir mayúsculas).

```json
{
  "statusCode": 409,
  "errorCode": "CONFLICT ERROR",
  "message": "there is already a user registered with email user02@email.com"
}
```

---

## POST /users/:id/password-reset

Genera una contraseña nueva para un usuario `regular` y sustituye la anterior. **Solo administradores.** Igual que en el alta, la contraseña se devuelve **solo en esta respuesta**, en `meta.password`.

Las sesiones abiertas del usuario siguen siendo válidas hasta que caduca su token. La contraseña de un administrador no se puede restablecer: la cambia él mismo con [`PATCH /users/me/password`](#patch-usersmepassword).

### Respuestas

#### 200 OK

```json
{
  "results": {
    "type": "users",
    "id": "01J9BHWZ8N4B1JBSAFCBKQGERS",
    "attributes": {
      "name": "user01",
      "email": "user01@email.com",
      "role": "regular",
      "avatar": "iVBORw0KGgoAAAANSUhEUgAA...",
      "createdAt": "2000-01-01T00:00:00.000Z",
      "updatedAt": "2026-02-14T23:33:56.859Z"
    }
  },
  "meta": {
    "password": "Hb4nYc8sWe2u"
  }
}
```

#### 403 Forbidden

El usuario autenticado no es administrador (`must be admin`), o el usuario indicado es un administrador:

```json
{
  "statusCode": 403,
  "errorCode": "PERMISSION ERROR",
  "message": "only the password of a regular user can be reset"
}
```

#### 404 Not Found

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "user not found"
}
```

---

## GET /users

Lista los usuarios, del más reciente al más antiguo. **Solo administradores.** Admite [paginación](../index.md#paginacion) y búsqueda. Los usuarios de la lista no incluyen el atributo `avatar`.

### Query Params

- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados
- `search`: string (opcional, máx. 100 caracteres) — Texto que debe aparecer en el nombre o en el email, sin distinguir mayúsculas. Se busca de forma literal

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "users",
      "id": "01J9BHWZ8N4B1JBSAFCBKQGERS",
      "attributes": {
        "name": "user01",
        "email": "user01@email.com",
        "role": "regular",
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

Query params no válidos.

#### 403 Forbidden

El usuario autenticado no es administrador (`must be admin`).

---

## GET /users/:id

Devuelve un usuario. **Solo administradores.** Igual que en la lista, no incluye el atributo `avatar`.

### Respuestas

#### 200 OK

```json
{
  "results": {
    "type": "users",
    "id": "01J9BHWZ8N4B1JBSAFCBKQGERS",
    "attributes": {
      "name": "user01",
      "email": "user01@email.com",
      "role": "regular",
      "createdAt": "2000-01-01T00:00:00.000Z",
      "updatedAt": "2000-01-01T00:00:00.000Z"
    }
  }
}
```

#### 403 Forbidden

El usuario autenticado no es administrador (`must be admin`).

#### 404 Not Found

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "user not found"
}
```

---

## GET /users/:id/stats

Devuelve estadísticas de las bibliotecas y los libros de un usuario `regular`, para el backoffice. **Solo administradores.** Por privacidad, la respuesta solo contiene cifras: nunca nombres de bibliotecas ni datos de los libros.

Se cuentan todos los libros del usuario, también los que no están en ninguna biblioteca (como en [`GET /user-books`](user-books.md)).

### Respuestas

#### 200 OK

```json
{
  "results": {
    "type": "user-stats",
    "attributes": {
      "libraries": {
        "count": 3,
        "averageBooks": 1.3333333333333333,
        "largestBooks": 3
      },
      "books": {
        "total": 8,
        "rated": 6,
        "unrated": 2,
        "withoutLibrary": 5
      },
      "ratings": {
        "average": 7.5,
        "distribution": { "1": 0, "2": 0, "3": 1, "4": 0, "5": 0, "6": 0, "7": 2, "8": 0, "9": 2, "10": 1 }
      }
    }
  }
}
```

| Campo | Tipo | Descripción |
| ----- | ---- | ----------- |
| `libraries.count` | number | Número de bibliotecas |
| `libraries.averageBooks` | number | Media de libros por biblioteca, sin redondear. Un libro que está en dos bibliotecas cuenta en las dos. `0` si no tiene bibliotecas |
| `libraries.largestBooks` | number \| null | Libros de la biblioteca más grande. `null` si no tiene bibliotecas |
| `books.total` | number | Libros del usuario |
| `books.rated` / `books.unrated` | number | Libros con y sin valoración |
| `books.withoutLibrary` | number | Libros que no están en ninguna biblioteca |
| `ratings.average` | number \| null | Valoración media de los libros valorados, sin redondear. `null` si no hay ninguno |
| `ratings.distribution` | object | Número de libros con cada valoración. Siempre tiene las diez claves, de `"1"` a `"10"` |

#### 403 Forbidden

El usuario autenticado no es administrador (`must be admin`).

#### 404 Not Found

El usuario no existe o es un administrador, que no tiene bibliotecas:

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "user not found"
}
```

---

## GET /users/me

Devuelve los datos del usuario autenticado. Es equivalente a [`GET /auth/me`](auth.md#get-authme).

### Respuestas

#### 200 OK

Mismo formato que [`GET /auth/me`](auth.md#get-authme).

#### 404 Not Found

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "user not found"
}
```

---

## PATCH /users/me

Actualiza el nombre del usuario autenticado. El avatar se regenera a partir del nuevo nombre; si RoboHash falla, el nombre se actualiza igualmente y el avatar queda como una cadena vacía.

### Body

```json
{
  "name": "nuevo nombre"
}
```

| Campo  | Tipo   | Requerido | Descripción             |
| ------ | ------ | --------- | ----------------------- |
| `name` | string | Sí        | Nuevo nombre de usuario |

### Respuestas

#### 200 OK

Devuelve el usuario actualizado (mismo formato que [`GET /auth/me`](auth.md#get-authme)).

#### 400 Bad Request

Body no válido.

#### 404 Not Found

El usuario no existe.

---

## PATCH /users/me/password

Cambia la contraseña del usuario autenticado.

### Body

```json
{
  "currentPassword": "contraseña_actual",
  "newPassword": "contraseña_nueva"
}
```

| Campo             | Tipo   | Requerido | Descripción                         |
| ----------------- | ------ | --------- | ----------------------------------- |
| `currentPassword` | string | Sí        | Contraseña actual (máx. 20 caracteres) |
| `newPassword`     | string | Sí        | Nueva contraseña (entre 6 y 20 caracteres) |

### Respuestas

#### 200 OK

Devuelve el usuario actualizado (mismo formato que [`GET /auth/me`](auth.md#get-authme)).

#### 400 Bad Request

Body no válido o contraseña actual incorrecta.

```json
{
  "statusCode": 400,
  "errorCode": "INVALID PASSWORD",
  "message": "invalid current password"
}
```

#### 404 Not Found

El usuario no existe.
