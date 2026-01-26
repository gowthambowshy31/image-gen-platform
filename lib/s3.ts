import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

// Lazy initialization to ensure env vars are loaded
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

function getBucketName(): string {
  return process.env.AWS_S3_BUCKET_NAME || "image-gen-platform-uploads"
}

/**
 * Upload a file buffer to S3
 */
export async function uploadToS3(params: {
  buffer: Buffer
  key: string
  contentType: string
}): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { buffer, key, contentType } = params

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    )

    // Return the public URL
    const url = `https://${getBucketName()}.s3.${process.env.AWS_REGION || "eu-north-1"}.amazonaws.com/${key}`

    return { success: true, url }
  } catch (error) {
    console.error("Error uploading to S3:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<boolean> {
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: getBucketName(),
        Key: key,
      })
    )
    return true
  } catch (error) {
    console.error("Error deleting from S3:", error)
    return false
  }
}

/**
 * Get the S3 key from a full S3 URL
 */
export function getS3KeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    // Remove leading slash
    return urlObj.pathname.substring(1)
  } catch {
    return null
  }
}
