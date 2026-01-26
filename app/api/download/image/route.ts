import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url')
    const filename = request.nextUrl.searchParams.get('filename') || 'image.jpg'

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    // Fetch the image
    const response = await fetch(url)

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image" },
        { status: response.status }
      )
    }

    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.byteLength.toString()
      }
    })
  } catch (error) {
    console.error("Error downloading image:", error)
    return NextResponse.json(
      { error: "Failed to download image" },
      { status: 500 }
    )
  }
}
