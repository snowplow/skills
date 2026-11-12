# Stage 2 Design

Decide the entities and events from the target app found in Stage 1, and write them as JSON Schemas.

Existing app: pick the first thing to measure from the code, in this order: the commitment action (checkout, subscribe, sign up, create or publish), else the main form submit or write endpoint, else the most prominent call to action or the most used handler. The objects that action involves are the entities.

Demo shop from Stage 1b: the design is fixed, a `product` entity with `id`, `name`, `price`, `currency`, an `order` entity with `id`, `total` and `currency`, an `add_to_cart` event carrying the product, and a `checkout_completed` event carrying the order and the cart's products. Neither event has properties.

Design:

- Entities carry the data: one per business object the action involves (`product`, `article`, `workspace`), with `id` plus two to five descriptive properties.
- Events say what happened: one per action, one to three of them. A property goes on an event only when it belongs to the action alone and to no object.
- Snowplow also has out-of-the-box tracking, such as page views and page pings, that needs no schema. This guide sticks to custom tracking for clarity, the docs below cover the rest.

Naming: snake_case schema names and properties, no parent prefix inside an entity (`id`, not `product_id`).

## Output

One JSON Schema per entity and event, written into the progress file under a `Design` heading, each introduced by its type, vendor, name and version, followed by the list of entities each event carries and whether the event cannot happen without one. Say in one line what was chosen and why, and continue. A wrong guess is cheap: specs and plans are editable, a schema change is a new version, and nothing has reached a warehouse yet.

Entity, `com.acme/product` version `1-0-0`:

```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "maxLength": 255 },
    "name": { "type": "string", "maxLength": 255 },
    "price": { "type": "number", "minimum": 0 },
    "currency": { "type": "string", "enum": ["EUR", "USD", "GBP"] }
  },
  "required": ["id"],
  "additionalProperties": false
}
```

Event, `com.acme/add_to_cart` version `1-0-0`, carrying `product`, required:

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

Property types: string, number, integer, boolean, object, array, or a union with null. Give strings a `maxLength` and numbers a range when known. New schemas start at `1-0-0`. Schemas are immutable once created, a change is a new version: `1-0-1` adds an optional property, `1-1-0` adds a required property or tightens a constraint, `2-0-0` removes or retypes a property.

## Docs

- [Tracking design best practice](https://docs.snowplow.io/docs/fundamentals/tracking-design-best-practice.md)
- [Out-of-the-box tracking](https://docs.snowplow.io/docs/events/ootb-data.md)
- [Page views and pings on web](https://docs.snowplow.io/docs/sources/web-trackers/tracking-events.md)
