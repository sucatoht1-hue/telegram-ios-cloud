#!/usr/bin/env python3
"""Forward Baguette and ask the browser to use the low-bandwidth stream."""

import asyncio
import os

LISTEN = os.environ.get("STREAM_PROXY_LISTEN", "127.0.0.1:8422")
UPSTREAM = os.environ.get("STREAM_PROXY_UPSTREAM", "127.0.0.1:8421")

INJECT = b"""<script>
(function () {
  var Orig = WebSocket;
  function Wrapped(url, protocols) {
    var target = String(url);
    try {
      if (target.indexOf("/stream") !== -1 && window.FrameDecoder &&
          window.FrameDecoder.isHardwareAvailable && window.FrameDecoder.isHardwareAvailable()) {
        if (target.indexOf("format=") === -1) {
          target += (target.indexOf("?") === -1 ? "?" : "&") + "format=avcc";
        } else {
          target = target.replace(/format=[^&]+/, "format=avcc");
        }
      }
    } catch (e) {}
    var ws = protocols === undefined ? new Orig(target) : new Orig(target, protocols);
    try {
      if (target.indexOf("/stream") !== -1) {
        ws.addEventListener("open", function () {
          function send(obj) {
            try { ws.send(JSON.stringify(obj)); } catch (e) {}
          }
          function tune() {
            send({cmd: "set_scale", type: "set_scale", scale: 3});
            send({cmd: "set_fps", type: "set_fps", fps: 60});
            send({cmd: "set_bitrate", type: "set_bitrate", bps: 1200000});
          }
          setTimeout(tune, 400);
          setTimeout(tune, 1500);
        });
      }
    } catch (e) {}
    return ws;
  }
  Wrapped.prototype = Orig.prototype;
  window.WebSocket = Wrapped;
})();
</script>
"""


def split_host(value: str) -> tuple[str, int]:
    host, _, port = value.rpartition(":")
    return host, int(port)


def inject_html(body: bytes) -> bytes:
    lower = body.lower()
    marker = b"</head>"
    index = lower.rfind(marker)
    if index != -1:
        return body[:index] + INJECT + body[index:]
    return body + INJECT


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while True:
            chunk = await reader.read(65536)
            if not chunk:
                break
            writer.write(chunk)
            await writer.drain()
    except Exception:
        pass
    try:
        writer.close()
    except Exception:
        pass


async def read_headers(reader: asyncio.StreamReader, initial: bytes = b"") -> tuple[bytes, bytes]:
    data = initial
    while b"\r\n\r\n" not in data:
        chunk = await reader.read(4096)
        if not chunk:
            break
        data += chunk
        if len(data) > 1024 * 512:
            break
    if b"\r\n\r\n" not in data:
        return data, b""
    head, rest = data.split(b"\r\n\r\n", 1)
    return head, rest


async def read_body(reader: asyncio.StreamReader, rest: bytes, length: int | None) -> bytes:
    body = rest
    if length is None:
        while True:
            chunk = await reader.read(65536)
            if not chunk:
                break
            body += chunk
        return body
    while len(body) < length:
        chunk = await reader.read(min(65536, length - len(body)))
        if not chunk:
            break
        body += chunk
    return body


async def handle(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter) -> None:
    upstream_writer = None
    try:
        head, rest = await read_headers(client_reader)
        if not head:
            client_writer.close()
            return
        lines = head.split(b"\r\n")
        request = lines[0].decode("latin1", "replace")
        method = request.split(" ", 1)[0].upper()
        websocket = any(
            line.lower().startswith(b"upgrade:") and b"websocket" in line.lower()
            for line in lines[1:]
        )
        host, port = split_host(UPSTREAM)
        upstream_reader, upstream_writer = await asyncio.open_connection(host, port)
        upstream_writer.write(head + b"\r\n\r\n" + rest)
        await upstream_writer.drain()
        if websocket or method not in {"GET", "HEAD"}:
            await asyncio.gather(
                pipe(client_reader, upstream_writer),
                pipe(upstream_reader, client_writer),
            )
            return
        resp_head, resp_rest = await read_headers(upstream_reader)
        if not resp_head:
            client_writer.close()
            return
        resp_lines = resp_head.split(b"\r\n")
        content_type = ""
        content_length = None
        encoded = False
        kept = []
        for line in resp_lines[1:]:
            lower = line.lower()
            if lower.startswith(b"content-type:"):
                content_type = line.split(b":", 1)[1].decode("latin1", "replace").lower()
            elif lower.startswith(b"content-length:"):
                try:
                    content_length = int(line.split(b":", 1)[1].strip())
                except ValueError:
                    content_length = None
                continue
            elif lower.startswith(b"transfer-encoding:"):
                continue
            elif lower.startswith(b"content-encoding:"):
                encoded = True
            kept.append(line)
        body = b"" if method == "HEAD" else await read_body(upstream_reader, resp_rest, content_length)
        if method != "HEAD" and not encoded and (
            "text/html" in content_type or body.lstrip()[:32].lower().startswith((b"<!doctype html", b"<html"))
        ):
            body = inject_html(body)
        kept.append(f"Content-Length: {len(body)}".encode())
        client_writer.write(b"\r\n".join(resp_lines[:1] + kept) + b"\r\n\r\n" + body)
        await client_writer.drain()
    except Exception:
        pass
    finally:
        try:
            client_writer.close()
        except Exception:
            pass
        if upstream_writer is not None:
            try:
                upstream_writer.close()
            except Exception:
                pass


async def main() -> None:
    host, port = split_host(LISTEN)
    server = await asyncio.start_server(handle, host, port)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
