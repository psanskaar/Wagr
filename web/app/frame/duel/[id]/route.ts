import { NextRequest, NextResponse } from 'next/server';

/**
 * Farcaster Frame endpoint for a duel.
 * A Warpcast user pasting a link `https://wagr-app.vercel.app/duel/<id>` sees the
 * duel rendered as an interactive Frame with two buttons: "Accept" and
 * "Watch". "Accept" deep-links to /duel/<id> where the wallet flow starts.
 *
 * Reference: https://docs.farcaster.xyz/reference/frames/spec
 */
export const runtime = 'edge';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
    const url =
        process.env.NEXT_PUBLIC_APP_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://wagr-app.vercel.app');
    const html = `<!doctype html>
<html><head>
  <meta property="og:image"                          content="${url}/api/og/duel/${params.id}" />
  <meta property="fc:frame"                          content="vNext" />
  <meta property="fc:frame:image"                    content="${url}/api/og/duel/${params.id}" />
  <meta property="fc:frame:image:aspect_ratio"       content="1.91:1" />
  <meta property="fc:frame:button:1"                 content="Accept duel" />
  <meta property="fc:frame:button:1:action"          content="link" />
  <meta property="fc:frame:button:1:target"          content="${url}/duel/${params.id}" />
  <meta property="fc:frame:button:2"                 content="Watch" />
  <meta property="fc:frame:button:2:action"          content="link" />
  <meta property="fc:frame:button:2:target"          content="${url}/duel/${params.id}" />
</head><body></body></html>`;
    return new NextResponse(html, { headers: { 'content-type': 'text/html' } });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    return GET(req, { params });
}
