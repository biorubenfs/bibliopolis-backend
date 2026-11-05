# API de Usuarios

Este documento describe los endpoints para la gestión de usuarios. Todos requieren autenticación; algunos solo están disponibles para administradores.

Atributos de un usuario:

| Campo              | Tipo   | Descripción                                                    |
| ------------------ | ------ | -------------------------------------------------------------- |
| `name`             | string | Nombre del usuario                                             |
| `email`            | string | Email del usuario                                              |
| `role`             | string | `regular` o `admin`                                            |
| `avatar`           | string | Imagen del avatar (PNG) codificada en base64, generada con RoboHash a partir del nombre. Puede ser una cadena vacía si no se pudo generar |
| `emailValidatedAt` | date   | Fecha de validación del email (puede no estar presente)        |
| `createdAt`        | date   | Fecha de creación                                              |
| `updatedAt`        | date   | Fecha de la última modificación                                |

## POST /users

Crea un nuevo usuario con rol `regular`. **Solo administradores.**

### Body

```json
{
  "name": "user02",
  "email": "user02@email.com",
  "password": "contraseña_segura"
}
```

| Campo      | Tipo   | Requerido | Descripción                                  |
| ---------- | ------ | --------- | -------------------------------------------- |
| `name`     | string | Sí        | Nombre del usuario                           |
| `email`    | string | Sí        | Email del usuario. Debe ser un email válido  |
| `password` | string | Sí        | Contraseña del usuario (entre 6 y 20 caracteres) |

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
  }
}
```

#### 400 Bad Request

Body no válido (email con formato incorrecto, contraseña fuera de los límites, campos faltantes, …).

#### 401 Unauthorized

El usuario autenticado no es administrador.

```json
{
  "statusCode": 401,
  "errorCode": "INVALID TOKEN ERROR",
  "message": "must be admin"
}
```

#### 409 Conflict

Ya existe un usuario con ese email.

```json
{
  "statusCode": 409,
  "errorCode": "CONFLICT ERROR",
  "message": "there is already a user registered with email user02@email.com"
}
```

---

## GET /users

Lista todos los usuarios. **Solo administradores.** Admite [paginación](../index.md#paginacion).

### Query Params

- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados

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
        "avatar": "iVBORw0KGgoAAAANSUhEUgAA...",
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

#### 401 Unauthorized

El usuario autenticado no es administrador (`must be admin`).

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

---

## GET /users/:id

Valida el email de un usuario a partir del código de validación generado al crearlo.

### Query Params

- `code`: string — Código de validación

> **En desarrollo:** este endpoint aún no tiene una URL de redirección definida y actualmente responde con un error `500`. No debe usarse todavía.
