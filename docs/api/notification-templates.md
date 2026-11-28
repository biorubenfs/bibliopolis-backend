# API de Plantillas de notificación

Este documento describe los endpoints con los que los administradores editan el título de cada tipo de [notificación](notifications.md). Hay una plantilla por tipo; mientras nadie la cambia, se usa la plantilla por defecto.

Todos los endpoints son **solo para administradores**: un usuario `regular` recibe un `403` (`must be admin`).

Cambiar una plantilla solo afecta a las notificaciones que se creen después; las ya creadas conservan su título (ver [Título](notifications.md#titulo)).

Atributos de una plantilla (su `id` es el tipo de notificación):

| Campo          | Tipo           | Descripción                                                                 |
| -------------- | -------------- | --------------------------------------------------------------------------- |
| `title`        | string         | Plantilla vigente del título                                                |
| `defaultTitle` | string         | Plantilla por defecto, para poder restaurarla                               |
| `variables`    | string[]       | Variables que admite el tipo (ver [Variables](#variables))                  |
| `optional`     | boolean        | Si los usuarios pueden desactivar este tipo de notificación                 |
| `updatedAt`    | date \| null   | Fecha del último cambio, o `null` si es la plantilla por defecto            |
| `updatedBy`    | string \| null | ID del administrador que la cambió por última vez, o `null` si es la plantilla por defecto |

## Variables

Una variable se escribe entre llaves dobles y sin espacios, por ejemplo `{{userName}}`. Puede aparecer varias veces o ninguna. Es solo texto: no hay condiciones ni formato.

| Variable      | Valor                                                  | Tipos                        |
| ------------- | ------------------------------------------------------ | ---------------------------- |
| `userName`    | Nombre del usuario que recibe la notificación          | `welcome`, `library-shared`  |
| `ownerName`   | Nombre del propietario de la biblioteca compartida     | `library-shared`             |
| `libraryName` | Nombre de la biblioteca compartida                     | `library-shared`             |

Plantillas por defecto:

| Tipo             | `defaultTitle`                                            |
| ---------------- | --------------------------------------------------------- |
| `welcome`        | `Te damos la bienvenida a Bibliopolis, {{userName}}`      |
| `library-shared` | `{{ownerName}} ha compartido «{{libraryName}}» contigo`   |

---

## GET /notification-templates

Lista las plantillas de todos los tipos de notificación. No admite paginación: devuelve siempre todos los tipos.

### Respuestas

#### 200 OK

```json
{
  "results": [
    {
      "type": "notification-templates",
      "id": "welcome",
      "attributes": {
        "title": "Bienvenido a Bibliopolis, {{userName}}",
        "defaultTitle": "Te damos la bienvenida a Bibliopolis, {{userName}}",
        "variables": ["userName"],
        "optional": false,
        "updatedAt": "2026-11-28T10:00:00.000Z",
        "updatedBy": "01J9BK7YX0D5NHHBN70Q4N7P69"
      }
    },
    {
      "type": "notification-templates",
      "id": "library-shared",
      "attributes": {
        "title": "{{ownerName}} ha compartido «{{libraryName}}» contigo",
        "defaultTitle": "{{ownerName}} ha compartido «{{libraryName}}» contigo",
        "variables": ["userName", "ownerName", "libraryName"],
        "optional": true,
        "updatedAt": null,
        "updatedBy": null
      }
    }
  ],
  "paginationInfo": {
    "skip": 0,
    "limit": 2,
    "total": 2
  }
}
```

#### 403 Forbidden

El usuario no es administrador.

---

## PUT /notification-templates/:type

Cambia la plantilla del título de un tipo de notificación. Para volver a la plantilla por defecto, se envía `defaultTitle`.

### Body

```json
{
  "title": "Bienvenido a Bibliopolis, {{userName}}"
}
```

| Campo   | Tipo   | Requerido | Descripción                                                                    |
| ------- | ------ | --------- | ------------------------------------------------------------------------------ |
| `title` | string | Sí        | Plantilla del título, entre 1 y 150 caracteres. Se eliminan los espacios de los extremos. Solo puede usar las variables de su tipo |

No se admite ningún otro campo.

### Respuestas

#### 200 OK

Devuelve la plantilla actualizada (mismo formato que un elemento de [`GET /notification-templates`](#get-notification-templates)).

#### 400 Bad Request

Body no válido: falta `title`, está vacío o supera los 150 caracteres.

Una variable que el tipo no ofrece (o escrita con espacios, como `{{ userName }}`):

```json
{
  "statusCode": 400,
  "errorCode": "INVALID TEMPLATE VARIABLE",
  "message": "unknown variables: libraryName; available: userName"
}
```

Llaves sin cerrar o que sobran, como `{{userName`:

```json
{
  "statusCode": 400,
  "errorCode": "INVALID TEMPLATE VARIABLE",
  "message": "variables must be written as {{name}}"
}
```

#### 403 Forbidden

El usuario no es administrador.

#### 404 Not Found

El tipo de notificación no existe.

```json
{
  "statusCode": 404,
  "errorCode": "NOT FOUND ERROR",
  "message": "notification template not found"
}
```
