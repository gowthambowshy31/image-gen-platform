import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateImage } from "@/lib/gemini"
import { uploadToS3 } from "@/lib/s3"
import { z } from "zod"
import path from "path"
import fs from "fs/promises"
import os from "os"

// Helper function to download image from URL to temp file
async function downloadImageToTemp(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    const tempPath = path.join(os.tmpdir(), `source-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)
    await fs.writeFile(tempPath, buffer)
    return tempPath
  } catch {
    return null
  }
}

const bulkGenerateSchema = z.object({
  productIds: z.array(z.string()).min(1),
  variant: z.string(),
  imageTypeId: z.string(),
  customPrompt: z.string().optional(),
  templateId: z.string().optional()
})

// POST /api/images/bulk-generate-by-variant
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = bulkGenerateSchema.parse(body)

    // Get admin user for logging
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN" }
    })

    // Get image type
    const imageType = await prisma.imageType.findUnique({
      where: { id: validated.imageTypeId }
    })

    if (!imageType) {
      return NextResponse.json({ error: "Image type not found" }, { status: 404 })
    }

    // For each product, find the highest-res source image with the given variant
    const products = await prisma.product.findMany({
      where: { id: { in: validated.productIds } },
      include: {
        sourceImages: {
          where: { variant: validated.variant },
          orderBy: { imageOrder: "asc" }
        }
      }
    })

    // Filter to products that actually have the selected variant
    const eligibleProducts = products.filter(p => p.sourceImages.length > 0)

    if (eligibleProducts.length === 0) {
      return NextResponse.json(
        { error: "No selected products have the variant: " + validated.variant },
        { status: 400 }
      )
    }

    // Create generation job
    const job = await prisma.generationJob.create({
      data: {
        productIds: eligibleProducts.map(p => p.id),
        imageTypeIds: [validated.imageTypeId],
        status: "PROCESSING",
        totalImages: eligibleProducts.length,
        startedAt: new Date()
      }
    })

    // Log activity
    if (adminUser) {
      await prisma.activityLog.create({
        data: {
          userId: adminUser.id,
          action: "CREATE_BULK_JOB",
          entityType: "GenerationJob",
          entityId: job.id,
          metadata: {
            variant: validated.variant,
            productCount: eligibleProducts.length,
            imageType: imageType.name
          }
        }
      })
    }

    // Process in background (don't await - return job immediately)
    processJob(job.id, eligibleProducts, imageType, validated, adminUser?.id).catch(err => {
      console.error("Bulk generation job failed:", err)
    })

    return NextResponse.json({
      jobId: job.id,
      totalImages: eligibleProducts.length,
      skippedProducts: products.length - eligibleProducts.length
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating bulk generation job:", error)
    return NextResponse.json(
      { error: "Failed to create bulk generation job" },
      { status: 500 }
    )
  }
}

// Background processing function
async function processJob(
  jobId: string,
  products: any[],
  imageType: any,
  validated: z.infer<typeof bulkGenerateSchema>,
  adminUserId?: string
) {
  let completedCount = 0
  let failedCount = 0
  const errors: string[] = []

  for (const product of products) {
    try {
      console.log(`[Bulk Job ${jobId}] Processing product: ${product.asin || product.id} (${completedCount + failedCount + 1}/${products.length})`)

      // Pick the highest-res image for this variant
      const sourceImage = product.sourceImages.reduce((best: any, img: any) => {
        if (!best) return img
        const bestRes = (best.width || 0) * (best.height || 0)
        const imgRes = (img.width || 0) * (img.height || 0)
        return imgRes > bestRes ? img : best
      }, null)

      if (!sourceImage) {
        failedCount++
        errors.push(`${product.asin || product.id}: No source image found`)
        await updateJobProgress(jobId, completedCount, failedCount, errors)
        continue
      }

      // Build prompt
      let promptToUse = validated.customPrompt || imageType.defaultPrompt
      promptToUse = promptToUse
        .replace(/\{product_name\}/g, product.title)
        .replace(/\{product_title\}/g, product.title)
        .replace(/\{category\}/g, product.category || "")
        .replace(/\{asin\}/g, product.asin || "")

      // Get version number
      const existingImages = await prisma.generatedImage.findMany({
        where: {
          productId: product.id,
          imageTypeId: validated.imageTypeId
        },
        orderBy: { version: "desc" },
        take: 1
      })
      const version = existingImages.length > 0 ? existingImages[0].version + 1 : 1

      // Generate filename
      const sanitizedImageTypeName = imageType.name
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()
      const productIdentifier = product.asin || product.id.slice(0, 8)
      const sequenceNum = String(Date.now()).slice(-4)
      const fileName = `${productIdentifier}_${sanitizedImageTypeName}_v${version}_${sequenceNum}.png`
      const uploadDir = process.env.UPLOAD_DIR || "./public/uploads"
      const outputPath = path.join(process.cwd(), uploadDir, fileName)

      // Download source image to temp
      let tempFilePath: string | null = null
      let sourceImagePath: string | undefined

      if (sourceImage.localFilePath?.startsWith("http")) {
        tempFilePath = await downloadImageToTemp(sourceImage.localFilePath)
        sourceImagePath = tempFilePath || undefined
      } else if (sourceImage.localFilePath) {
        sourceImagePath = path.join(process.cwd(), "public", sourceImage.localFilePath)
      } else if (sourceImage.amazonImageUrl) {
        tempFilePath = await downloadImageToTemp(sourceImage.amazonImageUrl)
        sourceImagePath = tempFilePath || undefined
      }

      // Create pending image record
      const imageRecord = await prisma.generatedImage.create({
        data: {
          productId: product.id,
          imageTypeId: validated.imageTypeId,
          sourceImageId: sourceImage.id,
          version,
          status: "GENERATING",
          filePath: outputPath,
          fileName,
          promptUsed: promptToUse,
          aiModel: "gemini",
          generationParams: {
            bulkJobId: jobId,
            variant: validated.variant,
            sourceImageId: sourceImage.id
          },
          generatedById: adminUserId || "system"
        }
      })

      // Update product status
      if (product.status === "NOT_STARTED") {
        await prisma.product.update({
          where: { id: product.id },
          data: { status: "IN_PROGRESS" }
        })
      }

      // Generate the image
      const result = await generateImage({
        prompt: promptToUse,
        sourceImagePath,
        outputPath
      })

      // Clean up temp source file
      if (tempFilePath) {
        try { await fs.unlink(tempFilePath) } catch {}
      }

      if (!result.success) {
        await prisma.generatedImage.update({
          where: { id: imageRecord.id },
          data: { status: "REJECTED" }
        })
        failedCount++
        errors.push(`${product.asin || product.id}: ${result.error || "Generation failed"}`)
        await updateJobProgress(jobId, completedCount, failedCount, errors)
        continue
      }

      // Upload to S3
      let finalFilePath = outputPath
      try {
        const imageBuffer = await fs.readFile(outputPath)
        const s3Key = `generated-images/${product.id}/${fileName}`
        const s3Result = await uploadToS3({
          buffer: imageBuffer,
          key: s3Key,
          contentType: "image/png"
        })

        if (s3Result.success && s3Result.url) {
          finalFilePath = s3Result.url
          try { await fs.unlink(outputPath) } catch {}
        }
      } catch {}

      // Update image record
      await prisma.generatedImage.update({
        where: { id: imageRecord.id },
        data: {
          status: "COMPLETED",
          filePath: finalFilePath,
          width: result.width,
          height: result.height,
          fileSize: result.fileSize
        }
      })

      // Update analytics
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const existingAnalytics = await prisma.analytics.findFirst({
        where: {
          date: { gte: today, lt: new Date(today.getTime() + 86400000) }
        }
      })
      if (existingAnalytics) {
        await prisma.analytics.update({
          where: { id: existingAnalytics.id },
          data: { imagesGenerated: { increment: 1 } }
        })
      } else {
        await prisma.analytics.create({
          data: { date: today, imagesGenerated: 1 }
        })
      }

      completedCount++
      await updateJobProgress(jobId, completedCount, failedCount, errors)

      console.log(`[Bulk Job ${jobId}] Completed: ${product.asin || product.id} (${completedCount}/${products.length})`)
    } catch (error) {
      failedCount++
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      errors.push(`${product.asin || product.id}: ${errorMsg}`)
      await updateJobProgress(jobId, completedCount, failedCount, errors)
      console.error(`[Bulk Job ${jobId}] Failed: ${product.asin || product.id}`, error)
    }
  }

  // Mark job as complete
  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status: failedCount === products.length ? "FAILED" : "COMPLETED",
      completedImages: completedCount,
      failedImages: failedCount,
      errorLog: errors.length > 0 ? errors.join("\n") : null,
      completedAt: new Date()
    }
  })

  console.log(`[Bulk Job ${jobId}] Job finished. ${completedCount} completed, ${failedCount} failed.`)
}

async function updateJobProgress(
  jobId: string,
  completed: number,
  failed: number,
  errors: string[]
) {
  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      completedImages: completed,
      failedImages: failed,
      errorLog: errors.length > 0 ? errors.join("\n") : null
    }
  })
}
