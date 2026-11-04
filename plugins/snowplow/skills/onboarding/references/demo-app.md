# Stage 1b Demo app

Build it only when Stage 1 found no app, in a new `snowplow-demo` directory under the current one. From here on `snowplow-demo` is the project root for every stage. Web app: Vite with the vanilla TypeScript template: no framework to learn, Snowtype emits TypeScript, one command serves it.

```
npm create vite@latest snowplow-demo -- --template vanilla-ts
cd snowplow-demo
npm install
```

Replace the template's `src/main.ts` with a small shop:

- Three views behind a hash router: `#/` lists three hardcoded products with an "Add to cart" button each, `#/cart` shows the cart with a "Checkout" button, `#/done` thanks the user.
- A `src/tracking.ts` module imported once from `src/main.ts`, empty for now. Stage 4 initialises the tracker there, with the collector host and app ID hardcoded. They do not go in `.env`, that file holds the Console API key and belongs to the CLI and Snowtype only.
- `git init`, add `.env` to `.gitignore`, keep `docs/snowplow-onboarding.md` in this directory, moving it here when Stage 1 created it one level up.

`npm run dev` serves it on `http://localhost:5173`. The three clicks that matter are: add a product, open the cart, check out. Stage 2 designs for them. Stage 4 wires `trackAddToCartSpec` with a `createProduct` entity into "Add to cart", and `trackCheckoutCompletedSpec` with a `createOrder` entity and the cart's products into "Checkout".

Done when `npm run build` passes and `npm run dev` answers on `http://localhost:5173`.
