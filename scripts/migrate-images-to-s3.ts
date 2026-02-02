/**
 * Migration script to upload local images to S3 and update database records
 *
 * Run with: npx ts-node scripts/migrate-images-to-s3.ts
 * Or: npx tsx scripts/migrate-images-to-s3.ts
 */

import { PrismaClient } from "@prisma/client"
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import fs from "fs/promises"
import path from "path"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
})

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
})

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "image-gen-platform-uploads"

async function uploadToS3(filePath: string, key: string): Promise<string | null> {
  try {
    const fileBuffer = await fs.readFile(filePath)

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: "image/png",
      })
    )

    const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "eu-north-1"}.amazonaws.com/${key}`
    return url
  } catch (error) {
    console.error(`  ❌ Failed to upload ${key}:`, error)
    return null
  }
}

async function checkS3Exists(key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    )
    return true
  } catch {
    return false
  }
}

async function migrateImages() {
  console.log("🚀 Starting image migration to S3...")
  console.log(`   Bucket: ${BUCKET_NAME}`)
  console.log(`   Region: ${process.env.AWS_REGION || "eu-north-1"}`)
  console.log("")

  // Find all generated images with local file paths (not S3 URLs)
  const localImages = await prisma.generatedImage.findMany({
    where: {
      NOT: {
        filePath: {
          startsWith: "http"
        }
      }
    },
    include: {
      product: true
    }
  })

  console.log(`📦 Found ${localImages.length} images with local paths`)
  console.log("")

  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const image of localImages) {
    console.log(`Processing: ${image.fileName}`)

    // Determine the local file path
    let localPath: string

    if (image.filePath.startsWith("/home/ubuntu/")) {
      // Absolute path on EC2 server - convert to relative
      localPath = image.filePath.replace("/home/ubuntu/image-gen-platform/", "")
    } else if (image.filePath.startsWith("./")) {
      localPath = image.filePath.substring(2)
    } else {
      localPath = image.filePath
    }

    // Check if the file exists locally
    const fullLocalPath = path.join(process.cwd(), localPath)

    try {
      await fs.access(fullLocalPath)
    } catch {
      console.log(`  ⚠️  Local file not found: ${fullLocalPath}`)
      console.log(`     (This file may only exist on the EC2 server)`)
      skipped++
      continue
    }

    // Generate S3 key
    const s3Key = `generated-images/${image.productId}/${image.fileName}`

    // Check if already exists in S3
    if (await checkS3Exists(s3Key)) {
      console.log(`  ⏭️  Already in S3, updating DB record...`)
      const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "eu-north-1"}.amazonaws.com/${s3Key}`

      await prisma.generatedImage.update({
        where: { id: image.id },
        data: { filePath: s3Url }
      })

      // Delete local file
      try {
        await fs.unlink(fullLocalPath)
        console.log(`  🧹 Deleted local file`)
      } catch {
        // Ignore
      }

      migrated++
      continue
    }

    // Upload to S3
    console.log(`  ☁️  Uploading to S3...`)
    const s3Url = await uploadToS3(fullLocalPath, s3Key)

    if (s3Url) {
      // Update database record
      await prisma.generatedImage.update({
        where: { id: image.id },
        data: { filePath: s3Url }
      })
      console.log(`  ✅ Migrated: ${s3Url}`)

      // Delete local file after successful upload
      try {
        await fs.unlink(fullLocalPath)
        console.log(`  🧹 Deleted local file`)
      } catch {
        // Ignore deletion errors
      }

      migrated++
    } else {
      failed++
    }
  }

  console.log("")
  console.log("=" .repeat(50))
  console.log("📊 Migration Summary:")
  console.log(`   ✅ Migrated: ${migrated}`)
  console.log(`   ⏭️  Skipped (file not found locally): ${skipped}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log("=" .repeat(50))

  if (skipped > 0) {
    console.log("")
    console.log("💡 TIP: Run this script on the EC2 server to migrate")
    console.log("   files that only exist there:")
    console.log("   ssh -i image-gen-key.pem ubuntu@56.228.4.202")
    console.log("   cd /home/ubuntu/image-gen-platform")
    console.log("   npx tsx scripts/migrate-images-to-s3.ts")
  }
}

migrateImages()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
