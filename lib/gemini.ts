import { GoogleGenerativeAI } from "@google/generative-ai"
import fs from "fs/promises"
import path from "path"
import sharp from "sharp"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

export interface ImageGenerationParams {
  prompt: string
  sourceImagePath?: string
  outputPath: string
  width?: number
  height?: number
  productSize?: 'small' | 'medium' | 'large' // Control product size in generated image
  negativePrompt?: string
}

export interface GenerationResult {
  success: boolean
  filePath?: string
  fileName?: string
  width?: number
  height?: number
  fileSize?: number
  error?: string
}

/**
 * Generate an image using Gemini AI Imagen 3
 * With control over product sizing in the image
 */
export async function generateImage(params: ImageGenerationParams): Promise<GenerationResult> {
  try {
    const {
      prompt,
      sourceImagePath,
      outputPath,
      width = 1024,
      height = 1024,
      productSize = 'medium',
      negativePrompt
    } = params

    // Ensure upload directory exists
    const uploadDir = path.dirname(outputPath)
    await fs.mkdir(uploadDir, { recursive: true })

    // Build enhanced prompt with product sizing instructions
    const sizeInstructions = {
      'small': 'The product should occupy approximately 30-40% of the image space, appearing elegant and refined with plenty of negative space around it.',
      'medium': 'The product should occupy approximately 50-60% of the image space, creating a balanced composition.',
      'large': 'The product should occupy approximately 70-80% of the image space, creating a bold and impactful presentation.'
    }

    const enhancedPrompt = `${prompt}\n\nProduct sizing: ${sizeInstructions[productSize]}\n\nStyle: Professional product photography, clean composition, high resolution, Amazon listing quality.`

    // ============ DETAILED GEMINI API LOGGING ============
    console.log('\n🔷🔷🔷 GEMINI API CALL DETAILS 🔷🔷🔷')
    console.log('📝 Enhanced Prompt:', enhancedPrompt)
    console.log('📏 Product Size:', productSize)
    console.log('🖼️  Source Image Path:', sourceImagePath || '❌ NO SOURCE IMAGE (Text-to-Image)')
    console.log('💾 Output Path:', outputPath)
    console.log('📐 Target Dimensions:', `${width}x${height}`)
    // ====================================================

    // Use Gemini 3 Pro Image for better image generation
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured')
    }

    console.log('🎨 Using Gemini 3 Pro Image API...')

    // Prepare content parts
    const contentParts: any[] = []

    // If source image exists, add it to the request
    if (sourceImagePath) {
      try {
        console.log('📸 Reading source image from:', sourceImagePath)
        const imageBuffer = await fs.readFile(sourceImagePath)
        const base64Image = imageBuffer.toString('base64')
        console.log('✅ Source image loaded, size:', (imageBuffer.length / 1024).toFixed(2), 'KB')
        console.log('📊 Base64 length:', base64Image.length)

        // Add image to content parts
        contentParts.push({
          inlineData: {
            data: base64Image,
            mimeType: 'image/png'
          }
        })
        console.log('✅ Source image added to API request')
      } catch (error) {
        console.error('❌ Failed to read source image:', error)
        console.log('⚠️  Continuing without source image (text-to-image mode)')
      }
    } else {
      console.log('ℹ️  No source image provided - using text-to-image mode')
    }

    // Add prompt to content parts
    contentParts.push({
      text: enhancedPrompt
    })

    const requestBody = {
      contents: [
        {
          parts: contentParts,
        },
      ],
      generationConfig: {
        responseModalities: ['image', 'text'],
      },
    }

    console.log('📤 Sending request to Gemini API...')
    console.log('📦 Request structure:', JSON.stringify({
      contentParts: contentParts.map(p => p.inlineData ? { type: 'image', size: p.inlineData.data.length } : { type: 'text', content: p.text?.substring(0, 100) + '...' }),
      generationConfig: requestBody.generationConfig
    }, null, 2))

    // Call the new Gemini Image API directly
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    )

    console.log('📥 Received response from Gemini API, status:', response.status)

    if (!response.ok) {
      const errorData = await response.json()
      console.error('❌ Gemini API error response:', JSON.stringify(errorData, null, 2))
      throw new Error(`Gemini API error: ${JSON.stringify(errorData)}`)
    }

    const data = await response.json()
    console.log('✅ Response received successfully')
    console.log('📊 Response candidates:', data.candidates?.length || 0)

    // Extract image data from response
    const imageData = data.candidates[0]?.content?.parts?.find(
      (part: any) => part.inlineData
    )

    if (!imageData) {
      console.error('❌ No image data found in response')
      console.error('📦 Full response:', JSON.stringify(data, null, 2))
      throw new Error('No image data in Gemini response')
    }

    console.log('✅ Image data extracted from response')
    console.log('📊 Image data size:', (imageData.inlineData.data.length / 1024).toFixed(2), 'KB (base64)')

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageData.inlineData.data, 'base64')
    console.log('✅ Converted to buffer, size:', (imageBuffer.length / 1024).toFixed(2), 'KB')

    // Process with Sharp to ensure correct dimensions and format
    console.log('🔄 Processing image with Sharp...')
    const processedImage = await sharp(imageBuffer)
      .resize(width, height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toBuffer()

    console.log('✅ Image processed, final size:', (processedImage.length / 1024).toFixed(2), 'KB')

    await fs.writeFile(outputPath, processedImage)
    console.log('💾 Image saved to:', outputPath)

    const stats = await fs.stat(outputPath)
    const metadata = await sharp(outputPath).metadata()

    console.log('✅✅✅ IMAGE GENERATION COMPLETE! ✅✅✅')
    console.log('📐 Final dimensions:', `${metadata.width}x${metadata.height}`)
    console.log('📦 File size:', (stats.size / 1024).toFixed(2), 'KB')
    console.log('💾 Saved to:', outputPath)
    console.log('🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷\n')

    return {
      success: true,
      filePath: outputPath,
      fileName: path.basename(outputPath),
      width: metadata.width,
      height: metadata.height,
      fileSize: stats.size
    }
  } catch (error: any) {
    console.error("❌ Error generating image:", error)

    // If Gemini Imagen is not available, fall back to processing with Sharp
    if (error.message?.includes('imagen') || error.message?.includes('not found') || error.message?.includes('model')) {
      console.log('⚠️ Gemini Imagen not available, falling back to image processing...')

      if (params.sourceImagePath) {
        return await fallbackImageProcessing(params)
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Fallback function for when Gemini Imagen is not available
 * Processes the source image with Sharp
 */
async function fallbackImageProcessing(params: ImageGenerationParams): Promise<GenerationResult> {
  try {
    const { sourceImagePath, outputPath, width = 1024, height = 1024, productSize = 'medium' } = params

    if (!sourceImagePath) {
      throw new Error('Source image required for fallback processing')
    }

    console.log('📦 Processing with Sharp (fallback mode)...')

    const imageBuffer = await fs.readFile(sourceImagePath)

    // Calculate resize based on product size
    const sizeFactor = {
      'small': 0.6,
      'medium': 0.8,
      'large': 1.0
    }[productSize]

    const targetWidth = Math.round(width * sizeFactor)
    const targetHeight = Math.round(height * sizeFactor)

    const processedImage = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .extend({
        top: Math.round((height - targetHeight) / 2),
        bottom: Math.round((height - targetHeight) / 2),
        left: Math.round((width - targetWidth) / 2),
        right: Math.round((width - targetWidth) / 2),
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toBuffer()

    await fs.writeFile(outputPath, processedImage)

    const stats = await fs.stat(outputPath)
    const metadata = await sharp(outputPath).metadata()

    return {
      success: true,
      filePath: outputPath,
      fileName: path.basename(outputPath),
      width: metadata.width,
      height: metadata.height,
      fileSize: stats.size
    }
  } catch (error) {
    console.error("Error in fallback processing:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Analyze an image using Gemini Vision API
 */
export async function analyzeImage(imagePath: string, prompt: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })

    const imageBuffer = await fs.readFile(imagePath)
    const base64Image = imageBuffer.toString('base64')

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: "image/jpeg"
        }
      }
    ])

    const response = await result.response
    return response.text()
  } catch (error) {
    console.error("Error analyzing image:", error)
    throw error
  }
}

/**
 * Generate image improvement suggestions using Gemini
 */
export async function suggestImprovements(imagePath: string, currentPrompt: string): Promise<string[]> {
  try {
    const analysisPrompt = `Analyze this product image and suggest 3-5 specific improvements to the image generation prompt. Current prompt: "${currentPrompt}". Focus on composition, lighting, product presentation, and Amazon listing requirements.`

    const analysis = await analyzeImage(imagePath, analysisPrompt)

    // Parse suggestions from the response
    const suggestions = analysis
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, 5)

    return suggestions
  } catch (error) {
    console.error("Error suggesting improvements:", error)
    return []
  }
}
