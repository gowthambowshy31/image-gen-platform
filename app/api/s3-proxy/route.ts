import { NextRequest, NextResponse } from "next/server"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"

// Lazy initialization
let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || "eu-north-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    })
  }
  return s3Client
}

// GET /api/s3-proxy?key=generated-images/...
// Proxies S3 objects through the server to avoid CORS/auth issues
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key")

    if (!key) {
      return NextResponse.json({ error: "Missing key parameter" }, { status: 400 })
    }

    // Security: only allow access to specific prefixes
    const allowedPrefixes = ["generated-images/", "source-images/"]
    if (!allowedPrefixes.some(prefix => key.startsWith(prefix))) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const bucketName = process.env.AWS_S3_BUCKET_NAME || "image-gen-platform-uploads"
    console.log(`[S3 Proxy] Fetching key: ${key} from bucket: ${bucketName}`)

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })

    const response = await getS3Client().send(command)

    if (!response.Body) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Use the SDK's built-in method to convert to byte array
    const byteArray = await response.Body.transformToByteArray()
    const buffer = Buffer.from(byteArray)

    // Determine content type
    const contentType = response.ContentType || "image/png"
    console.log(`[S3 Proxy] Success - size: ${buffer.length} bytes, type: ${contentType}`)

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error: any) {
    console.error("[S3 Proxy] Error:", error.name, error.message)

    if (error.name === "NoSuchKey") {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to fetch file", details: error.message },
      { status: 500 }
    )
  }
}
