# External

## GET /external

Permite buscar un libro a partir de Open Library

### Query Params

- `isbn`: string (isbn a buscar (isbn13 o isbn10))

### Respuestas

#### 200 No Content

```json
{
    "results": {
        "type": "book-result",
        "attributes": {
            "title": "The Seven Habits of Highly Effective People",
            "isbn13": null,
            "isbn10": "0671708635",
            "authors": [
                "Stephen R. Covey",
                "Sean Covey"
            ],
            "coverUrl": "https://covers.openlibrary.org/b/id/7239071-L.jpg"
        }
    }
}
```

#### 400

Error de validación

```json
{
    "statusCode": 400,
    "errorCode": "VALIDATION ERROR",
    "message": "invalid query param",
    "validationError": [
        {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": [
                "isbn"
            ],
            "message": "Required"
        }
    ]
}
```