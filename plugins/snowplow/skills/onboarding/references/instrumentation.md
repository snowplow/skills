# Stage 4 Instrument

Decide first how the tracking is implemented, and record it in the progress file:

- Snowtype, when the platform's tracker is in the table below. It generates typed functions from the event specs, and the events they send carry the `event_specification` entity that lets Micro and the pipeline validate against the spec.
- Direct tracker calls otherwise, with the Iglu URIs from Stage 3 and no code generation.

Then credentials (Snowtype only), tracker, generated code, wiring. Run every command from the project root. Platform-specific pieces come from the table, everything else is the same on every platform.

## Credentials

Snowtype only. It needs a Console API key and key ID to read the event specs. Sending events with the CLI does not. `snowplow-cli` below means `npx @snowplow/snowplow-cli`, or the binary when one is installed.

1. `snowplow-cli status`. If it passes and its `org_id` equals the id from `get_organization`, skip to the tracker.
2. Otherwise `snowplow-cli setup --dotenv`. It opens the browser for a device login, finds the organization, creates an API key, and writes `SNOWPLOW_CONSOLE_API_KEY`, `SNOWPLOW_CONSOLE_API_KEY_ID` and `SNOWPLOW_CONSOLE_ORG_ID` to `./.env`. The user completes the login. If the session cannot open a browser, ask them to run the command themselves. Snowtype reads the same `.env`.
3. Add `.env` to `.gitignore` if missing, run `snowplow-cli status` again, check the org id.

Forks. SSO organization, device login fails: the user creates the key in Console (Settings → Manage organization → API keys) and writes the three variables into `.env` themselves. A global CLI config for another organization exists: the project `.env` takes precedence, nothing else to do. Use `--read-only` only when the key serves Snowtype alone.

## Platform table

| Platform | Source app `tracker` | Snowtype `-t` | Snowtype `-l` | Docs |
|---|---|---|---|---|
| Web, npm | `javascript` | `@snowplow/browser-tracker` | `typescript` or `javascript` | [Web trackers](https://docs.snowplow.io/docs/sources/web-trackers.md) |
| Web, script tag | `javascript` | `@snowplow/javascript-tracker` | `javascript` | [Web trackers](https://docs.snowplow.io/docs/sources/web-trackers.md) |
| iOS | `ios` | `snowplow-ios-tracker` | `swift` | [Mobile trackers](https://docs.snowplow.io/docs/sources/mobile-trackers.md) |
| Android | `android` | `snowplow-android-tracker` | `kotlin` | [Mobile trackers](https://docs.snowplow.io/docs/sources/mobile-trackers.md) |
| React Native | `react_native` | `@snowplow/react-native-tracker` | `typescript` | [React Native tracker](https://docs.snowplow.io/docs/sources/react-native-tracker.md) |
| Flutter | `flutter` | `snowplow-flutter-tracker` | `dart` | [Flutter tracker](https://docs.snowplow.io/docs/sources/flutter-tracker.md) |
| Node.js | `nodejs` | `@snowplow/node-tracker` | `typescript` or `javascript` | [Node.js tracker](https://docs.snowplow.io/docs/sources/node-js-tracker.md) |
| Go | `golang` | `snowplow-golang-tracker` | `go` | [Go tracker](https://docs.snowplow.io/docs/sources/golang-tracker.md) |
| Java | `java` | `snowplow-java-tracker` | `java` | [Java tracker](https://docs.snowplow.io/docs/sources/java-tracker.md) |
| Google Tag Manager | `google_tag_manager` | `google-tag-manager` | `javascript-gtm` | [Google Tag Manager](https://docs.snowplow.io/docs/sources/google-tag-manager.md) |
| Python, .NET, Scala, Ruby, PHP, Rust, C++, Unity, Roku, pixel | `python`, `dotnet`, `scala`, `ruby`, `php`, `rust`, `cpp`, `unity`, `roku`, `pixel` | no Snowtype | | [All trackers](https://docs.snowplow.io/docs/sources.md) |

Install and initialisation details come from the Docs column.

## Initialise the tracker

Once, where the app boots, with the collector host read from the app's configuration. Point it at the Micro endpoint. Stage 6 switches it to the pipeline collector once a destination is active, an existing customer stays on the Micro until the schemas are in PROD. Web example:

```typescript
import { newTracker } from "@snowplow/browser-tracker";

newTracker("sp", collectorHost, { appId: "acme-web" });
```

Collector hosts: Micro `https://<id>.apps.snowplowanalytics.com`, pipeline `<name>.collector.snplow.net`. Mobile trackers take the same host and app ID in their tracker configuration.

## Snowtype

Node 18 or newer. Use the organization id from `get_organization`, the tracker and language from the platform table, and the tracking plan id from Stage 3. `init` writes the config without a plan, `patch` adds the plan to it, `generate` reads it:

```
npx @snowplow/snowtype@latest init -i <org-id> -t <tracker> -l <language> -o <outpath>
npx @snowplow/snowtype@latest patch --dataProductIds <tracking-plan-id>
npx @snowplow/snowtype@latest generate
```

Output: one source file with a `create<Entity>` function per entity and a `track<Spec>Spec` function per event spec in TypeScript and JavaScript, `to<Spec>Spec()` extension functions on the generated event types in Swift and Kotlin, and `.snowtype-lock.json` pinning the spec versions. Commit all of it. After the plan changes run `npx @snowplow/snowtype@latest update --yes` then `generate` again. `update --latestDraft` picks up draft specs, which is what an existing customer at DEV needs. Snowtype does not install the tracker and cannot generate for template plans.

## Wiring

For each event spec, go to the handler found in Stage 2, build the entity, call the spec function. Web example with Snowtype:

```typescript
import { createProduct, trackAddToCartSpec } from "./snowplow/snowplow";

trackAddToCartSpec({
  context: [createProduct({ id: product.id, name: product.name, price: product.price, currency: "EUR" })],
});
```

Build the app and fix type errors at the call sites, never in the generated file.

Without Snowtype: call the tracker's self-describing event method with the event's Iglu URI and an empty payload, and pass each entity with its Iglu URI and data. These events carry no `event_specification` entity, so Micro and the pipeline validate them against the schema only, and the autogenerated model in Stage 7 needs `eventSpecificationContextFiltering: false`.

## CLI events

For a target without code yet, to exercise the Micro without driving the app, or to test the schemas in Stage 5, send one event per spec with the CLI:

```
snowplow-cli events send --collector <collector-host> --app-id acme-web \
  --schema iglu:com.acme/add_to_cart/jsonschema/1-0-0 --json '{}' \
  --entities '[{"schema":"iglu:com.acme/product/jsonschema/1-0-0","data":{"id":"p1","name":"Mug","price":9.5,"currency":"EUR"}}]'
```

Like direct tracker calls, they carry no `event_specification` entity.

## Docs

- [All trackers](https://docs.snowplow.io/docs/sources.md)
- [Web tracker quick start](https://docs.snowplow.io/docs/sources/web-trackers/quick-start-guide.md)
- [Cookies and ad blockers](https://docs.snowplow.io/docs/get-started/tracking/cookies-and-ad-blockers.md)
- [Install Snowtype](https://docs.snowplow.io/docs/event-studio/implement-tracking/install-snowtype.md)
- [Snowtype configuration reference, supported trackers](https://docs.snowplow.io/docs/event-studio/implement-tracking/configuration-reference.md)
- [Generated code](https://docs.snowplow.io/docs/event-studio/implement-tracking/generate-tracking-code.md)
- [Keep code up to date](https://docs.snowplow.io/docs/event-studio/implement-tracking/keep-code-up-to-date.md)
- [CLI send events](https://docs.snowplow.io/docs/api-reference/snowplow-cli/send-events.md)
