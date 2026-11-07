# Bibliopolis API

API REST de Bibliopolis para gestionar usuarios, sus bibliotecas personales y los libros que contienen. Los metadatos de los libros se obtienen por ISBN de fuentes externas (Google Books y Open Library).

## Recursos

| Recurso                          | Ruta base     | Descripción                                                              |
| -------------------------------- | ------------- | ------------------------------------------------------------------------ |
| [Auth](api/auth.md)              | `/auth`       | Login y datos del usuario autenticado                                    |
| [Users](api/users.md)            | `/users`      | Gestión de usuarios y del perfil propio                                  |
| [Books](api/books.md)            | `/books`      | Catálogo compartido de libros, indexado por ISBN                         |
| [Libraries](api/libraries.md)    | `/libraries`  | Bibliotecas del usuario y libros que contienen                           |
| [User Books](api/user-books.md)  | `/user-books` | Ejemplares de libros de un usuario (valoración, notas, exportación)      |
| [External](api/external.md)      | `/external`   | Búsqueda de un libro por ISBN en el catálogo y en las fuentes externas   |
| [Imports](api/imports.md)        | `/imports`    | Importación de libros a una biblioteca desde un fichero CSV              |

Además, `GET /` es un endpoint público de estado:

```json
{
  "success": true,
  "time": "2026-11-02T10:00:00.000Z",
  "version": "1.0.0"
}
```

## Autenticación

Todas las rutas salvo `/auth/login` y `GET /` requieren un token JWT. El token se obtiene con [`POST /auth/login`](api/auth.md#post-authlogin) y se envía en la cabecera `Authorization`:

```
Authorization: Bearer <accessToken>
```

- Solo hay un token (no hay refresh token). Su caducidad es configurable en el servidor (7 días por defecto).
- No hay logout en el servidor: el cliente descarta el token, que sigue siendo válido hasta que caduca.
- El token contiene el ID del usuario y su rol (`regular` o `admin`). Algunos endpoints solo están disponibles para administradores.

Errores de autenticación (`401 Unauthorized`):

| `errorCode`                | `message`             | Causa                                                  |
| -------------------------- | --------------------- | ------------------------------------------------------ |
| `TOKEN NOT PROVIDED ERROR` | `token not provided`  | No se ha enviado la cabecera `Authorization`           |
| `INVALID TOKEN ERROR`      | `invalid token`       | Token mal formado o firma no válida                    |
| `INVALID TOKEN ERROR`      | `token expired`       | El token ha caducado                                   |
| `INVALID TOKEN ERROR`      | `must be admin`       | El endpoint requiere rol `admin`                       |

## Formato de las respuestas

Recurso único:

```json
{
  "results": {
    "type": "libraries",
    "id": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
    "attributes": { }
  }
}
```

Colección (con información de paginación):

```json
{
  "results": [ ],
  "paginationInfo": {
    "skip": 0,
    "limit": 10,
    "total": 100
  }
}
```

Los identificadores son [ULIDs](https://github.com/ulid/spec) y las fechas se devuelven en formato ISO 8601.

## Validación del body

El body de las peticiones se valida antes de procesarlas. Los campos que no estén documentados para un endpoint se ignoran y no se guardan, y a los campos opcionales que se omitan se les aplica su valor por defecto.

## Paginación

Los endpoints que devuelven colecciones aceptan los query params:

| Param   | Tipo   | Por defecto | Descripción                               |
| ------- | ------ | ----------- | ----------------------------------------- |
| `skip`  | number | `0`         | Elementos a omitir (`>= 0`)               |
| `limit` | number | `10`        | Número máximo de resultados (`1` – `100`) |

Valores fuera de rango devuelven un `400` con `errorCode` `VALIDATION ERROR`.

## Errores

Todos los errores tienen el mismo formato:

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
      "path": ["name"],
      "message": "Required"
    }
  ]
}
```

`validationError` solo aparece en los errores de validación y contiene los detalles devueltos por [zod](https://zod.dev).

| Status | `errorCode`                 | Descripción                                                       |
| ------ | --------------------------- | ----------------------------------------------------------------- |
| 400    | `VALIDATION ERROR`          | Body o query params no válidos                                    |
| 400    | `INVALID PASSWORD`          | La contraseña actual no es correcta (cambio de contraseña)        |
| 400    | `INVALID IMPORT FILE`       | Falta el fichero de una importación, o no se puede leer           |
| 400    | `IMPORT TOO MANY ROWS`      | El fichero de una importación supera el límite de filas           |
| 400    | `IMPORT WITHOUT ISBN COLUMN` | El fichero de una importación no tiene columna de ISBN           |
| 400    | `IMPORT WITHOUT VALID ISBN` | El fichero de una importación no tiene ninguna fila válida        |
| 401    | `TOKEN NOT PROVIDED ERROR`  | Falta el token                                                    |
| 401    | `INVALID TOKEN ERROR`       | Token no válido o caducado, o se requiere rol `admin`             |
| 403    | `INVALID CREDENTIALS ERROR` | Email o contraseña incorrectos en el login                        |
| 403    | `PERMISSION ERROR`          | El usuario no tiene permisos sobre el recurso                     |
| 404    | `NOT FOUND ERROR`           | El recurso no existe                                              |
| 404    | `BOOKS API ERROR`           | El libro no se ha encontrado en ninguna fuente externa            |
| 409    | `CONFLICT ERROR`            | El recurso ya existe (email, ISBN, nombre de biblioteca, …)       |
| 409    | `IMPORT ALREADY ACTIVE`     | El usuario ya tiene una importación en curso                      |
| 413    | `IMPORT FILE TOO LARGE`     | El fichero de una importación supera el límite de tamaño          |
| 429    | `TOO MANY REQUESTS ERROR`   | Demasiados intentos de login fallidos                             |
| 500    | `INTERNAL SERVER ERROR`     | Error inesperado del servidor                                     |
| 503    | `SOURCES UNAVAILABLE ERROR` | Libro no encontrado y al menos una fuente externa ha fallado      |
