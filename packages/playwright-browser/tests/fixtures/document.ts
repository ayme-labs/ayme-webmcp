export const chromiumViewport = { width: 1024, height: 768 } as const;

export const parityDocument = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Chromium parity fixture</title>
  </head>
  <body>
    <main role="main" aria-labelledby="fixture-title">
      <h1 id="fixture-title">Chromium parity fixture</h1>

      <section aria-labelledby="strict-title">
        <h2 id="strict-title">Strict resolution</h2>
        <button type="button" data-fixture="save">Save</button>
        <button type="button" data-fixture="duplicate">Duplicate</button>
        <button type="button" data-fixture="duplicate">Duplicate</button>
      </section>

      <section aria-labelledby="input-title">
        <h2 id="input-title">Input events</h2>
        <form id="message-form" onsubmit="event.preventDefault()">
          <label for="message-input">Message</label>
          <input id="message-input" name="message" type="text" />
        </form>
      </section>

      <section aria-labelledby="state-title">
        <h2 id="state-title">Delayed state</h2>
        <p
          role="status"
          aria-label="Ready"
          data-fixture="delayed-state"
          hidden
        >
          Ready
        </p>
      </section>
    </main>
  </body>
</html>`;
