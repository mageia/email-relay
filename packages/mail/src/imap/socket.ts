export function splitImapLines(chunk: string) {
  return chunk.split("\r\n").filter(Boolean);
}

export async function openImapSocket(input: {
  host: string;
  port: number;
  secure: boolean;
}) {
  // Use dynamic import so non-Workers environments only touch this path when needed.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const { connect } = await import("cloudflare:sockets");
  return connect(
    {
      hostname: input.host,
      port: input.port,
    } as any,
    {
      secureTransport: input.secure ? "on" : "starttls",
    } as any,
  );
}
