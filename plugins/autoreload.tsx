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
      body.children.unshift(
	//@ts-expect-error hast types aren't quite right
        <header
          id="autoreload-banner"
          style="position: absolute; top: 0; left: 0; width: 100%; background-color: rgba(0, 133, 242, 0.1) ; color: rgb(78, 78, 78); text-align: center; height: 0"
        >
          <section
            id="autoreload-banner-text"
            style="padding-top: .3em; padding-bottom: .3em;"
          />
        </header>,
      );
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
import { main, on, once, each, spawn, createChannel, sleep, suspend, withResolvers } from "https://esm.run/effection@3";

await main(function*() {
  let banner = document.getElementById("autoreload-banner");
  let text = document.getElementById("autoreload-banner-text");
  let source = new EventSource("/autoreload");

  let show = (message) => {
    text.innerText = message;
    banner.style.height = "auto";
  };

  let hide = () => {
    banner.style.height = 0;
  }

  let messages = yield* on(source, "message");

  // the first message is where we connect
  let next = yield* messages.next();

  // the next is where a restart is happening.
  next = yield* messages.next();

  yield* spawn(function*() {
    yield* sleep(5000);
    show("error: disconnected from server");
  });

  // we should get another connect message, and we're done.
  next = yield* messages.next();
  location.reload();
});
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
	    controller.enqueue({ data: "connect"});
            cancellation = yield* canceled.operation;
          } finally {
            if (!cancellation) {
              controller.enqueue({ data: "disconnect" });
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
