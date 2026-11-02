# API de Autenticación

Este documento describe los endpoints de autenticación de Bibliopolis. La autenticación usa un único token JWT que el cliente envía en la cabecera `Authorization: Bearer <accessToken>` (ver [Autenticación](../index.md#autenticacion)).

> El registro de usuarios no es público: los usuarios los crea un administrador con [`POST /users`](users.md#post-users).

## POST /auth/login

Autentica a un usuario verificando sus credenciales. Si son correctas, devuelve un token JWT en el body de la respuesta. Es un endpoint público.

### Body

```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña_segura"
}
```

| Campo      | Tipo   | Requerido | Descripción                  |
| ---------- | ------ | --------- | ---------------------------- |
| `email`    | string | Sí        | Email del usuario registrado |
| `password` | string | Sí        | Contraseña del usuario       |

### Respuestas

#### 200 OK

Login correcto. Devuelve el token de acceso.

```json
{
  "results": {
    "type": "auth",
    "attributes": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

#### 400 Bad Request

Los datos proporcionados no son válidos (formato incorrecto).

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
      "path": ["password"],
      "message": "Required"
    }
  ]
}
```

#### 403 Forbidden

Email o contraseña incorrectos.

```json
{
  "statusCode": 403,
  "errorCode": "INVALID CREDENTIALS ERROR",
  "message": "invalid email or password"
}
```

#### 429 Too Many Requests

Se han superado los 10 intentos de login fallidos desde la misma IP en una ventana de 15 minutos. Los logins correctos no cuentan para el límite. La respuesta incluye las cabeceras estándar `RateLimit` / `RateLimit-Policy`.

```json
{
  "statusCode": 429,
  "errorCode": "TOO MANY REQUESTS ERROR",
  "message": "Too many failed login attempts, please try again later"
}
```

---

## GET /auth/me

Devuelve los datos del usuario autenticado a partir del token enviado en la cabecera `Authorization`.

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
      "updatedAt": "2000-01-01T00:00:00.000Z"
    }
  }
}
```

#### 401 Unauthorized

Token no enviado, no válido o caducado.

```json
{
  "statusCode": 401,
  "errorCode": "TOKEN NOT PROVIDED ERROR",
  "message": "token not provided"
}
```

#### 404 Not Found

El usuario del token ya no existe.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "user not found"
}
```

---

## Notas de implementación

- El token JWT contiene el ID del usuario y su rol (`regular` o `admin`).
- No hay refresh token ni logout en el servidor: para cerrar sesión el cliente descarta el token, que sigue siendo válido hasta que caduca (7 días por defecto, configurable con `JWT_EXPIRATION`).
