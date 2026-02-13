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

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `email` | string | Sí | Email del usuario. Debe ser un email válido |
| `password` | string | Sí | Contraseña del usuario |
| `name` | string | Sí | Nombre completo del usuario |

### Respuestas

#### 201 Created

Usuario registrado correctamente.

```json
{
  "id": "user_id",
  "email": "usuario@ejemplo.com",
  "name": "Nombre del Usuario",
  "role": "user"
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

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `email` | string | Sí | Email del usuario registrado |
| `password` | string | Sí | Contraseña del usuario |

### Respuestas

#### 200 OK

Login exitoso.

```json
{
  "id": "user_id",
  "email": "usuario@ejemplo.com",
  "name": "Nombre del Usuario",
  "role": "user"
}
```

#### 400 Bad Request

Los datos proporcionados no son válidos (formato incorrecto).

#### 403 Forbidden

Email o contraseña incorrectos.

```json
{
  "error": "invalid email or password"
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
