# API de Autenticación

Este documento describe los endpoints disponibles para la autenticación de usuarios en la aplicación Bibliopolis.

## POST /auth/signup

Este endpoint registra un nuevo usuario en el sistema. Al completarse exitosamente el registro, se genera un token JWT que se devuelve al cliente mediante una cookie `access_token`.

Crea una nueva cuenta de usuario en el sistema.

### Body

```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña_segura",
  "name": "Nombre del Usuario"
}
```

| Campo      | Tipo   | Requerido | Descripción                                 |
| ---------- | ------ | --------- | ------------------------------------------- |
| `email`    | string | Sí        | Email del usuario. Debe ser un email válido |
| `password` | string | Sí        | Contraseña del usuario                      |
| `name`     | string | Sí        | Nombre completo del usuario                 |

### Respuestas

#### 201 Created

Usuario registrado correctamente.

```json
{
  "results": {
    "type": "users",
    "id": "01KHF81YFVSR13E8ZAC3WVKNPZ",
    "attributes": {
      "name": "username",
      "email": "user@email.com",
      "role": "regular",
      "createdAt": "2026-02-14T23:33:56.859Z",
      "updatedAt": "2026-02-14T23:33:56.859Z"
    }
  }
}
```

Se establece la cookie `access_token` con el token JWT de autenticación.

#### 400 Bad Request

Los datos proporcionados no son válidos (email inválido, campos faltantes, etc.).

---

## POST /auth/login

Autentica a un usuario existente verificando sus credenciales. Si las credenciales son correctas, se genera un token JWT que se devuelve al cliente mediante una cookie `access_token`.

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

Login exitoso. Devuelve el usuario.

```json
{
  "results": {
    "type": "users",
    "id": "01J9BK7YX0D5NHHBN70Q4N7P69",
    "attributes": {
      "name": "admin01",
      "email": "admin01@email.com",
      "role": "admin",
      "createdAt": "2000-01-01T00:00:00.000Z",
      "updatedAt": "2000-01-01T00:00:00.000Z"
    }
  }
}
```

#### 400 Bad Request

Los datos proporcionados no son válidos (formato incorrecto).

```json
{
  "statusCode": 400,
  "errorCode": "BODY VALIDATION ERROR",
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

---

## POST /auth/logout

Cierra la sesión del usuario actual eliminando su token de autenticación.

### Respuestas

#### 204 No Content

Logout exitoso. La cookie `access_token` ha sido eliminada.

---

## Notas de implementación

- Todos los tokens JWT generados contienen el ID del usuario y su rol.
- Las cookies se configuran según las opciones especificadas en la configuración de la aplicación.
