import { main, suspend } from "effection";
import { createRevolution, route } from "revolution";
import { useTailwind } from "./plugins/tailwind.ts";
import { assetRoute } from "./plugins/asset-route.ts";
import { autoreloadPlugin } from "./plugins/autoreload.ts";

await main(function* () {
  let css = yield* useTailwind({ input: "main.css", outdir: "build" });

  let revolution = createRevolution({
    app: [
      route("/", function* () {
        return (
          <html lang="en-US" dir="ltr">
            <head>
              <meta charset="UTF-8" />
              <title>Sketch some stuff</title>
              <meta
                name="viewport"
                content="width=device-width, initial-scale=1.0"
              />
              <link rel="stylesheet" href={css} />
            </head>
            <body>
              <h1 class="text-3xl font-bold underline">
                Hello world!
              </h1>
            </body>
          </html>
        );
      }),
      route("/build(.*)", assetRoute("build")),
    ],
    plugins: [
      autoreloadPlugin({ enabled: !!Deno.env.get("autoreload") }),
    ],
  });

  let server = yield* revolution.start();
  console.log(`www -> http://localhost:${server.port}`);

  yield* suspend();
});
