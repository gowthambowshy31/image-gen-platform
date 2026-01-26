import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
})

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "image-gen-platform-uploads"

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

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    )

    // Return the public URL
    const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "eu-north-1"}.amazonaws.com/${key}`

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
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
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
