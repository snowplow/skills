# Stage 1b Demo app

Build it only when Stage 1 found no app, in the project root, which is empty. Web app: Vite with the vanilla TypeScript template: no framework to learn, Snowtype emits TypeScript, one command serves it.

```
npm create vite@latest . -- --template vanilla-ts
npm install
```

Replace the template's `src/main.ts` with a small e-shop:

- Three views behind a hash router: `#/` lists three hardcoded products with an "Add to cart" button each, `#/cart` shows the cart with a "Checkout" button, `#/done` thanks the user.
- A `src/tracking.ts` module imported once from `src/main.ts`, empty for now. Stage 4 initialises the tracker there, with the collector host and app ID as constants.
- `git init`, add `.env` to `.gitignore`.

`npm run dev` serves it on the URL it prints, `http://localhost:5173` unless that port is taken. The three clicks that matter are: add a product, open the cart, check out. Stage 2 designs for them. Stage 4 wires `trackAddToCartSpec` with a `createProduct` entity into "Add to cart", and `trackCheckoutCompletedSpec` with a `createOrder` entity and the cart's products into "Checkout".

Done when `npm run build` passes and `npm run dev` answers on the URL it prints.
