import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

import { prisma } from "@/lib/prisma"
import { generateImage } from "@/lib/gemini"
import { z } from "zod"
import path from "path"

const generateImageSchema = z.object({
  productId: z.string(),
  imageTypeId: z.string(),
  sourceImageId: z.string().optional(),
  generatedImageId: z.string().optional(),
  customPrompt: z.string().optional(),
  parentImageId: z.string().optional()
})

// POST /api/images/generate - Generate a single image
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = generateImageSchema.parse(body)

    // Get default admin user for logging
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    })

    // Get product with source images
    const product = await prisma.product.findUnique({
      where: { id: validated.productId },
      include: {
        sourceImages: true
      }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Get image type
    const imageType = await prisma.imageType.findUnique({
      where: { id: validated.imageTypeId }
    })

    if (!imageType) {
      return NextResponse.json({ error: "Image type not found" }, { status: 404 })
    }

    // Check for custom prompt override
    let promptToUse = validated.customPrompt || imageType.defaultPrompt

    // Check if there's a product-specific override
    if (!validated.customPrompt) {
      const override = await prisma.promptOverride.findUnique({
        where: {
          productId_imageTypeId: {
            productId: validated.productId,
            imageTypeId: validated.imageTypeId
          }
        }
      })

      if (override) {
        promptToUse = override.customPrompt
      }
    }

    // Replace template variables in prompt
    promptToUse = promptToUse
      .replace(/\{product_name\}/g, product.title)
      .replace(/\{product_title\}/g, product.title)
      .replace(/\{category\}/g, product.category || '')
      .replace(/\{asin\}/g, product.asin || '')

    // Get version number
    const existingImages = await prisma.generatedImage.findMany({
      where: {
        productId: validated.productId,
        imageTypeId: validated.imageTypeId
      },
      orderBy: {
        version: 'desc'
      },
      take: 1
    })

    const version = existingImages.length > 0 ? existingImages[0].version + 1 : 1

    // Determine source image path
    let sourceImagePath: string | undefined
    let sourceImageId: string | undefined

    if (validated.sourceImageId) {
      // Use the selected source image from Amazon
      const sourceImage = await prisma.sourceImage.findUnique({
        where: { id: validated.sourceImageId }
      })

      if (sourceImage && sourceImage.localFilePath) {
        sourceImagePath = path.join(process.cwd(), 'public', sourceImage.localFilePath)
        sourceImageId = sourceImage.id
      }
    } else if (validated.generatedImageId) {
      // Use a previously generated image as source
      const generatedImage = await prisma.generatedImage.findUnique({
        where: { id: validated.generatedImageId }
      })
      if (generatedImage) {
        sourceImagePath = generatedImage.filePath
        // Keep the original source image ID if available
        sourceImageId = generatedImage.sourceImageId || undefined
      }
    } else if (validated.parentImageId) {
      // Use parent generated image for iteration
      const parentImage = await prisma.generatedImage.findUnique({
        where: { id: validated.parentImageId }
      })
      if (parentImage) {
        sourceImagePath = parentImage.filePath
        sourceImageId = parentImage.sourceImageId || undefined
      }
    } else if (product.sourceImages.length > 0) {
      // Default to first source image if available
      const firstSourceImage = product.sourceImages[0]
      if (firstSourceImage.localFilePath) {
        sourceImagePath = path.join(process.cwd(), 'public', firstSourceImage.localFilePath)
        sourceImageId = firstSourceImage.id
      }
    }

    // Generate unique filename
    const timestamp = Date.now()
    const fileName = `${product.id}_${imageType.name}_v${version}_${timestamp}.png`
    const uploadDir = process.env.UPLOAD_DIR || './public/uploads'
    const outputPath = path.join(process.cwd(), uploadDir, fileName)

    // Update product status to IN_PROGRESS if not already
    if (product.status === 'NOT_STARTED') {
      await prisma.product.update({
        where: { id: product.id },
        data: { status: 'IN_PROGRESS' }
      })
    }

    // Create pending image record
    const imageRecord = await prisma.generatedImage.create({
      data: {
        productId: validated.productId,
        imageTypeId: validated.imageTypeId,
        sourceImageId,
        version,
        status: 'GENERATING',
        filePath: outputPath,
        fileName,
        promptUsed: promptToUse,
        aiModel: 'gemini',
        generationParams: {
          sourceImageId: sourceImageId,
          hasParent: !!validated.parentImageId,
          usedGeneratedImage: !!validated.generatedImageId
        },
        parentImageId: validated.parentImageId,
        generatedById: adminUser?.id || 'system'
      }
    })

    // ============ DETAILED LOGGING FOR GEMINI API CALL ============
    console.log('\n========================================')
    console.log('🎨 GENERATING IMAGE WITH GEMINI API')
    console.log('========================================')
    console.log('📦 Product:', {
      id: product.id,
      title: product.title,
      category: product.category,
      asin: product.asin
    })
    console.log('🖼️  Image Type:', {
      id: imageType.id,
      name: imageType.name,
      description: imageType.description
    })
    console.log('📝 Prompt being sent to Gemini:')
    console.log('---')
    console.log(promptToUse)
    console.log('---')
    console.log('🖼️  Source Image Path:', sourceImagePath || 'No source image (text-to-image)')
    if (sourceImageId) {
      console.log('📎 Source Image ID:', sourceImageId)
    }
    if (validated.parentImageId) {
      console.log('🔄 Parent Image ID (regeneration):', validated.parentImageId)
    }
    console.log('💾 Output Path:', outputPath)
    console.log('📊 Version:', version)
    console.log('========================================\n')
    // ============================================================

    // Generate the image
    const result = await generateImage({
      prompt: promptToUse,
      sourceImagePath,
      outputPath
    })

    // ============ LOGGING GEMINI API RESULT ============
    console.log('\n========================================')
    console.log('✅ GEMINI API RESPONSE')
    console.log('========================================')
    if (!result.success) {
      console.log('❌ Status: FAILED')
      console.log('🚫 Error:', result.error)
    } else {
      console.log('✅ Status: SUCCESS')
      console.log('📐 Dimensions:', `${result.width}x${result.height}`)
      console.log('📦 File Size:', result.fileSize ? `${(result.fileSize / 1024).toFixed(2)} KB` : 'Unknown')
      console.log('💾 Saved to:', outputPath)
    }
    console.log('========================================\n')
    // ===================================================

    if (!result.success) {
      // Update image record with error
      await prisma.generatedImage.update({
        where: { id: imageRecord.id },
        data: {
          status: 'REJECTED'
        }
      })

      return NextResponse.json(
        { error: result.error || "Image generation failed" },
        { status: 500 }
      )
    }

    // Update image record with results
    const updatedImage = await prisma.generatedImage.update({
      where: { id: imageRecord.id },
      data: {
        status: 'COMPLETED',
        width: result.width,
        height: result.height,
        fileSize: result.fileSize
      },
      include: {
        imageType: true,
        product: true
      }
    })

    // Log activity
    if (adminUser) {
      await prisma.activityLog.create({
        data: {
          userId: adminUser.id,
          action: "GENERATE_IMAGE",
          entityType: "GeneratedImage",
          entityId: updatedImage.id,
          metadata: {
            productId: product.id,
            productTitle: product.title,
            imageType: imageType.name,
            version
          }
        }
      })
    }

    // Update analytics
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Find existing analytics record for today
    const existingAnalytics = await prisma.analytics.findFirst({
      where: {
        date: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
      }
    })

    if (existingAnalytics) {
      // Update existing record
      await prisma.analytics.update({
        where: { id: existingAnalytics.id },
        data: {
          imagesGenerated: { increment: 1 }
        }
      })
    } else {
      // Create new record
      await prisma.analytics.create({
        data: {
          date: today,
          imagesGenerated: 1
        }
      })
    }

    return NextResponse.json(updatedImage, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error generating image:", error)
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    )
  }
}
