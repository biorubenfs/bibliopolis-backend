# API de Notificaciones

Este documento describe los endpoints de las notificaciones dentro de la aplicación. Cada usuario solo ve las suyas, y no se borran con el tiempo.

Todos los endpoints son solo para usuarios `regular`: un administrador recibe un `403` (`must be a regular user`). Los administradores no reciben notificaciones.

Atributos de una notificación:

| Campo       | Tipo         | Descripción                                                                  |
| ----------- | ------------ | ---------------------------------------------------------------------------- |
| `type`      | string       | Tipo de la notificación (ver [Tipos](#tipos))                                |
| `title`     | string       | Texto de la notificación, ya completado (ver [Título](#titulo))              |
| `data`      | object       | Lo que la notificación referencia, según su tipo. Sirve al cliente para decidir adónde lleva al pulsarla |
| `readAt`    | date \| null | Fecha en que se marcó como leída, o `null` si no se ha leído                 |
| `createdAt` | date         | Fecha de creación                                                            |

## Tipos

| `type`           | Cuándo se crea                                                                                     | `data`                     | Desactivable |
| ---------------- | -------------------------------------------------------------------------------------------------- | -------------------------- | ------------ |
| `welcome`        | Al crear el usuario desde el backoffice ([`POST /users`](users.md#post-users)). Solo una vez       | `{}`                       | No           |
| `library-shared` | Cuando el propietario de una biblioteca invita al usuario ([`POST /libraries/:id/members`](libraries.md#post-librariesidmembers)) | `{ "libraryId", "ownerId" }` | Sí, con `libraryShared` en las [preferencias](users.md#patch-usersmenotification-preferences) |

Una notificación desactivada no se crea, en lugar de crearse oculta: si el usuario la vuelve a activar, solo recibe las nuevas.

Las notificaciones `library-shared` de una biblioteca se eliminan cuando el usuario deja de tener acceso a ella: si el propietario lo retira, si el usuario sale o si la biblioteca se elimina. No se avisa de que se ha retirado el acceso.

## Título

El título sale de la [plantilla](notification-templates.md) de su tipo, que los administradores pueden cambiar. Al crear la notificación se guarda una copia de la plantilla vigente, con las variables sin completar:

- **Cambiar la plantilla no afecta a las notificaciones ya creadas**, solo a las nuevas.
- **Las variables se completan cada vez que se lee la notificación**, con los datos actuales: si el propietario cambia de nombre o renombra la biblioteca, las notificaciones antiguas muestran el nombre nuevo.
- Si el dato ya no existe, se usa el valor que tenía al crearse la notificación.

---

## GET /notifications

Lista las notificaciones del usuario autenticado, de la más reciente a la más antigua. Admite [paginación](../index.md#paginacion).

### Query Params

- `skip`: number (opcional) — Elementos a omitir
- `limit`: number (opcional) — Límite de resultados
- `unread`: `true` \| `false` (opcional) — Con `true`, solo las no leídas. Con `false` o sin el parámetro, todas

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "notifications",
      "id": "01KB2Q7Y3M5W8E0R4T6Y9U1I3O",
      "attributes": {
        "type": "library-shared",
        "title": "user01 ha compartido «sample first library» contigo",
        "data": {
          "libraryId": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
          "ownerId": "01J9BHWZ8N4B1JBSAFCBKQGERS"
        },
        "readAt": null,
        "createdAt": "2026-11-28T10:00:00.000Z"
      }
    },
    {
      "type": "notifications",
      "id": "01KB2Q5V1K3T6C8Y2R4E6W8Q0P",
      "attributes": {
        "type": "welcome",
        "title": "Te damos la bienvenida a Bibliopolis, user02",
        "data": {},
        "readAt": "2026-11-27T09:30:00.000Z",
        "createdAt": "2026-11-27T09:00:00.000Z"
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

Parámetros de paginación no válidos, o `unread` distinto de `true` y `false`.

#### 403 Forbidden

El usuario es administrador.

---

## GET /notifications/unread-count

Devuelve cuántas notificaciones no leídas tiene el usuario autenticado. Pensado para consultarlo periódicamente.

### Respuestas

#### 200 OK

```json
{
  "results": {
    "type": "notifications-unread-count",
    "attributes": {
      "count": 2
    }
  }
}
```

#### 403 Forbidden

El usuario es administrador.

---

## PATCH /notifications/:id

Marca una notificación del usuario autenticado como leída o como no leída.

Si ya estaba leída, marcarla otra vez como leída conserva la fecha de la primera vez.

### Body

```json
{
  "read": true
}
```

| Campo  | Tipo    | Requerido | Descripción                                          |
| ------ | ------- | --------- | ---------------------------------------------------- |
| `read` | boolean | Sí        | `true` para marcarla como leída, `false` como no leída |

No se admite ningún otro campo.

### Respuestas

#### 200 OK

Devuelve la notificación actualizada.

```json
{
  "results": {
    "type": "notifications",
    "id": "01KB2Q7Y3M5W8E0R4T6Y9U1I3O",
    "attributes": {
      "type": "library-shared",
      "title": "user01 ha compartido «sample first library» contigo",
      "data": {
        "libraryId": "01J9W8VR2CFZW8PJ1Q8Y4Y5WEX",
        "ownerId": "01J9BHWZ8N4B1JBSAFCBKQGERS"
      },
      "readAt": "2026-11-28T10:05:00.000Z",
      "createdAt": "2026-11-28T10:00:00.000Z"
    }
  }
}
```

#### 400 Bad Request

Body no válido: falta `read`, no es un booleano o hay campos no admitidos.

#### 403 Forbidden

El usuario es administrador.

#### 404 Not Found

La notificación no existe o es de otro usuario.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "notification not found"
}
```

---

## POST /notifications/read-all

Marca como leídas todas las notificaciones no leídas del usuario autenticado. Las que ya estaban leídas conservan su fecha.

### Respuestas

#### 204 No Content

Todas las notificaciones del usuario están leídas.

#### 403 Forbidden

El usuario es administrador.
