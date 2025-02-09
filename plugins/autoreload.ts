import { drive, RevolutionPlugin, route, sse } from "revolution";
import { select } from "npm:hast-util-select";
import { assert } from "jsr:@std/assert";
import {
  createContext,
  Operation,
  Scope,
  sleep,
  spawn,
  Task,
  useScope,
  withResolvers,
} from "effection";
import {
  ServerSentEventMessage,
  ServerSentEventStream,
} from "jsr:@std/http/server-sent-event-stream";

export interface AutoreloadOptions {
  enabled: boolean;
}

const StreamingScopeContext = createContext<Scope>("autoreload.streaming");

export function* autoreloadPlugin(
  options: AutoreloadOptions,
): Operation<RevolutionPlugin> {
  yield* StreamingScopeContext.set(yield* useScope());

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
import { main, on, once, each, spawn, createChannel, suspend } from "https://esm.run/effection@3";

await main(function*() {
  let states = createChannel();
  let source = new EventSource("/autoreload");

  yield* spawn(function*() {
    for (let message of yield* each(on(source, "open"))) {
      yield* states.send({ status: "connected" });
      yield* each.next();
    }
  });

  yield* spawn(function*() {
    for (let message of yield* each(on(source, "error"))) {
      yield* states.send({ status: "disconnected" });
      yield* each.next();
    }
  });

  yield* spawn(function*() {
    for (let message of yield* each(on(source, "message"))) {
      yield* states.send({ status: "restarting" });
      yield* once(source, "open");
      location.reload();
      yield* each.next();
    }
  });

  yield* spawn(function*() {
    for (let state of yield* each(states)) {
      console.log(state);
      yield* each.next();
    }
  });

  yield* suspend();
})

`;
        return new Response(script, {
          status: 200,
          headers: {
            "Content-Type": "text/javascript",
          },
        });
      }),
      route("/autoreload", function* () {
        let started = withResolvers<ReadableStreamDefaultController>();
        let canceled = withResolvers<boolean>();

        const body = new ReadableStream<ServerSentEventMessage>({
          start: started.resolve,
          cancel: () => canceled.resolve(true),
        }).pipeThrough(new ServerSentEventStream());

        let scope = yield* StreamingScopeContext.expect();

        scope.run(function* () {
          let controller = yield* started.operation;
          let cancellation = false;
          try {
            cancellation = yield* canceled.operation;
          } finally {
            if (!cancellation) {
              controller.enqueue({ data: "close" });
              controller.close();
            }
          }
        });

        return new Response(body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      }),
    ],
  };
}
