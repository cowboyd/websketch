import { RevolutionPlugin, route, sse } from "revolution";
import { select } from "npm:hast-util-select";
import { assert } from "jsr:@std/assert";

export interface AutoreloadOptions {
  enabled: boolean;
}

export function autoreloadPlugin(options: AutoreloadOptions): RevolutionPlugin {
  let { enabled } = options;
  return {
    *html(request, next) {
      let html = yield* next(request);
      if (!enabled) {
        return html;
      }
      let body = select("body", html);
      assert(body, "returned html node without a <head> element");
      body.children.push({
        type: "element",
        tagName: "script",
        properties: {
          type: "module",
          src: "/autoreload.js",
        },
        children: [],
      });
      return html;
    },
    http: [
      route("/autoreload.js", function* () {
        let script = `
import { main } from "https://esm.run/effection@3";

let events = new EventSource("/autoreload");

await main(function*() {
  console.log("hello!");
})

`;
        return new Response(script, {
          status: 200,
          headers: {
            "Content-Type": "text/javascript",
          },
        });
      }),
      //      route("/autoreload", sse())
    ],
  };
}
