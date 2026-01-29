import { NextRequest, NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

// Dynamic file serving for uploaded images
// Next.js production mode doesn't serve files added to /public after build time,
// so this API route serves them dynamically.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params
    const filePath = pathSegments.join("/")

    // Prevent directory traversal
    const normalizedPath = path.normalize(filePath)
    if (normalizedPath.includes("..") || path.isAbsolute(normalizedPath)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 })
    }

    const fullPath = path.join(process.cwd(), "public", "uploads", normalizedPath)

    // Verify the resolved path is still within the uploads directory
    const uploadsDir = path.join(process.cwd(), "public", "uploads")
    if (!fullPath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 })
    }

    const fileBuffer = await fs.readFile(fullPath)

    // Determine content type from extension
    const ext = path.extname(fullPath).toLowerCase()
    const contentTypeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    }
    const contentType = contentTypeMap[ext] || "application/octet-stream"

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }
    console.error("Error serving uploaded file:", error)
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 })
  }
}
